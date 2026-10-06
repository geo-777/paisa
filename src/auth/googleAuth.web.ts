import { AuthError } from '@/src/sheets/errors';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export type GoogleUser = {
  id: string;
  email: string;
  name: string | null;
  photo: string | null;
};

const nativeAppOnly = (): AuthError =>
  new AuthError('Google Sign-In is available in the installed Android app, not in the browser.', 0);

export function configureGoogleSignIn(): void {
  // Keep web startup working without loading the native Google Sign-In module.
}

export async function signInSilently(): Promise<GoogleUser | null> {
  return null;
}

export async function signInWithGoogle(): Promise<GoogleUser | null> {
  throw nativeAppOnly();
}

export async function signOutFromGoogle(): Promise<void> {
  // There is no browser Google session in this native-only app.
}

export async function getAccessToken(): Promise<string> {
  throw nativeAppOnly();
}

export async function clearCachedAccessToken(_token: string): Promise<void> {
  // Native access tokens are not used in the browser.
}
