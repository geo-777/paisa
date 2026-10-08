import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSessionStore } from '@/src/store/useSession';
import { useNetworkStatus } from '@/src/hooks/useNetworkStatus';
import { colors, radius, screenPadding, space } from '@/src/theme/tokens';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [createAccount, setCreateAccount] = useState(false);
  const isBusy = useSessionStore((state) => state.isBusy);
  const errorMessage = useSessionStore((state) => state.errorMessage);
  const signIn = useSessionStore((state) => state.signIn);
  const { isOffline } = useNetworkStatus();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.title}>Paisa</Text>
          <Text style={styles.description}>{createAccount ? 'Create an account to keep your expenses in sync.' : 'Sign in to see your expenses.'}</Text>
        </View>
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          textContentType="emailAddress"
          value={email}
        />
        <TextInput
          accessibilityLabel="Password"
          autoCapitalize="none"
          autoComplete={createAccount ? 'new-password' : 'password'}
          onChangeText={setPassword}
          onSubmitEditing={() => { void signIn(email, password, createAccount); }}
          placeholder="Password (6 characters minimum)"
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          style={styles.input}
          textContentType={createAccount ? 'newPassword' : 'password'}
          value={password}
        />
        {isOffline && <Text style={styles.offline}>Offline · connect to the internet to sign in.</Text>}
        {errorMessage && <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text>}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy || isOffline }}
          disabled={isBusy || isOffline}
          onPress={() => { void signIn(email, password, createAccount); }}
          style={[styles.primaryButton, (isBusy || isOffline) && styles.disabled]}
        >
          {isBusy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.primaryText}>{createAccount ? 'Create account' : 'Sign in'}</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => { setCreateAccount(!createAccount); }} style={styles.toggle}>
          <Text style={styles.toggleText}>{createAccount ? 'Already have an account? Sign in' : 'New here? Create account'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, justifyContent: 'center', padding: screenPadding, gap: space.md },
  intro: { gap: space.sm, marginBottom: space.md },
  title: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 22 },
  description: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24 },
  input: { minHeight: 54, paddingHorizontal: space.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, backgroundColor: colors.surface, fontFamily: 'Inter_400Regular', fontSize: 16 },
  error: { color: colors.up, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  offline: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  primaryButton: { minHeight: 56, alignItems: 'center', justifyContent: 'center', marginTop: space.sm, backgroundColor: colors.primary, borderRadius: radius.pill },
  disabled: { opacity: 0.55 },
  primaryText: { color: colors.onPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  toggle: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  toggleText: { color: colors.textMuted, fontFamily: 'Inter_500Medium', fontSize: 14 },
});
