import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { useSessionStore } from '@/src/store/useSession';
import { startSyncListeners } from '@/src/sync/queue';
import { colors } from '@/src/theme/tokens';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const sessionStatus = useSessionStore((state) => state.status);
  const bootstrapSession = useSessionStore((state) => state.bootstrapSession);

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  useEffect(() => startSyncListeners(), []);

  useEffect(() => {
    if (loaded || fontError) void SplashScreen.hideAsync();
  }, [loaded, fontError]);

  if (!loaded && !fontError) return null;
  if (sessionStatus === 'checking') {
    return (
      <View style={styles.startup}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        {sessionStatus === 'signedIn' ? (
          <>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
            <Stack.Screen
              name="add"
              options={{
                presentation: 'transparentModal',
                animation: 'slide_from_bottom',
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
          </>
        ) : (
          <Stack.Screen name="login" />
        )}
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  startup: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
