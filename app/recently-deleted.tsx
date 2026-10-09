import Feather from '@expo/vector-icons/Feather';
import { format, parse } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatINR } from '@/src/lib/format';
import { useExpensesStore, type DeletedEntry } from '@/src/store/useExpenses';
import { loadDeletedMonth, requestSync } from '@/src/sync/queue';
import { colors, radius, screenPadding, space } from '@/src/theme/tokens';
import { useNetworkStatus } from '@/src/hooks/useNetworkStatus';

export default function RecentlyDeletedScreen() {
  const params = useLocalSearchParams<{ month?: string }>();
  const candidateMonth = typeof params.month === 'string' && /^\d{4}-\d{2}$/.test(params.month)
    ? params.month
    : format(new Date(), 'yyyy-MM');
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ month: string; message: string } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const { isOffline } = useNetworkStatus();
  const allDeletedEntries = useExpensesStore((state) => state.deletedEntries);
  const restoreEntry = useExpensesStore((state) => state.restoreEntry);
  const entries = useMemo(
    () => allDeletedEntries
      .filter((entry) => entry.date.startsWith(candidateMonth))
      .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)),
    [allDeletedEntries, candidateMonth],
  );
  const monthLoadError = loadError?.month === candidateMonth ? loadError : null;
  const loading = !isOffline && loadedMonth !== candidateMonth && monthLoadError === null;

  useEffect(() => {
    let active = true;
    if (isOffline) return () => { active = false; };
    const [year = '2000', month = '01'] = candidateMonth.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    void loadDeletedMonth(date, date).then(() => {
      if (active) {
        setLoadedMonth(candidateMonth);
        setLoadError((current) => current?.month === candidateMonth ? null : current);
      }
    }).catch((error: unknown) => {
      if (active) setLoadError({
        month: candidateMonth,
        message: error instanceof Error ? error.message : 'Could not load deleted expenses.',
      });
    });
    return () => { active = false; };
  }, [candidateMonth, isOffline, retryKey]);

  const restore = (entry: DeletedEntry) => {
    restoreEntry(entry.id);
    void requestSync();
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back to Monthly" onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={20} color={colors.textMuted} />
        </Pressable>
        <View style={styles.heading}>
          <Text style={styles.title}>Recently Deleted</Text>
          <Text style={styles.subtitle}>{format(monthDate(candidateMonth), 'MMMM yyyy')}</Text>
        </View>
        <View style={styles.backButton} />
      </View>

      {isOffline && <Text style={styles.offline}>Offline · showing deleted expenses saved on this device</Text>}

      {monthLoadError && !isOffline && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText} accessibilityRole="alert">Could not load deleted expenses. {monthLoadError.message}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry loading deleted expenses" onPress={() => { setLoadError(null); setRetryKey((value) => value + 1); }} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {loading && entries.length === 0 ? (
        <View style={styles.loadingState} accessibilityLabel="Loading deleted expenses">
          <View style={styles.skeletonRow} />
          <View style={styles.skeletonRow} />
          <View style={styles.skeletonRow} />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={entries}
          keyExtractor={(entry) => entry.id}
          ItemSeparatorComponent={Separator}
          renderItem={({ item }) => <DeletedExpenseRow entry={item} onRestore={() => restore(item)} />}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nothing to restore</Text>
              <Text style={styles.emptyText}>Expenses you move here can be restored to your monthly list.</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function DeletedExpenseRow({ entry, onRestore }: { entry: DeletedEntry; onRestore: () => void }) {
  return (
    <View style={styles.entryRow}>
      <View style={styles.entryInfo}>
        <View style={styles.entryHeading}>
          <Text style={styles.category}>{entry.category}</Text>
          <Text style={styles.amount}>{formatINR(entry.amount)}</Text>
        </View>
        <Text style={styles.entryDate}>{format(parse(entry.date, 'yyyy-MM-dd', new Date()), 'EEE, MMM d')}</Text>
        {entry.note ? <Text style={styles.note} numberOfLines={2}>{entry.note}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Restore ${entry.category} expense from ${format(parse(entry.date, 'yyyy-MM-dd', new Date()), 'MMM d')}`}
        onPress={onRestore}
        style={styles.restoreButton}
      >
        <Feather name="rotate-ccw" size={15} color={colors.text} />
        <Text style={styles.restoreText}>Restore</Text>
      </Pressable>
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

function monthDate(monthKey: string): Date {
  const [year = '2000', month = '01'] = monthKey.split('-');
  return new Date(Number(year), Number(month) - 1, 1);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', paddingHorizontal: screenPadding, gap: space.sm },
  backButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, gap: space.xs },
  title: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 20 },
  subtitle: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13 },
  offline: { marginHorizontal: screenPadding, marginBottom: space.md, color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12 },
  errorBox: { marginHorizontal: screenPadding, marginVertical: space.md, padding: space.md, gap: space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  errorText: { color: colors.up, fontFamily: 'Inter_400Regular', fontSize: 13 },
  retryButton: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: space.lg, backgroundColor: colors.primary, borderRadius: radius.pill },
  retryText: { color: colors.onPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  listContent: { paddingHorizontal: screenPadding, paddingBottom: space.xxl, flexGrow: 1 },
  entryRow: { minHeight: 90, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  entryInfo: { flex: 1, gap: space.xs },
  entryHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  category: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 14 },
  amount: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 15, fontVariant: ['tabular-nums'] },
  entryDate: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12 },
  note: { color: colors.textFaint, fontFamily: 'Inter_400Regular', fontSize: 12 },
  restoreButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingHorizontal: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill },
  restoreText: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 12 },
  separator: { height: 1, backgroundColor: colors.border },
  loadingState: { paddingHorizontal: screenPadding, gap: space.md },
  skeletonRow: { height: 72, borderRadius: radius.md, backgroundColor: colors.surface },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: screenPadding, gap: space.sm },
  emptyTitle: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 16 },
  emptyText: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
