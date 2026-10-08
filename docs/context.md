# Product & Technical Context

Supabase is the source of truth. An optional one-way Google Sheets mirror is supported for users who configure an Apps Script web app. The app never reads data from Sheets; Google Sign-In and Drive integration are not used.

## Product

A minimal personal finance tracker for college students. Core loop: open, see today, log an expense, done. The app answers: “Where is my money going, and am I spending more than usual?”

Do not build budgets, goals, bank sync, receipts, multi-currency, income tracking, sharing, notifications, gamification, social login or a custom backend.

## Stack

- Expo (latest stable SDK), TypeScript strict, expo-router (tabs + modal route).
- Supabase Postgres + Auth; `@supabase/supabase-js` and `react-native-url-polyfill`.
- Supabase email/password only. Persist sessions with `@react-native-async-storage/async-storage`.
- Zustand state, `date-fns`, Inter (`@expo-google-fonts/inter`), Feather icons.
- Hand-built charts with `react-native-svg`; jest-expo tests; IDs from `expo-crypto` `randomUUID()`.
- Must run in Expo Go; no custom native modules.
- `.env` is never committed. Commit `.env.example` containing `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` only. Never use a service-role or secret key in the client.

## Database

`supabase/schema.sql` defines the only v1 table, `public.expenses`, with UUID id, `user_id`, local calendar `date`, category (`breakfast`, `lunch`, `dinner`, `snacks`, `misc`), positive numeric amount, optional note, `created_at` and nullable `deleted_at`. RLS restricts all operations to the authenticated owner. No other tables in v1.

Expense dates are chosen on device as local `YYYY-MM-DD`; never derive a date with `toISOString()`.

## Data model and flow

UI categories display capitalized names; database category values are lowercase. An entry contains `{ id, date, category, amount, note?, createdAt, status: 'synced' | 'pending' | 'failed' }`.

- Add: generate a UUID on device; add immediately to the account-scoped local store as pending; upsert to Supabase with that ID. Mark synced only after success. Retry pending entries on app foreground and network reconnect.
- Delete: move the expense into the account-scoped Recently Deleted list immediately; queue a `deleted_at` update for retry while offline. Restore clears `deleted_at` and is also queued offline. Do not physically delete expense rows from the app.
- Edit: update the existing row by ID in the local store and upsert it; preserve its ID and creation time.
- Load only the date ranges a screen needs; never select all. Supabase may cap a response at 1000 rows per request, so paginate.
- Home and Dashboard load from the first day of the previous month through today.
- Analytics fetches the selected month and preceding month on selection change, then caches results.
- Persist local state to AsyncStorage. Merge server data by ID without overwriting pending local entries.
- All Supabase calls live in `src/data/expensesApi.ts` (client setup in `src/data/supabase.ts`). UI components never call Supabase directly.
- RLS ensures users can only read or mutate their own data. Local caches must also be separated by account.

## Auth

Email/password sign-up, sign-in and sign-out. Minimum password length is six characters. Explain auth errors clearly (wrong password, email taken, weak password, offline). Configure Supabase session persistence with `persistSession: true` and `autoRefreshToken: true`. Signed-out users see only Login. Session expiry/revocation returns to Login while retaining that account’s pending queue for its next sign-in.

For development, turn off **Confirm email** under Supabase Authentication → Providers → Email so registration signs in immediately. Settings (opened from Home, not a fourth tab) displays account email and Sign out. “Delete my data” is not in v1.

## Screens

- **Home:** today’s date, total spent, five compact category amounts, optional today-vs-average line, today’s entries with category/amount/time and long-press or swipe delete, plus button. No charts.
- **Add Expense modal:** auto-focused numeric input; category chips; time-based default (before 11:00 Breakfast, 11:00–15:59 Lunch, 16:00–18:59 Snacks, 19:00+ Dinner; never default to Misc); date defaults to Today with a secondary change control; optional note behind a tap. Save disabled until amount > 0, light haptic, optimistic close, ignore duplicate taps within 500 ms. Digits and one decimal point, max 7 digits and 2 decimals.
- **Dashboard:** this month total and same-days comparison; average/day, highest day; daily bar chart with today highlighted; category distribution; caution dot and one line only when caution triggers.
- **Analytics:** bounded month selector; question “Where is my money going, and am I spending more than usual?”; daily table with five categories and total (tabular numbers, zero as `-`); category totals and shares; average/day, highest/lowest day; month-over-month comparison.
- **Monthly:** fourth tab with a month selector, multi-select category filters and the total for the selected categories. The full daily table shows date and total; expand a day to see its expense entries and edit or move them to Recently Deleted. Recently Deleted entries can be restored. Include loading, empty, offline and error-with-retry states.
- Tabs: Home, Dashboard, Analytics, Monthly. Each screen handles loading, empty, offline and error-with-retry states.

## Calculation rules

Implement all money and percentage logic as pure functions in `src/lib/calc.ts`; pass today as a parameter and never read the clock inside calculation functions.

- `monthTotal`: sum entries in the month.
- `daysElapsed`: current month uses today’s day number; past month uses all days in that month. Zero-spend days count in average/day.
- `todayVsAverage = (today - avgPrev) / avgPrev * 100`; `avgPrev` is average daily spend before today this month. With fewer than three prior days, use last month’s average. Missing baseline returns null.
- `monthOverMonth`: compare days 1..N for this and last month, where N is days elapsed; past months compare full months. Missing/zero baseline returns null and UI says `No data for <Month>`.
- Highest/lowest day ties go to earliest date; lowest excludes zero-spend days.
- Category shares use largest remainder to one decimal and sum to 100.0.
- Caution is true if `today > avgPrev * 1.5 && today >= 100`, or `last7Days > prior7Days * 1.25 && prior7Days > 0`; return the reason.
- Never return NaN or Infinity. Percent display uses one decimal and ↑/↓; amber for increases, soft green for decreases, muted below 1%.
- INR uses `Intl.NumberFormat('en-IN')`, whole rupees unless paise exist.

## Edge cases

Recompute today on foreground and month rollover. Expenses after midnight belong to the new local day. Handle first day of month and first week without baselines. Duplicate saves within 500 ms are ignored. Offline add syncs once on reconnect. A revoked/expired session returns to Login and preserves pending data for the same account.

## Definition of done

Sign-up, sign-in and sign-out work; sessions survive restart; an expense appears immediately and persists to Supabase; reinstall plus sign-in restores server data; offline add syncs once; RLS prevents cross-user access; calculation rules have unit tests for month boundaries and missing baselines; no NaN or fake percentages; typecheck, lint and tests pass; app runs in Expo Go.

## Optional Google Sheets mirror

The mirror is opt-in and one-way: expense additions and deletes are sent to the user's configured Apps Script endpoint after their Supabase write succeeds or is durably queued locally. Supabase remains authoritative, and mirror failures never delay expense logging. There is no read-from-Sheets path. Configuration lives in the owner-only `user_settings` table; the token is also cached locally in SecureStore. A persisted, serial outbox retries writes while online and enabled. Settings provides connection testing, status, full backfill in chunks of at most 200, and setup instructions. Incremental edits and restores are not mirrored.
