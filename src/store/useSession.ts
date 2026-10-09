import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { requestSync } from '@/src/sync/queue';
import { persistStorage } from '@/src/lib/persistStorage';
import { isSupabaseConfigured, supabase } from '@/src/data/supabase';
import { useExpensesStore } from '@/src/store/useExpenses';
import { clearCachedSheetsSettings, loadSheetsSettings } from '@/src/data/sheetsSettings';
import { requestDailySheetsSync } from '@/src/data/sheetsScheduler';

export type SessionStatus = 'checking' | 'signedOut' | 'signedIn';
type SessionUser = { id: string; email: string };
type SessionState = {
  status: SessionStatus;
  isBusy: boolean;
  user: SessionUser | null;
  errorMessage: string | null;
  bootstrapSession: () => Promise<void>;
  signIn: (email: string, password: string, createAccount: boolean) => Promise<boolean>;
  signOut: () => Promise<void>;
};

function authMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Authentication failed. Try again.';
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/already registered|user already exists/i.test(message)) return 'An account with this email already exists. Sign in instead.';
  if (/password.*(6|short|weak)/i.test(message)) return 'Use a password with at least 6 characters.';
  if (/rate.?limit|too many requests|email rate/i.test(message)) return 'Too many sign-in or sign-up attempts. Wait a few minutes and try again.';
  if (/email.*(invalid|format)/i.test(message)) return 'Enter a valid email address.';
  if (/signup.*disabled|signups.*disabled/i.test(message)) return 'New accounts are temporarily unavailable. Try again later.';
  if (/network|fetch/i.test(message)) return 'Could not connect. Check your internet connection and try again.';
  return message;
}

export const useSessionStore = create<SessionState>()(persist((set) => ({
  status: 'checking',
  isBusy: false,
  user: null,
  errorMessage: null,
  bootstrapSession: async () => {
    set({ status: 'checking', errorMessage: null });
    if (!isSupabaseConfigured) {
      useExpensesStore.getState().activateUser(null);
      set({ status: 'signedOut', user: null, errorMessage: 'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY for this build.' });
      return;
    }
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const session = data.session;
      useExpensesStore.getState().activateUser(session?.user.id ?? null);
      set({ status: session ? 'signedIn' : 'signedOut', user: session?.user.email ? { id: session.user.id, email: session.user.email } : null });
      if (session) {
        void requestSync({ pull: true });
        void loadSheetsSettings().then(() => requestDailySheetsSync()).catch(() => undefined);
      }
      supabase.auth.onAuthStateChange((event, nextSession) => {
        if (!nextSession) clearCachedSheetsSettings();
        useExpensesStore.getState().activateUser(nextSession?.user.id ?? null);
        set({
          status: nextSession ? 'signedIn' : 'signedOut',
          user: nextSession?.user.email ? { id: nextSession.user.id, email: nextSession.user.email } : null,
          isBusy: false,
        });
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setTimeout(() => {
            void requestSync({ pull: true });
            if (event === 'SIGNED_IN') void loadSheetsSettings().then(() => requestDailySheetsSync()).catch(() => undefined);
          }, 0);
        }
      });
    } catch (error) {
      useExpensesStore.getState().activateUser(null);
      set({ status: 'signedOut', user: null, errorMessage: authMessage(error) });
    }
  },
  signIn: async (email, password, createAccount) => {
    if (!isSupabaseConfigured) {
      set({ isBusy: false, errorMessage: 'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY for this build.' });
      return false;
    }
    set({ isBusy: true, errorMessage: null });
    try {
      const result = createAccount
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (createAccount && !result.data.session) {
        useExpensesStore.getState().activateUser(null);
        set({ isBusy: false, errorMessage: 'Check your email to confirm your account, then sign in.' });
        return false;
      }
      if (result.data.user) useExpensesStore.getState().activateUser(result.data.user.id);
      set({ status: 'signedIn', isBusy: false, user: result.data.user?.email ? { id: result.data.user.id, email: result.data.user.email } : null });
      void requestSync({ pull: true });
      void loadSheetsSettings().then(() => requestDailySheetsSync()).catch(() => undefined);
      return true;
    } catch (error) {
      set({ isBusy: false, errorMessage: authMessage(error) });
      return false;
    }
  },
  signOut: async () => {
    set({ isBusy: true, errorMessage: null });
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      useExpensesStore.getState().activateUser(null);
      set({ status: 'signedOut', isBusy: false, user: null });
    } catch (error) {
      set({ isBusy: false, errorMessage: authMessage(error) });
    }
  },
}), {
  name: 'student-finance-session-v2',
  storage: createJSONStorage(() => persistStorage),
  partialize: (state) => ({ user: state.user }),
}));
