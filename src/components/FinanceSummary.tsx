import { StyleSheet, Text, View } from 'react-native';

import { percentDirection, type CategoryShare } from '@/src/lib/calc';
import { formatINR, formatPercent } from '@/src/lib/format';
import { colors, radius, space } from '@/src/theme/tokens';

export function DeltaPill({ value, comparisonLabel }: { value: number; comparisonLabel: string }) {
  const direction = percentDirection(value);
  const color = direction === 'up' ? colors.up : direction === 'down' ? colors.down : colors.textMuted;
  return (
    <View style={styles.deltaRow}>
      <Text style={[styles.deltaValue, { color }]}>{formatPercent(value)}</Text>
      <Text style={styles.deltaCaption}>vs {comparisonLabel}</Text>
    </View>
  );
}

export function CategoryDistributionRow({
  category,
  amount,
  percent,
  opacity,
}: CategoryShare & { opacity: number }) {
  return (
    <View style={styles.categoryRow}>
      <View style={styles.categoryNameWrap}>
        <Text style={styles.categoryName}>{category}</Text>
        <Text style={styles.categoryPercent}>{percent.toFixed(1)}%</Text>
      </View>
      <Text style={styles.categoryAmount}>{formatINR(amount)}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%`, opacity }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  deltaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  deltaValue: { fontFamily: 'Inter_500Medium', fontSize: 14, fontVariant: ['tabular-nums'] },
  deltaCaption: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12 },
  categoryRow: { gap: space.xs },
  categoryNameWrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  categoryName: { flex: 1, minWidth: 70, color: colors.text, fontFamily: 'Inter_400Regular', fontSize: 13 },
  categoryPercent: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12, fontVariant: ['tabular-nums'] },
  categoryAmount: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 13, fontVariant: ['tabular-nums'], marginTop: -space.xs },
  track: { height: 5, backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, overflow: 'hidden', marginTop: space.xs },
  fill: { height: '100%', backgroundColor: colors.text, borderRadius: radius.pill },
});
