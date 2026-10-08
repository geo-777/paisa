import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import * as Crypto from 'expo-crypto';

import type { Category } from '@/src/lib/categories';
import { persistStorage } from '@/src/lib/persistStorage';

export type Entry = {
  id: string;
  date: string;
  createdAt: string;
  category: Category;
  amount: number;
  note?: string;
  status: 'pending' | 'synced' | 'failed';
};

export type NewEntry = Pick<Entry, 'date' | 'category' | 'amount'> & Pick<Entry, 'note'>;

type ExpensesState = {
  entries: Entry[];
  deletedIds: string[];
  activeUserId: string | null;
  accounts: Record<string, { entries: Entry[]; deletedIds: string[] }>;
  syncStatus: 'synced' | 'syncing' | 'offline' | 'failed';
  syncError: string | null;
  hasHydrated: boolean;
  hydrationFailed: boolean;
  addEntry: (input: NewEntry) => Entry;
  activateUser: (userId: string | null) => void;
  deleteEntry: (id: string) => void;
  markEntriesSynced: (ids: string[]) => void;
  markEntriesFailed: (ids: string[]) => void;
  mergeRemoteEntries: (entries: Entry[]) => void;
  clearDeletedId: (id: string) => void;
  setSyncStatus: (status: ExpensesState['syncStatus'], error?: string | null) => void;
  retryFailed: () => void;
  setHydrationPending: () => void;
  finishHydration: (failed: boolean) => void;
};

export const useExpensesStore = create<ExpensesState>()(
  persist(
    (set) => ({
      entries: [],
      deletedIds: [],
      activeUserId: null,
      accounts: {},
      syncStatus: 'synced',
      syncError: null,
      hasHydrated: false,
      hydrationFailed: false,
      addEntry: (input) => {
        const entry: Entry = {
          ...input,
          id: Crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          status: 'pending',
        };
        set((state) => ({ entries: [entry, ...state.entries] }));
        return entry;
      },
      activateUser: (userId) => set((state) => {
        const accounts = { ...state.accounts };
        if (state.activeUserId) accounts[state.activeUserId] = { entries: state.entries, deletedIds: state.deletedIds };
        const account = userId ? accounts[userId] : undefined;
        return {
          accounts,
          activeUserId: userId,
          entries: account?.entries ?? [],
          deletedIds: account?.deletedIds ?? [],
        };
      }),
      deleteEntry: (id) => set((state) => ({
        entries: state.entries.filter((entry) => entry.id !== id),
        deletedIds: state.deletedIds.includes(id) ? state.deletedIds : [...state.deletedIds, id],
      })),
      markEntriesSynced: (ids) => set((state) => ({
        entries: state.entries.map((entry) => ids.includes(entry.id) ? { ...entry, status: 'synced' } : entry),
      })),
      markEntriesFailed: (ids) => set((state) => ({
        entries: state.entries.map((entry) => ids.includes(entry.id) ? { ...entry, status: 'failed' } : entry),
      })),
      mergeRemoteEntries: (remoteEntries) => set((state) => {
        const hiddenIds = new Set(state.deletedIds);
        const localById = new Map(state.entries.map((entry) => [entry.id, entry]));
        for (const remote of remoteEntries) {
          if (hiddenIds.has(remote.id)) continue;
          const local = localById.get(remote.id);
          if (local?.status === 'pending' || local?.status === 'failed') continue;
          localById.set(remote.id, remote);
        }
        return { entries: [...localById.values()] };
      }),
      clearDeletedId: (id) => set((state) => ({ deletedIds: state.deletedIds.filter((deletedId) => deletedId !== id) })),
      setSyncStatus: (syncStatus, syncError = null) => set({ syncStatus, syncError }),
      retryFailed: () => set((state) => ({
        entries: state.entries.map((entry) => entry.status === 'failed' ? { ...entry, status: 'pending' } : entry),
        syncStatus: 'syncing',
        syncError: null,
      })),
      setHydrationPending: () => set({ hasHydrated: false, hydrationFailed: false }),
      finishHydration: (failed) => set({ hasHydrated: true, hydrationFailed: failed }),
    }),
    {
      name: 'student-finance-expenses-v1',
      storage: createJSONStorage(() => persistStorage),
      partialize: (state) => ({ entries: state.entries, deletedIds: state.deletedIds, activeUserId: state.activeUserId, accounts: state.accounts }),
      onRehydrateStorage: () => (_state, error) => {
        useExpensesStore.getState().finishHydration(Boolean(error));
      },
    },
  ),
);

export const selectEntriesForDate = (dateKey: string) => (state: ExpensesState): Entry[] =>
  state.entries.filter((entry) => entry.date === dateKey);

export function useTodayEntries(dateKey: string): Entry[] {
  return useExpensesStore(useShallow(selectEntriesForDate(dateKey)));
}
