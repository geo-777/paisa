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
export type DeletedEntry = Entry & { deletedAt: string };

type ExpensesState = {
  entries: Entry[];
  deletedEntries: DeletedEntry[];
  deletedIds: string[];
  activeUserId: string | null;
  accounts: Record<string, { entries: Entry[]; deletedEntries: DeletedEntry[]; deletedIds: string[] }>;
  syncStatus: 'synced' | 'syncing' | 'offline' | 'failed';
  syncError: string | null;
  hasHydrated: boolean;
  hydrationFailed: boolean;
  addEntry: (input: NewEntry) => Entry;
  updateEntry: (id: string, input: NewEntry) => void;
  activateUser: (userId: string | null) => void;
  deleteEntry: (id: string) => void;
  restoreEntry: (id: string) => void;
  markEntrySynced: (entry: Entry) => void;
  markEntriesFailed: (ids: string[]) => void;
  mergeRemoteEntries: (entries: Entry[]) => void;
  mergeDeletedEntries: (entries: DeletedEntry[]) => void;
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
      deletedEntries: [],
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
      updateEntry: (id, input) => set((state) => ({
        entries: state.entries.map((entry) => entry.id === id
          ? { ...entry, ...input, note: input.note, status: 'pending' }
          : entry),
      })),
      activateUser: (userId) => set((state) => {
        const accounts = { ...state.accounts };
        if (state.activeUserId) {
          accounts[state.activeUserId] = {
            entries: state.entries,
            deletedEntries: state.deletedEntries,
            deletedIds: state.deletedIds,
          };
        }
        const account = userId ? accounts[userId] : undefined;
        return {
          accounts,
          activeUserId: userId,
          entries: account?.entries ?? [],
          deletedEntries: account?.deletedEntries ?? [],
          deletedIds: account?.deletedIds ?? [],
        };
      }),
      deleteEntry: (id) => set((state) => {
        const entry = state.entries.find((item) => item.id === id);
        if (!entry) return state;
        const deletedEntries = state.deletedEntries.filter((item) => item.id !== id);
        deletedEntries.unshift({ ...entry, deletedAt: new Date().toISOString() });
        return {
          entries: state.entries.filter((item) => item.id !== id),
          deletedEntries,
          deletedIds: state.deletedIds.includes(id) ? state.deletedIds : [...state.deletedIds, id],
        };
      }),
      restoreEntry: (id) => set((state) => {
        const deleted = state.deletedEntries.find((item) => item.id === id);
        if (!deleted) return state;
        const entry: Entry = {
          id: deleted.id,
          date: deleted.date,
          createdAt: deleted.createdAt,
          category: deleted.category,
          amount: deleted.amount,
          ...(deleted.note ? { note: deleted.note } : {}),
          status: deleted.status,
        };
        return {
          entries: [{ ...entry, status: 'pending' }, ...state.entries],
          deletedEntries: state.deletedEntries.filter((item) => item.id !== id),
          deletedIds: state.deletedIds.filter((deletedId) => deletedId !== id),
        };
      }),
      markEntrySynced: (synced) => set((state) => ({
        entries: state.entries.map((entry) => entry.id === synced.id
          && entry.date === synced.date
          && entry.category === synced.category
          && entry.amount === synced.amount
          && entry.note === synced.note
          && entry.createdAt === synced.createdAt
          ? { ...entry, status: 'synced' }
          : entry),
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
      mergeDeletedEntries: (remoteEntries) => set((state) => {
        const localById = new Map(state.deletedEntries.map((entry) => [entry.id, entry]));
        const pendingDeleteIds = new Set(state.deletedIds);
        for (const remote of remoteEntries) {
          if (!pendingDeleteIds.has(remote.id)) localById.set(remote.id, remote);
        }
        return { deletedEntries: [...localById.values()] };
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
      partialize: (state) => ({
        entries: state.entries,
        deletedEntries: state.deletedEntries,
        deletedIds: state.deletedIds,
        activeUserId: state.activeUserId,
        accounts: state.accounts,
      }),
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
