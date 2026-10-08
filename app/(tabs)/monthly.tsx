import { addDays, addMonths, format, parse, startOfDay, subMonths } from 'date-fns';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DailyExpenseTable } from '@/src/components/DailyExpenseTable';
import { categories, type Category } from '@/src/lib/categories';
import { dailyExpenseRows, daysElapsed, filteredMonthTotal, firstDataMonth } from '@/src/lib/calc';
import { formatDateKey } from '@/src/lib/dates';
import { formatINR } from '@/src/lib/format';
import { useExpensesStore } from '@/src/store/useExpenses';
import { loadMonth, requestSync } from '@/src/sync/queue';
import { colors, radius, screenPadding, space } from '@/src/theme/tokens';
import { useNetworkStatus } from '@/src/hooks/useNetworkStatus';
import { enqueueSheetsOpIfEnabled } from '@/src/data/sheetsOutbox';

export default function MonthlyScreen() {
  const [todayKey, setTodayKey] = useState(formatDateKey(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(todayKey.slice(0, 7));
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([...categories]);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ month: string; message: string } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const { isOffline } = useNetworkStatus();
  const entries = useExpensesStore((state) => state.entries);
  const deleteEntry = useExpensesStore((state) => state.deleteEntry);
  const hasHydrated = useExpensesStore((state) => state.hasHydrated);

  const currentMonth = todayKey.slice(0, 7);
  const firstMonth = firstDataMonth(entries, currentMonth);
  const displayedMonth = selectedMonth < firstMonth
    ? firstMonth
    : selectedMonth > currentMonth
      ? currentMonth
      : selectedMonth;
  const elapsedDays = daysElapsed(displayedMonth, todayKey);
  const rows = dailyExpenseRows(entries, displayedMonth, elapsedDays, selectedCategories);
  const total = filteredMonthTotal(entries, displayedMonth, selectedCategories, elapsedDays);
  const visibleEntries = entries.filter((entry) => entry.date.slice(0, 7) === displayedMonth && selectedCategories.includes(entry.category));
  const monthLabel = format(monthDate(displayedMonth), 'MMMM yyyy');
  const hasEntries = total > 0;
  const monthLoadError = loadError?.month === displayedMonth ? loadError : null;
  const refreshingMonth = !isOffline && loadedMonth !== displayedMonth && monthLoadError === null;
  const canGoPrevious = displayedMonth > firstMonth;
  const canGoNext = displayedMonth < currentMonth;

  const toggleCategory = (category: Category) => {
    setSelectedCategories((selected) => selected.includes(category)
      ? selected.filter((item) => item !== category)
      : [...selected, category]);
  };

  const moveToRecentlyDeleted = (entry: (typeof entries)[number]) => {
    Alert.alert(
      'Move to Recently Deleted?',
      'You can restore this expense later.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Move', style: 'destructive', onPress: () => {
          deleteEntry(entry.id);
          void enqueueSheetsOpIfEnabled({ type: 'delete', entryId: entry.id }).catch(() => undefined);
          void requestSync();
        } },
      ],
    );
  };

  const refreshToday = useCallback(() => {
    const nextToday = formatDateKey(new Date());
    const oldMonth = todayKey.slice(0, 7);
    const nextMonth = nextToday.slice(0, 7);
    if (oldMonth !== nextMonth) {
      setSelectedMonth((current) => current === oldMonth ? nextMonth : current);
    }
    setTodayKey(nextToday);
  }, [todayKey]);

  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout>;
    const scheduleUpdate = () => {
      refreshToday();
      const now = new Date();
      midnightTimer = setTimeout(scheduleUpdate, startOfDay(addDays(now, 1)).getTime() - now.getTime());
    };
    scheduleUpdate();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        clearTimeout(midnightTimer);
        scheduleUpdate();
      }
    });
    return () => {
      clearTimeout(midnightTimer);
      subscription.remove();
    };
  }, [refreshToday]);

  useFocusEffect(useCallback(() => { refreshToday(); }, [refreshToday]));

  useEffect(() => {
    let active = true;
    if (isOffline) {
      return () => { active = false; };
    }
    const date = monthDate(displayedMonth);
    void loadMonth(date, date).then(() => {
      if (active) setLoadedMonth(displayedMonth);
    }).catch((error: unknown) => {
      if (active) setLoadError({
        month: displayedMonth,
        message: error instanceof Error ? error.message : 'Could not load this month.',
      });
    });
    return () => { active = false; };
  }, [displayedMonth, isOffline, retryKey]);

  if (!hasHydrated) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.content} accessibilityLabel="Loading monthly expenses">
          <View style={styles.skeletonHeading} />
          <View style={styles.skeletonSummary} />
          <View style={styles.skeletonTable} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <Text style={styles.title}>Monthly</Text>
          <Text style={styles.subtitle}>Your spending, day by day</Text>
        </View>

        {isOffline && <Text style={styles.offline}>Offline · showing saved expenses</Text>}

        <View style={styles.monthSelector}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            accessibilityState={{ disabled: !canGoPrevious }}
            disabled={!canGoPrevious}
            onPress={() => setSelectedMonth(format(subMonths(monthDate(displayedMonth), 1), 'yyyy-MM'))}
            style={[styles.monthButton, !canGoPrevious && styles.disabled]}
          >
            <Text style={styles.chevron}>‹</Text>
          </Pressable>
          <Text style={styles.monthLabel} accessibilityLiveRegion="polite">{monthLabel}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: !canGoNext }}
            disabled={!canGoNext}
            onPress={() => setSelectedMonth(format(addMonths(monthDate(displayedMonth), 1), 'yyyy-MM'))}
            style={[styles.monthButton, !canGoNext && styles.disabled]}
          >
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>

        <View style={styles.filterSection}>
          <View style={styles.filterHeading}>
            <View style={styles.filterTitleGroup}>
              <Text style={styles.sectionTitle}>Categories</Text>
              <Text style={styles.filterCaption}>{selectedCategories.length} of {categories.length} selected</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select all categories"
              accessibilityState={{ selected: selectedCategories.length === categories.length }}
              onPress={() => setSelectedCategories([...categories])}
              style={styles.selectAllButton}
            >
              <Text style={styles.selectAllText}>All</Text>
            </Pressable>
          </View>
          <View style={styles.filterChips}>
            {categories.map((category) => {
              const selected = selectedCategories.includes(category);
              return (
                <Pressable
                  key={category}
                  accessibilityRole="button"
                  accessibilityLabel={`${selected ? 'Remove' : 'Include'} ${category} in total`}
                  accessibilityState={{ selected }}
                  onPress={() => toggleCategory(category)}
                  style={[styles.filterChip, selected && styles.filterChipSelected]}
                >
                  <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{category}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.summary}>
          <Text style={styles.eyebrow}>{selectedCategories.length === categories.length ? 'TOTAL SPENT' : 'SELECTED TOTAL'}</Text>
          <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit>{formatINR(total)}</Text>
          {selectedCategories.length === 0 && <Text style={styles.summaryHint}>Select one or more categories to see their total.</Text>}
        </View>

        {monthLoadError && !isOffline && (
          <View style={styles.errorRow}>
            <Text style={styles.errorText} accessibilityRole="alert">Could not refresh this month. {monthLoadError.message}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Retry loading month" onPress={() => setRetryKey((value) => value + 1)} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {refreshingMonth && !hasEntries && <View style={styles.loadingHint}><Text style={styles.hintText}>Loading month…</Text></View>}
        {!refreshingMonth && !hasEntries && !monthLoadError && selectedCategories.length > 0 && (
          <Text style={styles.emptyText}>
            {selectedCategories.length === categories.length ? 'No spending recorded for this month.' : 'No spending in the selected categories.'}
          </Text>
        )}

        <View style={styles.tableSection}>
          <View style={styles.tableHeading}>
            <Text style={styles.sectionTitle}>Daily expenses</Text>
            <Text style={styles.caption}>Tap a day to view or edit its entries</Text>
          </View>
          <DailyExpenseTable
            rows={rows}
            monthKey={displayedMonth}
            entries={visibleEntries}
            onEdit={(entry) => router.push({ pathname: '/add', params: { editId: entry.id } })}
            onDelete={moveToRecentlyDeleted}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open recently deleted expenses for ${monthLabel}`}
            onPress={() => router.push({ pathname: '/recently-deleted', params: { month: displayedMonth } })}
            style={styles.recentButton}
          >
            <Text style={styles.recentButtonText}>Recently Deleted</Text>
            <Text style={styles.recentChevron}>›</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function monthDate(monthKey: string): Date {
  const [year = '2000', month = '01'] = monthKey.split('-');
  return parse(`${year}-${month}-01`, 'yyyy-MM-dd', new Date());
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: screenPadding, paddingTop: space.lg, paddingBottom: space.xxl, gap: space.md },
  heading: { gap: space.xs },
  title: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 22 },
  subtitle: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 14 },
  offline: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12 },
  monthSelector: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.surface },
  disabled: { opacity: 0.35 },
  chevron: { color: colors.text, fontFamily: 'Inter_400Regular', fontSize: 30, marginTop: -3 },
  monthLabel: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 16, fontVariant: ['tabular-nums'] },
  summary: { minHeight: 112, padding: space.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, justifyContent: 'center' },
  filterSection: { padding: space.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, gap: space.md },
  filterHeading: { minHeight: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filterTitleGroup: { gap: space.xs },
  filterCaption: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11 },
  selectAllButton: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  selectAllText: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 13 },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  filterChip: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill },
  filterChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 12 },
  filterChipTextSelected: { color: colors.onPrimary },
  summaryHint: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: space.xs },
  eyebrow: { color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 0.8 },
  total: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 38, fontVariant: ['tabular-nums'], marginTop: space.xs },
  errorRow: { gap: space.sm, padding: space.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  errorText: { color: colors.up, fontFamily: 'Inter_400Regular', fontSize: 13 },
  retryButton: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: space.lg, backgroundColor: colors.primary, borderRadius: radius.pill },
  retryText: { color: colors.onPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  loadingHint: { minHeight: 48, justifyContent: 'center' },
  hintText: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13 },
  emptyText: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 14, paddingVertical: space.sm },
  tableSection: { padding: space.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, gap: space.md },
  tableHeading: { gap: space.xs },
  sectionTitle: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 15 },
  caption: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11 },
  recentButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: space.sm, marginTop: space.xs },
  recentButtonText: { color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 13 },
  recentChevron: { color: colors.textMuted, fontSize: 24 },
  skeletonHeading: { height: 54, width: '65%', backgroundColor: colors.surfaceRaised, borderRadius: radius.sm },
  skeletonSummary: { height: 112, backgroundColor: colors.surface, borderRadius: radius.md },
  skeletonTable: { height: 360, backgroundColor: colors.surface, borderRadius: radius.md },
});
