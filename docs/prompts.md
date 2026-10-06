# Codex Prompts

Run one phase per Codex task. Paste the prompt, let it finish, review the diff, run the app, then move on.
Every phase prompt assumes `AGENTS.md` and `docs/context.md` exist in the repo.

---

## Kickoff (run once, no code yet)
```
Read AGENTS.md, docs/context.md, docs/design-system.md and every skill in .agents/skills.
Do not write code yet. Reply with:
1. A summary of the app in 5 lines.
2. Any ambiguity or contradiction you found in the spec.
3. Risks you see, especially around Google Sign-In in Expo and the drive.file scope with the Sheets API.
4. The exact package list you plan to install and why each is needed.
Wait for my confirmation.
```

## Phase 0: Project scaffold and design tokens
```
Phase 0. Create the Expo TypeScript project in the current folder with expo-router (tabs template), strict TypeScript, ESLint, and jest-expo.
- Install only the packages listed in docs/context.md section 3.
- Implement src/theme/tokens.ts from docs/design-system.md and load Inter fonts with a splash/loading gate.
- Build the three tab screens as empty placeholders using the tokens, with a custom dark bottom tab bar (Home, Dashboard, Analytics) using Feather icons.
- Add src/lib/format.ts (INR formatting en-IN, percent formatting with arrows) and src/lib/dates.ts (local date helpers, no toISOString).
- Add unit tests for format.ts and dates.ts.
Acceptance: app starts with `npx expo start --dev-client`, typecheck/lint/tests pass, UI matches the dark design system.
Do not implement auth, Sheets, or real data.
```

## Phase 1: Core logic with tests (no UI, no network)
```
Phase 1. Use the finance-calcs skill.
Implement src/lib/calc.ts exactly per docs/context.md section 9, and src/lib/categories.ts (categories list and defaultCategoryForTime).
Functions: monthTotal, daysElapsed, avgDaily, dailyTotals, todayVsAverage, monthOverMonth, highestDay, lowestDay, categoryTotals, categoryShare, last7VsPrior7, caution.
Write __tests__/calc.test.ts covering: empty data, first day of month, fewer than 3 previous days, previous month missing or zero, month boundaries (Jan to Dec, 28/29/30/31 day months, leap year), same-days comparison, zero-spend days, largest-remainder percentages summing to 100, and caution thresholds.
Acceptance: all tests pass, pure functions only, no NaN or Infinity can be returned (return null for "no baseline").
```

## Phase 2: Local store, Add Expense and Home (local only)
```
Phase 2. Use the mobile-ui skill.
- Implement src/store/useExpenses.ts (zustand + AsyncStorage persist) with addEntry, deleteEntry and selectors for today's entries. Entries have status 'pending' for now.
- Build the Add Expense modal route app/add.tsx: auto-focused numeric amount, category chips with time-based default, date defaulting to Today with a small change control, optional note behind a tap, Save disabled until amount > 0, haptic on save, ignore double-taps.
- Build the Home screen per docs/context.md section 8: date, hero total, five category amounts, comparison line (use calc.ts, hide if null), today's entries with delete, primary + button, loading/empty states.
Acceptance: logging 60 takes tap +, type 60, tap Save. Data persists after app restart. Delete works. Entries logged near midnight land on the correct local date.
Still no Google integration.
```

## Phase 3: Google Sign-In and spreadsheet discovery
```
Phase 3. Use the google-sheets-sync skill. Read docs/setup-google.md first; assume the OAuth clients are already created and their IDs are in .env (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).
- Implement src/auth/googleAuth.ts with @react-native-google-signin/google-signin (scope drive.file only), signInSilently on launch, signOut, and getAccessToken with a single retry on 401.
- Implement src/sheets/driveApi.ts, sheetsApi.ts, discover.ts per docs/context.md section 5, using plain fetch and a small request helper that attaches the token, retries once on 401, and surfaces typed errors.
- Implement src/store/useSession.ts and the login screen (single Google button). Route guard: unauthenticated users see login.
- On login, run discovery and create the spreadsheet with a Log tab (header row) and the current month tab if none exists.
Acceptance (test on a real device with a dev build): sign in creates "Expense Tracker" once; sign out, uninstall, reinstall, sign in finds the SAME spreadsheet; trashing the sheet in Drive makes the app create a new one without crashing.
Report exactly which parts you verified against official docs and which you could not test.
```

