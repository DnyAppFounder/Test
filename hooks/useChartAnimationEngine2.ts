/**
 * useChartAnimationEngine
 *
 * Controls the live viewport clock and pan state for TradingViewChart.
 * Owns ONLY visual time movement — never creates candles, trades, volume, or prices.
 *
 * Responsibilities:
 *   - requestAnimationFrame loop (paused when tab hidden / chart off-screen)
 *   - visualRightTime — live clock that advances in real time, frozen while user pans
 *   - panOffsetMs — how far the user has scrolled into history (0 = live edge)
 *   - isLiveMode — true when panOffsetMs === 0
 *   - Return to Live — snap back to live edge cleanly
 *   - Pause/resume based on Page Visibility API and IntersectionObserver
 *
 * Not responsible for:
 *   - OHLCV data loading (chartDataService)
 *   - candle creation or mutation
 *   - price calculation or quote updates
 *   - wallet/trading logic
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

export interface ChartAnimationState {
  /** Unix-ms timestamp used as the right edge of the live viewport. */
  visualRightTime: number;
  /** How many ms the user has scrolled into history. 0 = live edge. */
  panOffsetMs: number;
  /** True when panOffsetMs === 0 (chart follows live time). */
  isLiveMode: boolean;
}

export interface ChartAnimationActions {
  /** Call when a horizontal pan gesture starts (touch or mouse-down). */
  onPanStart: () => void;
  /**
   * Call on each gesture move frame.
   * Adds a relative time offset to the viewport.
   * The chart component converts gesture direction into ms.
   */
  onPanDelta: (deltaMs: number) => void;
  /** Set the absolute pan offset in ms during a gesture. Safer than delta when React state is throttled. */
  setPanOffsetMs: (ms: number) => void;
  /** Call when gesture ends (touch-up, mouse-up, terminate). */
  onPanEnd: () => void;
  /** Snap the viewport back to the live edge. */
  returnToLive: () => void;
  /** Notify the engine when the chart SVG enters or leaves the viewport. */
  setChartVisible: (visible: boolean) => void;
  /**
   * Apply an auto-scroll correction (e.g. after data loads and last candle is
   * outside the live window). Ignored if the user has already panned manually.
   */
  setInitialPanOffsetMs: (ms: number) => void;
}

export interface UseChartAnimationEngineResult {
  state: ChartAnimationState;
  actions: ChartAnimationActions;
}

// RAF fires at display frequency but React state updates are throttled.
const RENDER_INTERVAL_MOBILE  =  50; // ~20fps — smooth enough on mobile without overheating
const RENDER_INTERVAL_DESKTOP =  16; // ~60fps — full smooth animation on desktop

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mobi|Android/i.test(navigator.userAgent);
}

export function useChartAnimationEngine(
  /** Maximum allowed pan-back in ms (normally = Date.now() - oldestCandle.timestamp). */
  maxPanBackMs: number,
): UseChartAnimationEngineResult {

  // ── Internal refs (read-only inside RAF closure) ────────────────────────────
  const isPanningRef        = useRef(false);
  const chartVisibleRef     = useRef(true);
  const panOffsetMsRef      = useRef(0);
  const visualRightTimeRef  = useRef(Date.now());
  const maxPanBackMsRef     = useRef(maxPanBackMs);
  // Track whether any user-initiated pan has occurred so auto-corrections
  // (setInitialPanOffsetMs) are accepted only before the first manual pan.
  const userHasPannedRef    = useRef(false);

  // Keep maxPanBackMs current without recreating the RAF effect.
  useEffect(() => { maxPanBackMsRef.current = maxPanBackMs; }, [maxPanBackMs]);

  // ── React state (triggers re-renders) ──────────────────────────────────────
  const [visualRightTime, setVisualRightTime] = useState(() => Date.now());
  const [panOffsetMs,     setPanOffsetMs]     = useState(0);

  const isLiveMode = panOffsetMs === 0;

  // ── RAF clock ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let rafId    = 0;
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
        // Freeze the clock while the user is dragging so the viewport doesn't
        // shift under their finger and create a fighting/snapping sensation.
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
  }, []); // intentionally empty — single RAF loop for the component lifetime

  // ── Actions ─────────────────────────────────────────────────────────────────
  const onPanStart = useCallback(() => {
    isPanningRef.current    = true;
    userHasPannedRef.current = true;
  }, []);

  const clampPanOffset = useCallback((ms: number) => {
    const maxBack = maxPanBackMsRef.current;
    return Math.max(0, Math.min(maxBack, ms));
  }, []);

  const setPanOffsetMsAbsolute = useCallback((ms: number) => {
    const clamped = clampPanOffset(ms);
    panOffsetMsRef.current = clamped;
    setPanOffsetMs(clamped);
  }, [clampPanOffset]);

  const onPanDelta = useCallback((deltaMs: number) => {
    setPanOffsetMsAbsolute(panOffsetMsRef.current + deltaMs);
  }, [setPanOffsetMsAbsolute]);

  const onPanEnd = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  const returnToLive = useCallback(() => {
    panOffsetMsRef.current     = 0;
    isPanningRef.current       = false;
    userHasPannedRef.current   = false;
    visualRightTimeRef.current = Date.now();
    setPanOffsetMs(0);
    setVisualRightTime(Date.now());
  }, []);

  const setChartVisible = useCallback((visible: boolean) => {
    chartVisibleRef.current = visible;
  }, []);

  const setInitialPanOffsetMs = useCallback((ms: number) => {
    // Only accept auto-corrections when the user hasn't manually panned yet,
    // otherwise we'd fight user intent by snapping the chart away mid-exploration.
    if (userHasPannedRef.current) return;
    setPanOffsetMsAbsolute(ms);
  }, [setPanOffsetMsAbsolute]);

  return {
    state:   { visualRightTime, panOffsetMs, isLiveMode },
    actions: { onPanStart, onPanDelta, setPanOffsetMs: setPanOffsetMsAbsolute, onPanEnd, returnToLive, setChartVisible, setInitialPanOffsetMs },
  };
}
