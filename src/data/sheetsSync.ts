import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import type { Entry } from '@/src/store/useExpenses';
import { fetchAllExpenses, fetchExpenses } from '@/src/data/expensesApi';
import { getCachedSheetsSettings, loadSheetsSettings } from '@/src/data/sheetsSettings';

export type MonthRow = { date: string; breakfast: number; lunch: number; dinner: number; snacks: number; misc: number };
export type SheetsErrorKind = 'config' | 'transient';
export class SheetsError extends Error {
  readonly kind: SheetsErrorKind;
  constructor(message: string, kind: SheetsErrorKind) {
    super(message);
    this.name = 'SheetsError';
    this.kind = kind;
  }
}

const categoryKeys = ['breakfast', 'lunch', 'dinner', 'snacks', 'misc'] as const;
type CategoryKey = typeof categoryKeys[number];

export function buildMonthRows(entries: Entry[], month: string): MonthRow[] {
  const grouped = new Map<string, MonthRow>();
  for (const entry of entries) {
    if (entry.date.slice(0, 7) !== month) continue;
    let row = grouped.get(entry.date);
    if (!row) {
      row = { date: entry.date, breakfast: 0, lunch: 0, dinner: 0, snacks: 0, misc: 0 };
      grouped.set(entry.date, row);
    }
    const key = entry.category.toLowerCase() as CategoryKey;
    if (!categoryKeys.includes(key)) continue;
    row[key] = Math.round((row[key] + entry.amount + Number.EPSILON) * 100) / 100;
  }
  return [...grouped.values()].filter((row) => categoryKeys.some((key) => row[key] !== 0)).sort((a, b) => a.date.localeCompare(b.date));
}

export async function parseSheetsResponse(response: Pick<Response, 'text'>): Promise<void> {
  let body: unknown;
  try { body = JSON.parse(await response.text()); }
  catch { throw new SheetsError('Sheets returned a non-JSON response. Check the web app deployment URL.', 'config'); }
  if (typeof body === 'object' && body !== null && 'ok' in body && body.ok === true) return;
  const reason = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
    ? body.error : 'Sheets rejected the sync request.';
  throw new SheetsError(reason, /token|unauthori[sz]ed|forbidden|deployment|configuration|url|access denied/i.test(reason) ? 'config' : 'transient');
}

function checkedUrl(url: string): string {
  const value = url.trim();
  if (!value.startsWith('https://script.google.com/') || !value.endsWith('/exec')) {
    throw new SheetsError('The web app URL must start with https://script.google.com/ and end with /exec.', 'config');
  }
  return value;
}

async function postAction(payload: Record<string, unknown>): Promise<void> {
  if (!getCachedSheetsSettings().url || !getCachedSheetsSettings().token) await loadSheetsSettings();
  const settings = getCachedSheetsSettings();
  if (!settings.enabled && payload.action !== 'ping') throw new SheetsError('Enable Google Sheets sync in Settings first.', 'config');
  if (!settings.token) throw new SheetsError('Add the shared token in Settings.', 'config');
  const url = checkedUrl(settings.url);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: settings.token, ...payload }),
      signal: controller.signal,
    });
    await parseSheetsResponse(response);
  } catch (error) {
    if (error instanceof SheetsError) throw error;
    throw new SheetsError(error instanceof Error && error.name === 'AbortError' ? 'Sheets request timed out after 15 seconds.' : 'Could not reach the Sheets web app. Check your internet connection.', 'transient');
  } finally { clearTimeout(timeoutId); }
}

export async function syncMonth(month: string, entries?: Entry[]): Promise<void> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new SheetsError('Month must use YYYY-MM format.', 'config');
  const [year, monthNumber] = month.split('-').map(Number);
  const monthStart = new Date(year, monthNumber - 1, 1, 12);
  if (format(monthStart, 'yyyy-MM') !== month) throw new SheetsError('Month must be a real calendar month.', 'config');
  const start = `${month}-01`;
  const end = format(endOfMonth(monthStart), 'yyyy-MM-dd');
  const monthEntries = entries ?? await fetchExpenses(start, end);
  const rows = buildMonthRows(monthEntries, month);
  await postAction({ action: 'syncMonth', month, rows });
}

export async function testSheetsConnection(): Promise<void> {
  await postAction({ action: 'ping' });
}

let syncTail: Promise<void> = Promise.resolve();
function serializedSync(work: () => Promise<void>): Promise<void> {
  const run = syncTail.then(work);
  syncTail = run.catch(() => undefined);
  return run;
}

async function syncMonthWindow(month: Date, through: Date): Promise<void> {
  const monthKey = format(month, 'yyyy-MM');
  const from = format(startOfMonth(month), 'yyyy-MM-dd');
  const end = format(through, 'yyyy-MM-dd');
  const entries = await fetchExpenses(from, end);
  await syncMonth(monthKey, entries);
}

export function runDailySync(now = new Date()): Promise<void> {
  return serializedSync(async () => {
    const previous = subMonths(startOfMonth(now), 1);
    await syncMonthWindow(previous, endOfMonth(previous));
    await syncMonthWindow(startOfMonth(now), now);
  });
}

export type FullSyncProgress = { completed: number; total: number; month: string };
export function runFullSync(onProgress?: (progress: FullSyncProgress) => void): Promise<void> {
  return serializedSync(async () => {
    const entries = await fetchAllExpenses();
    const months = [...new Set(entries.map((entry) => entry.date.slice(0, 7)))].sort();
    for (let index = 0; index < months.length; index += 1) {
      const month = months[index];
      await syncMonth(month, entries);
      onProgress?.({ completed: index + 1, total: months.length, month });
    }
  });
}
