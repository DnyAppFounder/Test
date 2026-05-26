import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { X, ArrowLeft, CandlestickChart, ChartLine, ChartArea, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { chartDataService, CandleData, TimeFrame } from '@/services/chartDataService';
import { useChartAnimationEngine } from '@/hooks/useChartAnimationEngine';

type ChartTimeFrame = TimeFrame | 'ALL';
type ChartMode = 'candlestick' | 'line' | 'area';
type ValueMode = 'mcap' | 'price';

interface TokenInfo {
  name: string;
  symbol: string;
  image?: string;
  price: number;
  priceChange24h: number;
  marketCap?: number;
  totalSupply?: number;
  pairAddress?: string;
  address?: string;
}

interface DawenProChartProps {
  tokenInfo?: TokenInfo;
  symbol?: string;
  currentPrice?: number;
  pairAddress?: string | null;
  tokenMint?: string;
  valueMode?: ValueMode;
  initialTimeframe?: ChartTimeFrame;
  onClose: () => void;
  onTradePress?: () => void;
}

const TIMEFRAMES: { key: ChartTimeFrame; label: string }[] = [
  { key: '1m', label: '1m' }, { key: '5m', label: '5m' }, { key: '15m', label: '15m' },
  { key: '1H', label: '1H' }, { key: '4H', label: '4H' }, { key: '1D', label: '1D' },
  { key: '1W', label: '1W' }, { key: '1M', label: '1M' }, { key: 'ALL', label: 'ALL' },
];

const BUCKET_MS: Record<string, number> = {
  '1m': 60_000, '5m': 300_000, '15m': 900_000, '1H': 3_600_000,
  '4H': 14_400_000, '1D': 86_400_000, '1W': 604_800_000, '1M': 2_592_000_000, 'ALL': 86_400_000,
};

const VISIBLE_BUCKETS: Record<string, number> = {
  '1m': 72, '5m': 72, '15m': 64, '1H': 72, '4H': 72,
  '1D': 60, '1W': 52, '1M': 36, 'ALL': 90,
};

function sanitizeCandles(raw: CandleData[]): CandleData[] {
  const out: CandleData[] = [];
  for (const item of raw ?? []) {
    const ts = Number(item.timestamp);
    const close = Number(item.close);
    if (!Number.isFinite(ts) || ts <= 0 || !Number.isFinite(close) || close <= 0) continue;
    const open = Number.isFinite(item.open) && item.open > 0 ? item.open : close;
    const high = Number.isFinite(item.high) && item.high > 0 ? item.high : close;
    const low = Number.isFinite(item.low) && item.low > 0 ? item.low : close;
    const safeHigh = Math.max(high, open, close);
    const safeLow = Math.min(low, open, close);
    const volume = Number.isFinite(item.volume) && item.volume > 0 ? item.volume : 0;
    out.push({ timestamp: ts, open, high: safeHigh, low: safeLow, close, volume });
  }
  const map = new Map<number, CandleData>();
  for (const c of out) {
    const prev = map.get(c.timestamp);
    if (!prev || c.volume > prev.volume) map.set(c.timestamp, c);
  }
  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function normalizeToQuote(candles: CandleData[], quotePrice: number): CandleData[] {
  if (!candles.length || !quotePrice || quotePrice <= 0) return candles;
  const lastClose = candles[candles.length - 1]?.close ?? 0;
  if (!lastClose || lastClose <= 0) return candles;
  const ratio = lastClose / quotePrice;
  if (ratio <= 1000 && ratio >= 0.001) return candles;
  const scale = quotePrice / lastClose;
  return candles.map(c => ({
    ...c,
    open: c.open * scale,
    high: c.high * scale,
    low: c.low * scale,
    close: c.close * scale,
  }));
}

function inferBucketMs(candles: CandleData[], fallback: number): number {
  if (candles.length < 2) return fallback;
  const gaps = candles.slice(1).map((c, i) => c.timestamp - candles[i].timestamp).filter(g => g > 0).sort((a, b) => a - b);
  return gaps.length ? gaps[Math.floor(gaps.length / 2)] : fallback;
}

function fmtPrice(v: number): string {
  if (!v || !Number.isFinite(v)) return '0';
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(5);
  if (v >= 0.000001) return v.toFixed(8);
  return v.toExponential(3);
}
function fmtMcap(v: number): string {
  if (!v || !Number.isFinite(v)) return '$0';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}
function fmtValue(v: number, mode: ValueMode): string { return mode === 'mcap' ? fmtMcap(v) : `$${fmtPrice(v)}`; }
function fmtTime(ts: number, bucketMs: number): string {
  const d = new Date(ts);
  if (bucketMs >= 86_400_000) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}
function copyShort(addr?: string) { return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : ''; }

export function DawenProChart({ tokenInfo, symbol, currentPrice, tokenMint, valueMode = 'price', initialTimeframe = '15m', onClose, onTradePress }: DawenProChartProps) {
  const { width, height } = useWindowDimensions();
  const [timeframe, setTimeframe] = useState<ChartTimeFrame>(initialTimeframe ?? '15m');
  const [mode, setMode] = useState<ChartMode>('candlestick');
  const [loading, setLoading] = useState(false);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; price: number; ts: number } | null>(null);

  const sym = tokenInfo?.symbol || symbol || 'TOKEN';
  const name = tokenInfo?.name || sym;
  const quotePrice = currentPrice && currentPrice > 0 ? currentPrice : tokenInfo?.price && tokenInfo.price > 0 ? tokenInfo.price : 0;
  const supply = tokenInfo?.totalSupply && tokenInfo.totalSupply > 0
    ? tokenInfo.totalSupply
    : tokenInfo?.marketCap && quotePrice > 0
      ? tokenInfo.marketCap / quotePrice
      : 1;

  const chartW = width;
  const chartH = Math.max(360, height - 250);
  const volH = 76;
  const timeH = 28;
  const pad = { top: 24, right: 76, bottom: 8, left: 14 };
  const plotW = chartW - pad.left - pad.right;
  const plotH = chartH - pad.top - pad.bottom;

  const rawBucketMs = BUCKET_MS[timeframe] ?? BUCKET_MS['15m'];
  const normalizedCandles = useMemo(() => normalizeToQuote(sanitizeCandles(candles), quotePrice), [candles, quotePrice]);
  const effectiveBucketMs = timeframe === 'ALL' ? inferBucketMs(normalizedCandles, rawBucketMs) : rawBucketMs;
  const visibleMs = (VISIBLE_BUCKETS[timeframe] ?? 72) * effectiveBucketMs;
  const maxPanBackMs = normalizedCandles.length > 0 ? Math.max(0, Date.now() - normalizedCandles[0].timestamp) : 0;
  const engine = useChartAnimationEngine(maxPanBackMs);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!tokenMint) return;
      setLoading(true);
      setError(null);
      setCrosshair(null);
      try {
        const tf = timeframe === 'ALL' ? 'ALL' : timeframe;
        const raw = await chartDataService.getOHLCVData(tokenMint, tf as any, undefined);
        if (cancelled) return;
        const cleaned = sanitizeCandles(raw ?? []);
        setCandles(cleaned);
        if (!cleaned.length) setError('No chart data yet');
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Chart data unavailable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    engine.actions.returnToLive();
    return () => { cancelled = true; };
  }, [tokenMint, timeframe]);

  const displayCandles = useMemo(() => {
    const scale = valueMode === 'mcap' ? supply : 1;
    return normalizedCandles.map(c => ({ ...c, open: c.open * scale, high: c.high * scale, low: c.low * scale, close: c.close * scale }));
  }, [normalizedCandles, valueMode, supply]);

  let xLeft = engine.state.visualRightTime - engine.state.panOffsetMs - visibleMs;
  if (displayCandles.length > 0) {
    const first = displayCandles[0].timestamp;
    const minLeft = first - effectiveBucketMs * 2;
    xLeft = Math.max(minLeft, xLeft);
  }
  const xRight = xLeft + visibleMs;
  const visible = displayCandles.filter(c => c.timestamp >= xLeft - effectiveBucketMs && c.timestamp <= xRight + effectiveBucketMs);
  const scaleBase = visible.length > 0 ? visible : displayCandles.slice(-Math.min(displayCandles.length, 80));
  const highs = scaleBase.map(c => c.high).filter(Number.isFinite);
  const lows = scaleBase.map(c => c.low).filter(Number.isFinite);
  const hi = highs.length ? Math.max(...highs) : (valueMode === 'mcap' ? (tokenInfo?.marketCap || quotePrice * supply) : quotePrice || 1);
  const lo = lows.length ? Math.min(...lows) : hi * 0.98;
  const range = Math.max(hi - lo, hi * 0.01 || 1e-12);
  const minP = Math.max(0, lo - range * 0.15);
  const maxP = hi + range * 0.15;
  const pRange = Math.max(maxP - minP, 1e-12);
  const maxVol = Math.max(1, ...visible.map(c => c.volume || 0));

  const tsToX = (ts: number) => pad.left + ((ts - xLeft) / visibleMs) * plotW;
  const yOf = (price: number) => pad.top + plotH - ((price - minP) / pRange) * plotH;
  const xOf = (c: CandleData) => tsToX(c.timestamp + effectiveBucketMs / 2);
  const volBarH = (v: number) => v > 0 ? Math.max(1, Math.min(volH - 14, (v / maxVol) * (volH - 16))) : 0;
  const slotW = plotW / (VISIBLE_BUCKETS[timeframe] ?? 72);
  const candleW = Math.max(5, Math.min(16, slotW * 0.72));

  const path = visible.map((c, i) => `${i === 0 ? 'M' : 'L'}${xOf(c).toFixed(1)},${yOf(c.close).toFixed(1)}`).join(' ');
  const areaPath = path ? `${path} L${xOf(visible[visible.length - 1]).toFixed(1)},${(pad.top + plotH).toFixed(1)} L${xOf(visible[0]).toFixed(1)},${(pad.top + plotH).toFixed(1)} Z` : '';
  const last = visible.length ? visible[visible.length - 1] : displayCandles[displayCandles.length - 1];
  const currentValue = last?.close || (valueMode === 'mcap' ? (tokenInfo?.marketCap || quotePrice * supply) : quotePrice);
  const priceY = yOf(currentValue || minP);

  const panStartRef = useRef(0);
  const dragStartRef = useRef(0);
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4,
    onPanResponderGrant: (e) => {
      panStartRef.current = engine.state.panOffsetMs;
      dragStartRef.current = e.nativeEvent.pageX;
      engine.actions.onPanStart();
    },
    onPanResponderMove: (_e, g) => {
      const delta = (g.dx / Math.max(plotW, 1)) * visibleMs;
      engine.actions.setPanOffsetMs(Math.max(0, panStartRef.current + delta));
    },
    onPanResponderRelease: (e, g) => {
      engine.actions.onPanEnd();
      if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) {
        const localX = Math.max(pad.left, Math.min(plotW + pad.left, e.nativeEvent.locationX));
        const rawTs = xLeft + ((localX - pad.left) / plotW) * visibleMs;
        let closest = visible[0];
        let dist = Infinity;
        for (const c of visible) {
          const d = Math.abs((c.timestamp + effectiveBucketMs / 2) - rawTs);
          if (d < dist) { dist = d; closest = c; }
        }
        if (closest) setCrosshair({ x: xOf(closest), y: yOf(closest.close), price: closest.close, ts: closest.timestamp });
      }
    },
    onPanResponderTerminate: () => engine.actions.onPanEnd(),
  })).current;

  async function copyAddr() {
    const addr = tokenInfo?.address || tokenMint;
    if (addr) await Clipboard.setStringAsync(addr);
  }

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onClose} style={styles.iconBtn}><ArrowLeft size={22} color="#fff" /></TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.symbol}>{sym}/USD</Text>
          <Text numberOfLines={1} style={styles.name}>{name} · Solana</Text>
        </View>
        <TouchableOpacity onPress={onTradePress ?? onClose} style={styles.buyBtn}><Text style={styles.buyText}>Buy / Sell</Text></TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={styles.iconBtn}><X size={22} color="rgba(255,255,255,0.75)" /></TouchableOpacity>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.current}>{fmtValue(currentValue, valueMode)}</Text>
        <TouchableOpacity onPress={copyAddr}><Text style={styles.addr}>{copyShort(tokenInfo?.address || tokenMint)} <Copy size={11} color="rgba(255,255,255,0.45)" /></Text></TouchableOpacity>
      </View>

      <View style={styles.tfRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tfScroll}>
          {TIMEFRAMES.map(tf => <TouchableOpacity key={tf.key} onPress={() => setTimeframe(tf.key)} style={[styles.tfBtn, timeframe === tf.key && styles.tfActive]}><Text style={[styles.tfText, timeframe === tf.key && styles.tfTextActive]}>{tf.label}</Text></TouchableOpacity>)}
        </ScrollView>
        <View style={styles.modeBtns}>
          <TouchableOpacity onPress={() => setMode('candlestick')} style={[styles.modeBtn, mode === 'candlestick' && styles.modeActive]}><CandlestickChart size={17} color={mode === 'candlestick' ? '#A78BFA' : 'rgba(255,255,255,0.55)'} /></TouchableOpacity>
          <TouchableOpacity onPress={() => setMode('line')} style={[styles.modeBtn, mode === 'line' && styles.modeActive]}><ChartLine size={17} color={mode === 'line' ? '#A78BFA' : 'rgba(255,255,255,0.55)'} /></TouchableOpacity>
          <TouchableOpacity onPress={() => setMode('area')} style={[styles.modeBtn, mode === 'area' && styles.modeActive]}><ChartArea size={17} color={mode === 'area' ? '#A78BFA' : 'rgba(255,255,255,0.55)'} /></TouchableOpacity>
        </View>
      </View>

      <View style={styles.chartShell} {...responder.panHandlers}>
        {loading && <View style={styles.loading}><ActivityIndicator color="#A78BFA" /><Text style={styles.loadingText}>Loading chart…</Text></View>}
        {!loading && error && !visible.length && <View style={styles.loading}><Text style={styles.errorText}>{error}</Text></View>}
        <Svg width={chartW} height={chartH + volH + timeH}>
          <Defs>
            <LinearGradient id="proArea" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#8B5CF6" stopOpacity="0.38"/><Stop offset="1" stopColor="#8B5CF6" stopOpacity="0.02"/></LinearGradient>
          </Defs>
          {[0,1,2,3,4].map(i => {
            const y = pad.top + (plotH / 4) * i;
            const val = maxP - (pRange / 4) * i;
            return <G key={`g${i}`}><Line x1={pad.left} y1={y} x2={chartW - pad.right} y2={y} stroke="rgba(167,139,250,0.12)" strokeWidth={1}/><SvgText x={chartW - pad.right + 8} y={y + 4} fontSize={12} fill="rgba(255,255,255,0.65)">{fmtValue(val, valueMode)}</SvgText></G>;
          })}
          {Array.from({ length: 6 }).map((_, i) => {
            const x = pad.left + (plotW / 5) * i;
            const ts = xLeft + (visibleMs / 5) * i;
            return <G key={`tx${i}`}><Line x1={x} y1={pad.top} x2={x} y2={pad.top + plotH + volH} stroke="rgba(167,139,250,0.08)" strokeWidth={1}/><SvgText x={x} y={pad.top + plotH + volH + 20} fontSize={12} fill="rgba(255,255,255,0.55)" textAnchor="middle">{fmtTime(ts, effectiveBucketMs)}</SvgText></G>;
          })}
          <Line x1={pad.left} y1={priceY} x2={chartW - pad.right} y2={priceY} stroke="#8B5CF6" strokeWidth={1} strokeDasharray="5 5" opacity={0.9}/>
          <Rect x={chartW - pad.right + 4} y={priceY - 12} width={pad.right - 8} height={24} rx={5} fill="#8B5CF6"/>
          <SvgText x={chartW - pad.right + pad.right / 2} y={priceY + 4} fontSize={11} fontWeight="800" fill="#fff" textAnchor="middle">{fmtValue(currentValue, valueMode)}</SvgText>
          {mode === 'area' && areaPath ? <Path d={areaPath} fill="url(#proArea)"/> : null}
          {(mode === 'line' || mode === 'area') && path ? <Path d={path} stroke="#8B5CF6" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round"/> : null}
          {mode === 'candlestick' && visible.map(c => {
            const cx = xOf(c); const up = c.close >= c.open; const col = up ? '#10B981' : '#EF4444';
            const top = yOf(Math.max(c.open, c.close)); const bot = yOf(Math.min(c.open, c.close)); const bodyH = Math.max(2, bot - top);
            return <G key={`c${c.timestamp}`}><Line x1={cx} y1={yOf(c.high)} x2={cx} y2={yOf(c.low)} stroke={col} strokeWidth={1}/><Rect x={cx - candleW / 2} y={bodyH === 2 ? top - 1 : top} width={candleW} height={bodyH} fill={up ? 'none' : col} stroke={col} strokeWidth={1}/></G>;
          })}
          {visible.map(c => {
            const h = volBarH(c.volume); if (!h) return null; const cx = xOf(c); const up = c.close >= c.open; const col = up ? 'rgba(16,185,129,0.5)' : 'rgba(236,72,153,0.5)';
            return <Rect key={`v${c.timestamp}`} x={cx - Math.max(1.5, candleW * 0.35)} y={pad.top + plotH + volH - h - 6} width={Math.max(2, candleW * 0.7)} height={h} fill={col}/>;
          })}
          {last ? <Circle cx={xOf(last)} cy={yOf(last.close)} r={4} fill="#A78BFA" stroke="#fff" strokeWidth={1.5}/> : null}
          {crosshair && <G><Line x1={crosshair.x} y1={pad.top} x2={crosshair.x} y2={pad.top + plotH + volH} stroke="rgba(255,255,255,0.45)" strokeDasharray="4 4"/><Line x1={pad.left} y1={crosshair.y} x2={chartW - pad.right} y2={crosshair.y} stroke="rgba(255,255,255,0.32)" strokeDasharray="4 4"/><Circle cx={crosshair.x} cy={crosshair.y} r={5} fill="#8B5CF6" stroke="#fff" strokeWidth={1}/></G>}
        </Svg>
      </View>
      {!engine.state.isLiveMode && <TouchableOpacity onPress={engine.actions.returnToLive} style={styles.returnLive}><Text style={styles.returnLiveText}>▶ Return to Live</Text></TouchableOpacity>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#06060B' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 48, paddingHorizontal: 14, paddingBottom: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(167,139,250,0.14)' },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' },
  titleWrap: { flex: 1 }, symbol: { color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 1 }, name: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 },
  buyBtn: { backgroundColor: '#16C784', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 }, buyText: { color: '#fff', fontWeight: '900' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }, current: { color: '#fff', fontSize: 20, fontWeight: '900' }, addr: { color: 'rgba(255,255,255,0.45)', fontSize: 12 },
  tfRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 10, gap: 8 }, tfScroll: { gap: 6 }, tfBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.04)' }, tfActive: { backgroundColor: 'rgba(139,92,246,0.25)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.55)' }, tfText: { color: 'rgba(255,255,255,0.55)', fontWeight: '800' }, tfTextActive: { color: '#A78BFA' },
  modeBtns: { flexDirection: 'row', gap: 5 }, modeBtn: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }, modeActive: { backgroundColor: 'rgba(139,92,246,0.18)', borderColor: 'rgba(167,139,250,0.45)' },
  chartShell: { flex: 1, backgroundColor: '#07080F', borderTopWidth: 1, borderTopColor: 'rgba(167,139,250,0.12)' }, loading: { position: 'absolute', left: 0, right: 0, top: 90, zIndex: 10, alignItems: 'center', gap: 8 }, loadingText: { color: 'rgba(255,255,255,0.55)' }, errorText: { color: '#EF4444', fontWeight: '800' },
  returnLive: { position: 'absolute', top: 122, alignSelf: 'center', backgroundColor: 'rgba(139,92,246,0.18)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.45)', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 }, returnLiveText: { color: '#C4B5FD', fontWeight: '900' },
});
