import {
  addDays,
  format,
  getDaysInMonth,
  isSameMonth,
  isValid,
  parse,
  subMonths,
} from 'date-fns';

import { categories, type Category } from './categories';

const DATE_REFERENCE = Date.UTC(2000, 0, 1);

export type ExpenseForCalc = {
  date: string;
  amount: number;
  category: Category;
};

export type CategoryTotals = Record<Category, number>;
export type PercentDirection = 'up' | 'down' | 'neutral';
export type DailyTotal = { date: string; total: number; aboveThreshold?: boolean };
export type DailyExpenseRow = { date: string; categories: CategoryTotals; total: number };
export type CategoryShare = { category: Category; amount: number; percent: number };
export type CautionResult = { active: boolean; reason: 'today' | 'week' | null; pct: number | null };
export type DashboardStats = {
  monthKey: string;
  monthTotal: number;
  daysElapsed: number;
  avgDaily: number;
  monthOverMonth: number | null;
  previousMonthName: string;
  highestDay: DailyTotal | null;
  categoryShares: CategoryShare[];
  dailyTotals: DailyTotal[];
  caution: CautionResult;
};

export function percentDirection(change: number): PercentDirection {
  if (!Number.isFinite(change) || Math.abs(change) < 1) return 'neutral';
  return change > 0 ? 'up' : 'down';
}

export function totalForDate(entries: ExpenseForCalc[], dateKey: string): number {
  return entries.reduce((total, entry) => total + (entry.date === dateKey ? validAmount(entry.amount) : 0), 0);
}

export function categoryTotalsForDate(entries: ExpenseForCalc[], dateKey: string): CategoryTotals {
  const totals = emptyCategoryTotals();
  for (const entry of entries) {
    if (entry.date === dateKey && isCategory(entry.category)) totals[entry.category] += validAmount(entry.amount);
  }
  return totals;
}

export function todayVsAverage(entries: ExpenseForCalc[], todayKey: string): number | null {
  const today = parseDateKey(todayKey);
  if (!today) return null;
  const previousDays = today.getDate() - 1;
  let baseline: number | null;
  if (previousDays >= 3) {
    const previousMonthToDate = entriesForMonth(entries, format(today, 'yyyy-MM')).filter((entry) => entry.date < todayKey);
    baseline = sumAmounts(previousMonthToDate) / previousDays;
  } else {
    const previousMonth = subMonths(today, 1);
    const previousMonthKey = format(previousMonth, 'yyyy-MM');
    const previousEntries = entriesForMonth(entries, previousMonthKey);
    baseline = previousEntries.length === 0
      ? null
      : sumAmounts(previousEntries) / getDaysInMonth(previousMonth);
  }

  if (baseline === null || baseline <= 0 || !Number.isFinite(baseline)) return null;
  const percent = ((totalForDate(entries, todayKey) - baseline) / baseline) * 100;
  return Number.isFinite(percent) ? percent : null;
}

export function monthTotal(entries: ExpenseForCalc[], monthKey: string, throughDay?: number): number {
  return sumAmounts(entriesForMonth(entries, monthKey).filter((entry) => {
    if (throughDay === undefined) return true;
    const day = Number(entry.date.slice(8, 10));
    return day <= throughDay;
  }));
}

export function daysElapsed(monthKey: string, todayKey: string): number {
  const monthDate = parseMonthKey(monthKey);
  const today = parseDateKey(todayKey);
  if (!monthDate || !today) return 0;
  if (isSameMonth(monthDate, today)) return today.getDate();
  if (monthDate > today) return 0;
  return getDaysInMonth(monthDate);
}

export function avgDaily(entries: ExpenseForCalc[], monthKey: string, todayKey: string): number {
  const monthDate = parseMonthKey(monthKey);
  const elapsed = daysElapsed(monthKey, todayKey);
  if (elapsed <= 0 || !monthDate) return 0;
  const today = parseDateKey(todayKey);
  const currentMonth = today !== null && isSameMonth(monthDate, today);
  return monthTotal(entries, monthKey, currentMonth ? elapsed : undefined) / elapsed;
}

export function monthOverMonth(entries: ExpenseForCalc[], todayKey: string, targetMonthKey?: string): number | null {
  const today = parseDateKey(todayKey);
  if (!today) return null;
  const currentMonthKey = format(today, 'yyyy-MM');
  const monthKey = targetMonthKey ?? currentMonthKey;
  const targetMonth = parseMonthKey(monthKey);
  if (!targetMonth || targetMonth > today) return null;
  const isCurrentMonth = monthKey === currentMonthKey;
  const previousMonth = subMonths(targetMonth, 1);
  const previousMonthKey = format(previousMonth, 'yyyy-MM');
  const comparisonDays = isCurrentMonth ? today.getDate() : getDaysInMonth(targetMonth);
  const currentTotal = monthTotal(entries, monthKey, comparisonDays);
  const priorDays = isCurrentMonth ? Math.min(comparisonDays, getDaysInMonth(previousMonth)) : undefined;
  const previousTotal = monthTotal(entries, previousMonthKey, priorDays);
  if (previousTotal <= 0) return null;
  const change = ((currentTotal - previousTotal) / previousTotal) * 100;
  return Number.isFinite(change) ? change : null;
}

