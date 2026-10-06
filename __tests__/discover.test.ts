import { ApiError, SpreadsheetMissing } from '../src/sheets/errors';
import { discoverSpreadsheet } from '../src/sheets/discover';
import { createSpreadsheetFile, getDriveFile, listTaggedSpreadsheets } from '../src/sheets/driveApi';
import { ensureInitialTabs } from '../src/sheets/monthTab';

jest.mock('../src/sheets/driveApi', () => ({
  createSpreadsheetFile: jest.fn(),
  getDriveFile: jest.fn(),
  listTaggedSpreadsheets: jest.fn(),
  SPREADSHEET_MIME_TYPE: 'application/vnd.google-apps.spreadsheet',
}));

jest.mock('../src/sheets/monthTab', () => ({ ensureInitialTabs: jest.fn() }));

const mockedGetDriveFile = jest.mocked(getDriveFile);
const mockedListSpreadsheets = jest.mocked(listTaggedSpreadsheets);
const mockedCreateSpreadsheet = jest.mocked(createSpreadsheetFile);
const mockedEnsureTabs = jest.mocked(ensureInitialTabs);

describe('discoverSpreadsheet', () => {
  const now = new Date(2024, 9, 6);

  beforeEach(() => jest.clearAllMocks());

  it('validates and reuses the cached spreadsheet id', async () => {
    mockedGetDriveFile.mockResolvedValue({ id: 'cached-id', name: 'Expense Tracker', mimeType: 'application/vnd.google-apps.spreadsheet' });

    const result = await discoverSpreadsheet('cached-id', jest.fn(), now);

    expect(result).toEqual({ spreadsheetId: 'cached-id', created: false });
    expect(mockedListSpreadsheets).not.toHaveBeenCalled();
    expect(mockedEnsureTabs).toHaveBeenCalledWith('cached-id', now, false);
  });

  it('clears a stale cached id and finds the most recently modified tagged sheet', async () => {
    mockedGetDriveFile.mockRejectedValue(new SpreadsheetMissing());
    mockedListSpreadsheets.mockResolvedValue([
      { id: 'newest-id', name: 'Expense Tracker', mimeType: 'application/vnd.google-apps.spreadsheet' },
      { id: 'older-id', name: 'Expense Tracker', mimeType: 'application/vnd.google-apps.spreadsheet' },
    ]);
    const clearCache = jest.fn();

    const result = await discoverSpreadsheet('stale-id', clearCache, now);

    expect(clearCache).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ spreadsheetId: 'newest-id', created: false });
    expect(mockedEnsureTabs).toHaveBeenCalledWith('newest-id', now, false);
  });

  it('creates and initializes a spreadsheet when discovery returns no match', async () => {
    mockedListSpreadsheets.mockResolvedValue([]);
    mockedCreateSpreadsheet.mockResolvedValue({ id: 'created-id', name: 'Expense Tracker', mimeType: 'application/vnd.google-apps.spreadsheet' });

    const result = await discoverSpreadsheet(null, jest.fn(), now);

    expect(result).toEqual({ spreadsheetId: 'created-id', created: true });
    expect(mockedEnsureTabs).toHaveBeenCalledWith('created-id', now, true);
  });

  it('treats cached 403 as stale according to the product discovery rule', async () => {
    mockedGetDriveFile.mockRejectedValue(new ApiError('forbidden', 403, ''));
    mockedListSpreadsheets.mockResolvedValue([]);
    mockedCreateSpreadsheet.mockResolvedValue({ id: 'replacement-id', name: 'Expense Tracker', mimeType: 'application/vnd.google-apps.spreadsheet' });
    const clearCache = jest.fn();

    const result = await discoverSpreadsheet('forbidden-id', clearCache, now);

    expect(clearCache).toHaveBeenCalledTimes(1);
    expect(result.spreadsheetId).toBe('replacement-id');
  });
});
