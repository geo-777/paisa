---
name: mobile-ui
description: Use when building or editing any screen or component (Home, Add Expense, Dashboard, Analytics, Settings, login) so the UI follows the minimal dark design system.
---

# Mobile UI playbook

Design spec: `docs/design-system.md`. Behavior spec: `docs/context.md` section 8.

## Before building a screen
1. Import colors, spacing and radius from `src/theme/tokens.ts`. No hardcoded hex values or magic numbers in screens.
2. Reuse existing components. Create a new component only when it is used on 2+ screens or exceeds ~80 lines.
3. List the states you must render: loading (skeleton), empty, offline, error, data. Build all of them.

## Layout rules
- Screen padding 20, 4pt spacing grid, safe-area aware (`react-native-safe-area-context`).
- One primary action per screen. No more than 3 visual groups on Home.
- Cards: `surface` background, 1px `border`, radius 16. No shadows or gradients.
- Every amount uses tabular numbers and `formatINR`. Every percent uses `formatPercent` with arrow and color.
- Touch targets at least 48px. Add `accessibilityLabel` and `accessibilityRole` to every touchable.
- Lists use `FlatList`, never `ScrollView` with `.map` for unbounded data.

## Add Expense sheet (most important screen)
- Keyboard opens instantly: `autoFocus` with `keyboardType="decimal-pad"`.
- Sanitize input: digits and a single dot, max 7 digits, max 2 decimals.
- Chips are single-select, default from `defaultCategoryForTime(now)`.
- Save is disabled until amount > 0, guarded against double-tap, triggers a light haptic, closes immediately (optimistic).
- Date control is small and secondary. Note field is hidden until tapped.
- Android back button closes the sheet without saving.

## Charts
- Build with `react-native-svg` only. Bar chart: one bar per day of the month, today highlighted, optional amber bars above 1.5x average, no gridlines except one faint baseline, no axis clutter (label only 1, 8, 15, 22, last day).
- Category distribution: horizontal bars with name, amount, percent. One color with opacity steps.

## Don't
- Don't add UI kits, icon packs beyond Feather, animation libraries, or chart libraries.
- Don't add emoji, illustrations, badges, streaks, or celebratory effects.
- Don't put math in components.
- Don't show a percentage when `calc` returned `null`.

## Self-check before finishing a screen
Describe the screen at 360px width and with large system font. Confirm nothing overflows, numbers align, and every state has been rendered at least once.
