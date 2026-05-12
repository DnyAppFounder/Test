import { useState, useEffect, useRef, useCallback } from 'react';
import { getDuelEntry, getMatchForEntry, triggerMatchmaking, DuelEntry, DuelMatch } from '@/services/game/duelEntryService';

type MatchState = 'waiting' | 'matched' | 'cancelled' | 'error';

interface UseSolDuelMatchmakingResult {
  state: MatchState;
  entry: DuelEntry | null;
  match: DuelMatch | null;
  pollCount: number;
  error: string | null;
  stopPolling: () => void;
}

export function useSolDuelMatchmaking(
  entryId: string | null,
  walletAddress: string | null,
): UseSolDuelMatchmakingResult {
  const [state, setState] = useState<MatchState>('waiting');
  const [entry, setEntry] = useState<DuelEntry | null>(null);
  const [match, setMatch] = useState<DuelMatch | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef = useRef(false);

  const stopPolling = useCallback(() => {
    stoppedRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!entryId || !walletAddress) return;
    stoppedRef.current = false;

    const poll = async () => {
      if (stoppedRef.current) return;
      try {
        setPollCount(c => c + 1);

        // Try to trigger matchmaking
        const result = await triggerMatchmaking({ entryId, walletAddress });

        if (result.matched && result.match) {
          setMatch(result.match);
          setState('matched');
          stopPolling();
          return;
        }

        // Refresh entry status
        const freshEntry = await getDuelEntry(entryId);
        if (!freshEntry) {
          setError('Entry not found');
          setState('error');
          stopPolling();
          return;
        }
        setEntry(freshEntry);

        if (freshEntry.status === 'matched') {
          const m = await getMatchForEntry(entryId);
          if (m) {
            setMatch(m);
            setState('matched');
            stopPolling();
          }
        } else if (freshEntry.status === 'cancelled' || freshEntry.status === 'refunded') {
          setState('cancelled');
          stopPolling();
        }
      } catch (e) {
        console.warn('[useSolDuelMatchmaking] poll error:', e);
        // Don't stop on transient errors — keep polling
      }
    };

    // Initial poll immediately
    poll();
    intervalRef.current = setInterval(poll, 5_000);

    return () => stopPolling();
  }, [entryId, walletAddress, stopPolling]);

  return { state, entry, match, pollCount, error, stopPolling };
}
