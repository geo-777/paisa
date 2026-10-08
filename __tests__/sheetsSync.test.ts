import { buildMonthRows, parseSheetsResponse, SheetsError } from '../src/data/sheetsSync';
import type { Entry } from '../src/store/useExpenses';

jest.mock('../src/data/expensesApi', () => ({ fetchAllExpenses: jest.fn(), fetchExpenses: jest.fn() }));
jest.mock('../src/data/sheetsSettings', () => ({ getCachedSheetsSettings: jest.fn(), loadSheetsSettings: jest.fn() }));

const expense = (date: string, category: Entry['category'], amount: number): Entry => ({
  id: `${date}-${category}-${amount}`,
  date,
  category,
  amount,
  createdAt: `${date}T10:00:00.000Z`,
  status: 'synced',
});

describe('buildMonthRows', () => {
  it('sums multiple entries on a day into lowercase category columns', () => {
    expect(buildMonthRows([
      expense('2026-10-08', 'Breakfast', 20),
      expense('2026-10-08', 'Breakfast', 10.5),
      expense('2026-10-08', 'Lunch', 50),
    ], '2026-10')).toEqual([
      { date: '2026-10-08', breakfast: 30.5, lunch: 50, dinner: 0, snacks: 0, misc: 0 },
    ]);
  });

  it('excludes entries outside the requested month and keeps days sorted', () => {
    expect(buildMonthRows([
      expense('2026-11-01', 'Misc', 15),
      expense('2026-10-31', 'Dinner', 80),
      expense('2026-09-30', 'Lunch', 30),
    ], '2026-10').map((row) => row.date)).toEqual(['2026-10-31']);
  });

  it('returns no rows for an empty month', () => {
    expect(buildMonthRows([], '2026-10')).toEqual([]);
  });

  it('rounds floating point decimal sums to paise', () => {
    expect(buildMonthRows([
      expense('2026-10-02', 'Snacks', 0.1),
      expense('2026-10-02', 'Snacks', 0.2),
    ], '2026-10')[0].snacks).toBe(0.3);
  });
});

describe('Sheets response parsing', () => {
  it('rejects non-JSON responses as configuration errors', async () => {
    await expect(parseSheetsResponse({ text: async () => '<html>redirect</html>' }))
      .rejects.toMatchObject({ name: 'SheetsError', kind: 'config' });
  });

  it('rejects ok false with the script-provided error', async () => {
    await expect(parseSheetsResponse({ text: async () => JSON.stringify({ ok: false, error: 'token rejected' }) }))
      .rejects.toMatchObject({ name: 'SheetsError', kind: 'config', message: 'token rejected' });
  });

  it('accepts ok true regardless of HTTP status', async () => {
    await expect(parseSheetsResponse({ text: async () => JSON.stringify({ ok: true }) })).resolves.toBeUndefined();
  });
});

it('exposes typed Sheets errors', () => {
  expect(new SheetsError('offline', 'transient')).toMatchObject({ name: 'SheetsError', kind: 'transient' });
});
