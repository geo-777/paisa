# Product & Technical Context

## 1. What this is
A minimal personal finance tracker for college students. Not a banking or budgeting app.
Core loop: **open, see today, log an expense, done.** Logging must take two taps and a number.
Question the app answers: *Where is my money going, and am I spending more than usual?*

## 2. Non-goals (do not build)
Budgets, goals, bank sync, receipts/OCR, multi-currency, income tracking, sharing, notifications, gamification, accounts other than Google, a backend.

## 3. Stack
- Expo (latest stable SDK), TypeScript strict, `expo-router` (tabs + modal route)
- State: `zustand` with persistence to `@react-native-async-storage/async-storage`
- Auth: `@react-native-google-signin/google-signin` (dev build via EAS, Android first, iOS later)
- Google: plain `fetch` against Sheets API v4 and Drive API v3 (no heavy client SDKs)
- Dates: `date-fns`. Network state: `@react-native-community/netinfo`
- Fonts: Inter via `@expo-google-fonts/inter`
- Charts: hand-built with `react-native-svg`
- Tests: `jest-expo`
- IDs: `expo-crypto` `randomUUID()`

## 4. Auth
- Google Sign-In with scope `https://www.googleapis.com/auth/drive.file` only. This limits the app to files it created.
- Access token: call `GoogleSignin.getTokens()` before each API batch; on a 401 clear the cached token and retry once.
- Silent sign-in on launch (`signInSilently`). If it fails, show the login screen.
- The OAuth client IDs must never change after users exist (`drive.file` access is tied to the client).

## 5. Spreadsheet discovery (reinstall-safe)
Local storage is only a cache. On login:
1. Cached `spreadsheetId` exists? Verify with a cheap `GET` (404/403 means stale, clear it).
2. Else Drive `files.list` with
   `q="appProperties has { key='app' and value='student-finance-v1' } and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"`, `orderBy=modifiedTime desc`. Take the first.
3. Else create one: Drive `files.create` with `name: "Expense Tracker"`, the spreadsheet mimeType and `appProperties: { app: 'student-finance-v1' }`. Then Sheets `batchUpdate` to create the `Log` tab and the current month tab.
4. Save the id to the cache.

## 6. Data model in the spreadsheet
The **Log tab is the source of truth.** Month tabs are generated summaries built with formulas, so there is one write per expense and no read-modify-write races.

**Tab `Log`** (header row 1, append-only):
| A id | B date | C ts | D category | E amount | F note |
|---|---|---|---|---|---|
| uuid | 2026-10-06 (text) | ISO timestamp | Breakfast | 40 | optional |

Write Log rows with `valueInputOption=RAW` so the date stays text and amount stays numeric.
Category values are exactly: `Breakfast`, `Lunch`, `Dinner`, `Snacks`, `Misc`.

**Tab `YYYY-MM`** (one per month, e.g. `2026-10`), created lazily:
| A Date | B Breakfast | C Lunch | D Dinner | E Snacks | F Misc | G Total |
- Pre-fill column A with every date of the month (write with `USER_ENTERED` so they become real dates).
- B2 formula: `=SUMIFS(Log!$E:$E, Log!$B:$B, TEXT($A2,"yyyy-mm-dd"), Log!$D:$D, B$1)` filled across B:F and down all rows.
- G2: `=SUM(B2:F2)`.
- Header cell text must match the Log category names exactly. Misc is documented in a cell note as "non-food stuff".
- Freeze header row. Keep styling minimal.

The app **reads the Log tab** (one `values.get` of `Log!A:F`), computes everything locally, and never reads month tabs. Month tabs exist so the user can view and use the data in Sheets.

## 7. Sync model (offline-first)
```ts
type Category = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks' | 'Misc';
type Entry = {
  id: string;            // uuid, generated on device
  date: string;          // 'YYYY-MM-DD' local
  ts: string;            // ISO timestamp
  category: Category;
  amount: number;        // rupees, up to 2 decimals
  note?: string;
  status: 'pending' | 'synced' | 'failed';
};
```
- Adding an expense: write to the local store immediately (`pending`), UI updates instantly, enqueue a sync job.
- A single serial queue sends pending entries with one `values:append` (batched) to `Log!A:F`. Retry with backoff. Never run two syncs at once.
- Idempotency: before retrying after an ambiguous failure (timeout, no response), read Log column A and skip ids that already exist.
- On app foreground and after login: flush the queue, then pull the Log tab and merge by id (remote wins for synced entries, pending local entries are kept).
- Ensure the month tab exists before the first write of a new month (check `spreadsheets.get` titles, create if missing).
- Delete (undo) an entry: find its row by id, `batchUpdate` `deleteDimension`. Offline deletes are queued too. No edit feature in v1: delete and re-add.
- Respect rate limits (about 60 reads/min/user): never poll, batch writes.

## 8. Screens

