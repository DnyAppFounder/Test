import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BIRDEYE_API_KEY  = Deno.env.get("BIRDEYE_API_KEY")  || "";
const BITQUERY_TOKEN   = Deno.env.get("BITQUERY_TOKEN")   || "";
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")     || "";
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CandleData {
  timestamp: number;
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume:    number;
}

type MarketType =
  | "pumpfun_bonding_curve"
  | "pumpswap"
  | "raydium"
  | "meteora"
  | "orca"
  | "unknown";

// ─── Candle repair ────────────────────────────────────────────────────────────
// Never invent price movement. If OHLC fields are missing/zero, fall back to close.
// Only reject candles whose close is invalid.

function repairCandle(raw: any): CandleData | null {
  if (!raw) return null;
  const ts = Number(raw.timestamp ?? raw.time ?? raw.unixTime ?? 0);
  if (!isFinite(ts) || ts <= 0) return null;
  // Normalise: if ts looks like Unix seconds (10 digits), convert to ms.
  const tsMs = ts < 10_000_000_000 ? ts * 1000 : ts;

  const close = Number(raw.close ?? raw.c ?? 0);
  if (!isFinite(close) || close <= 0) return null;

  const rawOpen = Number(raw.open  ?? raw.o ?? 0);
  const rawHigh = Number(raw.high  ?? raw.h ?? 0);
  const rawLow  = Number(raw.low   ?? raw.l ?? 0);

  const open = isFinite(rawOpen) && rawOpen > 0 ? rawOpen : close;
  const high = isFinite(rawHigh) && rawHigh > 0 ? rawHigh : close;
  const low  = isFinite(rawLow)  && rawLow  > 0 ? rawLow  : close;

  const safeHigh = Math.max(high, open, close);
  const safeLow  = Math.min(low,  open, close);
  if (safeHigh < safeLow) return null;

  const rawVol = Number(raw.volume ?? raw.v ?? 0);
  const volume = isFinite(rawVol) && rawVol > 0 ? rawVol : 0;

  return { timestamp: tsMs, open, high: safeHigh, low: safeLow, close, volume };
}

