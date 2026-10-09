import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { addDays, format, parse, startOfDay } from 'date-fns';
import { Link, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { categoryTotalsForDate, percentDirection, todayVsAverage, totalForDate } from '@/src/lib/calc';
import { categories, type Category } from '@/src/lib/categories';
import { formatDateKey } from '@/src/lib/dates';
import { formatINR, formatPercent } from '@/src/lib/format';
import { useExpensesStore, useTodayEntries, type Entry } from '@/src/store/useExpenses';
import { colors, radius, screenPadding, space } from '@/src/theme/tokens';
import { requestSync } from '@/src/sync/queue';
import { useNetworkStatus } from '@/src/hooks/useNetworkStatus';

export default function HomeScreen() {
  const [todayKey, setTodayKey] = useState(formatDateKey(new Date()));
  const { isOffline } = useNetworkStatus();
  const entries = useExpensesStore((state) => state.entries);
  const todayEntries = useTodayEntries(todayKey);
  const hasHydrated = useExpensesStore((state) => state.hasHydrated);
  const hydrationFailed = useExpensesStore((state) => state.hydrationFailed);
  const deleteEntry = useExpensesStore((state) => state.deleteEntry);
  const todayTotal = totalForDate(entries, todayKey);
  const todayCategories = categoryTotalsForDate(entries, todayKey);
  const comparison = todayVsAverage(entries, todayKey);
  const comparisonDirection = comparison === null ? null : percentDirection(comparison);

  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout>;
    const updateToday = () => {
      const now = new Date();
      setTodayKey(formatDateKey(now));
      midnightTimer = setTimeout(updateToday, startOfDay(addDays(now, 1)).getTime() - now.getTime());
    };
    updateToday();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        clearTimeout(midnightTimer);
        updateToday();
      }
    });
    return () => {
      clearTimeout(midnightTimer);
      subscription.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setTodayKey(formatDateKey(new Date()));
    }, []),
  );

  const retryHydration = () => {
    useExpensesStore.getState().setHydrationPending();
    void useExpensesStore.persist.rehydrate();
  };

  const renderEntry = ({ item }: { item: Entry }) => (
    <EntryRow entry={item} onDelete={() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      deleteEntry(item.id);
      void requestSync();
    }} />
  );

  const listHeader = (
    <View>
      <View style={styles.topLine}>
        <View>
          <Text style={styles.eyebrow}>TODAY</Text>
          <Text style={styles.date}>{format(parse(todayKey, 'yyyy-MM-dd', new Date()), 'EEEE, MMM d')}</Text>
          {isOffline && <Text style={styles.offlineText}>offline · saved on this device</Text>}
        </View>
        <Link href={'/settings' as Href} asChild>
          <Pressable accessibilityRole="button" accessibilityLabel="Settings" style={styles.settingsButton}>
            <Feather name="settings" size={20} color={colors.textMuted} />
          </Pressable>
        </Link>
      </View>

      <View style={styles.summary}>
        <Text style={styles.label}>SPENT TODAY</Text>
        <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>{formatINR(todayTotal)}</Text>
        {comparison !== null && (
          <Text style={styles.comparison}>
            <Text style={styles.comparisonCaption}>{formatINR(todayTotal)} today · </Text>
            <Text style={[
              styles.comparisonValue,
              comparisonDirection === 'neutral' ? styles.comparisonMuted : null,
              comparisonDirection === 'up' ? styles.comparisonUp : null,
              comparisonDirection === 'down' ? styles.comparisonDown : null,
            ]}>{formatPercent(comparison)}</Text>
            <Text style={styles.comparisonCaption}> vs your average</Text>
          </Text>
        )}
      </View>

      <View style={styles.categoryGrid}>
        {categories.map((category) => (
          <CategoryAmount key={category} category={category} amount={todayCategories[category]} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Today’s entries</Text>
    </View>
  );

  if (!hasHydrated) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.loading} accessibilityLabel="Loading expenses">
          <View style={styles.skeletonDate} />
          <View style={styles.skeletonHero} />
          <View style={styles.skeletonGrid} />
          <View style={styles.skeletonRow} />
        </View>
      </SafeAreaView>
    );
  }

  if (hydrationFailed) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.stateContent}>
          <Text style={styles.sectionTitle}>Your expenses could not be loaded.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry loading expenses" onPress={retryHydration} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={todayEntries}
        keyExtractor={(entry) => entry.id}
        renderItem={renderEntry}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Nothing logged today. Tap + to add your first expense.</Text>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
      <Link href="/add" asChild>
        <Pressable accessibilityRole="button" accessibilityLabel="Add expense" style={styles.addButton}>
          <Feather name="plus" size={24} color={colors.onPrimary} />
        </Pressable>
      </Link>
    </SafeAreaView>
  );
}

