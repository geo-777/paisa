const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatINR(amount: number): string {
  return inrFormatter.format(amount);
}

export function formatPercent(change: number): string {
  const arrow = change < 0 ? '↓' : '↑';
  return `${arrow} ${Math.abs(change).toFixed(1)}%`;
}
