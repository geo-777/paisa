import {
  avgDaily,
  categoryShares,
  categoryTotalsForDate,
  caution,
  dashboardStats,
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
});
