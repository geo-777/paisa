import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { supabase } from '@/src/data/supabase';
import { todayDateKey } from '@/src/lib/dates';
import { getCachedSheetsSettings, loadSheetsSettings } from '@/src/data/sheetsSettings';
import { runDailySync, runFullSync, type FullSyncProgress } from '@/src/data/sheetsSync';

const STATE_KEY = 'paisa-sheets-sync-state-v1';
const LEGACY_OUTBOX_KEY = 'paisa-sheets-outbox-v1';
const FAILURE_COOLDOWN_MS = 30 * 60 * 1000;
export type DailySyncDecision = { enabled: boolean; online: boolean; lastSyncDate: string | null; today: string; lastFailureAt: number | null; now: number };
export function shouldRunDailySync(input: DailySyncDecision): boolean {
  if (!input.enabled || !input.online || input.lastSyncDate === input.today) return false;
  if (input.lastFailureAt !== null && input.now - input.lastFailureAt < FAILURE_COOLDOWN_MS) return false;
  return true;
}

export type SheetsSyncStatus = { syncing: boolean; lastSyncDate: string | null; lastSyncAt: number | null; error: string | null };
const listeners = new Set<(status: SheetsSyncStatus) => void>();
let status: SheetsSyncStatus = { syncing: false, lastSyncDate: null, lastSyncAt: null, error: null };
let scheduledRun: Promise<void> | null = null;
function publish(next: SheetsSyncStatus): void {
  status = next;
  listeners.forEach((listener) => listener(next));
}
export function getSheetsSyncStatus(): SheetsSyncStatus { return status; }
export function subscribeSheetsSyncStatus(listener: (value: SheetsSyncStatus) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

type PersistedState = { lastSyncDate: string | null; lastSyncAt: number | null; lastFailureAt: number | null; error: string | null };
function storageKey(userId: string): string { return `${STATE_KEY}:${userId}`; }
async function readState(userId: string): Promise<PersistedState> {
  const value = await AsyncStorage.getItem(storageKey(userId));
  if (!value) return { lastSyncDate: null, lastSyncAt: null, lastFailureAt: null, error: null };
  try { return JSON.parse(value) as PersistedState; }
  catch { return { lastSyncDate: null, lastSyncAt: null, lastFailureAt: null, error: null }; }
}
async function writeState(userId: string, next: PersistedState): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
}
async function currentUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}
async function ensureSettings(): Promise<void> {
  await loadSheetsSettings();
  const settings = getCachedSheetsSettings();
  if (!settings.enabled) throw new Error('Enable Google Sheets sync in Settings first.');
  if (!settings.url || !settings.token) throw new Error('Add a valid Apps Script URL and token in Settings.');
}

export async function refreshSheetsSyncStatus(userId?: string): Promise<SheetsSyncStatus> {
  const id = userId ?? await currentUserId();
  if (!id) {
    const next = { syncing: false, lastSyncDate: null, lastSyncAt: null, error: null };
    publish(next);
    return next;
  }
  const persisted = await readState(id);
  const next = { syncing: status.syncing, lastSyncDate: persisted.lastSyncDate, lastSyncAt: persisted.lastSyncAt, error: persisted.error };
  publish(next);
  return next;
}

async function performManualSync(full: boolean, onProgress?: (progress: FullSyncProgress) => void): Promise<void> {
  const userId = await currentUserId();
  if (!userId) throw new Error('Sign in before syncing to Sheets.');
  const network = await NetInfo.fetch();
  if (network.isConnected === false || network.isInternetReachable === false) throw new Error('Connect to the internet before syncing to Sheets.');
  await ensureSettings();
  const persisted = await readState(userId);
  publish({ syncing: true, lastSyncDate: persisted.lastSyncDate, lastSyncAt: persisted.lastSyncAt, error: null });
  try {
    if (full) await runFullSync(onProgress);
    else await runDailySync();
    const lastSyncAt = Date.now();
    const done: PersistedState = { lastSyncDate: todayDateKey(), lastSyncAt, lastFailureAt: null, error: null };
    await writeState(userId, done);
    publish({ syncing: false, lastSyncDate: done.lastSyncDate, lastSyncAt, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not sync to Sheets.';
    await writeState(userId, { ...persisted, lastFailureAt: Date.now(), error: message });
    publish({ syncing: false, lastSyncDate: persisted.lastSyncDate, lastSyncAt: persisted.lastSyncAt, error: message });
    throw error;
  }
}

export function runManualDailySync(): Promise<void> { return performManualSync(false); }
export function runManualFullSync(onProgress?: (progress: FullSyncProgress) => void): Promise<void> { return performManualSync(true, onProgress); }

export function requestDailySheetsSync(): Promise<void> {
  if (scheduledRun) return scheduledRun;
  scheduledRun = (async () => {
    let userId: string | null = null;
    let persisted: PersistedState = { lastSyncDate: null, lastSyncAt: null, lastFailureAt: null, error: null };
    try {
      userId = await currentUserId();
      if (!userId) return;
      const network = await NetInfo.fetch();
      const online = network.isConnected !== false && network.isInternetReachable !== false;
      const settings = await loadSheetsSettings();
      persisted = await readState(userId);
      await refreshSheetsSyncStatus(userId);
      if (!shouldRunDailySync({
        enabled: settings.enabled && Boolean(settings.sheets_url) && Boolean(settings.sheets_token),
        online,
        lastSyncDate: persisted.lastSyncDate,
        today: todayDateKey(),
        lastFailureAt: persisted.lastFailureAt,
        now: Date.now(),
      })) return;
      publish({ syncing: true, lastSyncDate: persisted.lastSyncDate, lastSyncAt: persisted.lastSyncAt, error: null });
      await runDailySync();
      const lastSyncAt = Date.now();
      const done: PersistedState = { lastSyncDate: todayDateKey(), lastSyncAt, lastFailureAt: null, error: null };
      await writeState(userId, done);
      publish({ syncing: false, lastSyncDate: done.lastSyncDate, lastSyncAt, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sync to Sheets.';
      if (userId) await writeState(userId, { ...persisted, lastFailureAt: Date.now(), error: message });
      publish({ syncing: false, lastSyncDate: persisted.lastSyncDate, lastSyncAt: persisted.lastSyncAt, error: message });
    }
  })().finally(() => { scheduledRun = null; });
  return scheduledRun;
}

export function startSheetsScheduler(): () => void {
  void AsyncStorage.removeItem(LEGACY_OUTBOX_KEY).catch(() => undefined);
  const schedule = () => { void requestDailySheetsSync(); };
  schedule();
  const appState = AppState.addEventListener('change', (state) => { if (state === 'active') schedule(); });
  const net = NetInfo.addEventListener((state) => { if (state.isConnected && state.isInternetReachable !== false) schedule(); });
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) schedule();
    else if (!session) publish({ syncing: false, lastSyncDate: null, lastSyncAt: null, error: null });
  });
  return () => { appState.remove(); net(); data.subscription.unsubscribe(); };
}
