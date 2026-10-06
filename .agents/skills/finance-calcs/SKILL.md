---
name: finance-calcs
description: Use when implementing or modifying spending statistics: averages, percentage changes, month-over-month, highest/lowest day, category shares, or the caution indicator. All such logic belongs in src/lib/calc.ts.
---

# Finance calculations playbook

Spec: `docs/context.md` section 9.

## Rules
- Pure functions in `src/lib/calc.ts`. Inputs are plain arrays of `Entry` and explicit dates (never read `new Date()` inside; pass `today` in so tests are deterministic).
- Return `null` when there is no valid baseline. Never return `NaN`, `Infinity`, or a fake `0%`.
- Components only format and display results. They contain no math.

## Key decisions (do not change without asking)
- `avgDaily` divides by days elapsed (not days in the month) for the current month; zero-spend days count.
- Month-over-month compares the same number of days (days 1..N of both months) for the current month. Past months compare full vs full.
- `todayVsAverage` uses the average of days *before* today, so today does not dilute its own baseline. Fewer than 3 previous days falls back to last month's average, then to `null`.
- Category percentages use largest-remainder rounding so the displayed values sum to exactly 100.0.
- Caution: `today > avgPrev * 1.5 && today >= 100` OR `last7 > prior7 * 1.25 && prior7 > 0`. Return `{ active, reason: 'today' | 'week' | null, pct }`.
- Percent direction color: up = amber, down = green, |change| < 1% = muted/neutral.

## Test checklist (write these first)
1. Empty entries everywhere.
2. Day 1 of a month (no previous days).
3. Day 2 and 3 (fallback to last month's average).
4. Previous month missing, and previous month total of 0.
5. Same-days comparison: Oct 6 vs Sept 1-6, not Sept total.
6. Month lengths: Feb (28 and 29), Apr, Dec to Jan rollover.
7. Highest/lowest ties (earliest date wins), lowest ignores zero days.
8. Category share rounding sums to 100.
9. Caution at exact threshold (not triggered), just above (triggered), and below the ₹100 floor.
10. Paise values (e.g. 40.5) and large totals.

## Style
- Small functions, one responsibility, explicit return types.
- Use `date-fns` for date math with local dates. Never `toISOString()` for day keys.
