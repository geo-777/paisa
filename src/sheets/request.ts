import { clearCachedAccessToken, getAccessToken } from '@/src/auth/googleAuth';

import { ApiError, AuthError, NetworkError, SpreadsheetMissing } from './errors';

type RequestOptions = {
  spreadsheetId?: string;
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

type GoogleErrorPayload = { error?: { message?: string } };

export async function requestGoogleJson<T>(
  url: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const fetcher = options.fetcher ?? fetch;
  let authRetryCount = 0;
  let serviceRetryCount = 0;
  let token = '';

  while (true) {
    token = await getAccessToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await fetcher(url, { ...init, headers });
    } catch (error) {
      throw new NetworkError(error instanceof Error ? error.message : 'Could not connect to Google.');
    }

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      try {
        return await response.json() as T;
      } catch {
        throw new ApiError('Google returned an unreadable response.', response.status, '');
      }
    }

    const responseBody = await response.text();
    const message = readGoogleErrorMessage(responseBody) ?? `Google API request failed (${response.status}).`;

    if (response.status === 401 && authRetryCount === 0) {
      authRetryCount += 1;
      try {
        await clearCachedAccessToken(token);
      } catch (error) {
        throw new AuthError(
          error instanceof Error ? error.message : 'Could not clear the expired Google access token.',
        );
      }
      continue;
    }
    if (response.status === 401) throw new AuthError(message, response.status, responseBody);
    if (response.status === 404 && options.spreadsheetId) {
      throw new SpreadsheetMissing(message, response.status, responseBody);
    }

    if ((response.status === 429 || response.status >= 500) && serviceRetryCount < 4) {
      await waitForRetry(serviceRetryCount);
      serviceRetryCount += 1;
      continue;
    }

    throw new ApiError(message, response.status, responseBody);
  }
}

function readGoogleErrorMessage(body: string): string | null {
  try {
    const payload = JSON.parse(body) as GoogleErrorPayload;
    return payload.error?.message ?? null;
  } catch {
    return null;
  }
}

function waitForRetry(retry: number): Promise<void> {
  const delayMs = 500 * 2 ** retry + Math.random() * 250;
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
