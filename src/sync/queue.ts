import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';

import { fetchDeletedExpenses, fetchExpenses, softDeleteExpense, upsertExpense } from '@/src/data/expensesApi';
import { useExpensesStore } from '@/src/store/useExpenses';
import { supabase } from '@/src/data/supabase';

let activeFlush: Promise<void> | null = null;
let syncAgain = false;
let pullAgain = false;

async function waitForExpenseHydration(): Promise<void> {
  const store = useExpensesStore.getState();
  if (!store.hasHydrated) {
    await new Promise<void>((resolve) => {
      let unsubscribe: () => void = () => {};
      unsubscribe = useExpensesStore.persist.onFinishHydration(() => {
        unsubscribe();
        resolve();
      });
      if (useExpensesStore.getState().hasHydrated) {
        unsubscribe();
        resolve();
      }
    });
  }
  if (useExpensesStore.getState().hydrationFailed) {
    throw new Error('Local expenses could not be loaded. Retry loading before syncing.');
  }
}

export function requestSync(options: { pull?: boolean } = {}): Promise<void> {
  if (activeFlush) {
    syncAgain = true;
    pullAgain ||= options.pull ?? false;
    return activeFlush;
  }
  activeFlush = (async () => {
    let shouldPull = options.pull ?? false;
    do {
      syncAgain = false;
      shouldPull ||= pullAgain;
      pullAgain = false;
      await flush(shouldPull);
      shouldPull = false;
    } while (syncAgain);
  })().finally(() => { activeFlush = null; });
  return activeFlush;
}

async function flush(pull: boolean): Promise<void> {
  let flushUserId: string | null = null;
  try {
    await waitForExpenseHydration();
    const { data: authData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!authData.session) return;
    const userId = authData.session.user.id;
    flushUserId = userId;
    if (useExpensesStore.getState().activeUserId !== userId) return;
    const network = await NetInfo.fetch();
    if (!network.isConnected || network.isInternetReachable === false) {
      useExpensesStore.getState().setSyncStatus('offline');
      return;
    }

    useExpensesStore.getState().setSyncStatus('syncing');
    const store = useExpensesStore.getState();
    for (const id of store.deletedIds) {
      const deleted = useExpensesStore.getState().deletedEntries.find((entry) => entry.id === id);
      await softDeleteExpense(id, deleted?.deletedAt ?? new Date().toISOString(), userId);
      useExpensesStore.getState().clearDeletedId(id);
    }
    const pending = useExpensesStore.getState().entries.filter((entry) => entry.status !== 'synced');
    for (const entry of pending) {
      await upsertExpense(entry, userId);
      useExpensesStore.getState().markEntrySynced(entry);
    }
    if (pull) {
      const today = new Date();
      const from = format(startOfMonth(subMonths(today, 1)), 'yyyy-MM-dd');
      const through = format(today, 'yyyy-MM-dd');
      useExpensesStore.getState().mergeRemoteEntries(await fetchExpenses(from, through), from, through);
    }
    useExpensesStore.getState().setSyncStatus('synced');
  } catch (error) {
    const current = useExpensesStore.getState();
    if (flushUserId && current.activeUserId !== flushUserId) return;
    const stillPending = current.entries
      .filter((entry) => entry.status !== 'synced')
      .map((entry) => entry.id);
    useExpensesStore.getState().markEntriesFailed(stillPending);
    useExpensesStore.getState().setSyncStatus('failed', error instanceof Error ? error.message : 'Could not sync expenses.');
  }
}

export function startSyncListeners(): () => void {
  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) void requestSync({ pull: true });
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') void requestSync({ pull: true });
  });
  return () => { unsubscribe(); appState.remove(); };
}

export async function loadMonth(fromDate: Date, toDate: Date): Promise<void> {
  await waitForExpenseHydration();
  const from = format(startOfMonth(fromDate), 'yyyy-MM-dd');
  const through = format(endOfMonth(toDate), 'yyyy-MM-dd');
  const entries = await fetchExpenses(from, through);
  useExpensesStore.getState().mergeRemoteEntries(entries, from, through);
}

export async function loadDeletedMonth(fromDate: Date, toDate: Date): Promise<void> {
  await waitForExpenseHydration();
  const from = format(startOfMonth(fromDate), 'yyyy-MM-dd');
  const through = format(endOfMonth(toDate), 'yyyy-MM-dd');
  const entries = await fetchDeletedExpenses(from, through);
  useExpensesStore.getState().mergeDeletedEntries(entries, from, through);
}