function dedupeAndSort(raw: any[]): CandleData[] {
  const seen = new Map<number, CandleData>();
  for (const item of raw) {
    const c = repairCandle(item);
    if (!c) continue;
    const ex = seen.get(c.timestamp);
    if (!ex || c.volume > ex.volume) seen.set(c.timestamp, c);
  }
  return Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// ─── Quality scoring ──────────────────────────────────────────────────────────

function scoreCandles(cs: CandleData[], bucketMs: number): number {
  if (cs.length === 0) return -Infinity;
  if (cs.length === 1) return 1;

  const uniqueTs = new Set(cs.map(c => c.timestamp)).size;
  if (uniqueTs <= 1) return -Infinity;

  const span = cs[cs.length - 1].timestamp - cs[0].timestamp;
  if (span <= 0) return -Infinity;

  const flatCount = cs.filter(c =>
    Math.abs(c.high - c.low) < Math.max(c.close, 1e-12) * 1e-6
  ).length;
  const flatRatio = flatCount / cs.length;

  const expectedBuckets = Math.max(1, Math.round(span / bucketMs));
  const gapRatio = Math.max(0, 1 - cs.length / expectedBuckets);

  const withVol = cs.filter(c => c.volume > 0).length;
  const volCoverage = withVol / cs.length;

  const densityScore = Math.min(1, cs.length / 200);
  const spanScore    = Math.min(1, Math.log10(1 + span / 86_400_000) / Math.log10(366));

  return (
    cs.length * 2 +
    spanScore * 80 +
    densityScore * 30 +
    volCoverage * 20 -
    flatRatio * 40 -
    gapRatio * 30
  );
}

// ─── Upward aggregation ───────────────────────────────────────────────────────
// Aggregates lower-resolution candles into target bucket size.
// Only uses real candles — never creates empty/filled buckets.

function aggregateUp(candles: CandleData[], targetBucketMs: number): CandleData[] {
  if (candles.length === 0) return [];
  const buckets = new Map<number, CandleData[]>();
  for (const c of candles) {
    const bucket = Math.floor(c.timestamp / targetBucketMs) * targetBucketMs;
    const arr = buckets.get(bucket);
    if (arr) arr.push(c);
    else buckets.set(bucket, [c]);
  }
  const result: CandleData[] = [];
  for (const [bucket, cs] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
    const sorted = cs.sort((a, b) => a.timestamp - b.timestamp);
    result.push({
      timestamp: bucket,
      open:   sorted[0].open,
      high:   Math.max(...sorted.map(c => c.high)),
      low:    Math.min(...sorted.map(c => c.low)),
      close:  sorted[sorted.length - 1].close,
      volume: sorted.reduce((s, c) => s + c.volume, 0),
    });
  }
  return result;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TF_BUCKET_MS: Record<string, number> = {
  "1m":  60_000,
  "5m":  300_000,
  "15m": 900_000,
  "1H":  3_600_000,
  "4H":  14_400_000,
  "1D":  86_400_000,
  "1W":  604_800_000,
  "1M":  2_592_000_000,
};

// How many buckets to request per timeframe
const TF_LIMIT: Record<string, number> = {
  "1m": 120, "5m": 288, "15m": 192,
  "1H": 168, "4H": 180,
  "1D": 365, "1W": 104, "1M": 36,
};

const BIRDEYE_TF: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m",
  "1H": "1H", "4H": "4H",
  "1D": "1D", "1W": "1W", "1M": "1M",
};

const BITQUERY_INTERVAL_MIN: Record<string, number> = {
  "1m": 1, "5m": 5, "15m": 15,
  "1H": 60, "4H": 240,
  "1D": 1440, "1W": 10080, "1M": 43200,
};

const GECKO_TF_MAP: Record<string, { aggregate: number; tf: string }> = {
  "1m":  { aggregate: 1,  tf: "minute" },
  "5m":  { aggregate: 5,  tf: "minute" },
  "15m": { aggregate: 15, tf: "minute" },
  "1H":  { aggregate: 1,  tf: "hour"   },
  "4H":  { aggregate: 4,  tf: "hour"   },
  "1D":  { aggregate: 1,  tf: "day"    },
  "1W":  { aggregate: 7,  tf: "day"    },
  "1M":  { aggregate: 30, tf: "day"    },
};

const PUMPFUN_PROGRAM  = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymEHe5";
const PUMPSWAP_PROGRAM = "PSwapMdSai8tjrEXcxFeQth87xC4rRsa4VA5mhGhXkP";
const WSOL_MINT        = "So11111111111111111111111111111111111111112";

// ─── Market detection ─────────────────────────────────────────────────────────

interface MarketInfo {
  marketType:   MarketType;
  pairAddress:  string | null;
  allPairs:     { pairAddress: string; liquidity: number; volume: number }[];
  priceUsd:     number | null;
}

async function detectMarket(mint: string): Promise<MarketInfo> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { marketType: "unknown", pairAddress: null, allPairs: [], priceUsd: null };
    const data = await res.json();
    const pairs: any[] = (data.pairs || []).filter((p: any) => p.chainId === "solana");
    if (pairs.length === 0) return { marketType: "unknown", pairAddress: null, allPairs: [], priceUsd: null };

    // Sort by liquidity descending — but we keep all addresses for fallback.
    pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const best    = pairs[0];
    const dexId   = (best.dexId || "").toLowerCase();
    const priceUsd = parseFloat(best.priceUsd || "0") || null;

    let marketType: MarketType = "unknown";
    if      (dexId === "pumpfun")                              marketType = "pumpfun_bonding_curve";
    else if (dexId === "pumpswap")                             marketType = "pumpswap";
    else if (dexId === "raydium" || dexId === "raydium_clmm") marketType = "raydium";
    else if (dexId.includes("meteora"))                        marketType = "meteora";
    else if (dexId === "orca" || dexId === "orcawhirlpool")   marketType = "orca";

    const allPairs = pairs
      .filter((p: any) => p.pairAddress)
      .map((p: any) => ({
        pairAddress: p.pairAddress as string,
        liquidity:   p.liquidity?.usd ?? 0,
        volume:      p.volume?.h24    ?? 0,
      }));

    return { marketType, pairAddress: best.pairAddress ?? null, allPairs, priceUsd };
  } catch {
    return { marketType: "unknown", pairAddress: null, allPairs: [], priceUsd: null };
  }
}

// ─── Sources ──────────────────────────────────────────────────────────────────

