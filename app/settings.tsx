import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requestSync } from '@/src/sync/queue';
import { useExpensesStore } from '@/src/store/useExpenses';
import { useSessionStore } from '@/src/store/useSession';
import { colors, radius, screenPadding, space } from '@/src/theme/tokens';

const labels = {
  synced: 'Synced',
  syncing: 'Syncing',
  offline: 'Offline',
  failed: 'Sync failed',
} as const;

export default function SettingsScreen() {
  const status = useExpensesStore((state) => state.syncStatus);
  const error = useExpensesStore((state) => state.syncError);
  const retryFailed = useExpensesStore((state) => state.retryFailed);
  const signOut = useSessionStore((state) => state.signOut);

  const retry = () => {
    retryFailed();
    void requestSync({ pull: true });
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login' as Href);
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

      <View style={styles.content}>
        <Text style={styles.label}>SYNC</Text>
        <View style={styles.statusRow}>
          {status === 'syncing'
            ? <ActivityIndicator size="small" color={colors.textMuted} />
            : <View style={[styles.statusDot, status === 'synced' ? styles.dotSynced : null, status === 'offline' ? styles.dotOffline : null, status === 'failed' ? styles.dotFailed : null]} />}
          <Text style={styles.statusText}>{labels[status]}</Text>
          {(status === 'failed' || status === 'offline') && (
            <Pressable accessibilityRole="button" onPress={retry} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          )}
        </View>
        {status === 'failed' && error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable accessibilityRole="button" onPress={() => void handleSignOut()} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { height: 64, paddingHorizontal: screenPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 18 },
  content: { padding: screenPadding },
  label: { color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 0.8, marginBottom: space.sm },
  statusRow: { minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  statusDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.textFaint },
  dotSynced: { backgroundColor: colors.down },
  dotOffline: { backgroundColor: colors.textMuted },
  dotFailed: { backgroundColor: colors.up },
  statusText: { flex: 1, color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 14 },
  retryButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: space.md },
  retryText: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 14 },
  errorText: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: space.sm },
  signOutButton: { minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginTop: space.xxl },
  signOutText: { color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 14 },
});
