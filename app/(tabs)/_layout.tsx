import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import { useMemo } from 'react';
import { useWindowDimensions, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space } from '@/src/theme/tokens';

const HomeIcon = ({ color, size }: { color: ColorValue; size: number }) => (
  <Feather name="home" color={color} size={size} />
);
const DashboardIcon = ({ color, size }: { color: ColorValue; size: number }) => (
  <Feather name="bar-chart-2" color={color} size={size} />
);
const AnalyticsIcon = ({ color, size }: { color: ColorValue; size: number }) => (
  <Feather name="pie-chart" color={color} size={size} />
);
const MonthlyIcon = ({ color, size }: { color: ColorValue; size: number }) => (
  <Feather name="calendar" color={color} size={size} />
);

const tabOptions = {
  index: { title: 'Home', tabBarIcon: HomeIcon },
  dashboard: { title: 'Dashboard', tabBarIcon: DashboardIcon },
  analytics: { title: 'Analytics', tabBarIcon: AnalyticsIcon },
  monthly: { title: 'Monthly', tabBarIcon: MonthlyIcon },
};

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const screenOptions = useMemo(() => ({
    headerShown: false,
    tabBarActiveTintColor: colors.text,
    tabBarInactiveTintColor: colors.textFaint,
    tabBarStyle: {
      height: Math.max(60, 64 * fontScale) + insets.bottom,
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
    tabBarItemStyle: { minHeight: 48, borderRadius: radius.md },
  }), [fontScale, insets.bottom]);

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="index" options={tabOptions.index} />
      <Tabs.Screen name="dashboard" options={tabOptions.dashboard} />
      <Tabs.Screen name="analytics" options={tabOptions.analytics} />
      <Tabs.Screen name="monthly" options={tabOptions.monthly} />
    </Tabs>
  );
}
