# Design System

Minimal, dark, calm. Content first. One accent behavior, no decoration.

## Tokens (`src/theme/tokens.ts`)
```ts
export const colors = {
  bg: '#0B0B0D',
  surface: '#141417',
  surfaceRaised: '#1B1B20',
  border: '#1F1F24',
  text: '#F2F2F3',
  textMuted: '#8A8A93',
  textFaint: '#5A5A63',
  up: '#F5A524',      // spending increased / caution (bad direction)
  down: '#4ADE80',    // spending decreased (good direction)
  primary: '#F2F2F3', // primary button bg (light on dark)
  onPrimary: '#0B0B0D',
};
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
```

## Typography (Inter, tabular numbers on every amount)
| Role | Size | Weight |
|---|---|---|
| Hero number | 44 | 600 |
| Title | 22 | 600 |
| Stat number | 28 | 600 |
| Body | 16 | 400 |
| Label | 12, uppercase, letterSpacing 0.8, textMuted | 500 |
Use `fontVariant: ['tabular-nums']` for all numbers so columns align.

## Rules
- Dark only for v1. Background `bg`, cards `surface` with a 1px `border`. No shadows, no gradients, no glow.
- Spacing on a 4pt grid, screen padding 20. Generous whitespace beats borders.
- Radius 16 on cards, pill on chips and buttons.
- Increases in spending are amber, decreases soft green. Never use green for "up".
- Primary button: light background, dark text, 56px high, pill. Only one primary action per screen.
- Charts: single neutral bar color (`textFaint`), today highlighted in `text`, bars above the caution line in `up`. Category bars use opacity steps of one color, not a rainbow.
- Touch targets at least 48px. Respect safe areas and the Android system bars.
- Motion: only functional (sheet slide, number fade). 150-250ms. No bouncing.
- Haptics: light impact on Save and delete, nothing else.
- Icons: simple line icons (`@expo/vector-icons` Feather). No emoji in the UI.
- Copy: short, lowercase-friendly, no exclamation marks, no jargon.

## Component notes
- **Add sheet:** rises from the bottom, amount in hero size at the top, chips below, Save pinned above the keyboard.
- **DeltaPill:** `↑ 9.2%` or `↓ 12.1%` with color, tiny muted caption (`vs September`). Hide when there is no baseline.
- **Caution indicator:** 8px amber dot + one line of muted text. Not a banner, not a card.
- **Table:** sticky header, 13px text, tabular numbers, zero shown as `-`, row height 44.
- **Empty state:** one sentence and one action. No illustrations.
