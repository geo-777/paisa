import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as Crypto from 'expo-crypto';

import type { Category } from '@/src/lib/categories';

export type Entry = {
  id: string;
  date: string;
  ts: string;
  category: Category;
  amount: number;
  note?: string;
  status: 'pending';
};

export type NewEntry = Pick<Entry, 'date' | 'category' | 'amount'> & Pick<Entry, 'note'>;

type ExpensesState = {
  entries: Entry[];
  hasHydrated: boolean;
  hydrationFailed: boolean;
  addEntry: (input: NewEntry) => Entry;
  deleteEntry: (id: string) => void;
  setHydrationPending: () => void;
  finishHydration: (failed: boolean) => void;
};

export const useExpensesStore = create<ExpensesState>()(
  persist(
    (set) => ({
      entries: [],
      hasHydrated: false,
      hydrationFailed: false,
      addEntry: (input) => {
        const entry: Entry = {
          ...input,
          id: Crypto.randomUUID(),
          ts: new Date().toISOString(),
          status: 'pending',
        };
        set((state) => ({ entries: [entry, ...state.entries] }));
        return entry;
      },
      deleteEntry: (id) => set((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) })),
      setHydrationPending: () => set({ hasHydrated: false, hydrationFailed: false }),
      finishHydration: (failed) => set({ hasHydrated: true, hydrationFailed: failed }),
    }),
    {
      name: 'student-finance-expenses-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ entries: state.entries }),
      onRehydrateStorage: () => (_state, error) => {
        useExpensesStore.getState().finishHydration(Boolean(error));
      },
    },
  ),
);

export const selectEntriesForDate = (dateKey: string) => (state: ExpensesState): Entry[] =>
  state.entries.filter((entry) => entry.date === dateKey);

export function useTodayEntries(dateKey: string): Entry[] {
  return useExpensesStore(selectEntriesForDate(dateKey));
}
