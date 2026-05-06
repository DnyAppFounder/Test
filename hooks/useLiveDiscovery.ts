/**
 * useLiveDiscovery
 *
 * Polls DexScreener + Birdeye in the background on a safe interval and
 * merges newly discovered tokens into the caller's token list without
 * triggering a page reload or resetting scroll position.
 *
 * Usage:
 *   const { tokens, refreshNow, isRefreshing } = useLiveDiscovery(category, initialTokens);
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { liveMarketService, LiveToken, MarketCategory } from '@/services/liveMarketService';

const POLL_INTERVAL_MS = 15_000; // 15 seconds

export function useLiveDiscovery(
  category: MarketCategory,
  enabled = true
) {
  const [tokens, setTokens] = useState<LiveToken[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const seenMints = useRef(new Set<string>());

  const fetchAndMerge = useCallback(async (silent = true) => {
    if (!enabled) return;

    if (!silent) setIsRefreshing(true);
    console.log(`[LiveDiscovery] refresh started category=${category}`);

    try {
      const fresh = await liveMarketService.getTokensByCategory(category);
      if (!mountedRef.current) return;

      const newMints: string[] = [];
      setTokens(prev => {
        const existing = new Map(prev.map(t => [t.address, t]));

        for (const t of fresh) {
          if (!seenMints.current.has(t.address)) {
            newMints.push(t.address);
            seenMints.current.add(t.address);
          }
          // Always update market data for existing tokens
          existing.set(t.address, t);
        }

        const merged = Array.from(existing.values());
        // Preserve order: existing order first, then new at front
        const existingOrder = prev.map(t => t.address);
        const newTokens = newMints.map(m => existing.get(m)!).filter(Boolean);
        const updatedExisting = existingOrder
          .map(addr => existing.get(addr))
          .filter((t): t is LiveToken => !!t);

        return [...newTokens, ...updatedExisting];
      });

      if (newMints.length > 0) {
        console.log(`[LiveDiscovery] ${newMints.length} new tokens found and added to list`);
      }
    } catch (e) {
      console.warn('[LiveDiscovery] fetch error:', e);
    } finally {
      if (mountedRef.current && !silent) {
        setIsRefreshing(false);
      }
    }
  }, [category, enabled]);

  // Initial load (not silent — caller sees it)
  useEffect(() => {
    seenMints.current.clear();
    fetchAndMerge(false);
  }, [fetchAndMerge]);

  // Polling interval
  useEffect(() => {
    if (!enabled) return;

    intervalRef.current = setInterval(() => {
      fetchAndMerge(true);
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchAndMerge, enabled]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const refreshNow = useCallback(() => {
    fetchAndMerge(false);
  }, [fetchAndMerge]);

  return { tokens, isRefreshing, refreshNow };
}
