import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space } from '@/src/theme/tokens';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          height: 60 + insets.bottom,
          paddingTop: space.sm,
          paddingBottom: insets.bottom + space.xs,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_500Medium',
          fontSize: 12,
          marginTop: space.xs,
        },
        tabBarItemStyle: { borderRadius: radius.md },
        tabBarIcon: ({ color, size }) => {
          const iconName = route.name === 'index'
            ? 'home'
            : route.name === 'dashboard'
              ? 'bar-chart-2'
              : 'pie-chart';
          return <Feather name={iconName} color={color} size={size} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
    </Tabs>
  );
}
