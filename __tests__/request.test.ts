import { clearCachedAccessToken, getAccessToken } from '../src/auth/googleAuth';
import { AuthError, SpreadsheetMissing } from '../src/sheets/errors';
import { requestGoogleJson } from '../src/sheets/request';

jest.mock('../src/auth/googleAuth', () => ({
  clearCachedAccessToken: jest.fn(),
  getAccessToken: jest.fn(),
}));

const mockedGetAccessToken = jest.mocked(getAccessToken);
const mockedClearCachedAccessToken = jest.mocked(clearCachedAccessToken);
type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe('requestGoogleJson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears a rejected token and retries exactly once with a fresh token', async () => {
    mockedGetAccessToken.mockResolvedValueOnce('old-token').mockResolvedValueOnce('fresh-token');
    const fetcher = jest.fn<ReturnType<FetchFunction>, Parameters<FetchFunction>>()
      .mockResolvedValueOnce(new Response('{"error":{"message":"expired"}}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

    const result = await requestGoogleJson<{ ok: boolean }>('https://example.test', {}, { fetcher });

    expect(result).toEqual({ ok: true });
    expect(mockedClearCachedAccessToken).toHaveBeenCalledTimes(1);
    expect(mockedClearCachedAccessToken).toHaveBeenCalledWith('old-token');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer old-token');
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe('Bearer fresh-token');
  });

  it('returns a typed AuthError after a second 401', async () => {
    mockedGetAccessToken.mockResolvedValue('same-token');
    const fetcher = jest.fn<ReturnType<FetchFunction>, Parameters<FetchFunction>>()
      .mockImplementation(() => Promise.resolve(new Response('{"error":{"message":"denied"}}', { status: 401 })));

    await expect(requestGoogleJson('https://example.test', {}, { fetcher })).rejects.toBeInstanceOf(AuthError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('maps spreadsheet 404 responses to SpreadsheetMissing', async () => {
    mockedGetAccessToken.mockResolvedValue('token');
    const fetcher = jest.fn<ReturnType<FetchFunction>, Parameters<FetchFunction>>()
      .mockResolvedValue(new Response('{"error":{"message":"not found"}}', { status: 404 }));

    await expect(
      requestGoogleJson('https://example.test', {}, { fetcher, spreadsheetId: 'sheet-id' }),
    ).rejects.toBeInstanceOf(SpreadsheetMissing);
  });
});
