import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSessionStore } from '@/src/store/useSession';
import { colors, radius, screenPadding, space } from '@/src/theme/tokens';

export default function LoginScreen() {
  const isBusy = useSessionStore((state) => state.isBusy);
  const errorMessage = useSessionStore((state) => state.errorMessage);
  const signIn = useSessionStore((state) => state.signIn);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.title}>Student Finance</Text>
          <Text style={styles.description}>Sign in to save your expenses in your Google Sheet.</Text>
        </View>

        {errorMessage && <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text>}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          accessibilityState={{ disabled: isBusy }}
          disabled={isBusy}
          onPress={() => { void signIn(); }}
          style={[styles.googleButton, isBusy && styles.googleButtonBusy]}
        >
          <Text style={styles.googleButtonText}>{isBusy ? 'Signing in…' : 'Continue with Google'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, justifyContent: 'center', padding: screenPadding, gap: space.xl },
  intro: { gap: space.sm },
  title: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 22 },
  description: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24 },
  error: { color: colors.up, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  googleButton: { minHeight: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: radius.pill },
  googleButtonBusy: { opacity: 0.65 },
  googleButtonText: { color: colors.onPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 16 },
});
