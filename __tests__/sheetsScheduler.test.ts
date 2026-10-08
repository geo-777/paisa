import { shouldRunDailySync } from '../src/data/sheetsScheduler';

jest.mock('../src/data/supabase', () => ({ supabase: { auth: { getUser: jest.fn(), onAuthStateChange: jest.fn() } } }));
jest.mock('../src/data/sheetsSettings', () => ({ getCachedSheetsSettings: jest.fn(), loadSheetsSettings: jest.fn() }));
jest.mock('../src/data/sheetsSync', () => ({ runDailySync: jest.fn(), runFullSync: jest.fn() }));
jest.mock('@react-native-community/netinfo', () => ({ default: { fetch: jest.fn(), addEventListener: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));

const base = {
  enabled: true,
  online: true,
  lastSyncDate: null,
  today: '2026-10-01',
  lastFailureAt: null,
  now: 1_000_000,
};

describe('daily Sheets scheduler decision', () => {
  it('skips a sync already completed today', () => {
    expect(shouldRunDailySync({ ...base, lastSyncDate: base.today })).toBe(false);
  });

  it('skips when disabled', () => {
    expect(shouldRunDailySync({ ...base, enabled: false })).toBe(false);
  });

  it('skips while offline', () => {
    expect(shouldRunDailySync({ ...base, online: false })).toBe(false);
  });

  it('waits 30 minutes after a failure before an automatic retry', () => {
    expect(shouldRunDailySync({ ...base, lastFailureAt: base.now - 29 * 60 * 1000 })).toBe(false);
    expect(shouldRunDailySync({ ...base, lastFailureAt: base.now - 30 * 60 * 1000 })).toBe(true);
  });

  it('runs after local date rollover even when the previous date was synced', () => {
    expect(shouldRunDailySync({ ...base, lastSyncDate: '2026-09-30', today: '2026-10-01' })).toBe(true);
  });
});
