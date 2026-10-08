import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { format } from "date-fns";

import { useExpensesStore } from "@/src/store/useExpenses";
import { useSessionStore } from "@/src/store/useSession";
import { requestSync } from "@/src/sync/queue";
import { useNetworkStatus } from "@/src/hooks/useNetworkStatus";
import { colors, radius, screenPadding, space } from "@/src/theme/tokens";
import { todayDateKey } from "@/src/lib/dates";
import {
  loadSheetsSettings,
  saveSheetsSettings,
  type SheetsSettings,
} from "@/src/data/sheetsSettings";
import { testSheetsConnection } from "@/src/data/sheetsSync";
import {
  getSheetsSyncStatus,
  refreshSheetsSyncStatus,
  runManualDailySync,
  runManualFullSync,
  subscribeSheetsSyncStatus,
} from "@/src/data/sheetsScheduler";

const labels = {
  synced: "Synced",
  syncing: "Syncing",
  offline: "Offline",
  failed: "Sync failed",
} as const;

function isValidSheetsUrl(url: string): boolean {
  return url.startsWith("https://script.google.com/") && url.endsWith("/exec");
}

const sheetsSetupSteps = [
  "Create a Google Sheet and open Extensions → Apps Script.",
  "Copy the contents of scripts/code.gs from our github repository into the Apps Script editor.",
  'In Apps Script Project Settings → Script properties, add PAISA_SHEETS_TOKEN with a private value; enter the same token in Paisa.',
  "Deploy as a Web app, executing as yourself, and choose the access setting required by the script.",
  "Google may show an “unverified app” warning. Continue only if you trust the script and deployment.",
  "Copy the deployed URL ending in /exec into Paisa, test the connection, then enable sync.",
  "After editing the script, create a new version and update the deployment. Sync overwrites the sheet; do not edit it manually.",
];

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
  const pendingCount =
    entries.filter(
      (entry) => entry.status === "pending" || entry.status === "failed",
    ).length + deletedIds.length;
  const [sheets, setSheets] = useState<SheetsSettings>({
    sheets_url: "",
    sheets_token: "",
    enabled: false,
  });
  const [sheetsBusy, setSheetsBusy] = useState(false);
  const [sheetsMessage, setSheetsMessage] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [fullProgress, setFullProgress] = useState<{
    completed: number;
    total: number;
    month: string;
  } | null>(null);
  const [syncStatus, setSyncStatus] = useState(getSheetsSyncStatus());
  const [linkProblem, setLinkProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadSheetsSettings()
      .then((value) => {
        if (live) setSheets(value);
      })
      .catch((error) => {
        if (live)
          setSheetsMessage(
            error instanceof Error
              ? error.message
              : "Could not load Sheets settings. Check that the database schema is installed.",
          );
      });
    void refreshSheetsSyncStatus();
    const unsubscribeStatus = subscribeSheetsSyncStatus((next) => {
      setSyncStatus(next);
      if (!next.error && !next.syncing) setLinkProblem(null);
    });
    return () => {
      live = false;
      unsubscribeStatus();
    };
  }, [user?.id]);

  const persistSheets = async (next: SheetsSettings) => {
    if (next.sheets_url.trim() && !isValidSheetsUrl(next.sheets_url.trim())) {
      setSheetsMessage(
        "URL must start with https://script.google.com/ and end with /exec.",
      );
      return;
    }
    if (
      next.enabled &&
      (!isValidSheetsUrl(next.sheets_url.trim()) || !next.sheets_token.trim())
    ) {
      setSheetsMessage(
        "Add a valid Apps Script URL and token before enabling sync.",
      );
      return;
    }
    setSheets(next);
    setSheetsBusy(true);
    setSheetsMessage("");
    try {
      await saveSheetsSettings(next);
      setLinkProblem(null);
    } catch (error) {
      setSheetsMessage(
        error instanceof Error
          ? error.message
          : "Could not save Sheets settings.",
      );
    } finally {
      setSheetsBusy(false);
    }
  };
  const testSheets = async () => {
    setSheetsBusy(true);
    setSheetsMessage("");
    try {
      await saveSheetsSettings(sheets);
      await testSheetsConnection();
      setLinkProblem(null);
      setSheetsMessage("Connection successful.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not test the connection.";
      setLinkProblem(message);
      setSheetsMessage(message);
    } finally {
      setSheetsBusy(false);
    }
  };
  const runDaily = async () => {
    setSheetsBusy(true);
    setSheetsMessage("");
    try {
      await saveSheetsSettings(sheets);
      await runManualDailySync();
      setLinkProblem(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not sync this month to Sheets.";
      setSheetsMessage(message);
      setLinkProblem(message);
    } finally {
      setSheetsBusy(false);
    }
  };
  const runFull = async () => {
    setSheetsBusy(true);
    setFullProgress({ completed: 0, total: 0, month: "" });
    setSheetsMessage("");
    try {
      await saveSheetsSettings(sheets);
      await runManualFullSync(setFullProgress);
      setLinkProblem(null);
      setSheetsMessage("All expense months synced to Sheets.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not sync everything to Sheets.";
      setSheetsMessage(message);
      setLinkProblem(message);
    } finally {
      setSheetsBusy(false);
      setFullProgress(null);
    }
  };

  const validSheetsUrl = isValidSheetsUrl(sheets.sheets_url.trim());
  const runStatusText = syncStatus.syncing
    ? "Syncing…"
    : linkProblem || syncStatus.error
      ? `Link problem: ${linkProblem ?? syncStatus.error}`
      : syncStatus.lastSyncDate === todayDateKey() && syncStatus.lastSyncAt
        ? `Last synced today ${format(syncStatus.lastSyncAt, "HH:mm")}`
        : syncStatus.lastSyncAt
          ? `Last synced ${format(syncStatus.lastSyncAt, "dd MMM HH:mm")}`
          : "Not synced yet";

  const retrySync = () => {
    retryFailed();
    void requestSync({ pull: true });
  };

  const confirmSignOut = () => {
    const warning =
      pendingCount > 0
        ? `${pendingCount} unsynced ${pendingCount === 1 ? "change stays" : "changes stay"} on this device and can sync after you sign in again.`
        : "Your expenses stay on this device.";
    Alert.alert("Sign out?", warning, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          void signOut();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close settings"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Feather name="x" size={22} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>ACCOUNT</Text>
        <View style={styles.accountRow}>
          <View style={styles.accountIcon}>
            <Feather name="user" size={18} color={colors.textMuted} />
          </View>
          <View style={styles.accountText}>
            <Text style={styles.accountName}>
              {user?.email || "No account is currently signed in."}
            </Text>
          </View>
        </View>

        {isOffline && (
          <Text style={styles.offlineText}>
            Offline · local expenses remain available on this device.
          </Text>
        )}

        <Text style={[styles.label, styles.syncLabel]}>SYNC</Text>
        <View style={styles.statusRow}>
          {status === "syncing" ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <View
              style={[
                styles.statusDot,
                status === "synced" ? styles.dotSynced : null,
                status === "offline" ? styles.dotOffline : null,
                status === "failed" ? styles.dotFailed : null,
              ]}
            />
          )}
          <Text style={styles.statusText}>{labels[status]}</Text>
          {(status === "failed" || status === "offline") && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry syncing expenses"
              onPress={retrySync}
              style={styles.actionButton}
            >
              <Text style={styles.actionText}>Retry</Text>
            </Pressable>
          )}
        </View>
        {status === "failed" && error ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {pendingCount > 0 && (
          <Text style={styles.pendingText}>
            {pendingCount} unsynced {pendingCount === 1 ? "change" : "changes"}{" "}
            will stay on this device if you sign out.
          </Text>
        )}

        <Text style={[styles.label, styles.syncLabel]}>GOOGLE SHEETS SYNC</Text>
        <Text style={styles.helper}>
          Optional daily snapshot. Supabase remains the source of truth.
        </Text>
        <TextInput
          accessibilityLabel="Google Sheets web app link"
          autoCapitalize="none"
          keyboardType="url"
          value={sheets.sheets_url}
          onChangeText={(sheets_url) => setSheets({ ...sheets, sheets_url })}
          onEndEditing={() => {
            void persistSheets(sheets);
          }}
          placeholder="https://script.google.com/.../exec"
          placeholderTextColor={colors.textFaint}
          style={styles.field}
        />
        {sheets.sheets_url && !validSheetsUrl ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            URL must start with https://script.google.com/ and end with /exec.
          </Text>
        ) : null}
        <TextInput
          accessibilityLabel="Google Sheets token"
          autoCapitalize="none"
          value={sheets.sheets_token}
          onChangeText={(sheets_token) =>
            setSheets({ ...sheets, sheets_token })
          }
          onEndEditing={() => {
            void persistSheets(sheets);
          }}
          placeholder="Shared token"
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          style={styles.field}
        />
        <View style={styles.toggleRow}>
          <Text style={styles.statusText}>Enable sync</Text>
          <Switch
            accessibilityLabel="Enable Google Sheets sync"
            value={sheets.enabled}
            onValueChange={(enabled) => {
              void persistSheets({ ...sheets, enabled });
            }}
            trackColor={{ false: colors.border, true: colors.down }}
            thumbColor={colors.text}
          />
        </View>
        <Text style={styles.mirrorStatus} accessibilityLiveRegion="polite">
          {runStatusText}
        </Text>
        {sheetsMessage ? (
          <Text
            style={[styles.helper, linkProblem && styles.errorText]}
            accessibilityRole={linkProblem ? "alert" : undefined}
          >
            {sheetsMessage}
          </Text>
        ) : null}
        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Test Google Sheets connection"
            disabled={sheetsBusy}
            onPress={() => {
              void testSheets();
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.actionText}>Test connection</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sync current and previous months now"
            disabled={sheetsBusy || !validSheetsUrl || !sheets.sheets_token}
            onPress={() => {
              void runDaily();
            }}
            style={styles.secondaryButton}
          >
            {sheetsBusy && !fullProgress ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.actionText}>Sync now</Text>
            )}
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sync every expense month to Google Sheets"
          disabled={sheetsBusy || !validSheetsUrl || !sheets.sheets_token}
          onPress={() => {
            void runFull();
          }}
          style={styles.fullSyncButton}
        >
          {sheetsBusy && fullProgress ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.primaryActionText}>Sync everything</Text>
          )}
        </Pressable>
        {fullProgress ? (
          <View>
            <Text style={styles.helper}>
              {fullProgress.total
                ? `${fullProgress.completed} of ${fullProgress.total} months${fullProgress.month ? ` · ${fullProgress.month}` : ""}`
                : "Loading expenses…"}
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${fullProgress.total ? (fullProgress.completed / fullProgress.total) * 100 : 0}%`,
                  },
                ]}
              />
            </View>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show Google Sheets setup instructions"
          accessibilityState={{ expanded: helpOpen }}
          onPress={() => setHelpOpen(!helpOpen)}
          style={styles.helpButton}
        >
          <Text style={styles.actionText}>How to set up</Text>
          <Feather
            name={helpOpen ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textMuted}
          />
        </Pressable>
        {helpOpen ? (
          <View style={styles.setupSteps}>
            {sheetsSetupSteps.map((step, index) => (
              <Text key={step} style={styles.setupStep}>
                <Text style={styles.setupStepNumber}>{index + 1}. </Text>
                {step}
              </Text>
            ))}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          accessibilityState={{ disabled: isSigningOut }}
          disabled={isSigningOut}
          onPress={confirmSignOut}
          style={[styles.signOutButton, isSigningOut && styles.disabledButton]}
        >
          {isSigningOut ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.signOutText}>Sign out</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    minHeight: 64,
    paddingHorizontal: screenPadding,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 18 },
  content: { padding: screenPadding, paddingBottom: space.xxl, gap: space.md },
  label: {
    color: colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    letterSpacing: 0.8,
  },
  accountRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  accountIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  accountText: { flex: 1, gap: space.xs },
  accountName: {
    color: colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 15,
  },
  accountEmail: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  offlineText: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
  disabledButton: { opacity: 0.55 },
  syncLabel: { marginTop: space.lg },
  statusRow: {
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.textFaint,
  },
  dotSynced: { backgroundColor: colors.down },
  dotOffline: { backgroundColor: colors.textMuted },
  dotFailed: { backgroundColor: colors.up },
  statusText: {
    flex: 1,
    color: colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  actionButton: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  actionText: {
    color: colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  errorRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  errorText: {
    flex: 1,
    color: colors.up,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
  pendingText: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
  helper: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
  setupSteps: { gap: space.sm },
  setupStep: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
  setupStepNumber: { color: colors.text, fontFamily: "Inter_600SemiBold" },
  field: {
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  toggleRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mirrorStatus: {
    minHeight: 36,
    color: colors.down,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    paddingTop: space.sm,
  },
  buttonRow: { flexDirection: "row", gap: space.sm },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
  },
  fullSyncButton: {
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    color: colors.onPrimary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  helpButton: {
    minHeight: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: "hidden",
    marginTop: space.sm,
  },
  progressFill: { height: 6, backgroundColor: colors.down },
  signOutButton: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.xl,
    padding: space.md,
  },
  signOutText: {
    color: colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
});
