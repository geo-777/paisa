import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, screenPadding, space } from '@/src/theme/tokens';

export default function DashboardScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Dashboard</Text>
        <Text style={styles.description}>Monthly summaries will appear here.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, padding: screenPadding, justifyContent: 'center', gap: space.sm },
  title: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 22 },
  description: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 16 },
});
