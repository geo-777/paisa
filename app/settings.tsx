import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useExpensesStore } from '@/src/store/useExpenses';
import { useSessionStore } from '@/src/store/useSession';
import { requestSync } from '@/src/sync/queue';
import { useNetworkStatus } from '@/src/hooks/useNetworkStatus';
import { colors, radius, screenPadding, space } from '@/src/theme/tokens';
import { loadSheetsSettings, saveSheetsSettings, type SheetsSettings } from '@/src/data/sheetsSettings';
import { sheetsActions, SheetsError } from '@/src/data/sheetsMirror';
import { getSheetsOutboxStatus, sheetsOutbox, subscribeSheetsOutboxStatus } from '@/src/data/sheetsOutbox';
import { fetchAllExpenses } from '@/src/data/expensesApi';
import type { Entry } from '@/src/store/useExpenses';

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
  const isSigningOut = useSessionStore((state) => state.isBusy);
  const signOut = useSessionStore((state) => state.signOut);
  const pendingCount = entries.filter((entry) => entry.status === 'pending' || entry.status === 'failed').length + deletedIds.length;
  const [sheets, setSheets] = useState<SheetsSettings>({ sheets_url: '', sheets_token: '', enabled: false });
  const [sheetsBusy, setSheetsBusy] = useState(false);
  const [sheetsMessage, setSheetsMessage] = useState('');
  const [sheetsPending, setSheetsPending] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [backfill, setBackfill] = useState<{ done: number; total: number } | null>(null);
  const [linkProblem, setLinkProblem] = useState(false);
  const [outboxStatus, setOutboxStatus] = useState(getSheetsOutboxStatus());

  useEffect(() => {
    let live = true;
    void loadSheetsSettings().then((value) => { if (live) setSheets(value); }).catch(() => {
      if (live) setSheetsMessage('Could not load Sheets settings. Check that the database schema is installed.');
    });
    const refresh = () => { void sheetsOutbox.count().then((count) => { if (live) setSheetsPending(count); }); };
    const unsubscribeStatus = subscribeSheetsOutboxStatus(setOutboxStatus);
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => { live = false; clearInterval(timer); unsubscribeStatus(); };
  }, []);

  const persistSheets = async (next: SheetsSettings) => {
    setSheets(next);
    setSheetsBusy(true);
    setSheetsMessage('');
    try { await saveSheetsSettings(next); setLinkProblem(false); void sheetsOutbox.flush(); }
    catch (error) { setSheetsMessage(error instanceof Error ? error.message : 'Could not save Sheets settings.'); }
    finally { setSheetsBusy(false); }
  };
  const testSheets = async () => {
    setSheetsBusy(true); setSheetsMessage('');
    try { await saveSheetsSettings(sheets); await sheetsActions.ping(sheets.sheets_url, sheets.sheets_token); setLinkProblem(false); setSheetsMessage('Connection successful.'); }
    catch (error) { setLinkProblem(error instanceof SheetsError); setSheetsMessage(error instanceof SheetsError ? `Sheets endpoint: ${error.message}` : `Could not save or test settings: ${error instanceof Error ? error.message : 'unknown error'}`); }
    finally { setSheetsBusy(false); }
  };
  const runBackfill = async () => {
    setSheetsBusy(true); setBackfill({ done: 0, total: 0 }); setSheetsMessage('');
    try {
      await saveSheetsSettings(sheets);
      let all: Entry[];
      try { all = await fetchAllExpenses(); }
      catch (error) { throw new Error(`Could not fetch expenses from Supabase: ${error instanceof Error ? error.message : 'unknown error'}`); }
      setBackfill({ done: 0, total: all.length });
      for (let offset = 0; offset < all.length; offset += 200) {
        try { await sheetsActions.backfill(sheets.sheets_url, sheets.sheets_token, all.slice(offset, offset + 200)); }
        catch (error) { throw new Error(`Sheets backfill failed at expense ${Math.min(offset + 1, all.length)}: ${error instanceof Error ? error.message : 'unknown error'}`); }
        setBackfill({ done: Math.min(offset + 200, all.length), total: all.length });
      }
      setSheetsMessage(`Synced ${all.length} ${all.length === 1 ? 'expense' : 'expenses'} to Sheets.`);
      setLinkProblem(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sync everything to Sheets.';
      setLinkProblem(message.startsWith('Sheets backfill failed:') || message.startsWith('Sheets backfill failed at'));
      setSheetsMessage(message);
    }
    finally { setSheetsBusy(false); setBackfill(null); }
  };

  const retrySync = () => {
    retryFailed();
    void requestSync({ pull: true });
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
            <Text style={styles.accountName}>{user?.email || 'No account is currently signed in.'}</Text>
          </View>
        </View>

        {isOffline && <Text style={styles.offlineText}>Offline · local expenses remain available on this device.</Text>}

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

        <Text style={[styles.label, styles.syncLabel]}>GOOGLE SHEETS SYNC</Text>
        <Text style={styles.helper}>Optional one-way copy. Supabase remains the source of truth.</Text>
        <TextInput accessibilityLabel="Google Sheets web app link" autoCapitalize="none" keyboardType="url" value={sheets.sheets_url} onChangeText={(sheets_url) => setSheets({ ...sheets, sheets_url })} onEndEditing={() => { void persistSheets(sheets); }} placeholder="Apps Script web app URL" placeholderTextColor={colors.textFaint} style={styles.field} />
        <TextInput accessibilityLabel="Google Sheets token" autoCapitalize="none" value={sheets.sheets_token} onChangeText={(sheets_token) => setSheets({ ...sheets, sheets_token })} onEndEditing={() => { void persistSheets(sheets); }} placeholder="Shared token" placeholderTextColor={colors.textFaint} secureTextEntry style={styles.field} />
        <View style={styles.toggleRow}><Text style={styles.statusText}>Enable mirror</Text><Switch accessibilityLabel="Enable Google Sheets sync" value={sheets.enabled} onValueChange={(enabled) => { void persistSheets({ ...sheets, enabled }); }} trackColor={{ false: colors.border, true: colors.down }} thumbColor={colors.text} /></View>
        <Text style={styles.mirrorStatus} accessibilityLiveRegion="polite">{linkProblem || outboxStatus.linkProblem || (sheets.enabled && (!sheets.sheets_url || !sheets.sheets_token)) ? 'Link problem' : sheetsPending > 0 ? `${sheetsPending} pending` : outboxStatus.syncing || sheetsBusy && !backfill ? 'Syncing' : sheets.enabled ? 'Up to date' : 'Disabled'}</Text>
        {sheetsMessage || outboxStatus.message ? <Text style={[styles.helper, (linkProblem || outboxStatus.linkProblem) && styles.errorText]} accessibilityRole={linkProblem || outboxStatus.linkProblem ? 'alert' : undefined}>{sheetsMessage || outboxStatus.message}</Text> : null}
        <View style={styles.buttonRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Test Google Sheets connection" disabled={sheetsBusy} onPress={() => { void testSheets(); }} style={styles.secondaryButton}><Text style={styles.actionText}>Test connection</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Sync all expenses to Google Sheets" disabled={sheetsBusy || !sheets.sheets_url || !sheets.sheets_token} onPress={() => { void runBackfill(); }} style={styles.secondaryButton}>{sheetsBusy && !backfill ? <ActivityIndicator color={colors.text} /> : <Text style={styles.actionText}>Sync everything</Text>}</Pressable>
        </View>
        {backfill ? <View><Text style={styles.helper}>{backfill.total ? `${backfill.done} of ${backfill.total} expenses` : 'Loading expenses…'}</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${backfill.total ? (backfill.done / backfill.total) * 100 : 0}%` }]} /></View></View> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Show Google Sheets setup instructions" accessibilityState={{ expanded: helpOpen }} onPress={() => setHelpOpen(!helpOpen)} style={styles.helpButton}><Text style={styles.actionText}>How to set up</Text><Feather name={helpOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} /></Pressable>
        {helpOpen ? <Text style={styles.helper}>1. Create a Google Sheet and open Extensions → Apps Script.\n2. Paste the project’s docs/sheets-mirror/Code.gs script and set its shared token.\n3. Deploy as a Web app, execute as yourself, and choose access appropriate for the script.\n4. Google may show an “unverified app” warning because this script is not verified; continue only if you trust the script and deployment.\n5. Copy the web app URL here, enter the same token, test the connection, then enable sync.\n6. After editing the script, create a new version and update the deployment.</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
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
  helper: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  field: { minHeight: 52, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontFamily: 'Inter_400Regular', fontSize: 14 },
  toggleRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mirrorStatus: { minHeight: 36, color: colors.down, fontFamily: 'Inter_500Medium', fontSize: 14, paddingTop: space.sm },
  buttonRow: { flexDirection: 'row', gap: space.sm },
  secondaryButton: { flex: 1, minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  helpButton: { minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden', marginTop: space.sm },
  progressFill: { height: 6, backgroundColor: colors.down },
  signOutButton: { minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginTop: space.xl, padding: space.md },
  signOutText: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 14 },
});
