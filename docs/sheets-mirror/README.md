# Google Sheets snapshot sync setup

The sync is optional and one-way. Supabase remains the source of truth; the app never imports or reads spreadsheet data. It writes one snapshot per month, including tabs named like `october-2026`, with Date (`dd-mm-yy`), Breakfast, Lunch, Dinner, Snacks, Misc and Total columns. There is no Log tab.

## Prepare the Apps Script web app

1. Create a Google Sheet and open **Extensions → Apps Script**.
2. Add the project’s `Code.gs` script. The script file is pending receipt from the project owner; do not deploy until that source has been added and reviewed.
3. Set a long, private shared token in the script configuration. Use the same token in Paisa Settings. Treat it like a password.
4. Deploy **as a Web app**, executing as your account. Choose the access setting required by the script and your account. Anyone with the URL may be able to invoke a publicly accessible deployment, so protect the endpoint with the shared token and do not share the URL.
5. Google may display an **“unverified app”** warning because this personal Apps Script has not gone through Google verification. Continue only if you trust the script source and the deployment.
6. Copy the deployed web app URL into Paisa Settings → **Google Sheets sync**, enter the same token, select **Test connection**, then enable sync.
7. The app syncs the current and previous months once per local calendar day when it is opened or returns to the foreground. **Sync now** runs that sync on demand; **Sync everything** writes all months that contain expenses.

After editing the Apps Script, **create a new version** and update the existing deployment to use it. Saving source edits alone does not update a deployed version.

## Supabase setup

Apply the `user_settings` table definition and policies from `supabase/schema.sql` in the Supabase SQL editor before opening the sync settings. The table stores the endpoint and shared token under owner-only RLS. The enabled toggle and last sync schedule are kept locally per account.

The sheet is overwritten on every sync to make each month a current snapshot. **Do not edit the generated sheet manually**; those edits will be replaced on the next sync. Failures appear in Settings only and never prevent logging expenses to Supabase.
