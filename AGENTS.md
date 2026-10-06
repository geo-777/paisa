# AGENTS.md

Student Finance: a minimal expense tracker for college students. Expo (React Native) + TypeScript. Data lives in the user's own Google Sheet. No backend.

## Read first
1. `docs/context.md` is the product spec, data model and calculation rules. It is the source of truth.
2. `docs/design-system.md` for every UI decision.
3. `.agents/skills/*` for task-specific playbooks (sheets sync, finance calcs, mobile UI). Use them when the task matches.

## Hard rules
- TypeScript strict mode. No `any`. No unused dependencies.
- All money/percentage logic lives in `src/lib/calc.ts` as pure functions with unit tests. Never compute stats inside components.
- All Google API calls go through `src/sheets/*`. Components never call `fetch` directly.
- Dates are local `YYYY-MM-DD` strings. Never derive a date with `toISOString()` (UTC shift breaks IST evenings).
- Currency is INR. Format with `Intl.NumberFormat('en-IN')`, no decimals unless the value has paise.
- Local state is a cache. Google Sheets is the source of truth. The app must work offline and sync later.
- No gamification, badges, streaks, confetti, or extra cards. When unsure, remove rather than add.
- Do not add a UI library or chart library. Charts are hand-built with `react-native-svg` and `View`.
- Do not invent API behavior. If unsure about a Google API or Expo API, check the official docs and say what you verified.

## Commands
- `npx expo start --dev-client`  run the app (needs a dev build, Expo Go will not work for Google Sign-In)
- `npx tsc --noEmit`  typecheck
- `npm test`  unit tests (jest-expo)
- `npm run lint`  lint

## Workflow
- Work in the phases from `docs/prompts.md`, one phase per task. Do not start the next phase.
- Before finishing a phase: typecheck, tests, lint all pass. Then summarize what changed, what you could not verify, and any decision you made that was not in the spec.
- Keep commits small and use the message format `phase-N: short description`.
- Do not edit `docs/context.md` silently. If the spec is wrong or ambiguous, stop and ask, or propose the change in your summary.
