import { SheetsOutbox, type OutboxAdapter, type OutboxConfig, type SheetsOp } from '../src/data/sheetsOutbox';

jest.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: jest.fn(), setItem: jest.fn() } }));
jest.mock('../src/data/sheetsSettings', () => ({
  areSheetsSettingsLoaded: () => true,
  getCachedSheetsSettings: () => ({ enabled: true, url: 'url', token: 'token' }),
  loadSheetsSettings: jest.fn(),
}));

function makeHarness() {
  let ops: SheetsOp[] = [];
  let online = true;
  let config: OutboxConfig = { enabled: true, url: 'url', token: 'token' };
  const pushed: string[] = [];
  let failures = 0;
  const io: OutboxAdapter = {
    read: async () => [...ops],
    write: async (value) => { ops = [...value]; },
    online: async () => online,
    config: async () => config,
    push: async (op) => { pushed.push(`${op.type}:${op.entryId}`); if (failures > 0) { failures -= 1; throw new Error('temporary'); } },
    entry: async () => undefined,
    wait: async () => undefined,
  };
  return { outbox: new SheetsOutbox(io, 3), pushed, pending: () => ops, setOnline: (value: boolean) => { online = value; }, setConfig: (value: OutboxConfig) => { config = value; }, fail: (count: number) => { failures = count; } };
}

describe('SheetsOutbox', () => {
  it('collapses operations per entry so the latest delete replaces an upsert', async () => {
    const h = makeHarness(); h.setOnline(false);
    await h.outbox.enqueue({ type: 'upsert', entryId: 'a' });
    await h.outbox.enqueue({ type: 'delete', entryId: 'a' });
    expect(h.pending()).toEqual([{ type: 'delete', entryId: 'a' }]);
  });

  it('processes operations serially in enqueue order', async () => {
    const h = makeHarness();
    await h.outbox.enqueue({ type: 'upsert', entryId: 'a' });
    await h.outbox.enqueue({ type: 'delete', entryId: 'b' });
    await h.outbox.flush();
    expect(h.pushed.slice(-2)).toEqual(['upsert:a', 'delete:b']);
  });

  it('retries transient push failures and then removes the operation', async () => {
    const h = makeHarness(); h.fail(2);
    await h.outbox.enqueue({ type: 'delete', entryId: 'a' });
    await h.outbox.flush();
    expect(h.pushed.filter((item) => item === 'delete:a')).toHaveLength(3);
    expect(h.pending()).toEqual([]);
  });

  it('pauses while offline and resumes on flush', async () => {
    const h = makeHarness(); h.setOnline(false);
    await h.outbox.enqueue({ type: 'delete', entryId: 'a' });
    expect(h.pending()).toHaveLength(1);
    h.setOnline(true); await h.outbox.flush();
    expect(h.pending()).toEqual([]);
  });

  it('keeps operations queued while disabled', async () => {
    const h = makeHarness(); h.setConfig({ enabled: false, url: 'url', token: 'token' });
    await h.outbox.enqueue({ type: 'delete', entryId: 'a' });
    await h.outbox.flush();
    expect(h.pushed).toEqual([]);
    expect(h.pending()).toHaveLength(1);
  });
});