async function fetchSupabaseCandles(mint: string, tf: string, limit: number): Promise<CandleData[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE) return [];
  try {
    const sb  = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const bMs = TF_BUCKET_MS[tf] ?? 3_600_000;
    const fromTs = Date.now() - bMs * limit * 1.5;
    const { data, error } = await sb
      .from("token_candles")
      .select("open_time, open, high, low, close, volume, timeframe")
      .eq("token_mint", mint)
      .eq("timeframe", tf)
      .gte("open_time", Math.floor(fromTs / 1000))
      .order("open_time", { ascending: true })
      .limit(limit);
    if (error || !data) return [];
    return data.map((row: any) => ({
      timestamp: Number(row.open_time) * 1000,
      open:      Number(row.open),
      high:      Number(row.high),
      low:       Number(row.low),
      close:     Number(row.close),
      volume:    Number(row.volume ?? 0),
    }));
  } catch {
    return [];
  }
}

async function fetchBirdeyeOHLCV(mint: string, tf: string, limit: number): Promise<CandleData[]> {
  if (!BIRDEYE_API_KEY) return [];
  const tfParam = BIRDEYE_TF[tf] || "1H";
  const bMs     = TF_BUCKET_MS[tf] ?? 3_600_000;
  const now     = Math.floor(Date.now() / 1000);
  const from    = Math.floor((Date.now() - bMs * limit * 1.5) / 1000);
  try {
    const res = await fetch(
      `https://public-api.birdeye.so/defi/ohlcv?address=${mint}&type=${tfParam}&time_from=${from}&time_to=${now}`,
      {
        headers: { "X-API-KEY": BIRDEYE_API_KEY, "x-chain": "solana", "accept": "application/json" },
        signal:  AbortSignal.timeout(12000),
      },
    );
    if (!res.ok) return [];
    const data  = await res.json();
    const items = data?.data?.items ?? [];
    return items.map((item: any) => ({
      timestamp: Number(item.unixTime) * 1000,
      open:      Number(item.o  ?? 0),
      high:      Number(item.h  ?? 0),
      low:       Number(item.l  ?? 0),
      close:     Number(item.c  ?? 0),
      volume:    Number(item.v  ?? 0),
    }));
  } catch {
    return [];
  }
}

