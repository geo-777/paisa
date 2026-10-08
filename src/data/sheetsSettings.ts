import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/data/supabase';

const TOKEN_KEY = 'paisa-sheets-token';
const ENABLED_KEY = 'paisa-sheets-enabled-v1';
export type SheetsSettings = { sheets_url: string; sheets_token: string; enabled: boolean };
let cached: SheetsSettings = { sheets_url: '', sheets_token: '', enabled: false };
export function getCachedSheetsSettings(): { enabled: boolean; url: string; token: string } {
  return { enabled: cached.enabled, url: cached.sheets_url, token: cached.sheets_token };
}
export function clearCachedSheetsSettings(): void { cached = { sheets_url: '', sheets_token: '', enabled: false }; }
export async function loadSheetsSettings(): Promise<SheetsSettings> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) { clearCachedSheetsSettings(); return cached; }
  const tokenKey = `${TOKEN_KEY}-${userId}`;
  const enabledKey = `${ENABLED_KEY}:${userId}`;
  const [{ data, error }, localToken, localEnabled] = await Promise.all([
    supabase.from('user_settings').select('sheets_url,sheets_token').maybeSingle(),
    SecureStore.getItemAsync(tokenKey),
    AsyncStorage.getItem(enabledKey),
  ]);
  if (error) throw error;
  const remote = data as { sheets_url: string | null; sheets_token: string | null } | null;
  const token = remote?.sheets_token ?? localToken ?? '';
  if (token && token !== localToken) await SecureStore.setItemAsync(tokenKey, token);
  cached = { sheets_url: remote?.sheets_url ?? '', sheets_token: token, enabled: localEnabled === 'true' };
  return cached;
}
export async function saveSheetsSettings(settings: SheetsSettings): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) throw new Error('Sign in to save Sheets settings.');
  const tokenKey = `${TOKEN_KEY}-${userId}`;
  await (settings.sheets_token ? SecureStore.setItemAsync(tokenKey, settings.sheets_token) : SecureStore.deleteItemAsync(tokenKey));
  await AsyncStorage.setItem(`${ENABLED_KEY}:${userId}`, String(settings.enabled));
  const { error } = await supabase.from('user_settings').upsert({
    sheets_url: settings.sheets_url.trim() || null,
    sheets_token: settings.sheets_token || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
  cached = settings;
}
