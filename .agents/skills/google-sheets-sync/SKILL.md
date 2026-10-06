---
name: google-sheets-sync
description: Use when writing or changing anything that touches Google Sign-In, Drive, Sheets, spreadsheet discovery, the Log tab, month tabs, or the offline sync queue in this app.
---

# Google Sheets sync playbook

Spec: `docs/context.md` sections 4-7. Read them before coding.

## Principles
- Sheets is the source of truth, local store is a cache. Never lose a pending entry.
- Only `src/sheets/*`, `src/auth/*`, `src/sync/*` may talk to Google. Use plain `fetch`.
- Scope is `drive.file` only. Never request broader scopes.

## Request helper contract
- Attach `Authorization: Bearer <token>` from `getAccessToken()`.
- On 401: clear the cached token, fetch a new one, retry exactly once.
- On 429/5xx: exponential backoff with jitter, max 5 tries.
- On 404 for the spreadsheet: signal `SpreadsheetMissing` so discovery can re-run.
- Throw typed errors (`AuthError`, `NetworkError`, `SpreadsheetMissing`, `ApiError`). Never swallow errors.

## Endpoints you will use
- Drive: `files.create`, `files.list` (with `appProperties` query), `files.get` for validation
- Sheets: `spreadsheets.get` (tab titles), `spreadsheets.batchUpdate` (addSheet, deleteDimension, frozen rows), `spreadsheets.values.get`, `spreadsheets.values.append`, `spreadsheets.values.update`

## Write rules
- Log rows: `valueInputOption=RAW`, `insertDataOption=INSERT_ROWS`, range `Log!A:F`. Date is a text string `YYYY-MM-DD`, amount is a JSON number.
- Month tab header/dates/formulas: `USER_ENTERED` so dates become real dates and formulas evaluate.
- Batch: one append call per sync flush with many rows, not one call per entry.
- Idempotency: each entry has a client-generated uuid in column A. After a timeout or unknown failure, read `Log!A:A`, and skip ids already present before re-appending.
- Delete: read `Log!A:A`, find the row index by id, `batchUpdate` `deleteDimension` on that row. Row indexes shift after deletes, so always re-read before deleting.

## Month tab creation
1. `spreadsheets.get` to list titles. If `YYYY-MM` exists, do nothing.
2. `batchUpdate` addSheet, then one `values.update` writing header + all dates + formulas for the whole month, then freeze row 1.
3. Creating a tab must be safe to run twice (check-then-create, and tolerate "already exists" errors).

## Queue rules
- One serial queue, never two flushes at once (use a mutex flag).
- Pause when `netinfo` says offline, resume on reconnect and app foreground.
- Entries move `pending -> synced` only after a successful response. Failed after max retries: `failed`, shown in Settings with Retry.
- Pull merges remote Log rows by id. Never overwrite a local `pending` entry with remote data.

## Testing
- Mock the request helper, not `fetch` internals.
- Required tests: ordering, retry, no duplicate append after ambiguous failure, offline pause, delete, new-month tab creation, spreadsheet-missing recovery.
- You cannot test real Google behavior in jest. List clearly in your summary which behaviors still need a manual device test.

## Don't
- Don't store tokens yourself (the Google Sign-In library handles them).
- Don't read month tabs in the app.
- Don't poll. Sync on foreground, on login, and after writes.
- Don't guess API shapes. Check official docs when unsure and say what you verified.
