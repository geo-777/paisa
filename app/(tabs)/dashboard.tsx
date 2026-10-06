import { addDays, format, parse, startOfDay } from 'date-fns';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DashboardBarChart } from '@/src/components/DashboardBarChart';
import { cautionMessage, dashboardStats } from '@/src/lib/calc';
import { formatDateKey } from '@/src/lib/dates';
import { formatINR } from '@/src/lib/format';
import { CategoryDistributionRow, DeltaPill } from '@/src/components/FinanceSummary';
import { useExpensesStore } from '@/src/store/useExpenses';
import { colors, radius, screenPadding, space } from '@/src/theme/tokens';
import { useNetworkStatus } from '@/src/hooks/useNetworkStatus';

export default function DashboardScreen() {
  const [todayKey, setTodayKey] = useState(formatDateKey(new Date()));
  const { isOffline } = useNetworkStatus();
  const entries = useExpensesStore((state) => state.entries);
  const hasHydrated = useExpensesStore((state) => state.hasHydrated);
  const hydrationFailed = useExpensesStore((state) => state.hydrationFailed);
  const stats = dashboardStats(entries, todayKey);
  const hasCurrentMonthEntries = stats !== null && stats.monthTotal > 0;

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

  useFocusEffect(useCallback(() => {
    setTodayKey(formatDateKey(new Date()));
  }, []));

  if (!hasHydrated) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.content} accessibilityLabel="Loading dashboard">
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonHero} />
          <View style={styles.skeletonStats} />
          <View style={styles.skeletonChart} />
          <View style={styles.skeletonCategories} />
        </View>
      </SafeAreaView>
    );
  }

  if (hydrationFailed || stats === null) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.errorState}>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.body}>Your expenses could not be loaded.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading dashboard"
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

  const monthDate = parse(`${stats.monthKey}-01`, 'yyyy-MM-dd', new Date());
  const monthLabel = format(monthDate, 'MMMM yyyy');
  const highestDayLabel = stats.highestDay
    ? format(parse(stats.highestDay.date, 'yyyy-MM-dd', new Date()), 'MMM d')
    : '—';
  const cautionLine = cautionMessage(stats.caution);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
        </View>

        {isOffline && <Text style={styles.offlineLabel}>Offline · showing saved expenses</Text>}

        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>THIS MONTH</Text>
          <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>{formatINR(stats.monthTotal)}</Text>
          {stats.monthOverMonth === null ? (
            <Text style={styles.noBaseline}>No data for {stats.previousMonthName}</Text>
          ) : (
            <DeltaPill value={stats.monthOverMonth} comparisonLabel={stats.previousMonthName} />
          )}
        </View>

        <View style={styles.statRow}>
          <View style={[styles.statCard, styles.statCardLeft]}>
            <Text style={styles.statLabel}>AVERAGE / DAY</Text>
            <Text style={styles.statAmount} numberOfLines={1} adjustsFontSizeToFit>{formatINR(stats.avgDaily)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>HIGHEST DAY</Text>
            <Text style={styles.statAmount} numberOfLines={1} adjustsFontSizeToFit>
              {stats.highestDay ? formatINR(stats.highestDay.total) : '—'}
            </Text>
            <Text style={styles.statCaption}>{highestDayLabel}</Text>
          </View>
        </View>

        {cautionLine && (
          <View style={styles.cautionLine} accessibilityLabel={cautionLine}>
            <View style={styles.cautionDot} />
            <Text style={styles.cautionText}>{cautionLine}</Text>
          </View>
        )}

        {!hasCurrentMonthEntries && (
          <Text style={styles.emptyText}>No spending logged this month yet.</Text>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily spending</Text>
          <Text style={styles.sectionCaption}>Amber bars are above 1.5× your average</Text>
          <DashboardBarChart values={stats.dailyTotals} todayKey={todayKey} />
        </View>

        <View style={[styles.section, styles.categorySection]}>
          <Text style={styles.sectionTitle}>By category</Text>
          {hasCurrentMonthEntries
            ? stats.categoryShares.map((share, index) => (
              <CategoryDistributionRow key={share.category} {...share} opacity={1 - index * 0.12} />
            ))
            : <Text style={styles.categoryEmpty}>Category totals will appear after your first expense.</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: screenPadding, paddingTop: space.lg, paddingBottom: space.xxl, gap: space.md },
  heading: { gap: space.xs, marginBottom: space.xs },
  title: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 22 },
  monthLabel: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 14 },
  offlineLabel: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12 },
  heroCard: { minHeight: 142, padding: space.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, justifyContent: 'center' },
  eyebrow: { color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 0.8 },
  heroAmount: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 38, fontVariant: ['tabular-nums'], marginTop: space.xs },
  noBaseline: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: space.sm },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  statCard: { flex: 1, flexBasis: '45%', minWidth: 120, minHeight: 102, padding: space.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, justifyContent: 'center' },
  statCardLeft: { marginRight: 0 },
  statLabel: { color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 11, letterSpacing: 0.6 },
  statAmount: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 23, fontVariant: ['tabular-nums'], marginTop: space.xs },
  statCaption: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: space.xs },
  cautionLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  cautionDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.up },
  cautionText: { flex: 1, color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13 },
  emptyText: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 14, paddingVertical: space.xs },
  section: { padding: space.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: space.xs },
  sectionTitle: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 15 },
  sectionCaption: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: space.xs, marginBottom: space.xs },
  categorySection: { gap: space.md },
  categoryEmpty: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13 },
  errorState: { flex: 1, padding: screenPadding, justifyContent: 'center', gap: space.md },
  body: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 15 },
  retryButton: { minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.lg, alignSelf: 'flex-start' },
  retryLabel: { color: colors.onPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  skeletonTitle: { height: 48, width: '55%', backgroundColor: colors.surfaceRaised, borderRadius: radius.sm },
  skeletonHero: { height: 142, backgroundColor: colors.surface, borderRadius: radius.md },
  skeletonStats: { height: 102, backgroundColor: colors.surface, borderRadius: radius.md },
  skeletonChart: { height: 200, backgroundColor: colors.surface, borderRadius: radius.md },
  skeletonCategories: { height: 240, backgroundColor: colors.surface, borderRadius: radius.md },
});
