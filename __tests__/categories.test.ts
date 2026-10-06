import { defaultCategoryForTime } from '../src/lib/categories';

describe('defaultCategoryForTime', () => {
  it.each([
    [10, 'Breakfast'],
    [11, 'Lunch'],
    [15, 'Lunch'],
    [16, 'Snacks'],
    [18, 'Snacks'],
    [19, 'Dinner'],
    [23, 'Dinner'],
  ] as const)('selects %s hour as %s', (hour, category) => {
    expect(defaultCategoryForTime(new Date(2024, 0, 1, hour))).toBe(category);
  });
});
