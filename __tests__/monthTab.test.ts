import { batchUpdateSpreadsheet, getSpreadsheet, updateValues } from '../src/sheets/sheetsApi';
import { ensureMonthTab, writeMonthTab } from '../src/sheets/monthTab';

jest.mock('../src/sheets/sheetsApi', () => ({
  batchUpdateSpreadsheet: jest.fn(),
  getSpreadsheet: jest.fn(),
  updateValues: jest.fn(),
}));

const mockedBatchUpdate = jest.mocked(batchUpdateSpreadsheet);
const mockedGetSpreadsheet = jest.mocked(getSpreadsheet);
const mockedUpdateValues = jest.mocked(updateValues);

describe('writeMonthTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetSpreadsheet.mockResolvedValue({
      spreadsheetId: 'sheet-id',
      sheets: [{ properties: { sheetId: 12, title: '2024-10' } }],
    });
  });

  it('writes dates, category formulas, totals, a misc note, and a frozen header', async () => {
    await writeMonthTab('sheet-id', new Date(2024, 9, 6));

    const [spreadsheetId, range, values, inputOption] = mockedUpdateValues.mock.calls[0] ?? [];
    expect(spreadsheetId).toBe('sheet-id');
    expect(range).toBe("'2024-10'!A1:G32");
    expect(inputOption).toBe('USER_ENTERED');
    expect(values).toHaveLength(32);
    expect(values?.[0]).toEqual(['Date', 'Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Misc', 'Total']);
    expect(values?.[1]).toEqual([
      '2024-10-01',
      '=SUMIFS(Log!$E:$E, Log!$B:$B, TEXT($A2,"yyyy-mm-dd"), Log!$D:$D, B$1)',
      '=SUMIFS(Log!$E:$E, Log!$B:$B, TEXT($A2,"yyyy-mm-dd"), Log!$D:$D, C$1)',
      '=SUMIFS(Log!$E:$E, Log!$B:$B, TEXT($A2,"yyyy-mm-dd"), Log!$D:$D, D$1)',
      '=SUMIFS(Log!$E:$E, Log!$B:$B, TEXT($A2,"yyyy-mm-dd"), Log!$D:$D, E$1)',
      '=SUMIFS(Log!$E:$E, Log!$B:$B, TEXT($A2,"yyyy-mm-dd"), Log!$D:$D, F$1)',
      '=SUM(B2:F2)',
    ]);
    expect(values?.[31]?.[0]).toBe('2024-10-31');
    expect(mockedBatchUpdate).toHaveBeenCalledWith('sheet-id', expect.arrayContaining([
      expect.objectContaining({
        updateSheetProperties: expect.objectContaining({
          properties: { sheetId: 12, gridProperties: { frozenRowCount: 1 } },
        }),
      }),
      expect.objectContaining({
        updateCells: expect.objectContaining({
          rows: [{ values: [{ note: 'non-food stuff' }] }],
        }),
      }),
    ]));
  });
});

describe('ensureMonthTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates and initializes a missing month tab, but leaves an existing tab alone', async () => {
    mockedGetSpreadsheet
      .mockResolvedValueOnce({ spreadsheetId: 'sheet-id', sheets: [] })
      .mockResolvedValueOnce({ spreadsheetId: 'sheet-id', sheets: [{ properties: { sheetId: 15, title: '2024-10' } }] });

    await ensureMonthTab('sheet-id', new Date(2024, 9, 6));

    expect(mockedBatchUpdate).toHaveBeenNthCalledWith(1, 'sheet-id', [{ addSheet: { properties: { title: '2024-10' } } }]);
    expect(mockedUpdateValues).toHaveBeenCalledWith(
      'sheet-id',
      "'2024-10'!A1:G32",
      expect.any(Array),
      'USER_ENTERED',
    );

    jest.clearAllMocks();
    mockedGetSpreadsheet.mockResolvedValue({ spreadsheetId: 'sheet-id', sheets: [{ properties: { sheetId: 15, title: '2024-10' } }] });
    await ensureMonthTab('sheet-id', new Date(2024, 9, 6));
    expect(mockedBatchUpdate).not.toHaveBeenCalled();
    expect(mockedUpdateValues).not.toHaveBeenCalled();
  });
});
