import { requestGoogleJson } from './request';

const SHEETS_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

export type SpreadsheetMetadata = {
  spreadsheetId: string;
  properties?: { title?: string };
  sheets?: { properties: { sheetId: number; title: string } }[];
};

export type SheetsRequest = Record<string, unknown>;
export type SheetValues = { values?: (string | number | boolean | null)[][] };

export async function getSpreadsheet(spreadsheetId: string): Promise<SpreadsheetMetadata> {
  const query = new URLSearchParams({ fields: 'spreadsheetId,properties(title),sheets(properties(sheetId,title))' });
  return requestGoogleJson<SpreadsheetMetadata>(
    `${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}?${query.toString()}`,
    {},
    { spreadsheetId },
  );
}

export async function batchUpdateSpreadsheet(
  spreadsheetId: string,
  requests: SheetsRequest[],
): Promise<void> {
  await requestGoogleJson<unknown>(`${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  }, { spreadsheetId });
}

export async function updateValues(
  spreadsheetId: string,
  range: string,
  values: (string | number)[][],
  valueInputOption: 'RAW' | 'USER_ENTERED',
): Promise<void> {
  const query = new URLSearchParams({ valueInputOption });
  const encodedRange = encodeURIComponent(range);
  await requestGoogleJson<unknown>(
    `${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodedRange}?${query.toString()}`,
    {
      method: 'PUT',
      body: JSON.stringify({ majorDimension: 'ROWS', values }),
    },
    { spreadsheetId },
  );
}

export async function appendLogRows(spreadsheetId: string, values: (string | number)[][]): Promise<void> {
  if (values.length === 0) return;
  const query = new URLSearchParams({ valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
  const range = encodeURIComponent('Log!A:F');
  await requestGoogleJson<unknown>(
    `${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}/values/${range}:append?${query.toString()}`,
    { method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values }) },
    { spreadsheetId },
  );
}

export async function getValues(spreadsheetId: string, range: string): Promise<(string | number | boolean | null)[][]> {
  const query = new URLSearchParams({ majorDimension: 'ROWS' });
  const response = await requestGoogleJson<SheetValues>(
    `${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?${query.toString()}`,
    {},
    { spreadsheetId },
  );
  return response.values ?? [];
}

export async function deleteLogRowById(spreadsheetId: string, id: string): Promise<void> {
  // Re-read IDs for every delete because Sheets row positions move after deleteDimension.
  const ids = await getValues(spreadsheetId, 'Log!A:A');
  const valueIndex = ids.findIndex((row) => row[0] === id);
  if (valueIndex <= 0) return; // Row 1 is the header; absent IDs are already deleted.
  const spreadsheet = await getSpreadsheet(spreadsheetId);
  const logSheet = spreadsheet.sheets?.find((sheet) => sheet.properties.title === 'Log');
  if (!logSheet) throw new Error('The spreadsheet is missing its Log tab.');
  const rowIndex = valueIndex;
  await batchUpdateSpreadsheet(spreadsheetId, [{
    deleteDimension: {
      range: { sheetId: logSheet.properties.sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
    },
  }]);
}
