import { sanitizeAmountInput } from '../src/lib/amountInput';

describe('sanitizeAmountInput', () => {
  it('keeps digits and one decimal point', () => {
    expect(sanitizeAmountInput('₹12.5.8abc')).toBe('12.58');
  });

  it('limits the integer to seven digits and the decimal to two', () => {
    expect(sanitizeAmountInput('12345678.901')).toBe('1234567.90');
  });

  it('removes signs and other non-numeric characters', () => {
    expect(sanitizeAmountInput('-60')).toBe('60');
  });
});
