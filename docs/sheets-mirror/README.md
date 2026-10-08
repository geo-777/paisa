# Google Sheets mirror setup

The mirror is optional and one-way. Supabase remains the source of truth; the app never imports or reads spreadsheet data.

## Prepare the Apps Script web app

1. Create a Google Sheet and open **Extensions → Apps Script**.
2. Add the project’s `Code.gs` script. The script file is pending receipt from the project owner; do not deploy until that source has been added and reviewed.
3. Set a long, private shared token in the script configuration. Use the same token in Paisa Settings. Treat it like a password.
4. Deploy **as a Web app**, executing as your account. Choose the access setting required by the script and your account. Anyone with the URL may be able to invoke a publicly accessible deployment, so protect the endpoint with the shared token and do not share the URL.
5. Google may display an **“unverified app”** warning because this personal Apps Script has not gone through Google verification. Continue only if you trust the script source and the deployment.
6. Copy the deployed web app URL into Paisa Settings → **Google Sheets sync**, enter the same token, select **Test connection**, then enable the mirror.
7. Use **Sync everything to Sheets** for a one-time backfill. New additions and deletes are mirrored in the background while enabled and online.

After editing the Apps Script, **create a new version** and update the existing deployment to use it. Saving source edits alone does not update a deployed version.

## Supabase setup

Apply the `user_settings` table definition and policies from `supabase/schema.sql` in the Supabase SQL editor before opening the sync settings. The table stores the endpoint, shared token and enabled state under owner-only RLS. Run the SQL migration once per project.

Failures are shown in Settings and retried in the background. A Sheets outage does not prevent logging expenses to Supabase.
