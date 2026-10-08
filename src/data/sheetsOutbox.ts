import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { SheetsError, sheetsActions } from '@/src/data/sheetsMirror';
import { areSheetsSettingsLoaded, getCachedSheetsSettings, loadSheetsSettings } from '@/src/data/sheetsSettings';

const STORAGE_KEY = 'paisa-sheets-outbox-v1';
export type SheetsOp = { type: 'upsert' | 'delete'; entryId: string };
export type OutboxConfig = { enabled: boolean; url: string; token: string };
export type OutboxStatus = { syncing: boolean; linkProblem: boolean; message: string | null };
let outboxStatus: OutboxStatus = { syncing: false, linkProblem: false, message: null };
const statusListeners = new Set<(status: OutboxStatus) => void>();
function publishStatus(next: OutboxStatus): void {
  outboxStatus = next;
  statusListeners.forEach((listener) => listener(next));
}
export function getSheetsOutboxStatus(): OutboxStatus { return outboxStatus; }
export function subscribeSheetsOutboxStatus(listener: (status: OutboxStatus) => void): () => void {
  statusListeners.add(listener);
  return () => { statusListeners.delete(listener); };
}
export interface OutboxAdapter {
  read: () => Promise<SheetsOp[]>;
  write: (ops: SheetsOp[]) => Promise<void>;
  online: () => Promise<boolean>;
  config: () => Promise<OutboxConfig>;
  push: (op: SheetsOp, config: OutboxConfig) => Promise<void>;
  entry: (id: string) => Promise<import('@/src/store/useExpenses').Entry | undefined>;
  wait: (ms: number) => Promise<void>;
}
const adapter: OutboxAdapter = {
  read: async () => JSON.parse(await AsyncStorage.getItem(STORAGE_KEY) ?? '[]') as SheetsOp[],
  write: async (ops) => { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ops)); },
  online: async () => { const state = await NetInfo.fetch(); return state.isConnected !== false && state.isInternetReachable !== false; },
  config: async () => getCachedSheetsSettings(),
  push: async (op, config) => {
    if (op.type === 'delete') await sheetsActions.delete(config.url, config.token, op.entryId);
    else {
      const entry = await adapter.entry(op.entryId);
      if (entry) await sheetsActions.upsert(config.url, config.token, entry);
    }
  },
  entry: async (id) => (await import('@/src/store/useExpenses')).useExpensesStore.getState().entries.find((entry) => entry.id === id),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class SheetsOutbox {
  private active: Promise<void> | null = null;
  private mutation: Promise<void> = Promise.resolve();
  private runAgain = false;
  constructor(private readonly io: OutboxAdapter = adapter, private readonly maxRetries = 5) {}
  async enqueue(op: SheetsOp): Promise<void> {
    this.mutation = this.mutation.then(async () => {
      const current = await this.io.read();
      const next = current.filter((item) => item.entryId !== op.entryId);
      next.push(op);
      await this.io.write(next);
    });
    await this.mutation;
    void this.flush();
  }
  flush(): Promise<void> {
    if (this.active) {
      this.runAgain = true;
      return this.active;
    }
    this.active = (async () => {
      do {
        this.runAgain = false;
        await this.run();
      } while (this.runAgain);
    })().finally(() => { this.active = null; });
    return this.active;
  }
  private async run(): Promise<void> {
    await this.mutation;
    while (await this.io.online()) {
      const config = await this.io.config();
      if (!config.enabled || !config.url || !config.token) {
        publishStatus({ ...outboxStatus, syncing: false });
        return;
      }
      const ops = await this.io.read();
      const op = ops[0];
      if (!op) {
        publishStatus({ syncing: false, linkProblem: false, message: null });
        return;
      }
      publishStatus({ syncing: true, linkProblem: false, message: null });
      let sent = false;
      for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
        if (!await this.io.online()) {
          publishStatus({ ...outboxStatus, syncing: false });
          return;
        }
        try { await this.io.push(op, config); sent = true; break; }
        catch (error) {
          if (error instanceof SheetsError && error.kind === 'config') {
            publishStatus({ syncing: false, linkProblem: true, message: error.message });
            break;
          }
          if (attempt + 1 < this.maxRetries) await this.io.wait(Math.min(1000 * 2 ** attempt, 30_000));
          else publishStatus({ syncing: false, linkProblem: false, message: error instanceof Error ? error.message : 'Could not sync to Sheets.' });
        }
      }
      if (!sent) return;
      await this.io.write((await this.io.read()).filter((item) => item.entryId !== op.entryId));
      publishStatus({ syncing: false, linkProblem: false, message: null });
    }
    publishStatus({ syncing: false, linkProblem: false, message: null });
  }
  async count(): Promise<number> { return (await this.io.read()).length; }
}

export const sheetsOutbox = new SheetsOutbox();
export async function enqueueSheetsOpIfEnabled(op: SheetsOp): Promise<void> {
  if (!areSheetsSettingsLoaded()) await loadSheetsSettings();
  if (getCachedSheetsSettings().enabled) await sheetsOutbox.enqueue(op);
}
export function startSheetsOutboxListeners(): () => void {
  const net = NetInfo.addEventListener((state) => { if (state.isConnected && state.isInternetReachable !== false) void sheetsOutbox.flush(); });
  const app = AppState.addEventListener('change', (state) => { if (state === 'active') void sheetsOutbox.flush(); });
  return () => { net(); app.remove(); };
}
