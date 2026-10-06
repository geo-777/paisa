import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { categories, type Category } from '@/src/lib/categories';
import type { Entry } from '@/src/store/useExpenses';
import { useExpensesStore } from '@/src/store/useExpenses';
import { useSessionStore } from '@/src/store/useSession';
import { ensureMonthTab } from '@/src/sheets/monthTab';
import { deleteLogRowById, appendLogRows, getValues } from '@/src/sheets/sheetsApi';
import { SpreadsheetMissing } from '@/src/sheets/errors';

export type SyncAdapter = {
  isOnline: () => boolean;
  load: () => { spreadsheetId: string | null; entries: Entry[]; deletedIds: string[] };
  ensureMonth: (spreadsheetId: string, date: Date) => Promise<void>;
  append: (spreadsheetId: string, rows: (string | number)[][]) => Promise<void>;
  readIds: (spreadsheetId: string) => Promise<(string | number | boolean | null)[][]>;
  readLog: (spreadsheetId: string) => Promise<(string | number | boolean | null)[][]>;
  deleteById: (spreadsheetId: string, id: string) => Promise<void>;
  recoverSpreadsheet: (oldId: string) => Promise<string>;
  markSynced: (ids: string[]) => void;
  markFailed: (ids: string[]) => void;
  clearDeleted: (id: string) => void;
  mergeRemote: (entries: Entry[]) => void;
  setStatus: (status: 'synced' | 'syncing' | 'offline' | 'failed', error?: string | null) => void;
};

const MAX_ATTEMPTS = 5;
const backoff = (attempt: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 250);
});

export function createSyncQueue(adapter: SyncAdapter, delay: (attempt: number) => Promise<void> = backoff) {
  let running = false;
  let requested = false;
  let active: Promise<void> | null = null;
  let pullRequested = false;

  const currentSpreadsheetId = () => adapter.load().spreadsheetId;

  async function withRecovery<T>(operation: (spreadsheetId: string) => Promise<T>): Promise<T> {
    let spreadsheetId = currentSpreadsheetId();
    if (!spreadsheetId) throw new Error('No spreadsheet is connected. Sign in and retry.');
    try {
      return await operation(spreadsheetId);
    } catch (error) {
      if (!(error instanceof SpreadsheetMissing)) throw error;
      spreadsheetId = await adapter.recoverSpreadsheet(spreadsheetId);
      return operation(spreadsheetId);
    }
  }

  async function appendPending(entries: Entry[]): Promise<void> {
    if (entries.length === 0) return;
    const ordered = [...entries].sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id));
    const ids = ordered.map((entry) => entry.id);
    let reconcileBeforeAppend = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      if (!adapter.isOnline()) { adapter.setStatus('offline'); return; }
      try {
        if (reconcileBeforeAppend) {
          const rows = await withRecovery((id) => adapter.readIds(id));
          const present = new Set(rows.slice(1).map((row) => String(row[0] ?? '')).filter(Boolean));
          const alreadyWritten = ids.filter((id) => present.has(id));
          if (alreadyWritten.length) adapter.markSynced(alreadyWritten);
          const missing = ordered.filter((entry) => !present.has(entry.id));
          if (missing.length === 0) return;
          ordered.splice(0, ordered.length, ...missing);
          reconcileBeforeAppend = false;
        }
        const monthKeys = [...new Set(ordered.map((entry) => entry.date.slice(0, 7)))];
        for (const key of monthKeys) {
          const date = new Date(`${key}-01T12:00:00`);
          await withRecovery((id) => adapter.ensureMonth(id, date));
        }
        await withRecovery(async (id) => adapter.append(id, ordered.map(entryToRow)));
        adapter.markSynced(ids);
        return;
      } catch (error) {
        if (!adapter.isOnline()) { adapter.setStatus('offline'); return; }
        try {
          const rows = await withRecovery((id) => adapter.readIds(id));
          const present = new Set(rows.slice(1).map((row) => String(row[0] ?? '')).filter(Boolean));
          const alreadyWritten = ids.filter((id) => present.has(id));
          if (alreadyWritten.length) adapter.markSynced(alreadyWritten);
          const missing = ordered.filter((entry) => !present.has(entry.id));
          if (missing.length === 0) return;
          if (attempt === MAX_ATTEMPTS - 1) {
            adapter.markFailed(missing.map((entry) => entry.id));
            throw error;
          }
          await delay(attempt);
          // Re-read Log!A:A on the next iteration after an ambiguous append result.
          ordered.splice(0, ordered.length, ...missing);
          reconcileBeforeAppend = true;
        } catch (reconcileError) {
          if (!adapter.isOnline()) { adapter.setStatus('offline'); return; }
          reconcileBeforeAppend = true;
          if (attempt === MAX_ATTEMPTS - 1) {
            adapter.markFailed(ordered.map((entry) => entry.id));
            throw reconcileError;
          }
          await delay(attempt);
        }
      }
    }
  }

  async function pullRemote(): Promise<void> {
    const rows = await withRecovery((id) => adapter.readLog(id));
    const remote = rows.slice(1).map(rowToEntry).filter((entry): entry is Entry => entry !== null);
    adapter.mergeRemote(remote);
  }

  async function pass(): Promise<void> {
    const { entries, deletedIds } = adapter.load();
    const pending = entries.filter((entry) => entry.status === 'pending');
    await appendPending(pending);
    if (!adapter.isOnline()) { adapter.setStatus('offline'); return; }

    for (const id of deletedIds) {
      if (!adapter.isOnline()) { adapter.setStatus('offline'); return; }
      let deleted = false;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        try {
          await withRecovery((spreadsheetId) => adapter.deleteById(spreadsheetId, id));
          adapter.clearDeleted(id);
          deleted = true;
          break;
        } catch (error) {
          if (!adapter.isOnline()) { adapter.setStatus('offline'); return; }
          if (attempt === MAX_ATTEMPTS - 1) {
            adapter.setStatus('failed', error instanceof Error ? error.message : 'Could not sync deletion.');
            return;
          }
          await delay(attempt);
        }
      }
      if (!deleted) return;
    }

    if (pullRequested) {
      pullRequested = false;
      try { await pullRemote(); } catch (error) {
        adapter.setStatus('failed', error instanceof Error ? error.message : 'Could not refresh expenses.');
        return;
      }
    }
    const hasFailedEntries = adapter.load().entries.some((entry) => entry.status === 'failed');
    adapter.setStatus(hasFailedEntries ? 'failed' : 'synced');
  }

  function flush(options: { pull?: boolean } = {}): Promise<void> {
    if (options.pull) pullRequested = true;
    requested = true;
    if (running && active) return active;
    running = true;
    active = (async () => {
      while (requested) {
        requested = false;
        if (!adapter.load().spreadsheetId) break;
        if (!adapter.isOnline()) { adapter.setStatus('offline'); break; }
        adapter.setStatus('syncing');
        try { await pass(); } catch (error) {
          adapter.setStatus('failed', error instanceof Error ? error.message : 'Sync failed.');
        }
      }
    })().finally(() => { running = false; active = null; });
    return active;
  }

  return { flush };
}

