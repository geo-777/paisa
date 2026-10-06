import { formatINR, formatPercent } from '../src/lib/format';

describe('formatINR', () => {
  it('formats whole rupees with Indian grouping and no decimals', () => {
    expect(formatINR(123456)).toBe('₹1,23,456');
  });

  it('preserves paise when present', () => {
    expect(formatINR(40.5)).toBe('₹40.5');
    expect(formatINR(40.55)).toBe('₹40.55');
  });
});

describe('formatPercent', () => {
  it('uses an up arrow for positive changes', () => {
    expect(formatPercent(9.24)).toBe('↑ 9.2%');
  });

  it('uses a down arrow and absolute value for negative changes', () => {
    expect(formatPercent(-12.06)).toBe('↓ 12.1%');
  });
});
