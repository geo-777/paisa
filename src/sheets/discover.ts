import { ApiError, SpreadsheetMissing } from './errors';
import { createSpreadsheetFile, getDriveFile, listTaggedSpreadsheets, SPREADSHEET_MIME_TYPE } from './driveApi';
import { ensureInitialTabs } from './monthTab';

export type DiscoveryResult = { spreadsheetId: string; created: boolean };

export async function discoverSpreadsheet(
  cachedSpreadsheetId: string | null,
  clearStaleCache: () => void,
  now = new Date(),
): Promise<DiscoveryResult> {
  let spreadsheetId = cachedSpreadsheetId;
  let created = false;

  if (spreadsheetId) {
    try {
      const cachedFile = await getDriveFile(spreadsheetId);
      if (cachedFile.trashed || cachedFile.mimeType !== SPREADSHEET_MIME_TYPE) {
        clearStaleCache();
        spreadsheetId = null;
      }
    } catch (error) {
      if (error instanceof SpreadsheetMissing || (error instanceof ApiError && error.status === 403)) {
        clearStaleCache();
        spreadsheetId = null;
      } else {
        throw error;
      }
    }
  }

  if (!spreadsheetId) {
    const files = await listTaggedSpreadsheets();
    const firstFile = files[0];
    if (firstFile) {
      spreadsheetId = firstFile.id;
    } else {
      const createdFile = await createSpreadsheetFile();
      if (!createdFile.id) throw new ApiError('Drive created the spreadsheet without returning an ID.', 200, '');
      spreadsheetId = createdFile.id;
      created = true;
    }
  }

  await ensureInitialTabs(spreadsheetId, now, created);
  return { spreadsheetId, created };
}
