import { useState, useEffect } from 'react';
import { liveTokenStore, LiveTokenState } from '@/services/liveTokenStore';

export function useLiveToken(mint: string | null | undefined): LiveTokenState | null {
  const [state, setState] = useState<LiveTokenState | null>(
    mint ? liveTokenStore.getState(mint) : null
  );

  useEffect(() => {
    if (!mint) {
      setState(null);
      return;
    }
    // Subscribe; delivers current state immediately if available
    const unsub = liveTokenStore.watch(mint, (s) => {
      setState(s);
    });
    return unsub;
  }, [mint]);

  return state;
}

export function pushLivePrice(mint: string, price: number, marketCap?: number): void {
  liveTokenStore.pushPrice(mint, price, marketCap);
}
