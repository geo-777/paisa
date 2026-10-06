import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { AuthError } from '@/src/sheets/errors';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export type GoogleUser = {
  id: string;
  email: string;
  name: string | null;
  photo: string | null;
};

let configured = false;

export function configureGoogleSignIn(): void {
  if (configured) return;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) {
    throw new AuthError('Google Sign-In is not configured. Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to .env.', 0);
  }
  GoogleSignin.configure({ webClientId, scopes: [DRIVE_FILE_SCOPE] });
  configured = true;
}

export async function signInSilently(): Promise<GoogleUser | null> {
  configureGoogleSignIn();
  const response = await GoogleSignin.signInSilently();
  return response.type === 'success' ? toGoogleUser(response.data.user) : null;
}

export async function signInWithGoogle(): Promise<GoogleUser | null> {
  configureGoogleSignIn();
  const response = await GoogleSignin.signIn();
  return response.type === 'success' ? toGoogleUser(response.data.user) : null;
}

export async function signOutFromGoogle(): Promise<void> {
  await GoogleSignin.signOut();
}

export async function getAccessToken(): Promise<string> {
  configureGoogleSignIn();
  try {
    return (await GoogleSignin.getTokens()).accessToken;
  } catch (error) {
    throw new AuthError(error instanceof Error ? error.message : 'Could not get a Google access token.');
  }
}

export async function clearCachedAccessToken(token: string): Promise<void> {
  await GoogleSignin.clearCachedAccessToken(token);
}

function toGoogleUser(user: {
  id: string;
  email: string;
  name: string | null;
  photo: string | null;
}): GoogleUser {
  return { id: user.id, email: user.email, name: user.name, photo: user.photo };
}