export function highestDay(entries: ExpenseForCalc[], monthKey: string, throughDay?: number): DailyTotal | null {
  const totals = dailyTotalsForMonth(entries, monthKey, throughDay).filter((daily) => daily.total > 0);
  totals.sort((a, b) => b.total - a.total || a.date.localeCompare(b.date));
  return totals[0] ?? null;
}

export function lowestDay(entries: ExpenseForCalc[], monthKey: string, throughDay?: number): DailyTotal | null {
  const totals = dailyTotalsForMonth(entries, monthKey, throughDay).filter((daily) => daily.total > 0);
  totals.sort((a, b) => a.total - b.total || a.date.localeCompare(b.date));
  return totals[0] ?? null;
}

export function dailyTotalsForMonth(entries: ExpenseForCalc[], monthKey: string, throughDay?: number): DailyTotal[] {
  const monthDate = parseMonthKey(monthKey);
  if (!monthDate) return [];
  const count = getDaysInMonth(monthDate);
  const entriesByDate = new Map<string, number>();
  for (const entry of entriesForMonth(entries, monthKey)) {
    const day = Number(entry.date.slice(8, 10));
    if (throughDay !== undefined && day > throughDay) continue;
    entriesByDate.set(entry.date, (entriesByDate.get(entry.date) ?? 0) + validAmount(entry.amount));
  }
  return Array.from({ length: count }, (_, index) => {
    const date = format(addDays(monthDate, index), 'yyyy-MM-dd');
    return { date, total: entriesByDate.get(date) ?? 0 };
  });
}

export function categoryShares(entries: ExpenseForCalc[], monthKey: string, throughDay?: number): CategoryShare[] {
  const monthEntries = entriesForMonth(entries, monthKey).filter((entry) => {
    if (throughDay === undefined) return true;
    return Number(entry.date.slice(8, 10)) <= throughDay;
  });
  const totals = emptyCategoryTotals();
  for (const entry of monthEntries) {
    if (isCategory(entry.category)) totals[entry.category] += validAmount(entry.amount);
  }
  const grandTotal = sumAmounts(monthEntries);
  if (grandTotal <= 0) return categories.map((category) => ({ category, amount: 0, percent: 0 }));

  const tenths = categories.map((category, index) => {
    const exactTenths = totals[category] / grandTotal * 1000;
    const floored = Math.floor(exactTenths);
    return { category, index, amount: totals[category], tenths: floored, remainder: exactTenths - floored };
  });
  const remainingTenths = 1000 - tenths.reduce((total, share) => total + share.tenths, 0);
  [...tenths]
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .slice(0, remainingTenths)
    .forEach((share) => { tenths[share.index]!.tenths += 1; });
  return tenths.map(({ category, amount, tenths: shareTenths }) => ({ category, amount, percent: shareTenths / 10 }));
}

export function dailyExpenseRows(entries: ExpenseForCalc[], monthKey: string, throughDay?: number): DailyExpenseRow[] {
  const monthDate = parseMonthKey(monthKey);
  if (!monthDate) return [];
  const dayCount = Math.min(throughDay ?? getDaysInMonth(monthDate), getDaysInMonth(monthDate));
  const totalsByDate = new Map<string, CategoryTotals>();
  for (const entry of entriesForMonth(entries, monthKey)) {
    if (!isCategory(entry.category)) continue;
    const day = Number(entry.date.slice(8, 10));
    if (day > dayCount) continue;
    const totals = totalsByDate.get(entry.date) ?? emptyCategoryTotals();
    totals[entry.category] += validAmount(entry.amount);
    totalsByDate.set(entry.date, totals);
  }
  return Array.from({ length: dayCount }, (_, index) => {
    const date = format(addDays(monthDate, index), 'yyyy-MM-dd');
    const categoryTotals = totalsByDate.get(date) ?? emptyCategoryTotals();
    const total = categories.reduce((sum, category) => sum + categoryTotals[category], 0);
    return { date, categories: categoryTotals, total };
  });
}

export function firstDataMonth(entries: ExpenseForCalc[], currentMonthKey: string): string {
  const validMonths = entries
    .map((entry) => parseDateKey(entry.date))
    .filter((date): date is Date => date !== null)
    .map((date) => format(date, 'yyyy-MM'))
    .filter((monthKey) => monthKey <= currentMonthKey)
    .sort();
  return validMonths[0] ?? currentMonthKey;
}

