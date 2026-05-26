import { useCallback, useEffect, useRef, useState } from 'react';

export interface ChartAnimationState {
  /** Right edge of the live viewport in unix ms. This is the only live clock. */
  visualRightTime: number;
  /** How far the user is panned back from live. 0 = live edge. */
  panOffsetMs: number;
  /** True when panOffsetMs is essentially zero. */
  isLiveMode: boolean;
  /** True while the user is actively dragging the chart. */
  isPanning: boolean;
}

export interface ChartAnimationActions {
  onPanStart: () => void;
  onPanDelta: (deltaMs: number) => void;
  setPanOffsetMs: (ms: number) => void;
  onPanEnd: () => void;
  returnToLive: () => void;
  setChartVisible: (visible: boolean) => void;
  setInitialPanOffsetMs: (ms: number) => void;
}

export interface UseChartAnimationEngineResult {
  state: ChartAnimationState;
  actions: ChartAnimationActions;
}

const EPS_LIVE_MS = 80;
const MOBILE_FRAME_MS = 16;
const DESKTOP_FRAME_MS = 16;

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * DAWEN chart animation engine.
 *
 * This hook owns viewport time only. It never creates candles, prices, trades, or volume.
 * Pump-style behavior is achieved by moving the whole viewport with visualRightTime:
 *   xLeft = visualRightTime - panOffsetMs - visibleMs
 *
 * The renderer must use that same xLeft for line, candles, volumes, grid, time axis and crosshair.
 */
export function useChartAnimationEngine(maxPanBackMs: number): UseChartAnimationEngineResult {
  const maxPanBackMsRef = useRef(Math.max(0, maxPanBackMs || 0));
  const panOffsetMsRef = useRef(0);
  const visualRightTimeRef = useRef(Date.now());
  const chartVisibleRef = useRef(true);
  const isPanningRef = useRef(false);
  const userHasPannedRef = useRef(false);
  const lastClockRef = useRef(Date.now());

  const [visualRightTime, setVisualRightTime] = useState(() => visualRightTimeRef.current);
  const [panOffsetMsState, setPanOffsetMsState] = useState(0);
  const [isPanningState, setIsPanningState] = useState(false);

  useEffect(() => {
    maxPanBackMsRef.current = Math.max(0, maxPanBackMs || 0);
    if (panOffsetMsRef.current > maxPanBackMsRef.current) {
      const clamped = Math.max(0, maxPanBackMsRef.current);
      panOffsetMsRef.current = clamped;
      setPanOffsetMsState(clamped < EPS_LIVE_MS ? 0 : clamped);
    }
  }, [maxPanBackMs]);

  useEffect(() => {
    let rafId = 0;
    let lastRender = 0;
    let hidden = typeof document !== 'undefined' ? document.hidden : false;
    const frameMs = isMobileBrowser() ? MOBILE_FRAME_MS : DESKTOP_FRAME_MS;

    const onVisibility = () => {
      hidden = typeof document !== 'undefined' ? document.hidden : false;
      lastClockRef.current = Date.now();
      if (!hidden) {
        visualRightTimeRef.current = Date.now();
        setVisualRightTime(visualRightTimeRef.current);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    const tick = (nowPerf: number) => {
      const now = Date.now();
      if (!hidden && chartVisibleRef.current) {
        if (!isPanningRef.current) {
          // Move the LIVE VIEWPORT in real time. Not a fake price movement.
          const dt = Math.max(0, Math.min(now - lastClockRef.current, 1000));
          visualRightTimeRef.current += dt;
          // Avoid long-term drift from browser sleep/throttle.
          if (Math.abs(visualRightTimeRef.current - now) > 1500) {
            visualRightTimeRef.current = now;
          }
        }
        lastClockRef.current = now;
        if (nowPerf - lastRender >= frameMs) {
          lastRender = nowPerf;
          setVisualRightTime(visualRightTimeRef.current);
        }
      } else {
        lastClockRef.current = now;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, []);

  const clampPanOffset = useCallback((ms: number) => {
    const maxBack = Math.max(0, maxPanBackMsRef.current || 0);
    const safe = Math.max(0, Math.min(maxBack, Number.isFinite(ms) ? ms : 0));
    return safe < EPS_LIVE_MS ? 0 : safe;
  }, []);

  const setPanOffsetMs = useCallback((ms: number) => {
    const safe = clampPanOffset(ms);
    panOffsetMsRef.current = safe;
    setPanOffsetMsState(safe);
  }, [clampPanOffset]);

  const onPanStart = useCallback(() => {
    isPanningRef.current = true;
    userHasPannedRef.current = true;
    setIsPanningState(true);
  }, []);

  const onPanDelta = useCallback((deltaMs: number) => {
    setPanOffsetMs(panOffsetMsRef.current + deltaMs);
  }, [setPanOffsetMs]);

  const onPanEnd = useCallback(() => {
    isPanningRef.current = false;
    setIsPanningState(false);
    lastClockRef.current = Date.now();
  }, []);

  const returnToLive = useCallback(() => {
    isPanningRef.current = false;
    userHasPannedRef.current = false;
    panOffsetMsRef.current = 0;
    visualRightTimeRef.current = Date.now();
    lastClockRef.current = Date.now();
    setIsPanningState(false);
    setPanOffsetMsState(0);
    setVisualRightTime(visualRightTimeRef.current);
  }, []);

  const setChartVisible = useCallback((visible: boolean) => {
    chartVisibleRef.current = visible;
    lastClockRef.current = Date.now();
  }, []);

  const setInitialPanOffsetMs = useCallback((ms: number) => {
    if (userHasPannedRef.current) return;
    setPanOffsetMs(ms);
  }, [setPanOffsetMs]);

  const isLiveMode = panOffsetMsState < EPS_LIVE_MS;

  return {
    state: { visualRightTime, panOffsetMs: panOffsetMsState, isLiveMode, isPanning: isPanningState },
    actions: { onPanStart, onPanDelta, setPanOffsetMs, onPanEnd, returnToLive, setChartVisible, setInitialPanOffsetMs },
  };
}
