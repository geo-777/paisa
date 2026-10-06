# Google & Expo Setup (you do this by hand, Codex cannot)

## 1. Google Cloud project
1. console.cloud.google.com, create project `student-finance`.
2. APIs & Services, Library: enable **Google Sheets API** and **Google Drive API**.
3. OAuth consent screen: User type External, app name, support email. Add scope `.../auth/drive.file`. Leave in **Testing** mode and add every user's Gmail under Test users (limit 100, no verification needed).

## 2. OAuth clients
Create three client IDs (Credentials, Create credentials, OAuth client ID):
- **Web application**: its client ID goes in `.env` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (the Google Sign-In library uses it to get tokens).
- **Android**: package name = your `android.package` in app.json, SHA-1 = from your signing key.
  - Get the debug/dev SHA-1 from the EAS dev build: `eas credentials` (Android) and read the keystore SHA-1.
  - Add a separate Android client for each signing key you use (dev build keystore, and the one for preview/release builds).
- **iOS** (only if you ship iOS later): bundle id.

Do not change or delete these client IDs once friends are using the app.

## 3. Expo / EAS
```
npm i -g eas-cli
eas login
eas build:configure
eas build --profile development --platform android
```
Install the resulting APK on your phone, then run `npx expo start --dev-client`.
Google Sign-In is a native module, so Expo Go will not work.

## 4. .env
```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
```
Commit `.env.example`, never `.env`.

## 5. Things that commonly break
- `DEVELOPER_ERROR` on Android: SHA-1 or package name does not match the Android client ID.
- Sign-in works but Sheets returns 403: API not enabled, or the scope was not requested at sign-in.
- Works for you, not for friend: their email is not in Test users.
- Sheet not found after reinstall: you changed the OAuth client, or the file lacks the `appProperties` tag.