export function caution(entries: ExpenseForCalc[], todayKey: string): CautionResult {
  const today = parseDateKey(todayKey);
  if (!today) return { active: false, reason: null, pct: null };

  const previousDays = today.getDate() - 1;
  if (previousDays > 0) {
    const beforeToday = sumAmounts(entriesForMonth(entries, format(today, 'yyyy-MM')).filter((entry) => entry.date < todayKey));
    const averageBeforeToday = beforeToday / previousDays;
    const todayTotal = totalForDate(entries, todayKey);
    if (todayTotal >= 100 && todayTotal > averageBeforeToday * 1.5) {
      const pct = averageBeforeToday > 0 ? ((todayTotal - averageBeforeToday) / averageBeforeToday) * 100 : null;
      return { active: true, reason: 'today', pct: pct !== null && Number.isFinite(pct) ? pct : null };
    }
  }

  const lastSevenStart = addDays(today, -6);
  const priorSevenStart = addDays(today, -13);
  const lastSeven = sumAmountsInDateRange(entries, format(lastSevenStart, 'yyyy-MM-dd'), todayKey);
  const priorSeven = sumAmountsInDateRange(entries, format(priorSevenStart, 'yyyy-MM-dd'), format(addDays(today, -7), 'yyyy-MM-dd'));
  if (priorSeven > 0 && lastSeven > priorSeven * 1.25) {
    const pct = ((lastSeven - priorSeven) / priorSeven) * 100;
    return { active: true, reason: 'week', pct: Number.isFinite(pct) ? pct : null };
  }
  return { active: false, reason: null, pct: null };
}

export function dashboardStats(entries: ExpenseForCalc[], todayKey: string): DashboardStats | null {
  const today = parseDateKey(todayKey);
  if (!today) return null;
  const monthKey = format(today, 'yyyy-MM');
  const previousMonthName = format(subMonths(today, 1), 'MMMM');
  const average = avgDaily(entries, monthKey, todayKey);
  return {
    monthKey,
    monthTotal: monthTotal(entries, monthKey, today.getDate()),
    daysElapsed: today.getDate(),
    avgDaily: average,
    monthOverMonth: monthOverMonth(entries, todayKey),
    previousMonthName,
    highestDay: highestDay(entries, monthKey, today.getDate()),
    categoryShares: categoryShares(entries, monthKey, today.getDate()),
    dailyTotals: dailyTotalsForMonth(entries, monthKey).map((daily) => ({
      ...daily,
      aboveThreshold: average > 0 && daily.total > average * 1.5,
    })),
    caution: caution(entries, todayKey),
  };
}

export function cautionMessage(result: CautionResult): string | null {
  if (!result.active || !result.reason) return null;
  const amount = result.pct === null ? 'above' : `${Math.round(result.pct)}% above`;
  return result.reason === 'today'
    ? `Spending is ${amount} your usual today.`
    : `Spending is ${amount} your usual over the last 7 days.`;
}

function entriesForMonth(entries: ExpenseForCalc[], monthKey: string): ExpenseForCalc[] {
  return entries.filter((entry) => {
    const date = parseDateKey(entry.date);
    return date !== null && format(date, 'yyyy-MM') === monthKey && Number.isFinite(entry.amount);
  });
}

function sumAmounts(entries: ExpenseForCalc[]): number {
  return entries.reduce((total, entry) => total + validAmount(entry.amount), 0);
}

function sumAmountsInDateRange(entries: ExpenseForCalc[], firstDate: string, lastDate: string): number {
  return sumAmounts(entries.filter((entry) => entry.date >= firstDate && entry.date <= lastDate));
}

function emptyCategoryTotals(): CategoryTotals {
  return Object.fromEntries(categories.map((category) => [category, 0])) as CategoryTotals;
}

function parseDateKey(dateKey: string): Date | null {
  const parsedDate = parse(dateKey, 'yyyy-MM-dd', DATE_REFERENCE);
  return isValid(parsedDate) && format(parsedDate, 'yyyy-MM-dd') === dateKey ? parsedDate : null;
}

function parseMonthKey(monthKey: string): Date | null {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;
  const parsedDate = parse(`${monthKey}-01`, 'yyyy-MM-dd', DATE_REFERENCE);
  return isValid(parsedDate) && format(parsedDate, 'yyyy-MM') === monthKey ? parsedDate : null;
}

function validAmount(amount: number): number {
  return Number.isFinite(amount) ? amount : 0;
}

function isCategory(category: string): category is Category {
  return categories.includes(category as Category);
}
