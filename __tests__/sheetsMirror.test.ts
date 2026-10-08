import { parseSheetsResponse, SheetsError } from '../src/data/sheetsMirror';

describe('Sheets response parsing', () => {
  it('rejects a non-JSON response as a configuration error', async () => {
    await expect(parseSheetsResponse({ ok: true, status: 200, text: async () => 'not json' }))
      .rejects.toMatchObject({ name: 'SheetsError', kind: 'config' });
  });

  it('rejects ok false with a typed error', async () => {
    await expect(parseSheetsResponse({ ok: true, status: 200, text: async () => JSON.stringify({ ok: false, error: 'bad token' }) }))
      .rejects.toMatchObject({ name: 'SheetsError', kind: 'config', message: 'bad token' });
  });

  it('classifies endpoint authorization failures as configuration errors', async () => {
    await expect(parseSheetsResponse({ ok: false, status: 401, text: async () => JSON.stringify({ ok: false }) }))
      .rejects.toBeInstanceOf(SheetsError);
  });
});
