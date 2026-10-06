import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  configureGoogleSignIn,
  signInSilently,
  signInWithGoogle,
  signOutFromGoogle,
  type GoogleUser,
} from '@/src/auth/googleAuth';
import { messageFromError } from '@/src/sheets/errors';
import { discoverSpreadsheet } from '@/src/sheets/discover';
import { requestSync } from '@/src/sync/queue';

export type SessionStatus = 'checking' | 'signedOut' | 'signedIn';

type SessionState = {
  status: SessionStatus;
  isBusy: boolean;
  user: GoogleUser | null;
  spreadsheetId: string | null;
  errorMessage: string | null;
  bootstrapSession: () => Promise<void>;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
};

async function discoverForUser(user: GoogleUser): Promise<void> {
  const result = await discoverSpreadsheet(
    useSessionStore.getState().spreadsheetId,
    () => useSessionStore.setState({ spreadsheetId: null }),
  );
  useSessionStore.setState({
    status: 'signedIn',
    isBusy: false,
    user,
    spreadsheetId: result.spreadsheetId,
    errorMessage: null,
  });
  void requestSync({ pull: true });
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      status: 'checking',
      isBusy: false,
      user: null,
      spreadsheetId: null,
      errorMessage: null,
      bootstrapSession: async () => {
        set({ status: 'checking', errorMessage: null });
        try {
          await useSessionStore.persist.rehydrate();
          configureGoogleSignIn();
          const user = await signInSilently();
          if (!user) {
            set({ status: 'signedOut', user: null, isBusy: false });
            return;
          }
          await discoverForUser(user);
        } catch (error) {
          set({ status: 'signedOut', user: null, isBusy: false, errorMessage: messageFromError(error) });
        }
      },
      signIn: async () => {
        set({ isBusy: true, errorMessage: null });
        try {
          configureGoogleSignIn();
          const user = await signInWithGoogle();
          if (!user) {
            set({ status: 'signedOut', isBusy: false });
            return false;
          }
          await discoverForUser(user);
          return true;
        } catch (error) {
          set({ status: 'signedOut', user: null, isBusy: false, errorMessage: messageFromError(error) });
          return false;
        }
      },
      signOut: async () => {
        set({ isBusy: true, errorMessage: null });
        try {
          await signOutFromGoogle();
          set({ status: 'signedOut', user: null, isBusy: false });
        } catch (error) {
          set({ status: 'signedOut', user: null, isBusy: false, errorMessage: messageFromError(error) });
        }
      },
    }),
    {
      name: 'student-finance-session-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ spreadsheetId: state.spreadsheetId }),
    },
  ),
);
