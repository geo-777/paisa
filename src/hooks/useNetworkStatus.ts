import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

function isOfflineState(state: { isConnected: boolean | null; isInternetReachable: boolean | null }): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

export function useNetworkStatus(): { isOffline: boolean } {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let mounted = true;
    void NetInfo.fetch()
      .then((state) => {
        if (mounted) setIsOffline(isOfflineState(state));
      })
      .catch(() => {
        if (mounted) setIsOffline(true);
      });
    const unsubscribe = NetInfo.addEventListener((state) => setIsOffline(isOfflineState(state)));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return { isOffline };
}