### Home (Today)
- Today's date, big total spent today
- Five category amounts in a compact row/grid (Breakfast, Lunch, Dinner, Snacks, Misc)
- One comparison line: `₹180 today · ↑ 12% vs your average`
- Today's entries list (category, amount, time, swipe or long-press to delete)
- Primary `+` button opens Add Expense
- Focused on logging. No charts here.

### Add Expense (modal bottom sheet)
- Amount field auto-focused, numeric keypad opens immediately
- Category chips, single select. Default by time of day: before 11:00 Breakfast, 11:00-15:59 Lunch, 16:00-18:59 Snacks, 19:00+ Dinner. Misc is never auto-selected.
- Date shows `Today` and can be changed (small control, not prominent). Default always today.
- Optional note hidden behind a tap
- One Save button, disabled until amount > 0. On save: close sheet, haptic, entry appears instantly.
- Flow target: tap +, type 60, tap Save.

### Dashboard
- This month total, with `↑ 9.2% vs September` (see calc rules)
- Average per day, highest day (`₹287 · Oct 4`)
- Daily spending bar chart for the month (today highlighted)
- Category distribution as horizontal bars with percentages
- Caution indicator: subtle amber dot plus one line, e.g. `Spending is 30% above your usual`. Only visible when the caution rule triggers.

### Analytics
- Month selector (previous / next, cannot go beyond current month or before the first data month)
- Header text: `Where is my money going, and am I spending more than usual?`
- Daily expense table: Date, five categories, Total (horizontally scrollable if needed, tabular numbers)
- Category totals and percentages
- Average/day, highest day, lowest day (lowest among days with logged spending)
- Month-over-month comparison

### Other
- Login screen (single Google button), Settings sheet (account, sign out, open sheet in Google Sheets, sync status). Settings is reached from an icon on Home, not a fourth tab.
- Bottom tabs: Home, Dashboard, Analytics.
- Required states for every screen: loading (skeleton), empty, offline, error with retry.

## 9. Calculation rules (implement in `src/lib/calc.ts`, test all)
- `monthTotal` = sum of entries in the month.
- `daysElapsed`: for the current month, the day of month today; for past months, days in that month.
- `avgDaily` = `monthTotal / daysElapsed`. Days with no entries count as zero spend.
- `todayVsAverage` = `(today - avgPrev) / avgPrev * 100`, where `avgPrev` is the average daily spend of the days before today in the current month. If there are fewer than 3 previous days, fall back to last month's `avgDaily`. If no baseline exists, show nothing (no fake percentage).
- `monthOverMonth` = `(thisMonthToDate - lastMonthSameDays) / lastMonthSameDays * 100`, comparing the same number of days (days 1..N of both months, N = days elapsed). If last month baseline is 0 or missing, show `No data for <Month>`. For past months compare full month to full previous month.
- `highestDay` / `lowestDay`: by daily total, with date. Lowest ignores zero-spend days.
- `categoryShare` = category total / month total * 100, rounded to 1 decimal, summing display to 100 (largest remainder).
- `caution` is true when `today > avgPrev * 1.5` (and today >= ₹100) OR `last7Days > prior7Days * 1.25` (and prior7Days > 0). Return the reason so the UI can show the right line.
- Percent display: one decimal, arrow `↑`/`↓`, amber for up, soft green for down, muted for under 1% change.
- Rounding: display whole rupees unless paise present.

## 10. Edge cases to handle
- Month rollover while the app is open (recompute "today" on foreground).
- First day of month (no baseline) and first week of use (no previous month).
- Timezone: always local device time. Entries logged just after midnight belong to the new day.
- User deletes or trashes the spreadsheet: detect on 404/trashed, re-run discovery, create new if needed, keep the local pending queue.
- Token revoked: return to login, keep the local queue.
- Duplicate taps on Save: ignore within 500 ms (and ids make server-side dedupe safe).
- Amount input: digits and one decimal point only, max 7 digits, no negatives.

## 11. Folder structure
```
app/                     expo-router routes
  _layout.tsx
  login.tsx
  (tabs)/_layout.tsx
  (tabs)/index.tsx       Home
  (tabs)/dashboard.tsx
  (tabs)/analytics.tsx
  add.tsx                modal route
  settings.tsx
src/
  auth/googleAuth.ts
  sheets/driveApi.ts  sheetsApi.ts  monthTab.ts  discover.ts
  sync/queue.ts
  store/useExpenses.ts  useSession.ts
  lib/calc.ts  dates.ts  format.ts  categories.ts
  components/  AmountInput CategoryChips BottomSheet StatBlock DeltaPill BarChart CategoryBars EntryRow Skeleton
  theme/tokens.ts
__tests__/calc.test.ts  dates.test.ts  queue.test.ts
```

## 12. Definition of done (v1)
- Sign in, create/find the sheet, reinstall + sign in finds the same sheet.
- Log an expense offline, reconnect, it appears in the sheet exactly once.
- Month tab auto-created on the first entry of a new month and totals match the app.
- All calc functions tested, including month boundaries and missing baselines.
- No screen shows a fake or NaN percentage.
- Typecheck, lint and tests pass. Release build installs on a real Android phone.
