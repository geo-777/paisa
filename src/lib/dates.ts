import { format } from 'date-fns';

export function formatDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function formatMonthKey(date: Date): string {
  return format(date, 'yyyy-MM');
}

export function todayDateKey(): string {
  return formatDateKey(new Date());
}
