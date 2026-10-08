import {
  avgDaily,
  categoryShares,
  categoryTotalsForDate,
  caution,
  dashboardStats,
  dailyExpenseRows,
  daysElapsed,
  filteredMonthTotal,
  firstDataMonth,
  highestDay,
  lowestDay,
  monthOverMonth,
  percentDirection,
  todayVsAverage,
  totalForDate,
  type ExpenseForCalc,
} from '../src/lib/calc';
import { dashboardLogFixtures, type LogRow } from './fixtures/dashboardLogs';

const entry = (date: string, amount: number, category: ExpenseForCalc['category'] = 'Breakfast'): ExpenseForCalc => ({
  date,
  amount,
  category,
});

function expensesFromLog(rows: LogRow[]): ExpenseForCalc[] {
  return rows.map(([, date, , category, amount]) => ({
    date,
    amount,
    category: category as ExpenseForCalc['category'],
  }));
}

describe('Home calculations', () => {
  it('totals today only and returns all five categories', () => {
    const entries = [entry('2024-10-06', 40), entry('2024-10-06', 25, 'Lunch'), entry('2024-10-05', 100)];
    expect(totalForDate(entries, '2024-10-06')).toBe(65);
    expect(categoryTotalsForDate(entries, '2024-10-06')).toEqual({
      Breakfast: 40,
      Lunch: 25,
      Dinner: 0,
      Snacks: 0,
      Misc: 0,
    });
  });

  it('uses the average of previous days in the current month when at least three days exist', () => {
    const entries = [entry('2024-10-01', 90), entry('2024-10-04', 60)];
    expect(todayVsAverage(entries, '2024-10-04')).toBeCloseTo(100);
  });

  it('falls back to last month during the first three days', () => {
    const entries = [entry('2024-09-01', 3000), entry('2024-10-02', 150)];
    expect(todayVsAverage(entries, '2024-10-02')).toBeCloseTo(50);
  });

  it('returns null without a positive baseline', () => {
    expect(todayVsAverage([], '2024-10-06')).toBeNull();
    expect(todayVsAverage([entry('2024-10-01', 0)], '2024-10-04')).toBeNull();
  });

  it('uses neutral styling below a one percent change', () => {
    expect(percentDirection(0.9)).toBe('neutral');
    expect(percentDirection(1)).toBe('up');
    expect(percentDirection(-1)).toBe('down');
  });

  it('matches the October Log hand calculation, comparing only Sep 1–6', () => {
    const expenses = expensesFromLog(dashboardLogFixtures.octoberWithBaseline);
    const stats = dashboardStats(expenses, '2024-10-06');

    expect(stats).not.toBeNull();
    expect(stats?.monthTotal).toBe(800);
    expect(stats?.avgDaily).toBeCloseTo(800 / 6);
    expect(stats?.monthOverMonth).toBeCloseTo((800 - 600) / 600 * 100);
    expect(stats?.highestDay).toEqual({ date: '2024-10-06', total: 300 });
    expect(stats?.categoryShares.map(({ percent }) => percent)).toEqual([37.5, 18.8, 12.5, 18.7, 12.5]);
    expect(stats?.categoryShares.reduce((total, share) => total + share.percent, 0)).toBe(100);
    expect(stats?.caution).toEqual({ active: true, reason: 'today', pct: 200 });
    expect(stats?.dailyTotals).toHaveLength(31);
  });

  it('keeps first-week comparisons hidden when there is no previous-month baseline', () => {
    const expenses = expensesFromLog(dashboardLogFixtures.firstWeekNoBaseline);
    expect(monthOverMonth(expenses, '2024-11-02')).toBeNull();
    expect(todayVsAverage(expenses, '2024-11-02')).toBeNull();
    expect(avgDaily(expenses, '2024-11', '2024-11-02')).toBe(60);
    expect(dashboardStats(expenses, '2024-11-02')?.monthOverMonth).toBeNull();
  });

  it('handles leap February and a zero same-days prior baseline without fake percentages', () => {
    const expenses = expensesFromLog(dashboardLogFixtures.leapFebruaryZeroPrior);
    const stats = dashboardStats(expenses, '2024-02-29');

    expect(stats?.monthTotal).toBe(380);
    expect(stats?.avgDaily).toBeCloseTo(380 / 29);
    expect(stats?.monthOverMonth).toBeNull();
    expect(stats?.dailyTotals).toHaveLength(29);
    expect(stats?.highestDay).toEqual({ date: '2024-02-29', total: 180 });
    expect(stats?.categoryShares.map(({ percent }) => percent)).toEqual([21, 31.6, 47.4, 0, 0]);
    expect(categoryShares(expenses, '2024-02', 29).reduce((total, share) => total + share.percent, 0)).toBe(100);
    expect(caution(expenses, '2024-02-29')).toEqual({ active: true, reason: 'today', pct: 2420 });
  });

  it('returns zero-valued empty month stats and no day extrema or comparison', () => {
    expect(daysElapsed('2024-10', '2024-10-01')).toBe(1);
    expect(dashboardStats([], '2024-10-01')).toMatchObject({
      monthTotal: 0,
      avgDaily: 0,
      monthOverMonth: null,
      highestDay: null,
      caution: { active: false, reason: null, pct: null },
    });
  });

  it('uses full month totals when comparing a past month and counts leap days locally', () => {
    const expenses = [entry('2024-01-10', 50), entry('2024-02-01', 40), entry('2024-02-29', 60)];
    expect(daysElapsed('2024-02', '2024-03-01')).toBe(29);
    expect(monthOverMonth(expenses, '2024-03-01', '2024-02')).toBe(100);
  });

  it('bounds month selection at the earliest stored entry month and builds zero-filled daily rows', () => {
    const expenses = expensesFromLog(dashboardLogFixtures.octoberWithBaseline);
    expect(firstDataMonth(expenses, '2024-10')).toBe('2024-09');
    expect(firstDataMonth([], '2024-10')).toBe('2024-10');
    const rows = dailyExpenseRows(expenses, '2024-10', 6);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ date: '2024-10-01', total: 100 });
    expect(rows[5]).toMatchObject({ date: '2024-10-06', total: 300 });
    expect(rows[2]?.categories.Dinner).toBe(100);
  });

  it('totals one or several selected categories within the selected month and elapsed days', () => {
    const expenses = [
      entry('2024-10-01', 40, 'Breakfast'),
      entry('2024-10-01', 70, 'Lunch'),
      entry('2024-10-02', 90, 'Dinner'),
      entry('2024-11-01', 500, 'Breakfast'),
    ];
    expect(filteredMonthTotal(expenses, '2024-10', ['Breakfast'])).toBe(40);
    expect(filteredMonthTotal(expenses, '2024-10', ['Breakfast', 'Lunch'])).toBe(110);
    expect(filteredMonthTotal(expenses, '2024-10', ['Breakfast', 'Lunch'], 1)).toBe(110);
    expect(filteredMonthTotal(expenses, '2024-10', [])).toBe(0);
    expect(dailyExpenseRows(expenses, '2024-10', 2, ['Breakfast', 'Lunch'])[1]?.total).toBe(0);
  });

  it('uses earliest date for ties and ignores zero-spend days for the lowest day', () => {
    const expenses = [
      entry('2024-10-02', 40),
      entry('2024-10-04', 40),
      entry('2024-10-05', 15),
      entry('2024-10-06', 15),
    ];
    expect(highestDay(expenses, '2024-10')).toEqual({ date: '2024-10-02', total: 40 });
    expect(lowestDay(expenses, '2024-10')).toEqual({ date: '2024-10-05', total: 15 });
    expect(lowestDay([], '2024-10')).toBeNull();
  });

  it('does not trigger caution at exactly 1.5×, below the rupee floor, or below the weekly threshold', () => {
    const baseline = [entry('2024-10-01', 100), entry('2024-10-02', 100), entry('2024-10-03', 100)];
    expect(caution([...baseline, entry('2024-10-04', 150)], '2024-10-04').active).toBe(false);
    expect(caution([...baseline, entry('2024-10-04', 151)], '2024-10-04')).toEqual({ active: true, reason: 'today', pct: 51 });
    expect(caution([entry('2024-10-01', 20), entry('2024-10-02', 20), entry('2024-10-03', 20), entry('2024-10-04', 99)], '2024-10-04').active).toBe(false);
  });

  it('triggers the weekly caution only when the last seven days exceed the prior seven by more than 25%', () => {
    const entries = [
      entry('2024-10-02', 20), entry('2024-10-03', 20), entry('2024-10-04', 20),
      entry('2024-10-05', 20), entry('2024-10-06', 20),
      entry('2024-10-09', 25), entry('2024-10-10', 25), entry('2024-10-11', 25),
      entry('2024-10-12', 25), entry('2024-10-13', 25), entry('2024-10-14', 25),
    ];
    expect(caution(entries, '2024-10-15')).toEqual({ active: true, reason: 'week', pct: 50 });
  });
});
