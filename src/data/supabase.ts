import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const validSupabaseUrl = (() => {
  try {
    const parsed = new URL(supabaseUrl ?? '');
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
})();
export const isSupabaseConfigured = validSupabaseUrl && Boolean(supabaseAnonKey?.trim());

// Keep the app renderable if an EAS environment is missing its public config.
// Auth entry points check isSupabaseConfigured before making requests.
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl! : 'https://missing-supabase-config.invalid',
  isSupabaseConfigured ? supabaseAnonKey! : 'missing-supabase-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
