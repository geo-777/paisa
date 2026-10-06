import { getDaysInMonth, isBefore, isSameMonth, parse, subMonths } from 'date-fns';

import { categories, type Category } from './categories';

export type ExpenseForCalc = {
  date: string;
  amount: number;
  category: Category;
};

export type CategoryTotals = Record<Category, number>;
export type PercentDirection = 'up' | 'down' | 'neutral';

export function percentDirection(change: number): PercentDirection {
  if (Math.abs(change) < 1) return 'neutral';
  return change > 0 ? 'up' : 'down';
}

export function totalForDate(entries: ExpenseForCalc[], dateKey: string): number {
  return entries.reduce((total, entry) => total + (entry.date === dateKey ? entry.amount : 0), 0);
}

export function categoryTotalsForDate(entries: ExpenseForCalc[], dateKey: string): CategoryTotals {
  const totals = Object.fromEntries(categories.map((category) => [category, 0])) as CategoryTotals;
  for (const entry of entries) {
    if (entry.date === dateKey) totals[entry.category] += entry.amount;
  }
  return totals;
}

export function todayVsAverage(entries: ExpenseForCalc[], todayKey: string): number | null {
  const today = parse(todayKey, 'yyyy-MM-dd', new Date());
  const previousDays = today.getDate() - 1;
  const thisMonthEntries = entries.filter((entry) => {
    const entryDate = parse(entry.date, 'yyyy-MM-dd', new Date());
    return isSameMonth(entryDate, today) && isBefore(entryDate, today);
  });

  let baseline: number | null;
  if (previousDays >= 3) {
    baseline = thisMonthEntries.reduce((total, entry) => total + entry.amount, 0) / previousDays;
  } else {
    const previousMonth = subMonths(today, 1);
    const previousMonthEntries = entries.filter((entry) =>
      isSameMonth(parse(entry.date, 'yyyy-MM-dd', new Date()), previousMonth),
    );
    const previousMonthTotal = previousMonthEntries.reduce((total, entry) => total + entry.amount, 0);
    baseline = previousMonthTotal / getDaysInMonth(previousMonth);
  }

  if (baseline === null || baseline <= 0 || !Number.isFinite(baseline)) return null;
  const todayTotal = totalForDate(entries, todayKey);
  const percent = ((todayTotal - baseline) / baseline) * 100;
  return Number.isFinite(percent) ? percent : null;
}
