import { formatDateKey, formatMonthKey } from '../src/lib/dates';

describe('local date keys', () => {
  it('formats date keys from local calendar fields', () => {
    expect(formatDateKey(new Date(2024, 0, 2, 23, 45))).toBe('2024-01-02');
  });

  it('formats a month key with a two-digit month', () => {
    expect(formatMonthKey(new Date(2024, 8, 12))).toBe('2024-09');
  });
});