## Phase 4: Month tabs and sync queue
```
Phase 4. Use the google-sheets-sync skill.
- Implement src/sheets/monthTab.ts: create tab 'YYYY-MM' lazily with header, all dates of the month, SUMIFS formulas per docs/context.md section 6, Total column, frozen header.
- Implement src/sync/queue.ts: serial queue that batch-appends pending entries to Log!A:F with RAW values, marks them synced, retries with exponential backoff, dedupes by id after ambiguous failures, and pauses when offline (netinfo).
- Implement delete sync (find row by id, deleteDimension).
- Implement pull: read Log!A:F, merge into the store by id, triggered on login and app foreground.
- Show a tiny sync status (synced / syncing / offline / failed with retry) in Settings only.
- Unit-test the queue with a mocked API: ordering, retry, no duplicate append, offline pause, delete.
Acceptance: add an expense in airplane mode, reconnect, it appears once in the Log tab and the month tab total updates. A new month creates its tab automatically.
```

## Phase 5: Dashboard
```
Phase 5. Use the mobile-ui and finance-calcs skills.
Build the Dashboard per docs/context.md section 8: month total with DeltaPill vs previous month (same-days rule), average/day, highest day, daily bar chart (react-native-svg, today highlighted, bars above 1.5x average in amber), category distribution bars, caution indicator only when calc.caution is true.
Handle empty month, first week of use (no previous month baseline), and loading states.
Acceptance: numbers match a hand calculation from the Log tab on 3 sample datasets (add these as test fixtures). No NaN, no fake percentages.
```

## Phase 6: Analytics
```
Phase 6. Use the mobile-ui and finance-calcs skills.
Build Analytics per docs/context.md section 8: month selector with bounds, the header question, daily expense table (sticky header, tabular numbers, zero as '-'), category totals and percentages, average/day, highest and lowest day, month-over-month comparison.
Reuse components from Dashboard. Keep it clean: no new card styles.
Acceptance: switching months is instant (data already in the store), future months are not selectable, a past month compares against its previous month correctly.
```

## Phase 7: Polish, states and edge cases
```
Phase 7. Walk through docs/context.md sections 8 and 10 and verify every item.
- Add skeleton loading, empty, offline and error-with-retry states for all screens.
- Settings: account email, open spreadsheet in Google Sheets, sync status, sign out (keeps local pending queue warning).
- Handle: month rollover while open, token revoked, deleted spreadsheet, duplicate saves, long numbers, small screens, Android back button on the add modal, keyboard overlap.
- Accessibility labels on all touchables, minimum 48px targets, font scaling does not break layouts.
- Add app icon and splash (simple monochrome), set app name and Android package id.
Acceptance: a written checklist in your summary mapping each edge case to where it is handled.
```

## Phase 8: Release build
```
Phase 8. Configure EAS: eas.json with development and preview profiles, Android APK build for preview. Document the exact commands in README.md (install, dev build, run, test, build APK).
Do a final review: remove unused code and dependencies, ensure no secrets are committed, .env.example exists, typecheck/lint/tests pass.
List anything that still needs manual testing on a device.
```

---

## Utility prompts

**Review before merging a phase**
```
Review the changes of this phase against AGENTS.md and docs/context.md. List: (1) spec violations, (2) places where logic leaked out of calc.ts or fetch leaked out of src/sheets, (3) missing tests, (4) UI deviations from docs/design-system.md, (5) anything you assumed. Do not fix yet, just report.
```

**Bug fix**
```
Bug: <what happens>. Expected: <what should happen>. Steps: <steps>.
First write a failing test or a minimal reproduction if it is logic. Then find the root cause, fix it, and explain the cause in 3 lines. Do not refactor unrelated code.
```

**Verify Google behavior (use when auth/sheets misbehave)**
```
Check the current official docs for: Google Sign-In scopes on Android with @react-native-google-signin/google-signin, the drive.file scope with Sheets API values.append and batchUpdate, and Drive files.list with appProperties queries. State what you confirmed, with doc links, and whether our implementation matches. Do not guess.
```

**Small UI tweak**
```
Change only <component/screen>: <change>. Follow docs/design-system.md. Do not touch other files unless required, and list every file you changed.
```
