# Codex Prompts

Run one phase per task. Every phase assumes `AGENTS.md`, `docs/context.md` and `docs/design-system.md` exist.

## Phase 0: Scaffold and design tokens

Create the Expo TypeScript app with expo-router tabs, strict TypeScript, ESLint and jest-expo. Install only packages listed in `docs/context.md`. Add design tokens, load Inter with a splash/loading gate, build placeholder tabs with Feather icons, local date helpers, INR/percent formatting and tests. Do not implement auth or data access.

## Phase 1: Calculation logic

Use the finance-calcs skill. Implement `src/lib/calc.ts` and categories exactly per `docs/context.md`; add unit tests for empty data, thresholds, missing baselines, month boundaries, leap years, zero-spend days, category shares and caution. Pure functions only; no NaN or Infinity.

## Phase 2: Local store, Add Expense and Home

Use the mobile-ui skill. Implement Zustand + AsyncStorage account-scoped local state. Build Add Expense and Home per `docs/context.md`, including optimistic add/delete, local dates, haptic, amount validation, duplicate-tap guard and empty/loading states. No network access in this phase.

## Phase 3: Supabase Auth and client

Use the Supabase skill. Set up `src/data/supabase.ts` with only the public anon key, AsyncStorage session persistence, auto-refresh and URL polyfill. Implement email/password sign-up, sign-in, sign-out and route guard. Add `supabase/schema.sql` with the expenses table and owner-only RLS policies. Settings shows account email and sign out. Verify auth and policy shape against official Supabase docs; never use service-role credentials.

## Phase 4: Expenses API and offline sync

Use the Supabase skill. Put all Supabase table calls in `src/data/expensesApi.ts`. Implement bounded/paginated date reads, idempotent upserts, optimistic local deletes, a serialized retry queue, reconnect/foreground sync and by-ID merge that preserves pending local entries. Query only each screen’s date range. Test offline add/reconnect, idempotent retry, deletion and account isolation.

## Phase 5: Dashboard

Use mobile-ui and finance-calcs skills. Build the Dashboard per context using calculation helpers, hand-built SVG charts, baseline-aware comparisons and caution output. Cover empty and missing-baseline states.

## Phase 6: Analytics

Use mobile-ui and finance-calcs skills. Build Analytics summaries and the fourth Monthly tab. Monthly shows a month selector and the full daily category table, with totals per day and for the month. Fetch the selected month on change; cache results; prevent future month selection. Both screens handle loading, empty, offline and retry states.

## Phase 7: Polish and edge cases

Verify loading, empty, offline and retry states. Handle month rollover, revoked sessions, offline queue, duplicate saves, long amounts, keyboard overlap and Android back behavior. Settings includes email and sign out. Check accessibility, touch targets, safe areas and font scaling.

## Phase 8: Release

Review the implementation, remove unused code/dependencies, ensure `.env.example` exists and no secrets are committed. Document Expo Go and build commands. Run typecheck, lint and tests; list device checks that remain.
