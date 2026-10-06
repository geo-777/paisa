import { categoryTotalsForDate, percentDirection, todayVsAverage, totalForDate, type ExpenseForCalc } from '../src/lib/calc';

const entry = (date: string, amount: number, category: ExpenseForCalc['category'] = 'Breakfast'): ExpenseForCalc => ({
  date,
  amount,
  category,
});

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
});