function CategoryAmount({ category, amount }: { category: Category; amount: number }) {
  return (
    <View style={styles.categoryAmount}>
      <Text style={styles.categoryName} numberOfLines={1}>{category}</Text>
      <Text style={styles.categoryValue} numberOfLines={1} adjustsFontSizeToFit>{formatINR(amount)}</Text>
    </View>
  );
}

function EntryRow({ entry, onDelete }: { entry: Entry; onDelete: () => void }) {
  return (
    <View style={styles.entryRow}>
      <View style={styles.entryInfo}>
        <Text style={styles.entryCategory}>{entry.category}</Text>
        <Text style={styles.entryTime}>{format(new Date(entry.createdAt), 'h:mm a')}</Text>
      </View>
      <Text style={styles.entryAmount} numberOfLines={1} adjustsFontSizeToFit>{formatINR(entry.amount)}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${entry.category} expense for ${formatINR(entry.amount)}`}
        hitSlop={4}
        onPress={onDelete}
        style={styles.deleteButton}
      >
        <Feather name="trash-2" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingHorizontal: screenPadding, paddingBottom: space.xxl },
  topLine: { paddingTop: space.lg, paddingBottom: space.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingsButton: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  eyebrow: { color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 0.8 },
  date: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 16, marginTop: space.xs },
  offlineText: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: space.xs },
  summary: { paddingBottom: space.xl },
  label: { color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 0.8 },
  heroAmount: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 44, fontVariant: ['tabular-nums'], marginTop: space.xs },
  comparison: { fontFamily: 'Inter_500Medium', fontSize: 14, marginTop: space.sm },
  comparisonUp: { color: colors.up },
  comparisonDown: { color: colors.down },
  comparisonValue: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  comparisonMuted: { color: colors.textMuted },
  comparisonCaption: { color: colors.textMuted, fontFamily: 'Inter_400Regular' },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    marginBottom: space.xl,
  },
  categoryAmount: { width: '50%', paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.xs },
  categoryName: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12 },
  categoryValue: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 14, fontVariant: ['tabular-nums'] },
  sectionTitle: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 18, marginBottom: space.sm },
  entryRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  entryInfo: { flex: 1, gap: space.xs },
  entryCategory: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 16 },
  entryTime: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12 },
  entryAmount: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 16, fontVariant: ['tabular-nums'] },
  deleteButton: { width: 48, height: 48, alignItems: 'flex-end', justifyContent: 'center', marginLeft: space.md },
  emptyState: { paddingTop: space.lg },
  emptyText: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  addButton: {
    position: 'absolute',
    right: screenPadding,
    bottom: space.lg,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: { flex: 1, padding: screenPadding, paddingTop: space.xxl, gap: space.lg },
  skeletonDate: { width: 160, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  skeletonHero: { width: 220, height: 88, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  skeletonGrid: { height: 136, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  skeletonRow: { height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  stateContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: screenPadding, gap: space.md },
  retryButton: { minHeight: 48, paddingHorizontal: space.xl, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primary },
  retryText: { color: colors.onPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 16 },
});
