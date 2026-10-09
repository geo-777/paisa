# Paisa

A personal expense tracker for students. Supabase is the source of truth; the optional Google Sheets feature writes daily month snapshots.

## Requirements

- Node.js and npm
- An Expo account for EAS builds
- Android device or emulator for device testing

## Install and configure

```sh
npm ci
cp .env.example .env
```

Fill `.env` with the Supabase project URL and **anon/publishable key only**. Never put a Supabase service-role or secret key in the app.

For cloud EAS builds, link the project once and add the two public client values to both EAS environments:

```sh
npm install --global eas-cli
eas login
eas init
eas env:set --name EXPO_PUBLIC_SUPABASE_URL --value 'https://your-project.supabase.co' --environment development --visibility plaintext
eas env:set --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value 'your-anon-key' --environment development --visibility plaintext
eas env:set --name EXPO_PUBLIC_SUPABASE_URL --value 'https://your-project.supabase.co' --environment preview --visibility plaintext
eas env:set --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value 'your-anon-key' --environment preview --visibility plaintext
```

Replace the example values before running those commands. Both values are public client configuration and are embedded in the app bundle.

## Development build and run

Build and install the Android development client APK using the URL EAS prints:

```sh
eas build --platform android --profile development
```

Start Metro and open the installed development client:

```sh
npx expo start --dev-client
```

For local native Android builds instead:

```sh
npx expo run:android
```

## Verify changes

```sh
npx tsc --noEmit
npm run lint
npm test -- --runInBand
```

## Build a preview APK

The `preview` EAS profile produces an internally distributable Android APK:

```sh
eas build --platform android --profile preview
```

The build link from EAS can install the APK directly on a device or emulator. The profile configuration is in [`eas.json`](eas.json).

## Publish APKs with GitHub releases

The workflow in [`.github/workflows/release-apk.yml`](.github/workflows/release-apk.yml) builds a preview APK when a GitHub release is published and attaches it to that release. Before using it:

1. Add an Expo access token as the `EXPO_TOKEN` Actions secret in the GitHub repository settings.
2. Make sure `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set in the EAS `preview` environment. The workflow's cloud build reads variables from EAS, not a GitHub Actions `.env` file.
3. Create a GitHub release from the tag/commit you want to share and publish it. The APK appears as a downloadable release asset after the workflow finishes.

## Google Sheets setup

See [`docs/sheets-mirror/README.md`](docs/sheets-mirror/README.md). The Apps Script source is [`scripts/code.gs`](scripts/code.gs). Store its shared token in Apps Script Script Properties, not in the source file. The sheet is overwritten on sync and should not be edited manually.

## Secrets

`.env` is ignored by Git. `.env.example` contains empty placeholders only. Keep credentials in local environment files or EAS environment variables; never commit real keys or shared tokens. A token previously committed in the Apps Script source must be rotated because removing it from the current file does not erase it from earlier Git history.
