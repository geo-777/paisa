export function sanitizeAmountInput(input: string): string {
  const numeric = input.replace(/[^\d.]/g, '');
  const [integerPart = '', ...fractionParts] = numeric.split('.');
  const integer = integerPart.slice(0, 7);
  const fraction = fractionParts.join('').slice(0, 2);
  return numeric.includes('.') ? `${integer}.${fraction}` : integer;
}
