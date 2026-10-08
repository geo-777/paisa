import { Feather } from '@expo/vector-icons';
import { format, parse } from 'date-fns';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { categories, type Category } from '@/src/lib/categories';
import { dailyExpenseRows } from '@/src/lib/calc';
import { formatINR } from '@/src/lib/format';
import type { Entry } from '@/src/store/useExpenses';
import { colors, space } from '@/src/theme/tokens';

type DailyRows = ReturnType<typeof dailyExpenseRows>;

export function DailyExpenseTable({
  rows,
  monthKey,
  entries,
  onEdit,
  onDelete,
}: {
  rows: DailyRows;
  monthKey: string;
  entries?: Entry[];
  onEdit?: (entry: Entry) => void;
  onDelete?: (entry: Entry) => void;
}) {
  return (
    <View>
      <View style={styles.columnHeader}>
        <Text style={styles.columnLabel}>DAY</Text>
        <Text style={styles.columnLabel}>TOTAL SPENT</Text>
      </View>
      {rows.map((row) => (
        <DayRow
          key={row.date}
          row={row}
          date={parse(row.date, 'yyyy-MM-dd', monthDate(monthKey))}
          entries={entries?.filter((entry) => entry.date === row.date)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </View>
  );
}

function DayRow({ row, date, entries, onEdit, onDelete }: {
  row: DailyRows[number];
  date: Date;
  entries?: Entry[];
  onEdit?: (entry: Entry) => void;
  onDelete?: (entry: Entry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasSpending = row.total > 0;

  return (
    <View style={styles.rowWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${format(date, 'EEEE, MMMM d')}, spent ${formatINR(row.total)}${hasSpending ? ', show category amounts' : ', no spending'}`}
        accessibilityState={{ disabled: !hasSpending, expanded }}
        disabled={!hasSpending}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.dayRow, pressed && hasSpending && styles.pressed]}
      >
        <View style={styles.dayInfo}>
          <Text style={styles.dayName}>{format(date, 'EEE')}</Text>
          <Text style={styles.dayDate}>{format(date, 'MMM d')}</Text>
        </View>
        <Text style={[styles.dayTotal, !hasSpending && styles.zeroTotal]}>{hasSpending ? formatINR(row.total) : '—'}</Text>
        {hasSpending ? <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} /> : <View style={styles.iconSpace} />}
      </Pressable>
      {expanded && hasSpending && (
        <View style={styles.breakdown}>
          {entries
            ? entries.map((entry) => <ExpenseItem key={entry.id} entry={entry} date={date} onEdit={onEdit} onDelete={onDelete} />)
            : categories.map((category) => <CategoryAmount key={category} category={category} amount={row.categories[category]} />)}
        </View>
      )}
    </View>
  );
}

function ExpenseItem({ entry, date, onEdit, onDelete }: {
  entry: Entry;
  date: Date;
  onEdit?: (entry: Entry) => void;
  onDelete?: (entry: Entry) => void;
}) {
  return (
    <View style={styles.expenseItem}>
      <View style={styles.expenseInfo}>
        <View style={styles.expenseTitleRow}>
          <Text style={styles.expenseCategory}>{entry.category}</Text>
          <Text style={styles.expenseTime}>{format(new Date(entry.createdAt), 'h:mm a')}</Text>
        </View>
        {entry.note ? <Text style={styles.expenseNote} numberOfLines={2}>{entry.note}</Text> : null}
      </View>
      <Text style={styles.expenseAmount}>{formatINR(entry.amount)}</Text>
      {onEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${entry.category} expense from ${format(date, 'MMM d')}`}
          onPress={() => onEdit(entry)}
          style={styles.actionButton}
          hitSlop={space.xs}
        >
          <Feather name="edit-2" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
      {onDelete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Move ${entry.category} expense from ${format(date, 'MMM d')} to recently deleted`}
          onPress={() => onDelete(entry)}
          style={styles.actionButton}
          hitSlop={space.xs}
        >
          <Feather name="trash-2" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

function CategoryAmount({ category, amount }: { category: Category; amount: number }) {
  return (
    <View style={styles.categoryCell}>
      <Text style={styles.categoryName} numberOfLines={1}>{category}</Text>
      <Text style={[styles.categoryAmount, amount === 0 && styles.zeroAmount]} numberOfLines={1}>
        {amount === 0 ? '—' : formatINR(amount)}
      </Text>
    </View>
  );
}

function monthDate(monthKey: string): Date {
  const [year = '2000', month = '01'] = monthKey.split('-');
  return new Date(Number(year), Number(month) - 1, 1);
}

const styles = StyleSheet.create({
  columnHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm },
  columnLabel: { color: colors.textFaint, fontFamily: 'Inter_500Medium', fontSize: 10, letterSpacing: 0.8 },
  rowWrap: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  dayRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, gap: space.sm },
  pressed: { backgroundColor: colors.surfaceRaised },
  dayInfo: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  dayName: { width: 34, color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 12 },
  dayDate: { color: colors.text, fontFamily: 'Inter_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] },
  dayTotal: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 15, fontVariant: ['tabular-nums'] },
  zeroTotal: { color: colors.textFaint, fontFamily: 'Inter_400Regular' },
  iconSpace: { width: 18 },
  breakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.sm, paddingTop: space.xs, paddingBottom: space.md, backgroundColor: colors.surfaceRaised },
  expenseItem: { width: '100%', minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  expenseInfo: { flex: 1, gap: space.xs },
  expenseTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  expenseCategory: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 12 },
  expenseTime: { color: colors.textFaint, fontFamily: 'Inter_400Regular', fontSize: 10 },
  expenseNote: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11 },
  expenseAmount: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 12, fontVariant: ['tabular-nums'] },
  actionButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  categoryCell: { flexBasis: '30%', minWidth: 76, gap: space.xs, paddingVertical: space.xs },
  categoryName: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 10 },
  categoryAmount: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 12, fontVariant: ['tabular-nums'] },
  zeroAmount: { color: colors.textFaint },
});