let connected = false;
let online = true;
const queue = createSyncQueue({
  isOnline: () => online,
  load: () => ({
    spreadsheetId: useSessionStore.getState().spreadsheetId,
    entries: useExpensesStore.getState().entries,
    deletedIds: useExpensesStore.getState().deletedIds,
  }),
  ensureMonth: ensureMonthTab,
  append: appendLogRows,
  readIds: (spreadsheetId) => getValues(spreadsheetId, 'Log!A:A'),
  readLog: (spreadsheetId) => getValues(spreadsheetId, 'Log!A:F'),
  deleteById: deleteLogRowById,
  recoverSpreadsheet: async (oldId) => {
    const result = await import('@/src/sheets/discover').then(({ discoverSpreadsheet }) => discoverSpreadsheet(
      null,
      () => useSessionStore.setState({ spreadsheetId: null }),
    ));
    if (result.spreadsheetId === oldId) throw new Error('Could not find a replacement spreadsheet.');
    useSessionStore.setState({ spreadsheetId: result.spreadsheetId });
    return result.spreadsheetId;
  },
  markSynced: (ids) => useExpensesStore.getState().markEntriesSynced(ids),
  markFailed: (ids) => useExpensesStore.getState().markEntriesFailed(ids),
  clearDeleted: (id) => useExpensesStore.getState().clearDeletedId(id),
  mergeRemote: (entries) => useExpensesStore.getState().mergeRemoteEntries(entries),
  setStatus: (status, error) => useExpensesStore.getState().setSyncStatus(status, error),
});

export function requestSync(options: { pull?: boolean } = {}): Promise<void> {
  return queue.flush(options);
}

export function startSyncListeners(): () => void {
  if (connected) return () => undefined;
  connected = true;
  const networkSubscription = NetInfo.addEventListener((state: NetInfoState) => {
    online = state.isConnected !== false && state.isInternetReachable !== false;
    if (online) void requestSync();
    else useExpensesStore.getState().setSyncStatus('offline');
  });
  const appSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') void requestSync({ pull: true });
  });
  return () => {
    networkSubscription();
    appSubscription.remove();
    connected = false;
  };
}

function entryToRow(entry: Entry): (string | number)[] {
  return [entry.id, entry.date, entry.ts, entry.category, entry.amount, entry.note ?? ''];
}

function rowToEntry(row: (string | number | boolean | null)[]): Entry | null {
  const [id, date, ts, category, amount, note] = row;
  if (typeof id !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? '')) || typeof ts !== 'string') return null;
  if (typeof category !== 'string' || !categories.includes(category as Category)) return null;
  const parsedAmount = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(parsedAmount)) return null;
  return {
    id,
    date: String(date),
    ts,
    category: category as Category,
    amount: parsedAmount,
    ...(typeof note === 'string' && note ? { note } : {}),
    status: 'synced',
  };
}
