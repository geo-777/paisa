import type { Entry } from '@/src/store/useExpenses';

export type SheetsErrorKind = 'config' | 'transient';
export class SheetsError extends Error {
  readonly kind: SheetsErrorKind;
  constructor(message: string, kind: SheetsErrorKind) {
    super(message);
    this.name = 'SheetsError';
    this.kind = kind;
  }
}

export type MirrorEntry = Pick<Entry, 'id' | 'date' | 'category' | 'amount' | 'createdAt'> & { note: string };
export function toMirrorEntry(entry: Entry): MirrorEntry {
  return { id: entry.id, date: entry.date, category: entry.category, amount: entry.amount, note: entry.note ?? '', createdAt: entry.createdAt };
}

export async function parseSheetsResponse(response: Pick<Response, 'ok' | 'status' | 'text'>): Promise<void> {
  let body: unknown;
  try { body = JSON.parse(await response.text()); }
  catch { throw new SheetsError('The Sheets endpoint returned an invalid response. Check its deployment URL and script.', 'config'); }
  if (typeof body !== 'object' || body === null || !('ok' in body) || body.ok !== true) {
    const message = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error : 'The Sheets endpoint rejected the request.';
    const isConfig = response.status === 400 || response.status === 401 || response.status === 403 || response.status === 404
      || /token|unauthori[sz]ed|forbidden|deployment|configuration|url|access denied/i.test(message);
    throw new SheetsError(message, isConfig ? 'config' : 'transient');
  }
}

export async function sendSheetsAction(url: string, token: string, action: 'ping' | 'upsert' | 'delete' | 'backfill', payload: Record<string, unknown> = {}): Promise<void> {
  if (!url.trim() || !token.trim()) throw new SheetsError('Add the Sheets web app link and token first.', 'config');
  if (action === 'backfill' && Array.isArray(payload.entries) && payload.entries.length > 200) {
    throw new SheetsError('A backfill request can include at most 200 entries.', 'config');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, action, ...payload }),
      signal: controller.signal,
    });
    await parseSheetsResponse(response);
  } catch (error) {
    if (error instanceof SheetsError) throw error;
    throw new SheetsError(error instanceof Error && error.name === 'AbortError' ? 'The Sheets request timed out.' : 'Could not reach the Sheets endpoint. Check your connection.', 'transient');
  } finally { clearTimeout(timeout); }
}

export const sheetsActions = {
  ping: (url: string, token: string) => sendSheetsAction(url, token, 'ping'),
  upsert: (url: string, token: string, entry: Entry) => sendSheetsAction(url, token, 'upsert', { entry: toMirrorEntry(entry) }),
  delete: (url: string, token: string, id: string) => sendSheetsAction(url, token, 'delete', { id }),
  backfill: (url: string, token: string, entries: Entry[]) => sendSheetsAction(url, token, 'backfill', { entries: entries.map(toMirrorEntry) }),
};
