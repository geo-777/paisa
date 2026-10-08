import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';

import { fetchDeletedExpenses, fetchExpenses, softDeleteExpense, upsertExpense } from '@/src/data/expensesApi';
import { useExpensesStore } from '@/src/store/useExpenses';
import { supabase } from '@/src/data/supabase';

let activeFlush: Promise<void> | null = null;
let syncAgain = false;
let pullAgain = false;

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
  const { data: authData } = await supabase.auth.getSession();
  if (!authData.session) return;
  const network = await NetInfo.fetch();
  if (!network.isConnected || network.isInternetReachable === false) {
    useExpensesStore.getState().setSyncStatus('offline');
    return;
  }

  const store = useExpensesStore.getState();
  store.setSyncStatus('syncing');
  try {
    for (const id of store.deletedIds) {
      const deleted = useExpensesStore.getState().deletedEntries.find((entry) => entry.id === id);
      await softDeleteExpense(id, deleted?.deletedAt ?? new Date().toISOString());
      useExpensesStore.getState().clearDeletedId(id);
    }
    const pending = useExpensesStore.getState().entries.filter((entry) => entry.status !== 'synced');
    for (const entry of pending) {
      await upsertExpense(entry);
      useExpensesStore.getState().markEntrySynced(entry);
    }
    if (pull) {
      const today = new Date();
      const from = format(startOfMonth(subMonths(today, 1)), 'yyyy-MM-dd');
      const through = format(today, 'yyyy-MM-dd');
      useExpensesStore.getState().mergeRemoteEntries(await fetchExpenses(from, through));
    }
    useExpensesStore.getState().setSyncStatus('synced');
  } catch (error) {
    const stillPending = useExpensesStore.getState().entries
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
  const entries = await fetchExpenses(format(startOfMonth(fromDate), 'yyyy-MM-dd'), format(endOfMonth(toDate), 'yyyy-MM-dd'));
  useExpensesStore.getState().mergeRemoteEntries(entries);
}

export async function loadDeletedMonth(fromDate: Date, toDate: Date): Promise<void> {
  const entries = await fetchDeletedExpenses(format(startOfMonth(fromDate), 'yyyy-MM-dd'), format(endOfMonth(toDate), 'yyyy-MM-dd'));
  useExpensesStore.getState().mergeDeletedEntries(entries);
}
