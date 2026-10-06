import { requestGoogleJson } from './request';

export const SPREADSHEET_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const APP_PROPERTY_QUERY =
  "appProperties has { key='app' and value='student-finance-v1' } and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  trashed?: boolean;
  modifiedTime?: string;
};

type DriveFileList = { files?: DriveFile[] };

export async function listTaggedSpreadsheets(): Promise<DriveFile[]> {
  const query = new URLSearchParams({
    q: APP_PROPERTY_QUERY,
    orderBy: 'modifiedTime desc',
    pageSize: '100',
    fields: 'files(id,name,mimeType,trashed,modifiedTime)',
  });
  const result = await requestGoogleJson<DriveFileList>(`${DRIVE_FILES_URL}?${query.toString()}`);
  return result.files ?? [];
}

export async function getDriveFile(fileId: string): Promise<DriveFile> {
  const query = new URLSearchParams({ fields: 'id,name,mimeType,trashed' });
  return requestGoogleJson<DriveFile>(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?${query.toString()}`, {}, {
    spreadsheetId: fileId,
  });
}

export async function createSpreadsheetFile(): Promise<DriveFile> {
  const query = new URLSearchParams({ fields: 'id,name,mimeType,trashed' });
  return requestGoogleJson<DriveFile>(`${DRIVE_FILES_URL}?${query.toString()}`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Expense Tracker',
      mimeType: SPREADSHEET_MIME_TYPE,
      appProperties: { app: 'student-finance-v1' },
    }),
  });
}
