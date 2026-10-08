import AsyncStorage from '@react-native-async-storage/async-storage';

import { useExpensesStore } from '../src/store/useExpenses';

// AsyncStorage documents this Jest mock as its supported unit-test adapter.
jest.mock('@react-native-async-storage/async-storage', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage/jest/async-storage-mock');
});

const storageKey = 'student-finance-expenses-v1';

describe('useExpensesStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useExpensesStore.setState({ entries: [], deletedEntries: [], deletedIds: [], activeUserId: null, accounts: {} });
  });

  it('adds pending entries and restores them from persisted storage', async () => {
    const entry = useExpensesStore.getState().addEntry({
      date: '2024-10-06',
      category: 'Lunch',
      amount: 60,
    });
    expect(entry.status).toBe('pending');

    await new Promise((resolve) => setTimeout(resolve, 0));
    const saved = await AsyncStorage.getItem(storageKey);
    expect(saved).not.toBeNull();

    useExpensesStore.setState({ entries: [] });
    await AsyncStorage.setItem(storageKey, saved as string);
    await useExpensesStore.persist.rehydrate();

    expect(useExpensesStore.getState().entries).toEqual([entry]);
  });

  it('moves a deleted entry to recoverable storage and restores it as pending', () => {
    const entry = useExpensesStore.getState().addEntry({
      date: '2024-10-06',
      category: 'Breakfast',
      amount: 40,
    });

    useExpensesStore.getState().deleteEntry(entry.id);

    expect(useExpensesStore.getState().entries).toEqual([]);
    expect(useExpensesStore.getState().deletedEntries[0]).toMatchObject({ id: entry.id, deletedAt: expect.any(String) });
    expect(useExpensesStore.getState().deletedIds).toContain(entry.id);

    useExpensesStore.getState().restoreEntry(entry.id);

    expect(useExpensesStore.getState().deletedEntries).toEqual([]);
    expect(useExpensesStore.getState().deletedIds).not.toContain(entry.id);
    expect(useExpensesStore.getState().entries[0]).toMatchObject({ id: entry.id, status: 'pending' });
  });

  it('updates a previous entry while preserving its ID and creation time', () => {
    const entry = useExpensesStore.getState().addEntry({
      date: '2024-10-06',
      category: 'Breakfast',
      amount: 40,
      note: 'Old note',
    });

    useExpensesStore.getState().updateEntry(entry.id, {
      date: '2024-10-05',
      category: 'Lunch',
      amount: 75,
    });

    expect(useExpensesStore.getState().entries[0]).toEqual({
      ...entry,
      date: '2024-10-05',
      category: 'Lunch',
      amount: 75,
      note: undefined,
      status: 'pending',
    });
  });
});
