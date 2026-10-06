import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useExpensesStore } from '@/src/store/useExpenses';
import { useSessionStore } from '@/src/store/useSession';
import { requestSync } from '@/src/sync/queue';
import { useNetworkStatus } from '@/src/hooks/useNetworkStatus';
import { colors, radius, screenPadding, space } from '@/src/theme/tokens';

const labels = {
  synced: 'Synced',
  syncing: 'Syncing',
  offline: 'Offline',
  failed: 'Sync failed',
} as const;

export default function SettingsScreen() {
  const { isOffline } = useNetworkStatus();
  const status = useExpensesStore((state) => state.syncStatus);
  const error = useExpensesStore((state) => state.syncError);
  const entries = useExpensesStore((state) => state.entries);
  const deletedIds = useExpensesStore((state) => state.deletedIds);
  const retryFailed = useExpensesStore((state) => state.retryFailed);
  const user = useSessionStore((state) => state.user);
  const spreadsheetId = useSessionStore((state) => state.spreadsheetId);
  const isSigningOut = useSessionStore((state) => state.isBusy);
  const signOut = useSessionStore((state) => state.signOut);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const pendingCount = entries.filter((entry) => entry.status === 'pending' || entry.status === 'failed').length + deletedIds.length;

  const retrySync = () => {
    retryFailed();
    void requestSync({ pull: true });
  };

  const openSpreadsheet = async () => {
    if (!spreadsheetId) {
      setLinkError('No spreadsheet is connected yet. Sign in again to reconnect.');
      return;
    }
    setLinking(true);
    setLinkError(null);
    try {
      await Linking.openURL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`);
    } catch (openError) {
      setLinkError(openError instanceof Error ? openError.message : 'Could not open Google Sheets. Try again.');
    } finally {
      setLinking(false);
    }
  };

  const confirmSignOut = () => {
    const warning = pendingCount > 0
      ? `${pendingCount} unsynced ${pendingCount === 1 ? 'change stays' : 'changes stay'} on this device and can sync after you sign in again.`
      : 'Your expenses stay on this device.';
    Alert.alert('Sign out?', warning, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { void signOut(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close settings" onPress={() => router.back()} style={styles.iconButton}>
          <Feather name="x" size={22} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>ACCOUNT</Text>
        <View style={styles.accountRow}>
          <View style={styles.accountIcon}><Feather name="user" size={18} color={colors.textMuted} /></View>
          <View style={styles.accountText}>
            <Text style={styles.accountName}>{user?.name || 'Google account'}</Text>
            <Text style={styles.accountEmail}>{user?.email || 'No account is currently signed in.'}</Text>
          </View>
        </View>

        {isOffline && <Text style={styles.offlineText}>Offline · local expenses remain available on this device.</Text>}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open spreadsheet in Google Sheets"
          accessibilityState={{ disabled: linking || !spreadsheetId }}
          disabled={linking || !spreadsheetId}
          onPress={() => { void openSpreadsheet(); }}
          style={[styles.sheetButton, (!spreadsheetId || linking) && styles.disabledButton]}
        >
          {linking ? <ActivityIndicator color={colors.onPrimary} /> : <Feather name="external-link" size={18} color={colors.onPrimary} />}
          <Text style={styles.sheetButtonText}>{linking ? 'Opening…' : 'Open Google Sheet'}</Text>
        </Pressable>
        {linkError && (
          <View style={styles.errorRow}>
            <Text style={styles.errorText} accessibilityRole="alert">{linkError}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Retry opening spreadsheet" onPress={() => { void openSpreadsheet(); }} style={styles.actionButton}>
              <Text style={styles.actionText}>Retry</Text>
            </Pressable>
          </View>
        )}

        <Text style={[styles.label, styles.syncLabel]}>SYNC</Text>
        <View style={styles.statusRow}>
          {status === 'syncing'
            ? <ActivityIndicator size="small" color={colors.textMuted} />
            : <View style={[styles.statusDot, status === 'synced' ? styles.dotSynced : null, status === 'offline' ? styles.dotOffline : null, status === 'failed' ? styles.dotFailed : null]} />}
          <Text style={styles.statusText}>{labels[status]}</Text>
          {(status === 'failed' || status === 'offline') && (
            <Pressable accessibilityRole="button" accessibilityLabel="Retry syncing expenses" onPress={retrySync} style={styles.actionButton}>
              <Text style={styles.actionText}>Retry</Text>
            </Pressable>
          )}
        </View>
        {status === 'failed' && error ? <Text style={styles.errorText} accessibilityRole="alert">{error}</Text> : null}
        {pendingCount > 0 && (
          <Text style={styles.pendingText}>
            {pendingCount} unsynced {pendingCount === 1 ? 'change' : 'changes'} will stay on this device if you sign out.
          </Text>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out of Google"
          accessibilityState={{ disabled: isSigningOut }}
          disabled={isSigningOut}
          onPress={confirmSignOut}
          style={[styles.signOutButton, isSigningOut && styles.disabledButton]}
        >
          {isSigningOut ? <ActivityIndicator color={colors.text} /> : <Text style={styles.signOutText}>Sign out</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 64, paddingHorizontal: screenPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 18 },
  content: { padding: screenPadding, paddingBottom: space.xxl, gap: space.md },
  label: { color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 0.8 },
  accountRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  accountIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.surface },
  accountText: { flex: 1, gap: space.xs },
  accountName: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 15 },
  accountEmail: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13 },
  offlineText: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  sheetButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, borderRadius: radius.pill, backgroundColor: colors.primary },
  sheetButtonText: { color: colors.onPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  disabledButton: { opacity: 0.55 },
  syncLabel: { marginTop: space.lg },
  statusRow: { minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  statusDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.textFaint },
  dotSynced: { backgroundColor: colors.down },
  dotOffline: { backgroundColor: colors.textMuted },
  dotFailed: { backgroundColor: colors.up },
  statusText: { flex: 1, color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 14 },
  actionButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.md },
  actionText: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 14 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  errorText: { flex: 1, color: colors.up, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  pendingText: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  signOutButton: { minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginTop: space.xl, padding: space.md },
  signOutText: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 14 },
});
