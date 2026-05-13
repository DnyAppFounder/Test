import { useState, useEffect, useRef, useCallback } from 'react';
import { getDuelEntry, getMatchForEntry, triggerMatchmaking, DuelEntry, DuelMatch } from '@/services/game/duelEntryService';
import { supabase } from '@/lib/supabase';

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

  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef   = useRef(false);
  const resolvedRef  = useRef(false); // prevents double-resolution from poll + realtime

  const resolveMatch = useCallback((m: DuelMatch) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setMatch(m);
    setState('matched');
  }, []);

  const stopPolling = useCallback(() => {
    stoppedRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!entryId || !walletAddress) return;
    stoppedRef.current  = false;
    resolvedRef.current = false;

    // ── Realtime: duel_entries UPDATE → detect when this entry is matched ──
    const entryChannel = supabase
      .channel(`duel_entry_${entryId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'duel_entries', filter: `id=eq.${entryId}` },
        (payload) => {
          const row = payload.new as any;
          if (row.status === 'matched' && !resolvedRef.current) {
            (async () => {
              const m = await getMatchForEntry(entryId);
              if (m) {
                resolveMatch(m);
                stopPolling();
              }
            })();
          } else if (row.status === 'cancelled' || row.status === 'refunded') {
            if (!resolvedRef.current) {
              resolvedRef.current = true;
              setState('cancelled');
              stopPolling();
            }
          }
        },
      )
      .subscribe();

    // ── Realtime: duel_matches INSERT → detect a new match for this entry ──
    const matchChannel = supabase
      .channel(`duel_match_entry_${entryId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'duel_matches' },
        (payload) => {
          const row = payload.new as any;
          if (
            (row.player1_entry_id === entryId || row.player2_entry_id === entryId) &&
            !resolvedRef.current
          ) {
            const m: DuelMatch = row as DuelMatch;
            resolveMatch(m);
            stopPolling();
          }
        },
      )
      .subscribe();

    // ── Polling fallback every 5 s ────────────────────────────────────────
    const poll = async () => {
      if (stoppedRef.current || resolvedRef.current) return;
      try {
        setPollCount(c => c + 1);

        const result = await triggerMatchmaking({ entryId, walletAddress });
        if (result.matched && result.match) {
          resolveMatch(result.match);
          stopPolling();
          return;
        }

        const freshEntry = await getDuelEntry(entryId);
        if (!freshEntry) {
          if (!resolvedRef.current) {
            resolvedRef.current = true;
            setError('Entry not found');
            setState('error');
            stopPolling();
          }
          return;
        }
        setEntry(freshEntry);

        if (freshEntry.status === 'matched') {
          const m = await getMatchForEntry(entryId);
          if (m) {
            resolveMatch(m);
            stopPolling();
          }
        } else if (freshEntry.status === 'cancelled' || freshEntry.status === 'refunded') {
          if (!resolvedRef.current) {
            resolvedRef.current = true;
            setState('cancelled');
            stopPolling();
          }
        }
      } catch (e) {
        console.warn('[useSolDuelMatchmaking] poll error:', e);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 5_000);

    return () => {
      stopPolling();
      supabase.removeChannel(entryChannel);
      supabase.removeChannel(matchChannel);
    };
  }, [entryId, walletAddress, stopPolling, resolveMatch]);

  return { state, entry, match, pollCount, error, stopPolling };
}
