export const categories = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Misc'] as const;

export type Category = (typeof categories)[number];

export function defaultCategoryForTime(now: Date): Exclude<Category, 'Misc'> {
  const hour = now.getHours();
  if (hour < 11) return 'Breakfast';
  if (hour < 16) return 'Lunch';
  if (hour < 19) return 'Snacks';
  return 'Dinner';
}
