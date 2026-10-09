import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { addDays, format, parse } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { categories, defaultCategoryForTime, type Category } from '@/src/lib/categories';
import { sanitizeAmountInput } from '@/src/lib/amountInput';
import { formatDateKey, todayDateKey } from '@/src/lib/dates';
import { useExpensesStore, type Entry } from '@/src/store/useExpenses';
import { requestSync } from '@/src/sync/queue';
import { colors, radius, screenPadding, space } from '@/src/theme/tokens';
import { useNetworkStatus } from '@/src/hooks/useNetworkStatus';

export default function AddExpenseScreen() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const editEntry = useExpensesStore((state) => state.entries.find((entry) => entry.id === editId));
  const hasHydrated = useExpensesStore((state) => state.hasHydrated);
  const hydrationFailed = useExpensesStore((state) => state.hydrationFailed);

  useEffect(() => {
    if (!hasHydrated && !hydrationFailed) void useExpensesStore.persist.rehydrate();
  }, [hasHydrated, hydrationFailed]);

  if (!hasHydrated || hydrationFailed) {
    return (
      <SafeAreaView style={styles.loadingSheet} edges={['top', 'bottom']}>
        {!hydrationFailed ? (
          <View style={styles.loadingContent} accessibilityLabel="Loading expenses before adding">
            <View style={styles.loadingTitle} />
            <View style={styles.loadingAmount} />
            <View style={styles.loadingRow} />
          </View>
        ) : (
          <View style={styles.loadingContent}>
            <Text style={styles.saveError} accessibilityRole="alert">Your saved expenses could not be loaded.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading expenses"
              onPress={() => {
                useExpensesStore.getState().setHydrationPending();
                void useExpensesStore.persist.rehydrate();
              }}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return <AddExpenseForm key={editId ?? 'new'} editEntry={editEntry} />;
}

function AddExpenseForm({ editEntry }: { editEntry: Entry | undefined }) {
  const insets = useSafeAreaInsets();
  const { isOffline } = useNetworkStatus();
  const [amountInput, setAmountInput] = useState(() => editEntry ? String(editEntry.amount) : '');
  const [category, setCategory] = useState<Category>(() => editEntry?.category ?? defaultCategoryForTime(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(() => editEntry && editEntry.date !== todayDateKey() ? editEntry.date : null);
  const [noteVisible, setNoteVisible] = useState(() => Boolean(editEntry?.note));
  const [note, setNote] = useState(() => editEntry?.note ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastSaveAt = useRef(0);
  const saving = useRef(false);
  const addEntry = useExpensesStore((state) => state.addEntry);
  const updateEntry = useExpensesStore((state) => state.updateEntry);
  const amount = Number(amountInput);
  const isValidAmount = Number.isFinite(amount) && amount > 0;
  const displayDate = selectedDate ?? todayDateKey();

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.back();
      return true;
    });
    return () => subscription.remove();
  }, []);

  const shiftDate = (days: number) => {
    const target = formatDateKey(addDays(parse(displayDate, 'yyyy-MM-dd', new Date()), days));
    setSelectedDate(target >= todayDateKey() ? null : target);
  };

  const saveExpense = () => {
    const now = Date.now();
    if (!isValidAmount || saving.current || now - lastSaveAt.current < 500) return;
    lastSaveAt.current = now;
    saving.current = true;
    try {
      const input = {
        amount,
        category,
        date: selectedDate ?? todayDateKey(),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      if (editEntry) updateEntry(editEntry.id, input);
      else {
        addEntry(input);
      }
      setSaveError(null);
      void requestSync();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      router.back();
    } catch (error) {
      saving.current = false;
      setSaveError(error instanceof Error ? error.message : 'Could not save this expense. Try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.overlay}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={styles.sheet} edges={['bottom']}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.title}>{editEntry ? 'Edit expense' : 'Add expense'}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close add expense"
            onPress={() => router.back()}
            style={styles.closeButton}
          >
            <Feather name="x" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        {isOffline && (
          <Text style={styles.offlineNotice} accessibilityLiveRegion="polite">
            Offline · this expense will save on your device and sync later.
          </Text>
        )}
        {saveError && (
          <View style={styles.saveErrorRow}>
            <Text style={styles.saveError} accessibilityRole="alert">{saveError}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Retry saving expense" onPress={saveExpense} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.amountWrap}>
            <Text style={styles.currency}>₹</Text>
            <TextInput
              accessibilityLabel="Expense amount in rupees"
              autoFocus
              keyboardType="decimal-pad"
              value={amountInput}
              onChangeText={(value) => setAmountInput(sanitizeAmountInput(value))}
              placeholder="0"
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.text}
              style={styles.amountInput}
              maxLength={10}
            />
          </View>

          <View style={styles.dateRow}>
            <View style={styles.dateLabelGroup}>
              <Text style={styles.label}>DATE</Text>
              <Text style={styles.dateText}>
                {selectedDate === null
                  ? 'Today'
                  : format(parse(selectedDate, 'yyyy-MM-dd', new Date()), 'EEE, MMM d')}
              </Text>
            </View>
            <View style={styles.dateControls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose previous date"
                onPress={() => shiftDate(-1)}
                style={styles.dateButton}
              >
                <Feather name="chevron-left" size={20} color={colors.textMuted} />
              </Pressable>
              {selectedDate !== null && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Set date to today"
                  onPress={() => setSelectedDate(null)}
                  style={styles.todayButton}
                >
                  <Text style={styles.todayButtonText}>Today</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose next date"
                disabled={selectedDate === null}
                onPress={() => shiftDate(1)}
                style={[styles.dateButton, selectedDate === null && styles.disabledControl]}
              >
                <Feather name="chevron-right" size={20} color={selectedDate === null ? colors.textFaint : colors.textMuted} />
              </Pressable>
            </View>
          </View>

          <View style={styles.categorySection}>
            <Text style={styles.label}>CATEGORY</Text>
            <View style={styles.chipGrid}>
              {categories.map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityLabel={`${item} category`}
                  accessibilityState={{ selected: item === category }}
                  onPress={() => setCategory(item)}
                  style={[styles.chip, item === category && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, item === category && styles.chipTextSelected]}>{item}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {noteVisible ? (
            <TextInput
              accessibilityLabel="Optional expense note"
              value={note}
              onChangeText={setNote}
              placeholder="Add a note"
              placeholderTextColor={colors.textFaint}
              style={styles.noteInput}
              returnKeyType="done"
              maxLength={120}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add an optional note"
              onPress={() => setNoteVisible(true)}
              style={styles.noteToggle}
            >
              <Feather name="plus" size={16} color={colors.textMuted} />
              <Text style={styles.noteToggleText}>Add a note</Text>
            </Pressable>
          )}
        </ScrollView>

        <View style={[styles.saveArea, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editEntry ? 'Save expense changes' : 'Save expense'}
            accessibilityState={{ disabled: !isValidAmount }}
            disabled={!isValidAmount}
            onPress={saveExpense}
            style={[styles.saveButton, !isValidAmount && styles.saveButtonDisabled]}
          >
            <Text style={[styles.saveText, !isValidAmount && styles.saveTextDisabled]}>{editEntry ? 'Save changes' : 'Save'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  loadingSheet: { flex: 1, justifyContent: 'center', backgroundColor: colors.surface, padding: screenPadding },
  loadingContent: { gap: space.lg },
  loadingTitle: { height: 48, width: '55%', borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  loadingAmount: { height: 92, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  loadingRow: { height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  sheet: {
    maxHeight: '94%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderColor: colors.border,
    borderTopWidth: 1,
    paddingTop: space.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: space.xs, borderRadius: radius.pill, backgroundColor: colors.textFaint },
  sheetHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: screenPadding },
  offlineNotice: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12, paddingHorizontal: screenPadding, paddingBottom: space.sm },
  saveErrorRow: { paddingHorizontal: screenPadding, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  saveError: { flex: 1, color: colors.up, fontFamily: 'Inter_400Regular', fontSize: 13 },
  retryButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.md },
  retryText: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 14 },
  title: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 22 },
  closeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  formScroll: { flexShrink: 1 },
  formContent: { paddingHorizontal: screenPadding, paddingBottom: space.md },
  amountWrap: { minHeight: 92, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: space.lg },
  currency: { color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 28, marginRight: space.sm },
  amountInput: { flex: 1, color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 44, fontVariant: ['tabular-nums'], padding: 0 },
  label: { color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 0.8 },
  dateRow: { minHeight: 64, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.lg },
  dateLabelGroup: { gap: space.xs },
  dateText: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 14 },
  dateControls: { flexDirection: 'row', alignItems: 'center' },
  dateButton: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  todayButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.sm },
  todayButtonText: { color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 12 },
  disabledControl: { opacity: 0.5 },
  categorySection: { gap: space.sm },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { minHeight: 48, minWidth: 84, paddingHorizontal: space.md, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 14 },
  chipTextSelected: { color: colors.onPrimary },
  noteToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  noteToggleText: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 14 },
  noteInput: { minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border, color: colors.text, fontFamily: 'Inter_400Regular', fontSize: 16, marginTop: space.sm },
  saveArea: { paddingHorizontal: screenPadding, paddingTop: space.sm },
  saveButton: { height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primary },
  saveButtonDisabled: { backgroundColor: colors.surfaceRaised },
  saveText: { color: colors.onPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  saveTextDisabled: { color: colors.textFaint },
});
