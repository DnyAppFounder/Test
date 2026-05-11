import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  PanResponder,
  Animated,
  Easing,
} from 'react-native';
import Svg, {
  Line, Rect, Path, Text as SvgText, Defs, LinearGradient, Stop, Circle,
} from 'react-native-svg';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { CandleData, TimeFrame } from '@/services/chartDataService';
import { realtimeChartService, CandleUpdateListener } from '@/services/realtimeChartService';

type ChartMode = 'candles' | 'line' | 'area' | 'bars' | 'mountain' | 'bonding';

// ─── Layout constants ─────────────────────────────────────────────────────────
const CHART_HEIGHT       = 480;  // extra 20px for time axis row
const PRICE_AXIS_WIDTH   = 78;   // enough room for price labels
const VOLUME_HEIGHT      = 90;   // ~20% of CHART_HEIGHT
const VOLUME_GAP         = 10;
const PADDING_TOP        = 14;
const PADDING_BOTTOM     = 6;
const TIME_AXIS_HEIGHT   = 20;   // reserved at the bottom for time labels
const MIN_CANDLE_WIDTH   = 6;    // thicker candles for readability
const MAX_CANDLE_WIDTH   = 18;
const CANDLE_GAP_RATIO   = 0.28; // gap fraction of candle width
const TARGET_VISIBLE     = 40;   // default visible candles on screen
const MAX_VISIBLE        = 60;   // hard cap — never squeeze more than this
const PATTERN_W          = 120;  // bg grid pattern width — multiple of 40 for seamless loop
const MAX_PAN_EXTRA      = 6000; // max extra pixels user can pan left

const CHART_MODES: { id: ChartMode; label: string }[] = [
  { id: 'candles',  label: 'Candles'  },
  { id: 'area',     label: 'Area'     },
  { id: 'line',     label: 'Line'     },
  { id: 'mountain', label: 'Mountain' },
  { id: 'bars',     label: 'Bars'     },
  { id: 'bonding',  label: 'Bonding'  },
];

interface CrosshairState {
  x: number;
  y: number;
  candleIndex: number;
}

interface TradingChartProps {
  tokenAddress: string;
  currentPrice?: number;
}

