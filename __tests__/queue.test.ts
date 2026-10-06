/* eslint-disable import/first, @typescript-eslint/no-require-imports */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    signInSilently: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    getTokens: jest.fn(),
    clearCachedAccessToken: jest.fn(),
  },
}));

import { createSyncQueue, type SyncAdapter } from '../src/sync/queue';
import type { Entry } from '../src/store/useExpenses';
import { AuthError, SpreadsheetMissing } from '../src/sheets/errors';

const rowFor = (entry: Entry) => [entry.id, entry.date, entry.ts, entry.category, entry.amount, entry.note ?? ''];

function setup(initial?: Partial<ReturnType<SyncAdapter['load']>>) {
  let online = true;
  let spreadsheetId = 'sheet-1';
  const entries: Entry[] = initial?.entries ?? [];
  const deletedIds = initial?.deletedIds ?? [];
  const remoteRows: (string | number | boolean | null)[][] = [['id', 'date', 'ts', 'category', 'amount', 'note']];
  const adapter: SyncAdapter = {
    isOnline: () => online,
    load: () => ({ spreadsheetId, entries, deletedIds }),
    ensureMonth: jest.fn(async () => undefined),
    append: jest.fn(async (_spreadsheetId, rows) => { remoteRows.push(...rows); }),
    readIds: jest.fn(async () => remoteRows.map((row) => [row[0] ?? null])),
    readLog: jest.fn(async () => remoteRows),
    deleteById: jest.fn(async (_spreadsheetId, id) => {
      const index = remoteRows.findIndex((row) => row[0] === id);
      if (index > 0) remoteRows.splice(index, 1);
    }),
    recoverSpreadsheet: jest.fn(async () => { spreadsheetId = 'sheet-2'; return spreadsheetId; }),
    markSynced: jest.fn(),
    markFailed: jest.fn(),
    clearDeleted: jest.fn(),
    mergeRemote: jest.fn(),
    setStatus: jest.fn(),
  };
  return {
    adapter,
    queue: createSyncQueue(adapter, async () => undefined),
    setOnline: (value: boolean) => { online = value; },
    remoteRows,
  };
}

const entry = (id: string, ts: string, status: Entry['status'] = 'pending'): Entry => ({
  id,
  date: '2026-10-06',
  ts,
  category: 'Breakfast',
  amount: 60,
  status,
});

describe('sync queue', () => {
  it('appends pending entries in timestamp order in one batch and creates month tabs first', async () => {
    const { adapter, queue } = setup({ entries: [entry('later', '2026-10-06T10:00:00.000Z'), entry('earlier', '2026-10-06T08:00:00.000Z')] });

    await queue.flush();

    expect(adapter.ensureMonth).toHaveBeenCalledTimes(1);
    expect(jest.mocked(adapter.ensureMonth).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(adapter.append).mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(adapter.append).toHaveBeenCalledWith('sheet-1', [rowFor(entry('earlier', '2026-10-06T08:00:00.000Z')), rowFor(entry('later', '2026-10-06T10:00:00.000Z'))]);
    expect(adapter.markSynced).toHaveBeenCalledWith(['earlier', 'later']);
  });

  it('retries a failed append after checking the remote IDs', async () => {
    const { adapter, queue } = setup({ entries: [entry('retry-id', '2026-10-06T08:00:00.000Z')] });
    jest.mocked(adapter.append).mockRejectedValueOnce(new Error('temporary failure'));

    await queue.flush();

    expect(adapter.readIds).toHaveBeenCalled();
    expect(adapter.append).toHaveBeenCalledTimes(2);
    expect(adapter.markSynced).toHaveBeenCalledWith(['retry-id']);
  });

  it('does not append a second time when an ambiguous response already wrote the row', async () => {
    const { adapter, queue, remoteRows } = setup({ entries: [entry('ambiguous-id', '2026-10-06T08:00:00.000Z')] });
    jest.mocked(adapter.append).mockImplementationOnce(async (_id, rows) => {
      remoteRows.push(...rows);
      throw new Error('response lost');
    });

    await queue.flush();

    expect(adapter.append).toHaveBeenCalledTimes(1);
    expect(remoteRows.filter((row) => row[0] === 'ambiguous-id')).toHaveLength(1);
    expect(adapter.markSynced).toHaveBeenCalledWith(['ambiguous-id']);
  });

  it('pauses offline without attempting an append', async () => {
    const { adapter, queue, setOnline } = setup({ entries: [entry('offline-id', '2026-10-06T08:00:00.000Z')] });
    setOnline(false);

    await queue.flush();

    expect(adapter.append).not.toHaveBeenCalled();
    expect(adapter.setStatus).toHaveBeenCalledWith('offline');
  });

  it('sends queued deletions through the delete adapter and clears their tombstone', async () => {
    const { adapter, queue } = setup({ deletedIds: ['delete-id'] });

    await queue.flush();

    expect(adapter.deleteById).toHaveBeenCalledWith('sheet-1', 'delete-id');
    expect(adapter.clearDeleted).toHaveBeenCalledWith('delete-id');
  });

  it('recovers from a missing spreadsheet and continues against the replacement', async () => {
    const { adapter, queue } = setup({ entries: [entry('recover-id', '2026-10-06T08:00:00.000Z')] });
    jest.mocked(adapter.ensureMonth).mockRejectedValueOnce(new SpreadsheetMissing());

    await queue.flush();

    expect(adapter.recoverSpreadsheet).toHaveBeenCalledWith('sheet-1');
    expect(adapter.append).toHaveBeenCalledWith('sheet-2', [rowFor(entry('recover-id', '2026-10-06T08:00:00.000Z'))]);
  });

  it('returns to signed out on a revoked token without discarding local entries', async () => {
    const localEntry = entry('pending-auth', '2026-10-06T08:00:00.000Z');
    const { adapter, queue } = setup({ entries: [localEntry] });
    const onAuthRevoked = jest.fn();
    adapter.onAuthRevoked = onAuthRevoked;
    jest.mocked(adapter.append).mockRejectedValueOnce(new AuthError('Token revoked', 401, ''));

    await queue.flush();

    expect(onAuthRevoked).toHaveBeenCalledTimes(1);
    expect(adapter.markSynced).not.toHaveBeenCalled();
    expect(adapter.markFailed).not.toHaveBeenCalled();
    expect(adapter.load().entries).toEqual([localEntry]);
  });
});
