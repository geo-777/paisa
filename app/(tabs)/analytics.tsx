import { addDays, addMonths, format, parse, startOfDay, subMonths } from 'date-fns';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryDistributionRow, DeltaPill } from '@/src/components/FinanceSummary';
import {
  avgDaily,
  categoryShares,
  dailyExpenseRows,
  daysElapsed,
  firstDataMonth,
  highestDay,
  lowestDay,
  monthOverMonth,
  monthTotal,
} from '@/src/lib/calc';
import { formatDateKey } from '@/src/lib/dates';
import { formatINR } from '@/src/lib/format';
import { useExpensesStore } from '@/src/store/useExpenses';
import { colors, radius, screenPadding, space } from '@/src/theme/tokens';
import { useNetworkStatus } from '@/src/hooks/useNetworkStatus';
import { loadMonth } from '@/src/sync/queue';

export default function AnalyticsScreen() {
  const [todayKey, setTodayKey] = useState(formatDateKey(new Date()));
  const todayRef = useRef(todayKey);
  const [selectedMonth, setSelectedMonth] = useState(todayKey.slice(0, 7));
  const { isOffline } = useNetworkStatus();
  const entries = useExpensesStore((state) => state.entries);
  const hasHydrated = useExpensesStore((state) => state.hasHydrated);
  const hydrationFailed = useExpensesStore((state) => state.hydrationFailed);

  const currentMonth = todayKey.slice(0, 7);
  const firstMonth = firstDataMonth(entries, currentMonth);
  const displayedMonth = selectedMonth < firstMonth
    ? firstMonth
    : selectedMonth > currentMonth
      ? currentMonth
      : selectedMonth;
  const elapsedDays = daysElapsed(displayedMonth, todayKey);
  const total = monthTotal(entries, displayedMonth, elapsedDays);
  const average = avgDaily(entries, displayedMonth, todayKey);
  const comparison = monthOverMonth(entries, todayKey, displayedMonth);
  const previousMonthName = format(subMonths(monthDate(displayedMonth), 1), 'MMMM');
  const monthLabel = format(monthDate(displayedMonth), 'MMMM yyyy');
  const rows = dailyExpenseRows(entries, displayedMonth, elapsedDays);
  const shares = categoryShares(entries, displayedMonth, elapsedDays);
  const highDay = highestDay(entries, displayedMonth, elapsedDays);
  const lowDay = lowestDay(entries, displayedMonth, elapsedDays);
  const hasMonthEntries = total > 0;
  const canGoPrevious = displayedMonth > firstMonth;
  const canGoNext = displayedMonth < currentMonth;

  const updateToday = useCallback(() => {
    const nextKey = formatDateKey(new Date());
    const previousMonth = todayRef.current.slice(0, 7);
    const nextMonth = nextKey.slice(0, 7);
    if (previousMonth !== nextMonth) {
      setSelectedMonth((selected) => selected === previousMonth ? nextMonth : selected);
    }
    todayRef.current = nextKey;
    setTodayKey(nextKey);
  }, []);

  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout>;
    const scheduleUpdate = () => {
      updateToday();
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
  }, [updateToday]);

  useFocusEffect(useCallback(() => { updateToday(); }, [updateToday]));

  useEffect(() => {
    if (isOffline) return;
    const selectedDate = monthDate(selectedMonth);
    void loadMonth(subMonths(selectedDate, 1), selectedDate).catch((error: unknown) => {
      useExpensesStore.getState().setSyncStatus('failed', error instanceof Error ? error.message : 'Could not load this month.');
    });
  }, [isOffline, selectedMonth]);

  if (!hasHydrated) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.content} accessibilityLabel="Loading analytics">
          <View style={styles.skeletonHeading} />
          <View style={styles.skeletonSummary} />
          <View style={styles.skeletonStats} />
          <View style={styles.skeletonSection} />
          <View style={styles.skeletonTable} />
        </View>
      </SafeAreaView>
    );
  }

  if (hydrationFailed) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.errorState}>
          <Text style={styles.title}>Analytics</Text>
          <Text style={styles.body}>Your expenses could not be loaded.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading analytics"
            onPress={() => {
              useExpensesStore.getState().setHydrationPending();
              void useExpensesStore.persist.rehydrate();
            }}
            style={styles.retryButton}
          >
            <Text style={styles.retryLabel}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <Text style={styles.title}>Analytics</Text>
          <Text style={styles.question}>Where is my money going, and am I spending more than usual?</Text>
        </View>

        {isOffline && <Text style={styles.offlineLabel}>Offline · showing saved expenses</Text>}

        <View style={styles.monthSelector}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            accessibilityState={{ disabled: !canGoPrevious }}
            disabled={!canGoPrevious}
            onPress={() => setSelectedMonth(format(subMonths(monthDate(displayedMonth), 1), 'yyyy-MM'))}
            style={[styles.monthButton, !canGoPrevious && styles.monthButtonDisabled]}
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
            style={[styles.monthButton, !canGoNext && styles.monthButtonDisabled]}
          >
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>

        <View style={styles.summary}>
          <Text style={styles.eyebrow}>MONTH TOTAL</Text>
          <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>{formatINR(total)}</Text>
          {comparison === null
            ? <Text style={styles.noBaseline}>No data for {previousMonthName}</Text>
            : <DeltaPill value={comparison} comparisonLabel={previousMonthName} />}
        </View>

        <View style={styles.statRow}>
          <StatBlock label="AVERAGE / DAY" value={formatINR(average)} />
          <StatBlock
            label="HIGHEST DAY"
            value={highDay ? formatINR(highDay.total) : '—'}
            caption={highDay ? format(parse(highDay.date, 'yyyy-MM-dd', monthDate(displayedMonth)), 'MMM d') : undefined}
          />
          <StatBlock
            label="LOWEST DAY"
            value={lowDay ? formatINR(lowDay.total) : '—'}
            caption={lowDay ? format(parse(lowDay.date, 'yyyy-MM-dd', monthDate(displayedMonth)), 'MMM d') : undefined}
          />
        </View>

        {!hasMonthEntries && <Text style={styles.emptyText}>No spending recorded for this month.</Text>}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Category totals</Text>
          {hasMonthEntries
            ? shares.map((share, index) => (
              <CategoryDistributionRow key={share.category} {...share} opacity={1 - index * 0.12} />
            ))
            : <Text style={styles.sectionEmpty}>Category totals will appear when this month has spending.</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily expenses</Text>
          <Text style={styles.sectionCaption}>Zero amounts shown as —</Text>
          <DailyExpenseTable rows={rows} monthKey={displayedMonth} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBlock({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {caption ? <Text style={styles.statCaption}>{caption}</Text> : null}
    </View>
  );
}

function DailyExpenseTable({ rows, monthKey }: { rows: ReturnType<typeof dailyExpenseRows>; monthKey: string }) {
  return (
    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
      <ScrollView
        style={styles.tableVerticalScroll}
        nestedScrollEnabled
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator
      >
        <View style={styles.tableHeader}>
          <TableCell value="Date" kind="date" header />
          <TableCell value="Breakfast" header />
          <TableCell value="Lunch" header />
          <TableCell value="Dinner" header />
          <TableCell value="Snacks" header />
          <TableCell value="Misc" header />
          <TableCell value="Total" kind="total" header />
        </View>
        {rows.map((row) => (
          <View key={row.date} style={styles.tableRow}>
            <TableCell value={format(parse(row.date, 'yyyy-MM-dd', monthDate(monthKey)), 'MMM d')} kind="date" />
            <TableCell value={tableAmount(row.categories.Breakfast)} />
            <TableCell value={tableAmount(row.categories.Lunch)} />
            <TableCell value={tableAmount(row.categories.Dinner)} />
            <TableCell value={tableAmount(row.categories.Snacks)} />
            <TableCell value={tableAmount(row.categories.Misc)} />
            <TableCell value={tableAmount(row.total)} kind="total" />
          </View>
        ))}
      </ScrollView>
    </ScrollView>
  );
}

function TableCell({ value, kind, header = false }: { value: string; kind?: 'date' | 'total'; header?: boolean }) {
  return (
    <View style={[styles.tableCell, kind === 'date' && styles.dateCell, kind === 'total' && styles.totalCell, header && styles.headerCell]}>
      <Text style={[styles.cellText, header && styles.headerText, (kind === 'date' || header) && styles.leftCellText, kind === 'total' && styles.totalText]}>
        {value}
      </Text>
    </View>
  );
}

function tableAmount(value: number): string {
  return value === 0 ? '-' : formatINR(value);
}

function monthDate(monthKey: string): Date {
  const [year = '2000', month = '01'] = monthKey.split('-');
  return new Date(Number(year), Number(month) - 1, 1);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: screenPadding, paddingTop: space.lg, paddingBottom: space.xxl, gap: space.md },
  heading: { gap: space.sm, marginBottom: space.xs },
  title: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 22 },
  question: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22 },
  offlineLabel: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12 },
  monthSelector: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.surface },
  monthButtonDisabled: { opacity: 0.35 },
  chevron: { color: colors.text, fontFamily: 'Inter_400Regular', fontSize: 30, marginTop: -3 },
  monthLabel: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 16, fontVariant: ['tabular-nums'] },
  summary: { minHeight: 142, padding: space.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, justifyContent: 'center' },
  eyebrow: { color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 0.8 },
  heroAmount: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 38, fontVariant: ['tabular-nums'], marginTop: space.xs },
  noBaseline: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: space.sm },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  statBlock: { flex: 1, flexBasis: '30%', minWidth: 112, minHeight: 100, padding: space.sm, justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  statLabel: { color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 10, letterSpacing: 0.3 },
  statValue: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 19, fontVariant: ['tabular-nums'], marginTop: space.xs },
  statCaption: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: space.xs },
  emptyText: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 14 },
  section: { padding: space.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, gap: space.md, marginTop: space.xs },
  sectionTitle: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 15 },
  sectionCaption: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: -space.sm },
  sectionEmpty: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13 },
  tableVerticalScroll: { maxHeight: 400 },
  tableHeader: { minHeight: 48, flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableRow: { minHeight: 48, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tableCell: { width: 88, minHeight: 48, justifyContent: 'center', paddingHorizontal: space.xs, paddingVertical: space.xs, alignItems: 'flex-end' },
  dateCell: { width: 64, alignItems: 'flex-start' },
  totalCell: { width: 96, backgroundColor: colors.surfaceRaised },
  headerCell: { alignItems: 'flex-start', paddingHorizontal: space.xs },
  cellText: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12, fontVariant: ['tabular-nums'], textAlign: 'right' },
  leftCellText: { textAlign: 'left' },
  headerText: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 11 },
  totalText: { color: colors.text, fontFamily: 'Inter_500Medium' },
  errorState: { flex: 1, padding: screenPadding, justifyContent: 'center', gap: space.md },
  body: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 15 },
  retryButton: { minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.lg, alignSelf: 'flex-start' },
  retryLabel: { color: colors.onPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  skeletonHeading: { height: 72, width: '85%', backgroundColor: colors.surfaceRaised, borderRadius: radius.sm },
  skeletonSummary: { height: 142, backgroundColor: colors.surface, borderRadius: radius.md },
  skeletonStats: { height: 100, backgroundColor: colors.surface, borderRadius: radius.md },
  skeletonSection: { height: 220, backgroundColor: colors.surface, borderRadius: radius.md },
  skeletonTable: { height: 300, backgroundColor: colors.surface, borderRadius: radius.md },
});