function deduplicateCandles(candles: CandleData[]): CandleData[] {
  const seen = new Map<number, CandleData>();
  for (const c of candles) {
    const existing = seen.get(c.timestamp);
    if (!existing || c.volume > existing.volume) seen.set(c.timestamp, c);
  }
  return Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function formatPrice(price: number): string {
  if (price === 0) return '0';
  if (price >= 1000) return price.toFixed(0);
  if (price >= 1)    return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  if (price >= 0.0001) return price.toFixed(6);
  return price.toExponential(2);
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000)     return `${(vol / 1_000).toFixed(1)}K`;
  return vol.toFixed(0);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTimeAxis(ts: number, tf: TimeFrame): string {
  const d = new Date(ts);
  if (tf === '1D') return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function timeFrameToPeriodMs(tf: TimeFrame): number {
  const map: Record<TimeFrame, number> = {
    '1m': 60_000, '5m': 300_000, '15m': 900_000,
    '1H': 3_600_000, '4H': 14_400_000, '1D': 86_400_000,
  };
  return map[tf] ?? 60_000;
}

export function TradingChart({ tokenAddress, currentPrice }: TradingChartProps) {
  const [rawCandles, setRawCandles] = useState<CandleData[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [timeFrame,     setTimeFrame]     = useState<TimeFrame>('15m');
  const [chartMode,     setChartMode]     = useState<ChartMode>('candles');
  const [containerWidth, setContainerWidth] = useState(Dimensions.get('window').width - 32);
  const [panOffset,     setPanOffset]     = useState(0);
  const [isLive,        setIsLive]        = useState(true);
  const [crosshair,     setCrosshair]     = useState<CrosshairState | null>(null);

  const timeFrames: TimeFrame[] = ['1m', '5m', '15m', '1H', '4H', '1D'];

  // ─── Subscription refs ────────────────────────────────────────────────────────
  const listenerRef     = useRef<CandleUpdateListener | null>(null);
  const currentTokenRef = useRef<string>('');
  const currentTfRef    = useRef<TimeFrame>('15m');

  // ─── Stable refs for PanResponder closures ────────────────────────────────────
  const candlesRef          = useRef<CandleData[]>([]);
  const panOffsetRef        = useRef(0);
  const isLiveRef           = useRef(true);
  const chartAreaWidthRef   = useRef(0);
  const rawCandleWidthRef   = useRef(9);
  const priceChartHeightRef = useRef(0);
  const priceMinRef         = useRef(0);
  const priceRangeRef       = useRef(1);
  const gestureModeRef      = useRef<'none' | 'crosshair' | 'pan'>('none');
  const panStartOffsetRef   = useRef(0);
  const crosshairTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live time offset — advances the chart continuously between candle updates
  const [liveTimeOffset, setLiveTimeOffset] = useState(0);
  const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Background animation ─────────────────────────────────────────────────────
  const bgAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(bgAnim, {
        toValue: 1,
        duration: 7000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const bgTranslate = bgAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, -PATTERN_W],
  });

  // ─── Keep refs synced ─────────────────────────────────────────────────────────
  useEffect(() => { candlesRef.current   = rawCandles;  }, [rawCandles]);
  useEffect(() => { panOffsetRef.current = panOffset;   }, [panOffset]);
  useEffect(() => { isLiveRef.current    = isLive;      }, [isLive]);

  // ─── Data subscription ────────────────────────────────────────────────────────
  const handleCandleUpdate = useCallback((updated: CandleData[]) => {
    const deduped = deduplicateCandles(updated);
    if (process.env.NODE_ENV !== 'production') {
      const dups = updated.length - deduped.length;
      console.log(
        `[Chart] tf=${timeFrame} candles=${deduped.length}` +
        (dups > 0 ? ` (${dups} dupes removed)` : '') +
        (deduped.length > 0 ? ` latest=${new Date(deduped[deduped.length - 1].timestamp).toISOString()}` : '')
      );
    }
    setRawCandles(deduped);
    setLoading(false);
  }, [timeFrame]);

  useEffect(() => {
    if (!tokenAddress) return;
    if (listenerRef.current) {
      realtimeChartService.unsubscribe(
        currentTokenRef.current, currentTfRef.current, listenerRef.current
      );
    }
    currentTokenRef.current = tokenAddress;
    currentTfRef.current    = timeFrame;
    listenerRef.current     = handleCandleUpdate;
    setLoading(true);
    setRawCandles([]);
    setPanOffset(0);
    setIsLive(true);

    realtimeChartService
      .subscribe(tokenAddress, timeFrame, handleCandleUpdate)
      .then((initial) => { if (initial.length > 0) handleCandleUpdate(initial); })
      .catch((err) => { console.error('[TradingChart] Subscribe error:', err); setLoading(false); });

    return () => {
      if (listenerRef.current) {
        realtimeChartService.unsubscribe(tokenAddress, timeFrame, listenerRef.current);
        listenerRef.current = null;
      }
    };
  }, [tokenAddress, timeFrame]);

  // ─── Live time offset — keeps chart moving in real time ──────────────────────
  useEffect(() => {
    if (liveTimerRef.current) { clearInterval(liveTimerRef.current); liveTimerRef.current = null; }
    if (!isLive) { setLiveTimeOffset(0); return; }

    const update = () => {
      const cs = candlesRef.current;
      if (cs.length === 0) { setLiveTimeOffset(0); return; }
      const lastCandle = cs[cs.length - 1];
      const periodMs   = timeFrameToPeriodMs(currentTfRef.current);
      const elapsed    = (Date.now() - lastCandle.timestamp) % periodMs;
      setLiveTimeOffset(Math.min(1, elapsed / periodMs) * rawCandleWidthRef.current);
    };

    update();
    liveTimerRef.current = setInterval(update, 500);
    return () => { if (liveTimerRef.current) { clearInterval(liveTimerRef.current); liveTimerRef.current = null; } };
  }, [isLive]);

  // ─── Layout & candle sizing ───────────────────────────────────────────────────

  const chartAreaWidth   = containerWidth - PRICE_AXIS_WIDTH;
  const priceChartHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM - VOLUME_HEIGHT - VOLUME_GAP;
  const candles          = rawCandles;

  // Fixed candle width — show TARGET_VISIBLE by default (pan reveals older ones)
  const visibleCount   = Math.min(candles.length, TARGET_VISIBLE);
  const rawCandleWidth = candles.length > 0
    ? Math.max(MIN_CANDLE_WIDTH, Math.min(MAX_CANDLE_WIDTH, chartAreaWidth / Math.max(visibleCount, 1)))
    : 9;
  const bodyWidth = Math.max(3, rawCandleWidth * (1 - CANDLE_GAP_RATIO));

  // Start X of candle[0] in chart coordinates (negative = left of viewport)
  // liveTimeOffset shifts candles left proportional to elapsed time in current period
  const totalUsed = candles.length * rawCandleWidth;
  const startX    = candles.length <= 1
    ? chartAreaWidth / 2 - rawCandleWidth / 2
    : Math.max(0, chartAreaWidth - totalUsed) - panOffset - (isLive ? liveTimeOffset : 0);

  // Visible candle indices for price scale
  const visFirstIdx = Math.max(0, Math.floor(-startX / rawCandleWidth));
  const visLastIdx  = Math.min(candles.length - 1, Math.ceil((chartAreaWidth - startX) / rawCandleWidth));
  const visSlice    = candles.length > 0 ? candles.slice(visFirstIdx, visLastIdx + 1) : [];

  // Price scale — based on visible candles so it adapts to the pan window
  const scaleSource  = visSlice.length > 0 ? visSlice : candles;
  const prices       = scaleSource.length > 0 ? scaleSource.flatMap(c => [c.high, c.low]) : [1, 0];
  const rawMax       = Math.max(...prices);
  const rawMin       = Math.min(...prices);
  const rawRange     = rawMax - rawMin || rawMax * 0.1 || 1;
  const priceMax     = rawMax + rawRange * 0.06;
  const priceMin     = Math.max(0, rawMin - rawRange * 0.06);
  const priceRange   = priceMax - priceMin || 1;

  const volumes      = candles.map(c => c.volume);
  const maxVol       = Math.max(...volumes, 1);
  const volBaseY     = PADDING_TOP + priceChartHeight + VOLUME_GAP + VOLUME_HEIGHT;
  const volToHeight  = (v: number) => (v / maxVol) * (VOLUME_HEIGHT * 0.9);

  // Sync layout refs for PanResponder
  chartAreaWidthRef.current   = chartAreaWidth;
  rawCandleWidthRef.current   = rawCandleWidth;
  priceChartHeightRef.current = priceChartHeight;
  priceMinRef.current         = priceMin;
  priceRangeRef.current       = priceRange;

  const xOf = (index: number): number => startX + index * rawCandleWidth + rawCandleWidth / 2;

  const priceToY = (price: number): number => {
    const ratio = (price - priceMin) / priceRange;
    return PADDING_TOP + priceChartHeight - ratio * priceChartHeight;
  };

  // ─── PanResponder ─────────────────────────────────────────────────────────────

  const clearCrosshairDelayed = () => {
    if (crosshairTimerRef.current) clearTimeout(crosshairTimerRef.current);
    crosshairTimerRef.current = setTimeout(() => setCrosshair(null), 2400);
  };

  const updateCrosshairAt = (touchX: number, touchY: number) => {
    const cs  = candlesRef.current;
    const cw  = chartAreaWidthRef.current;
    const rcw = rawCandleWidthRef.current;
    const po  = panOffsetRef.current;
    const pch = priceChartHeightRef.current;
    if (cs.length === 0) return;

    const totalW  = cs.length * rcw;
    const sx      = Math.max(0, cw - totalW) - po;
    const rawIdx  = (touchX - sx) / rcw;
    const idx     = Math.max(0, Math.min(cs.length - 1, Math.round(rawIdx)));
    const candleX = sx + idx * rcw + rcw / 2;
    const clampY  = Math.max(PADDING_TOP, Math.min(PADDING_TOP + pch, touchY));

    setCrosshair({ x: candleX, y: clampY, candleIndex: idx });
    if (crosshairTimerRef.current) clearTimeout(crosshairTimerRef.current);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,

      onPanResponderGrant: (e) => {
        if (crosshairTimerRef.current) clearTimeout(crosshairTimerRef.current);
        gestureModeRef.current    = 'crosshair';
        panStartOffsetRef.current = panOffsetRef.current;
        updateCrosshairAt(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },

      onPanResponderMove: (e, gs) => {
        const absDx = Math.abs(gs.dx);
        const absDy = Math.abs(gs.dy);

        if (gestureModeRef.current !== 'pan' && absDx > 8 && absDx > absDy * 1.4) {
          gestureModeRef.current = 'pan';
          setCrosshair(null);
        }

        if (gestureModeRef.current === 'pan') {
          const cs  = candlesRef.current;
          const cw  = chartAreaWidthRef.current;
          const rcw = rawCandleWidthRef.current;
          const totalW  = cs.length * rcw;
          const maxPan  = Math.max(0, totalW - cw) + MAX_PAN_EXTRA;
          const newOff  = Math.max(0, Math.min(maxPan, panStartOffsetRef.current - gs.dx));
          setPanOffset(newOff);
          panOffsetRef.current = newOff;
          if (newOff > 10 && isLiveRef.current) {
            setIsLive(false);
            isLiveRef.current = false;
          }
        } else if (gestureModeRef.current === 'crosshair') {
          updateCrosshairAt(e.nativeEvent.locationX, e.nativeEvent.locationY);
        }
      },

      onPanResponderRelease: () => {
        if (gestureModeRef.current === 'pan') {
          panStartOffsetRef.current = panOffsetRef.current;
          if (panOffsetRef.current <= 10) {
            setIsLive(true);
            isLiveRef.current = true;
            setPanOffset(0);
            panOffsetRef.current = 0;
          }
        }
        gestureModeRef.current = 'none';
        clearCrosshairDelayed();
      },

      onPanResponderTerminate: () => {
        gestureModeRef.current = 'none';
        clearCrosshairDelayed();
      },
    })
  ).current;

  const returnToLive = () => {
    setPanOffset(0);
    panOffsetRef.current      = 0;
    panStartOffsetRef.current = 0;
    setIsLive(true);
    isLiveRef.current = true;
    setCrosshair(null);
  };

  // ─── Animated background ──────────────────────────────────────────────────────

  const renderAnimatedBackground = () => {
    const bgW       = containerWidth + PATTERN_W;
    const numVLines = Math.ceil(bgW / 40) + 2;

    return (
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateX: bgTranslate }] }]}
        pointerEvents="none"
      >
        <Svg width={bgW} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="bgH" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%"   stopColor="rgba(88,28,135,0)"    stopOpacity="0" />
              <Stop offset="35%"  stopColor="rgba(88,28,135,0.12)" stopOpacity="1" />
              <Stop offset="65%"  stopColor="rgba(88,28,135,0.12)" stopOpacity="1" />
              <Stop offset="100%" stopColor="rgba(88,28,135,0)"    stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id="bgV" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor="rgba(0,0,0,0)"         stopOpacity="0" />
              <Stop offset="55%"  stopColor="rgba(88,28,135,0.07)"  stopOpacity="1" />
              <Stop offset="100%" stopColor="rgba(88,28,135,0.18)"  stopOpacity="1" />
            </LinearGradient>
          </Defs>

          {/* Glow overlays */}
          <Rect x={0} y={0} width={bgW} height={CHART_HEIGHT} fill="url(#bgH)" />
          <Rect x={0} y={0} width={bgW} height={CHART_HEIGHT} fill="url(#bgV)" />

          {/* Moving vertical grid lines every 40px */}
          {Array.from({ length: numVLines }, (_, i) => (
            <Line key={i}
              x1={i * 40} y1={0} x2={i * 40} y2={CHART_HEIGHT}
              stroke="rgba(139,92,246,0.08)" strokeWidth="1"
            />
          ))}

          {/* Accent lines every PATTERN_W — slightly brighter */}
          {Array.from({ length: Math.ceil(bgW / PATTERN_W) + 1 }, (_, i) => (
            <Line key={`a${i}`}
              x1={i * PATTERN_W} y1={0} x2={i * PATTERN_W} y2={CHART_HEIGHT}
              stroke="rgba(139,92,246,0.22)" strokeWidth="1"
            />
          ))}

          {/* Horizontal scanlines — sparse for performance */}
          {Array.from({ length: Math.ceil(CHART_HEIGHT / 16) }, (_, i) => (
            <Rect key={`s${i}`}
              x={0} y={i * 16} width={bgW} height={1}
              fill="rgba(139,92,246,0.03)"
            />
          ))}
        </Svg>
      </Animated.View>
    );
  };

  // ─── Price axis ───────────────────────────────────────────────────────────────

  const renderPriceAxis = (crosshairY?: number) => {
    const steps  = 5;
    const labels: { y: number; label: string }[] = [];
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps;
      const price = priceMin + ratio * priceRange;
      const y     = PADDING_TOP + priceChartHeight - ratio * priceChartHeight;
      labels.push({ y, label: formatPrice(price) });
    }
    const cpY = currentPrice !== undefined ? priceToY(currentPrice) : null;
    const chY = crosshairY ?? null;

    return (
      <View style={styles.priceAxis}>
        <Svg width={PRICE_AXIS_WIDTH} height={CHART_HEIGHT}>
          {/* Price labels */}
          {labels.map((l, i) => (
            <SvgText key={i} x={6} y={l.y + 4}
              fontSize="11" fill="rgba(255,255,255,0.65)" fontWeight="600">
              {l.label}
            </SvgText>
          ))}

          {/* Current price badge */}
          {cpY !== null && cpY > PADDING_TOP && cpY < PADDING_TOP + priceChartHeight && (
            <>
              <Rect x={1} y={cpY - 11} width={PRICE_AXIS_WIDTH - 3} height={18} rx={4} fill={colors.primary} />
              <SvgText x={5} y={cpY + 3} fontSize="11" fill="#fff" fontWeight="800">
                {formatPrice(currentPrice!)}
              </SvgText>
            </>
          )}

          {/* Crosshair price badge */}
          {chY !== null && chY > PADDING_TOP && chY < PADDING_TOP + priceChartHeight && (
            <>
              <Rect x={1} y={chY - 11} width={PRICE_AXIS_WIDTH - 3} height={18} rx={4}
                fill="rgba(255,255,255,0.2)" />
              <SvgText x={5} y={chY + 3} fontSize="11" fill="#fff" fontWeight="700">
                {formatPrice(priceMin + (1 - (chY - PADDING_TOP) / priceChartHeight) * priceRange)}
              </SvgText>
            </>
          )}
        </Svg>
      </View>
    );
  };

  // ─── Grid ─────────────────────────────────────────────────────────────────────

  const renderGrid = () =>
    Array.from({ length: 6 }, (_, i) => {
      const ratio = i / 5;
      const y = PADDING_TOP + priceChartHeight - ratio * priceChartHeight;
      return (
        <Line key={i} x1={0} y1={y} x2={chartAreaWidth} y2={y}
          stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      );
    });

  // ─── Crosshair lines (SVG) ────────────────────────────────────────────────────

  const renderCrosshairLines = () => {
    if (!crosshair) return null;
    const { x, y } = crosshair;
    return (
      <>
        <Line x1={x} y1={PADDING_TOP} x2={x} y2={PADDING_TOP + priceChartHeight}
          stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="4,3" />
        <Line x1={0} y1={y} x2={chartAreaWidth} y2={y}
          stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="4,3" />
        <Circle cx={x} cy={y} r={5}  fill="rgba(255,255,255,0.95)" />
        <Circle cx={x} cy={y} r={9}  fill="rgba(255,255,255,0.12)" />
      </>
    );
  };

  // ─── Crosshair tooltip ────────────────────────────────────────────────────────

  const renderCrosshairTooltip = () => {
    if (!crosshair) return null;
    const candle = candles[crosshair.candleIndex];
    if (!candle) return null;
    const isRight = crosshair.x > chartAreaWidth / 2;
    const isGreen = candle.close >= candle.open;
    return (
      <View style={[styles.tooltip, isRight ? styles.tooltipLeft : styles.tooltipRight]}>
        <Text style={styles.tooltipTime}>{formatTime(candle.timestamp)}</Text>
        <View style={styles.tooltipGrid}>
          <View style={styles.tooltipCell}>
            <Text style={styles.tooltipLabel}>O</Text>
            <Text style={styles.tooltipVal}>{formatPrice(candle.open)}</Text>
          </View>
          <View style={styles.tooltipCell}>
            <Text style={styles.tooltipLabel}>H</Text>
            <Text style={[styles.tooltipVal, { color: colors.success }]}>{formatPrice(candle.high)}</Text>
          </View>
          <View style={styles.tooltipCell}>
            <Text style={styles.tooltipLabel}>L</Text>
            <Text style={[styles.tooltipVal, { color: colors.error }]}>{formatPrice(candle.low)}</Text>
          </View>
          <View style={styles.tooltipCell}>
            <Text style={styles.tooltipLabel}>C</Text>
            <Text style={[styles.tooltipVal, { color: isGreen ? colors.success : colors.error }]}>
              {formatPrice(candle.close)}
            </Text>
          </View>
        </View>
        <Text style={styles.tooltipVol}>Vol {formatVolume(candle.volume)}</Text>
      </View>
    );
  };

  // ─── Candlesticks ─────────────────────────────────────────────────────────────

  const renderCandles = () =>
    candles.map((c, i) => {
      const x = xOf(i);
      if (x < -rawCandleWidth * 2 || x > chartAreaWidth + rawCandleWidth * 2) return null;
      const isGreen = c.close >= c.open;
      const col     = isGreen ? colors.success : colors.error;
      const openY   = priceToY(c.open);
      const closeY  = priceToY(c.close);
      const highY   = priceToY(c.high);
      const lowY    = priceToY(c.low);
      const bodyTop = Math.min(openY, closeY);
      const bodyH   = Math.max(1.5, Math.abs(closeY - openY));
      return (
        <>
          <Line key={`w${i}`} x1={x} y1={highY} x2={x} y2={lowY} stroke={col} strokeWidth="2" />
          <Rect key={`b${i}`} x={x - bodyWidth / 2} y={bodyTop}
            width={bodyWidth} height={bodyH} fill={col} />
        </>
      );
    });

  // ─── Shared path builders ─────────────────────────────────────────────────────

  const buildLinePath = (): string => {
    if (candles.length === 0) return '';
    return candles.map((c, i) => {
      const x = xOf(i); const y = priceToY(c.close);
      return i === 0 ? `M${x},${y}` : `L${x},${y}`;
    }).join(' ');
  };

  const buildAreaPath = (): string => {
    if (candles.length === 0) return '';
    const baseY = PADDING_TOP + priceChartHeight;
    return `M${xOf(0)},${baseY} ` +
      candles.map((c, i) => `L${xOf(i)},${priceToY(c.close)}`).join(' ') +
      ` L${xOf(candles.length - 1)},${baseY} Z`;
  };

  const isPositiveTrend = candles.length >= 2
    ? candles[candles.length - 1].close >= candles[0].close : true;
  const trendColor = isPositiveTrend ? colors.success : colors.error;

  const renderLine = () => {
    const p = buildLinePath();
    return p ? <Path d={p} stroke={trendColor} strokeWidth="2" fill="none" strokeLinejoin="round" /> : null;
  };

  const renderArea = () => {
    const ap = buildAreaPath(); const lp = buildLinePath();
    if (!ap) return null;
    return (
      <>
        <Defs>
          <LinearGradient id="aG" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%"   stopColor={trendColor} stopOpacity="0.38" />
            <Stop offset="100%" stopColor={trendColor} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        <Path d={ap} fill="url(#aG)" stroke="none" />
        <Path d={lp} stroke={trendColor} strokeWidth="2" fill="none" strokeLinejoin="round" />
      </>
    );
  };

  const renderMountain = () => {
    const ap = buildAreaPath(); const lp = buildLinePath();
    if (!ap) return null;
    return (
      <>
        <Defs>
          <LinearGradient id="mG" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%"   stopColor={trendColor} stopOpacity="0.58" />
            <Stop offset="100%" stopColor={trendColor} stopOpacity="0.05" />
          </LinearGradient>
        </Defs>
        <Path d={ap} fill="url(#mG)" stroke="none" />
        <Path d={lp} stroke={trendColor} strokeWidth="2.5" fill="none" strokeLinejoin="round" />
      </>
    );
  };

  // ─── Bars mode ────────────────────────────────────────────────────────────────

  const renderBarsMode = () => {
    const barsH = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    return candles.map((c, i) => {
      const x = xOf(i);
      if (x < -rawCandleWidth * 2 || x > chartAreaWidth + rawCandleWidth * 2) return null;
      const col  = c.close >= c.open ? colors.success : colors.error;
      const barH = (c.volume / maxVol) * (barsH * 0.85);
      return (
        <Rect key={`bar${i}`} x={x - bodyWidth / 2} y={PADDING_TOP + barsH - barH}
          width={bodyWidth} height={Math.max(2, barH)} fill={col} opacity={0.85} />
      );
    });
  };

  // ─── Bonding mode ─────────────────────────────────────────────────────────────

  const renderBonding = () => {
    if (candles.length < 2) return null;
    const p = buildLinePath(); const ap = buildAreaPath();
    return (
      <>
        <Defs>
          <LinearGradient id="bG" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%"   stopColor="#f59e0b" stopOpacity="0.6" />
            <Stop offset="100%" stopColor={colors.success} stopOpacity="0.6" />
          </LinearGradient>
          <LinearGradient id="bF" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%"   stopColor="#f59e0b" stopOpacity="0.22" />
            <Stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        <Path d={ap} fill="url(#bF)" stroke="none" />
        <Path d={p}  stroke="url(#bG)" strokeWidth="2" fill="none" strokeLinejoin="round" />
        {(() => {
          const last = candles[candles.length - 1];
          const lx   = xOf(candles.length - 1);
          const ly   = priceToY(last.close);
          return (
            <>
              <Line x1={lx} y1={PADDING_TOP} x2={lx} y2={PADDING_TOP + priceChartHeight}
                stroke="rgba(245,158,11,0.3)" strokeWidth="1" strokeDasharray="3,3" />
              <Circle cx={lx} cy={ly} r={4} fill="#f59e0b" />
            </>
          );
        })()}
      </>
    );
  };

  // ─── Volume bars ──────────────────────────────────────────────────────────────

  const renderVolumeBars = () =>
    candles.map((c, i) => {
      const x = xOf(i);
      if (x < -rawCandleWidth * 2 || x > chartAreaWidth + rawCandleWidth * 2) return null;
      const col = c.close >= c.open ? 'rgba(20,241,149,0.55)' : 'rgba(255,77,79,0.55)';
      const h   = Math.max(2, volToHeight(c.volume));
      return (
        <Rect key={`v${i}`} x={x - bodyWidth / 2} y={volBaseY - h}
          width={bodyWidth} height={h} fill={col} />
      );
    });

  // ─── Time axis ───────────────────────────────────────────────────────────────

  const renderTimeAxis = () => {
    if (candles.length === 0) return null;
    const labelStep = Math.max(1, Math.round(60 / rawCandleWidth));
    const baseY = PADDING_TOP + priceChartHeight + VOLUME_GAP + VOLUME_HEIGHT;
    const sepY  = baseY + 4;
    const textY = baseY + TIME_AXIS_HEIGHT - 3;
    const elems: React.ReactElement[] = [];

    // Separator line between volume and time axis
    elems.push(
      <Line key="ta-sep"
        x1={0} y1={sepY} x2={chartAreaWidth} y2={sepY}
        stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
    );

    for (let i = 0; i < candles.length; i += labelStep) {
      const x = xOf(i);
      if (x < -30 || x > chartAreaWidth + 30) continue;
      elems.push(
        <SvgText key={`ta${i}`}
          x={x} y={textY} fontSize="9"
          fill="rgba(255,255,255,0.45)"
          textAnchor="middle" fontWeight="600">
          {formatTimeAxis(candles[i].timestamp, timeFrame)}
        </SvgText>
      );
      // Small tick mark
      elems.push(
        <Line key={`tk${i}`}
          x1={x} y1={sepY} x2={x} y2={sepY + 3}
          stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      );
    }
    return elems;
  };

  // ─── Current price line ───────────────────────────────────────────────────────

  const renderCurrentPriceLine = () => {
    if (currentPrice === undefined) return null;
    const y = priceToY(currentPrice);
    if (y < PADDING_TOP || y > PADDING_TOP + priceChartHeight) return null;
    return (
      <Line x1={0} y1={y} x2={chartAreaWidth} y2={y}
        stroke={colors.primary} strokeWidth="1" strokeDasharray="5,4" opacity={0.75} />
    );
  };

  // ─── Main chart SVG ───────────────────────────────────────────────────────────

  const isBarsMode = chartMode === 'bars';

  const renderChart = () => (
    <Svg width={chartAreaWidth} height={CHART_HEIGHT}>
      {!isBarsMode && renderGrid()}
      {!isBarsMode && renderCurrentPriceLine()}
      {chartMode === 'candles'  && renderCandles()}
      {chartMode === 'line'     && renderLine()}
      {chartMode === 'area'     && renderArea()}
      {chartMode === 'mountain' && renderMountain()}
      {chartMode === 'bars'     && renderBarsMode()}
      {chartMode === 'bonding'  && renderBonding()}
      {!isBarsMode && renderVolumeBars()}
      {renderTimeAxis()}
      {renderCrosshairLines()}
    </Svg>
  );

  // ─── Header stats ─────────────────────────────────────────────────────────────

  const latestCandle = candles[candles.length - 1];
  const firstCandle  = candles[0];
  const priceChange  = latestCandle && firstCandle
    ? ((latestCandle.close - firstCandle.open) / (firstCandle.open || 1)) * 100 : 0;
  const isPositive   = priceChange >= 0;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container} onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.priceSection}>
          {currentPrice !== undefined && (
            <Text style={styles.currentPrice}>${formatPrice(currentPrice)}</Text>
          )}
          {latestCandle && (
            <Text style={[styles.priceChange, isPositive ? styles.up : styles.down]}>
              {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
            </Text>
          )}
        </View>
        <View style={[styles.liveIndicator, !isLive && styles.liveIndicatorHistory]}>
          {isLive && <View style={styles.liveDot} />}
          <Text style={[styles.liveText, !isLive && styles.liveTextHistory]}>
            {isLive ? 'LIVE' : 'HISTORY'}
          </Text>
        </View>
      </View>

      {/* Timeframe */}
      <View style={styles.row}>
        {timeFrames.map((tf) => (
          <TouchableOpacity key={tf}
            style={[styles.tfBtn, timeFrame === tf && styles.tfBtnActive]}
            onPress={() => setTimeFrame(tf)}>
            <Text style={[styles.tfText, timeFrame === tf && styles.tfTextActive]}>{tf}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chart mode */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.modeRow} contentContainerStyle={styles.modeRowContent}>
        {CHART_MODES.map((m) => (
          <TouchableOpacity key={m.id}
            style={[styles.modeBtn, chartMode === m.id && styles.modeBtnActive]}
            onPress={() => setChartMode(m.id)}>
            <Text style={[styles.modeText, chartMode === m.id && styles.modeTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Chart */}
      <View style={styles.chartWrap}>
        {/* Animated background — pointer-events none, z-index 1 */}
        {renderAnimatedBackground()}

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loaderText}>Loading chart...</Text>
          </View>
        ) : candles.length === 0 ? (
          <View style={styles.loader}>
            <Text style={styles.loaderText}>No chart data available</Text>
          </View>
        ) : (
          <View style={styles.chartInner}>
            {/* Interactive area — PanResponder handles crosshair + pan */}
            <View style={styles.chartArea} {...panResponder.panHandlers}>
              {renderChart()}
              {renderCrosshairTooltip()}
            </View>
            {/* Price axis — separate from gesture area */}
            {chartMode !== 'bars' && renderPriceAxis(crosshair?.y)}
          </View>
        )}

        {/* Return to Live */}
        {!isLive && (
          <TouchableOpacity style={styles.liveBtn} onPress={returnToLive} activeOpacity={0.8}>
            <View style={styles.liveBtnDot} />
            <Text style={styles.liveBtnText}>Return to Live</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  priceSection: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  currentPrice: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  priceChange: { fontSize: fontSize.sm, fontWeight: '700' },
  up:   { color: colors.success },
  down: { color: colors.error   },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  liveIndicatorHistory: {
    backgroundColor: 'rgba(255,165,0,0.12)',
    borderColor: 'rgba(255,165,0,0.3)',
  },
  liveDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.success,
  },
  liveText: {
    fontSize: 11, fontWeight: '800',
    color: colors.success, letterSpacing: 0.5,
  },
  liveTextHistory: { color: '#f97316' },
  row: {
    flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs,
  },
  tfBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 5,
    borderRadius: borderRadius.sm, backgroundColor: colors.surfaceLight,
  },
  tfBtnActive: { backgroundColor: colors.primary },
  tfText:      { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  tfTextActive: { color: '#fff' },
  modeRow:        { marginBottom: spacing.sm },
  modeRowContent: { gap: spacing.xs, paddingRight: spacing.xs },
  modeBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: borderRadius.sm,
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  modeBtnActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}20`,
  },
  modeText:      { fontSize: 10, fontWeight: '600', color: colors.textMuted },
  modeTextActive: { color: colors.primary },
  chartWrap: {
    height: CHART_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
    borderRadius: borderRadius.md,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    zIndex: 2,
  },
  loaderText: {
    fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600',
  },
  chartInner: {
    flexDirection: 'row',
    height: CHART_HEIGHT,
    position: 'relative',
    zIndex: 2,
  },
  chartArea: {
    flex: 1,
    height: CHART_HEIGHT,
  },
  priceAxis: {
    width: PRICE_AXIS_WIDTH,
    zIndex: 3,
  },
  tooltip: {
    position: 'absolute',
    top: 10,
    backgroundColor: 'rgba(8,8,18,0.92)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    minWidth: 130,
    zIndex: 10,
  },
  tooltipLeft:  { left: 8  },
  tooltipRight: { right: 8 },
  tooltipTime: {
    fontSize: 11, fontWeight: '700',
    color: 'rgba(255,255,255,0.65)', marginBottom: 6,
  },
  tooltipGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 4,
  },
  tooltipCell: {
    flexDirection: 'row', alignItems: 'center', gap: 3, width: '47%',
  },
  tooltipLabel: {
    fontSize: 11, fontWeight: '700',
    color: 'rgba(255,255,255,0.4)', width: 12,
  },
  tooltipVal: {
    fontSize: 11, fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
  },
  tooltipVol: {
    fontSize: 10, fontWeight: '600',
    color: 'rgba(255,255,255,0.5)', marginTop: 5,
  },
  liveBtn: {
    position: 'absolute',
    bottom: 12,
    right: PRICE_AXIS_WIDTH + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16,185,129,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.55)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    zIndex: 20,
  },
  liveBtnDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.success,
  },
  liveBtnText: {
    fontSize: 12, fontWeight: '800', color: colors.success,
  },
});
