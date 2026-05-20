/**
 * useChartAnimationEngine
 *
 * Owns the live viewport clock and pan state for TradingViewChart.
 * It controls ONLY visual time movement — never creates candles, trades, volume, or prices.
 *
 * Responsibilities:
 *   - requestAnimationFrame loop (paused when tab hidden / chart off-screen)
 *   - visualRightTime — live clock, frozen while user pans
 *   - panOffsetMs — how far the user has scrolled into history
 *   - isLiveMode — true when panOffset === 0
 *   - Return to Live action
 *
 * Not responsible for:
 *   - OHLCV data loading
 *   - candle creation
 *   - price updates
 *   - any WebSocket or REST logic
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

export interface ChartAnimationState {
  /** Unix-ms timestamp that acts as the right edge of the live viewport. */
  visualRightTime: number;
  /** How many milliseconds the user has scrolled into the past. 0 = live edge. */
  panOffsetMs: number;
  /** True when panOffsetMs === 0 (chart is following live time). */
  isLiveMode: boolean;
}

export interface ChartAnimationActions {
  /** Call on gesture start (touch or mouse-down). */
  onPanStart: () => void;
  /**
   * Call on gesture move.
   * @param deltaMs positive = drag right = moving into past; negative = drag left = toward live.
   */
  onPanDelta: (deltaMs: number) => void;
  /** Call on gesture end. */
  onPanEnd: () => void;
  /** Jump back to live edge. */
  returnToLive: () => void;
  /** Notify the engine that the chart SVG has entered / left the viewport. */
  setChartVisible: (visible: boolean) => void;
  /**
   * Called by auto-scroll logic when data loads and the last candle is outside the
   * visible window. Engine accepts this as an initial pan correction only when
   * isLiveMode = true (no user has panned yet).
   */
  setInitialPanOffsetMs: (ms: number) => void;
}

export interface UseChartAnimationEngineResult {
  state: ChartAnimationState;
  actions: ChartAnimationActions;
}

// Mobile: 10fps; desktop: ~16fps. RAF runs at display rate but React state updates
// are throttled to avoid overheating.
const RENDER_INTERVAL_MOBILE  = 100; // 10 fps
const RENDER_INTERVAL_DESKTOP =  60; // ~16 fps

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mobi|Android/i.test(navigator.userAgent);
}

export function useChartAnimationEngine(
  /** Maximum pan-back in ms (based on oldest loaded candle). 0 = no data yet. */
  maxPanBackMs: number,
): UseChartAnimationEngineResult {
  // --- refs that are safe to read inside the RAF closure ---
  const isPanningRef       = useRef(false);
  const chartVisibleRef    = useRef(true);
  const panOffsetMsRef     = useRef(0);
  const visualRightTimeRef = useRef(Date.now());
  const maxPanBackMsRef    = useRef(maxPanBackMs);

  // Keep maxPanBackMs in sync without re-creating the RAF effect.
  useEffect(() => { maxPanBackMsRef.current = maxPanBackMs; }, [maxPanBackMs]);

  // Exposed React state (re-render triggers).
  const [visualRightTime, setVisualRightTime] = useState(() => Date.now());
  const [panOffsetMs,     setPanOffsetMs]     = useState(0);

  const isLiveMode = panOffsetMs === 0;

  // ── RAF clock ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let rafId = 0;
    let lastRender = 0;
    let tabHidden  = false;
    const INTERVAL = isMobileBrowser() ? RENDER_INTERVAL_MOBILE : RENDER_INTERVAL_DESKTOP;

    const onVisibilityChange = () => {
      tabHidden = typeof document !== 'undefined' ? document.hidden : false;
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
      tabHidden = document.hidden;
    }

    const tick = (now: number) => {
      if (!tabHidden && chartVisibleRef.current) {
        // Advance the live clock only when the user is not dragging.
        // Dragging while the clock ticks would shift the viewport under their finger.
        if (!isPanningRef.current) {
          visualRightTimeRef.current = Date.now();
        }
        if (now - lastRender >= INTERVAL) {
          lastRender = now;
          setVisualRightTime(visualRightTimeRef.current);
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, []); // intentionally empty — runs once

  // ── Actions ────────────────────────────────────────────────────────────────
  const onPanStart = useCallback(() => {
    isPanningRef.current = true;
  }, []);

  const onPanDelta = useCallback((deltaMs: number) => {
    // deltaMs > 0 → user dragged right → moving into past → increase offset.
    // deltaMs < 0 → user dragged left → moving toward live → decrease offset.
    const maxBack  = maxPanBackMsRef.current;
    const newOffset = Math.max(0, Math.min(maxBack, panOffsetMsRef.current + deltaMs));
    panOffsetMsRef.current = newOffset;
    setPanOffsetMs(newOffset);
  }, []);

  const onPanEnd = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  const returnToLive = useCallback(() => {
    panOffsetMsRef.current  = 0;
    isPanningRef.current    = false;
    visualRightTimeRef.current = Date.now();
    setPanOffsetMs(0);
    setVisualRightTime(Date.now());
  }, []);

  const setChartVisible = useCallback((visible: boolean) => {
    chartVisibleRef.current = visible;
  }, []);

  const setInitialPanOffsetMs = useCallback((ms: number) => {
    // Only accept auto-corrections when no user pan has occurred.
    if (panOffsetMsRef.current !== 0) return;
    const maxBack = maxPanBackMsRef.current;
    const clamped = Math.max(0, Math.min(maxBack, ms));
    panOffsetMsRef.current = clamped;
    setPanOffsetMs(clamped);
  }, []);

  return {
    state: {
      visualRightTime,
      panOffsetMs,
      isLiveMode,
    },
    actions: {
      onPanStart,
      onPanDelta,
      onPanEnd,
      returnToLive,
      setChartVisible,
      setInitialPanOffsetMs,
    },
  };
}
