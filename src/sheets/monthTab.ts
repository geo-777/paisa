import { addDays, format, getDaysInMonth, startOfMonth } from 'date-fns';

import { categories } from '@/src/lib/categories';
import { formatDateKey } from '@/src/lib/dates';

import { batchUpdateSpreadsheet, getSpreadsheet, updateValues, type SheetsRequest } from './sheetsApi';

export async function ensureInitialTabs(spreadsheetId: string, now = new Date(), renameDefaultTab = false): Promise<void> {
  let spreadsheet = await getSpreadsheet(spreadsheetId);
  const sheetTitles = new Set((spreadsheet.sheets ?? []).map((sheet) => sheet.properties.title));
  const setupRequests: SheetsRequest[] = [];

  if (!sheetTitles.has('Log')) {
    const defaultSheet = renameDefaultTab
      ? spreadsheet.sheets?.find((sheet) => sheet.properties.title === 'Sheet1')
      : undefined;
    if (defaultSheet) {
      setupRequests.push({
        updateSheetProperties: {
          properties: { sheetId: defaultSheet.properties.sheetId, title: 'Log' },
          fields: 'title',
        },
      });
    } else {
      setupRequests.push({ addSheet: { properties: { title: 'Log' } } });
    }
  }

  if (setupRequests.length > 0) {
    try {
      await batchUpdateSpreadsheet(spreadsheetId, setupRequests);
    } catch (error) {
      spreadsheet = await getSpreadsheet(spreadsheetId);
      const titlesAfterRetry = new Set((spreadsheet.sheets ?? []).map((sheet) => sheet.properties.title));
      if (!titlesAfterRetry.has('Log')) throw error;
    }
  }

  await updateValues(spreadsheetId, "'Log'!A1:F1", [['id', 'date', 'ts', 'category', 'amount', 'note']], 'RAW');
  await ensureMonthTab(spreadsheetId, now);
}

export async function ensureMonthTab(spreadsheetId: string, monthDate: Date): Promise<void> {
  const monthTitle = format(monthDate, 'yyyy-MM');
  let spreadsheet = await getSpreadsheet(spreadsheetId);
  let monthSheet = spreadsheet.sheets?.find((sheet) => sheet.properties.title === monthTitle);
  if (monthSheet) return;

  try {
    await batchUpdateSpreadsheet(spreadsheetId, [{ addSheet: { properties: { title: monthTitle } } }]);
  } catch (error) {
    spreadsheet = await getSpreadsheet(spreadsheetId);
    monthSheet = spreadsheet.sheets?.find((sheet) => sheet.properties.title === monthTitle);
    if (monthSheet) return;
    throw error;
  }
  spreadsheet = await getSpreadsheet(spreadsheetId);
  monthSheet = spreadsheet.sheets?.find((sheet) => sheet.properties.title === monthTitle);

  const sheetId = monthSheet?.properties.sheetId;
  if (sheetId === undefined) throw new Error(`Could not find the ${monthTitle} tab after creating it.`);

  await writeMonthTabContents(spreadsheetId, monthDate, sheetId);
}

export async function writeMonthTab(spreadsheetId: string, monthDate: Date): Promise<void> {
  const monthTitle = format(monthDate, 'yyyy-MM');
  const spreadsheet = await getSpreadsheet(spreadsheetId);
  const monthSheet = spreadsheet.sheets?.find((sheet) => sheet.properties.title === monthTitle);
  if (monthSheet?.properties.sheetId === undefined) {
    await ensureMonthTab(spreadsheetId, monthDate);
    return;
  }
  await writeMonthTabContents(spreadsheetId, monthDate, monthSheet.properties.sheetId);
}

async function writeMonthTabContents(spreadsheetId: string, monthDate: Date, sheetId: number): Promise<void> {
  const monthTitle = format(monthDate, 'yyyy-MM');

  const firstDay = startOfMonth(monthDate);
  const daysInMonth = getDaysInMonth(monthDate);
  const values: (string | number)[][] = [[
    'Date',
    ...categories,
    'Total',
  ]];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const rowNumber = day + 1;
    const dayKey = formatDateKey(addDays(firstDay, day - 1));
    const categoryFormulas = categories.map((_, categoryIndex) => {
      const column = String.fromCharCode('B'.charCodeAt(0) + categoryIndex);
      return `=SUMIFS(Log!$E:$E, Log!$B:$B, TEXT($A${rowNumber},"yyyy-mm-dd"), Log!$D:$D, ${column}$1)`;
    });
    values.push([dayKey, ...categoryFormulas, `=SUM(B${rowNumber}:F${rowNumber})`]);
  }

  await updateValues(
    spreadsheetId,
    `'${monthTitle}'!A1:G${daysInMonth + 1}`,
    values,
    'USER_ENTERED',
  );
  await batchUpdateSpreadsheet(spreadsheetId, [
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    {
      updateCells: {
        range: { sheetId, startRowIndex: 0, startColumnIndex: 5, endRowIndex: 1, endColumnIndex: 6 },
        rows: [{ values: [{ note: 'non-food stuff' }] }],
        fields: 'note',
      },
    },
  ]);
}
