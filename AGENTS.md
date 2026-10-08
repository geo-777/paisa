# AGENTS.md

Student Finance is a minimal expense tracker for college students. Expo + React Native + TypeScript. Supabase Postgres and Auth are the backend; there is no custom backend.

## Read first

1. `docs/context.md` is the product spec, data model and calculation rules.
2. `docs/design-system.md` for every UI decision.
3. `.agents/skills/*` for task-specific playbooks. Use Supabase, finance-calcs and mobile-ui for matching work.

## Hard rules

- TypeScript strict mode. No `any` or unused dependencies.
- All money and percentage logic lives in `src/lib/calc.ts` as pure functions with unit tests. Never compute stats inside components.
- All Supabase calls go through `src/data/*`. Components never call Supabase or `fetch` directly.
- Never use the Supabase service role or secret key in the app. Only the anon key is allowed.
- Every exposed table has RLS policies that restrict rows to `auth.uid() = user_id`.
- Dates are local `YYYY-MM-DD` strings. Never derive an expense date with `toISOString()`.
- Currency is INR. Format with `Intl.NumberFormat('en-IN')`, no decimals unless the value has paise.
- Local state is an offline cache. Keep pending writes and retries; server rows are the source of truth.
- No budgets, goals, bank sync, receipts, income, sharing, notifications, gamification, OAuth or custom backend.
- Do not add a UI or chart library. Charts are built with `react-native-svg` and `View`.
- The app must run in Expo Go.

## Commands

- `npx expo start`
- `npx tsc --noEmit`
- `npm test`
- `npm run lint`

## Workflow

- Work in the phases from `docs/prompts.md`, one phase per task.
- Before finishing a phase: typecheck, tests and lint must pass. Summarize changes, verification limits and decisions outside the spec.
- Keep commits small and use `phase-N: short description`.
- Do not edit `docs/context.md` silently. If the spec is wrong or ambiguous, ask or propose the change in the summary.