async function fetchBitqueryOHLCV(
  mint: string,
  programAddress: string,
  tf: string,
  limit: number,
): Promise<CandleData[]> {
  if (!BITQUERY_TOKEN) return [];
  const intervalMin = BITQUERY_INTERVAL_MIN[tf] || 60;
  const now         = new Date();
  const fromDate    = new Date(Date.now() - intervalMin * limit * 60 * 1000);

  const query = `
    query OHLCVByMint($mint: String!, $program: String!, $since: DateTime!, $till: DateTime!, $interval: Int!) {
      Solana {
        DEXTradeByTokens(
          orderBy: { ascendingByField: "Block_Time" }
          where: {
            Trade: {
              Currency: { MintAddress: { is: $mint } }
              Dex: { ProgramAddress: { is: $program } }
              Side: { Currency: { MintAddress: { is: "${WSOL_MINT}" } } }
            }
            Block: { Time: { since: $since, till: $till } }
          }
        ) {
          Block { Time(interval: { in: minutes, count: $interval }) }
          volume: sum(of: Trade_Side_AmountInUSD)
          Trade {
            open:  PriceInUSD(minimum: Block_Time)
            high:  PriceInUSD(maximum: Trade_PriceInUSD)
            low:   PriceInUSD(minimum: Trade_PriceInUSD)
            close: PriceInUSD(maximum: Block_Time)
          }
        }
      }
    }
  `;
  try {
    const res = await fetch("https://streaming.bitquery.io/eap", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${BITQUERY_TOKEN}` },
      body:    JSON.stringify({ query, variables: { mint, program: programAddress, since: fromDate.toISOString(), till: now.toISOString(), interval: intervalMin } }),
      signal:  AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data   = await res.json();
    const trades = data?.data?.Solana?.DEXTradeByTokens ?? [];
    return trades.map((t: any) => ({
      timestamp: new Date(t.Block?.Time ?? 0).getTime(),
      open:      Number(t.Trade?.open  ?? 0),
      high:      Number(t.Trade?.high  ?? 0),
      low:       Number(t.Trade?.low   ?? 0),
      close:     Number(t.Trade?.close ?? 0),
      volume:    parseFloat(String(t.volume ?? "0")),
    }));
  } catch {
    return [];
  }
}

async function fetchGeckoTerminal(pairAddress: string, tf: string, limit: number): Promise<CandleData[]> {
  const { aggregate, tf: gtf } = GECKO_TF_MAP[tf] ?? GECKO_TF_MAP["1H"];
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairAddress}/ohlcv/${gtf}?aggregate=${aggregate}&limit=${limit}&currency=usd&token=base`,
      { headers: { Accept: "application/json;version=20230302" }, signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const list = data?.data?.attributes?.ohlcv_list ?? [];
    return list.map((item: number[]) => ({
      timestamp: item[0] * 1000,
      open:   item[1],
      high:   item[2],
      low:    item[3],
      close:  item[4],
      volume: item[5] ?? 0,
    }));
  } catch {
    return [];
  }
}

// ─── Per-timeframe fetch with quality fallback ────────────────────────────────
// Tries every real source in priority order. Never stops at the first result if
// that result is weak (< MIN_USABLE candles) and another source can do better.

const MIN_USABLE = 5;

async function fetchBestForTimeframe(
  mint: string,
  tf: string,
  market: MarketInfo,
): Promise<{ candles: CandleData[]; source: string; repairedCount: number }> {
  const limit = TF_LIMIT[tf] ?? 168;
  const bucketMs = TF_BUCKET_MS[tf] ?? 3_600_000;

  type Candidate = { candles: CandleData[]; source: string; score: number };
  const candidates: Candidate[] = [];

  function consider(raw: any[], src: string) {
    const cs = dedupeAndSort(raw);
    if (cs.length === 0) return;
    const score = scoreCandles(cs, bucketMs);
    candidates.push({ candles: cs, source: src, score });
    console.log(`[chart-data] ${tf} candidate ${src}: ${cs.length} candles score=${score.toFixed(1)}`);
  }

  // 1. Supabase token_candles (fastest — our own DB).
  const sbRaw = await fetchSupabaseCandles(mint, tf, limit);
  consider(sbRaw, "supabase_candles");

  // 2. Birdeye (primary external — covers most Solana tokens).
  if (BIRDEYE_API_KEY) {
    const raw = await fetchBirdeyeOHLCV(mint, tf, limit);
    consider(raw, "birdeye_ohlcv");
  }

  // 3. GeckoTerminal via all known pair addresses (try up to 3).
  const pairsTried = new Set<string>();
  for (const { pairAddress } of market.allPairs.slice(0, 3)) {
    if (pairsTried.has(pairAddress)) continue;
    pairsTried.add(pairAddress);
    const raw = await fetchGeckoTerminal(pairAddress, tf, limit);
    if (raw.length > 0) {
      consider(raw, `geckoterminal:${pairAddress.slice(0, 8)}`);
      // Stop trying more pairs once we have a strong candidate.
      const best = candidates.reduce((b, c) => c.score > b.score ? c : b, candidates[0]);
      if (best.candles.length >= MIN_USABLE * 4) break;
    }
  }

  // 4. Bitquery — pump.fun and pumpswap (useful for fresh tokens).
  if (BITQUERY_TOKEN) {
    const programs: [string, string][] = [
      [PUMPFUN_PROGRAM, "bitquery_pumpfun"],
      [PUMPSWAP_PROGRAM, "bitquery_pumpswap"],
    ];
    for (const [prog, src] of programs) {
      const raw = await fetchBitqueryOHLCV(mint, prog, tf, limit);
      consider(raw, src);
    }
  }

  // 5. Aggregation fallback: if we still have nothing useful, try aggregating
  //    finer-resolution candles upward.
  const AGGREGATION_MAP: Record<string, string[]> = {
    "5m":  ["1m"],
    "15m": ["5m", "1m"],
    "1H":  ["15m", "5m", "1m"],
    "4H":  ["1H", "15m"],
    "1D":  ["4H", "1H"],
    "1W":  ["1D", "4H"],
    "1M":  ["1D", "1W"],
  };
  const bestSoFar = candidates.length > 0
    ? candidates.reduce((b, c) => c.score > b.score ? c : b)
    : null;
  if ((!bestSoFar || bestSoFar.candles.length < MIN_USABLE) && AGGREGATION_MAP[tf]) {
    for (const srcTf of AGGREGATION_MAP[tf]) {
      const srcLimit = TF_LIMIT[srcTf] ?? 168;
      const srcBucket = TF_BUCKET_MS[srcTf] ?? 3_600_000;
      // Try Birdeye and Supabase for the finer resolution.
      const fineRaws: CandleData[][] = [];
      if (BIRDEYE_API_KEY) {
        const r = dedupeAndSort(await fetchBirdeyeOHLCV(mint, srcTf, srcLimit));
        if (r.length > 0) fineRaws.push(r);
      }
      const sbFine = dedupeAndSort(await fetchSupabaseCandles(mint, srcTf, srcLimit));
      if (sbFine.length > 0) fineRaws.push(sbFine);

      // Pick the finer-resolution dataset with the best score.
      let fineBest: CandleData[] = [];
      let fineBestScore = -Infinity;
      for (const fr of fineRaws) {
        const s = scoreCandles(fr, srcBucket);
        if (s > fineBestScore) { fineBestScore = s; fineBest = fr; }
      }
      if (fineBest.length >= MIN_USABLE) {
        const aggregated = aggregateUp(fineBest, bucketMs);
        if (aggregated.length > 0) {
          consider(aggregated, `aggregated_${srcTf}_to_${tf}`);
          break; // stop at first successful aggregation
        }
      }
    }
  }

  if (candidates.length === 0) {
    return { candles: [], source: "none", repairedCount: 0 };
  }

  // Choose best-scoring candidate.
  const best = candidates.reduce((b, c) => c.score > b.score ? c : b);

  // Count repaired candles (those with volume=0 and open=high=low=close are likely repaired).
  const repaired = best.candles.filter(c =>
    c.volume === 0 && Math.abs(c.high - c.low) < Math.max(c.close, 1e-12) * 1e-6
  ).length;

  return { candles: best.candles, source: best.source, repairedCount: repaired };
}

// ─── ALL timeframe: pick best resolution ─────────────────────────────────────

async function fetchAllTimeHistory(
  mint: string,
  market: MarketInfo,
): Promise<{ candles: CandleData[]; source: string; resolvedTf: string }> {
  const resolutions: string[] = ["1D", "4H", "1H", "15m", "5m", "1m"];

  // Fetch all resolutions in parallel.
  const results = await Promise.allSettled(
    resolutions.map(tf => fetchBestForTimeframe(mint, tf, market))
  );

  let bestCandles: CandleData[] = [];
  let bestScore  = -Infinity;
  let bestSource = "none";
  let bestTf     = "1D";

  for (let i = 0; i < resolutions.length; i++) {
    const res = results[i];
    if (res.status !== "fulfilled") continue;
    const { candles, source } = res.value;
    if (candles.length === 0) continue;
    const bucketMs = TF_BUCKET_MS[resolutions[i]] ?? 3_600_000;
    const score    = scoreCandles(candles, bucketMs);
    console.log(`[chart-data] ALL candidate ${resolutions[i]}: ${candles.length} candles score=${score.toFixed(1)}`);
    if (score > bestScore) {
      bestScore   = score;
      bestCandles = candles;
      bestSource  = source;
      bestTf      = resolutions[i];
    }
  }

  console.log(`[chart-data] ALL selected ${bestTf}: ${bestCandles.length} candles (score=${bestScore.toFixed(1)})`);
  return { candles: bestCandles, source: `all:${bestSource}`, resolvedTf: bestTf };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json() as { mint?: string; timeframe?: string };
    const { mint, timeframe = "1H" } = body;

    if (!mint) {
      return new Response(
        JSON.stringify({ error: "mint is required", candles: [], source: "none" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[chart-data] mint=${mint.slice(0, 8)} tf=${timeframe}`);

    // Detect market (DexScreener — gives us pair addresses for GeckoTerminal fallback).
    const market = await detectMarket(mint);
    console.log(`[chart-data] marketType=${market.marketType} pairs=${market.allPairs.length}`);

    let candles: CandleData[];
    let source: string;
    let repairedCount = 0;
    let resolvedTf    = timeframe;

    if (timeframe === "ALL") {
      const result = await fetchAllTimeHistory(mint, market);
      candles    = result.candles;
      source     = result.source;
      resolvedTf = result.resolvedTf;
    } else {
      const result = await fetchBestForTimeframe(mint, timeframe, market);
      candles      = result.candles;
      source       = result.source;
      repairedCount = result.repairedCount;
    }

    const reason = candles.length === 0
      ? `No chart data available for ${market.marketType} token on ${timeframe}`
      : undefined;

    console.log(`[chart-data] result: source=${source} candles=${candles.length}`);

    return new Response(
      JSON.stringify({
        candles,
        source,
        marketType: market.marketType,
        reason,
        debug: {
          attemptedSources: [source],
          selectedSource:   source,
          candleCount:      candles.length,
          timeframe:        resolvedTf,
          repairedCandles:  repairedCount,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[chart-data] error:", err?.message ?? err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Internal error", candles: [], source: "error", marketType: "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
