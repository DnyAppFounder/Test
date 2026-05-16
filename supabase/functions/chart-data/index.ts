import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BIRDEYE_API_KEY = Deno.env.get("BIRDEYE_API_KEY") || "";
const BITQUERY_TOKEN  = Deno.env.get("BITQUERY_TOKEN")  || "";

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

// ─── Candle helpers ───────────────────────────────────────────────────────────

function isValidCandle(c: CandleData): boolean {
  if (!c || typeof c.timestamp !== "number") return false;
  if (!isFinite(c.timestamp) || c.timestamp <= 0) return false;
  if (!isFinite(c.open)  || c.open  <= 0) return false;
  if (!isFinite(c.close) || c.close <= 0) return false;
  if (!isFinite(c.high)  || c.high  <= 0) return false;
  if (!isFinite(c.low)   || c.low   <= 0) return false;
  if (c.high < c.low)    return false;
  if (c.high < c.open)   return false;
  if (c.high < c.close)  return false;
  if (c.low  > c.open)   return false;
  if (c.low  > c.close)  return false;
  return true;
}

function normalizeAndSort(candles: CandleData[]): CandleData[] {
  const seen = new Map<number, CandleData>();
  for (const c of candles) {
    if (!isValidCandle(c)) continue;
    const ex = seen.get(c.timestamp);
    if (!ex || c.volume > ex.volume) seen.set(c.timestamp, c);
  }
  return Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// Timeframe → milliseconds
function tfToMs(tf: string): number {
  const map: Record<string, number> = {
    "1m":  60_000, "5m": 300_000, "15m": 900_000,
    "1H":  3_600_000, "4H": 14_400_000,
    "1D":  86_400_000, "1W": 604_800_000, "1M": 2_592_000_000,
  };
  return map[tf] ?? 3_600_000;
}

// Candle counts per timeframe
const TF_LIMIT: Record<string, number> = {
  "1m": 120, "5m": 144, "15m": 96,
  "1H": 168, "4H": 90,
  "1D": 90, "1W": 52, "1M": 24,
};

// Birdeye type param map
const BIRDEYE_TF: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m",
  "1H": "1H", "4H": "4H",
  "1D": "1D", "1W": "1W", "1M": "1M",
};

// Bitquery interval in minutes
const BITQUERY_INTERVAL_MIN: Record<string, number> = {
  "1m": 1, "5m": 5, "15m": 15,
  "1H": 60, "4H": 240,
  "1D": 1440, "1W": 10080, "1M": 43200,
};

// ─── Market type detection ────────────────────────────────────────────────────

async function detectMarket(mint: string): Promise<{
  marketType: MarketType;
  pairAddress: string | null;
  priceUsd: number | null;
}> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { marketType: "unknown", pairAddress: null, priceUsd: null };
    const data = await res.json();
    const pairs: any[] = (data.pairs || []).filter((p: any) => p.chainId === "solana");
    if (pairs.length === 0) return { marketType: "unknown", pairAddress: null, priceUsd: null };

    pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const best = pairs[0];
    const dexId: string = (best.dexId || "").toLowerCase();
    const priceUsd = parseFloat(best.priceUsd || "0") || null;

    let marketType: MarketType = "unknown";
    if      (dexId === "pumpfun")                               marketType = "pumpfun_bonding_curve";
    else if (dexId === "pumpswap")                              marketType = "pumpswap";
    else if (dexId === "raydium" || dexId === "raydium_clmm")   marketType = "raydium";
    else if (dexId.includes("meteora"))                         marketType = "meteora";
    else if (dexId === "orca" || dexId === "orcawhirlpool")     marketType = "orca";

    return { marketType, pairAddress: best.pairAddress ?? null, priceUsd };
  } catch {
    return { marketType: "unknown", pairAddress: null, priceUsd: null };
  }
}

// ─── Birdeye OHLCV ────────────────────────────────────────────────────────────

async function fetchBirdeyeOHLCV(
  mint: string,
  timeframe: string,
  limit: number,
): Promise<CandleData[]> {
  if (!BIRDEYE_API_KEY) return [];

  const tfParam = BIRDEYE_TF[timeframe] || "1H";
  const tfMs    = tfToMs(timeframe);
  const now     = Math.floor(Date.now() / 1000);
  const from    = Math.floor((Date.now() - tfMs * limit * 1.5) / 1000);

  try {
    const url = `https://public-api.birdeye.so/defi/ohlcv?address=${mint}&type=${tfParam}&time_from=${from}&time_to=${now}`;
    const res = await fetch(url, {
      headers: {
        "X-API-KEY":  BIRDEYE_API_KEY,
        "x-chain":    "solana",
        "accept":     "application/json",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      console.warn(`[chart-data] Birdeye ${res.status} for ${mint.slice(0, 8)}`);
      return [];
    }
    const data  = await res.json();
    const items = data?.data?.items ?? [];
    return items.map((item: any) => ({
      timestamp: Number(item.unixTime) * 1000,
      open:      Number(item.o),
      high:      Number(item.h),
      low:       Number(item.l),
      close:     Number(item.c),
      volume:    Number(item.v ?? 0),
    }));
  } catch (e) {
    console.warn("[chart-data] Birdeye fetch error:", (e as any)?.message);
    return [];
  }
}

// ─── Bitquery OHLCV (Pump.fun / PumpSwap) ────────────────────────────────────

const PUMPFUN_PROGRAM   = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymEHe5";
const PUMPSWAP_PROGRAM  = "PSwapMdSai8tjrEXcxFeQth87xC4rRsa4VA5mhGhXkP";
const WSOL_MINT         = "So11111111111111111111111111111111111111112";

async function fetchBitqueryOHLCV(
  mint: string,
  programAddress: string,
  timeframe: string,
  limit: number,
): Promise<CandleData[]> {
  if (!BITQUERY_TOKEN) return [];

  // Cap Bitquery queries at 2 days for short TFs, 90 days for longer
  const intervalMin = BITQUERY_INTERVAL_MIN[timeframe] || 60;
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
          Block {
            Time(interval: { in: minutes, count: $interval })
          }
          volume: sum(of: Trade_Side_AmountInUSD)
          Trade {
            open:  PriceInUSD(minimum: Block_Time)
            high:  PriceInUSD(maximum: Trade_PriceInUSD)
            low:   PriceInUSD(minimum: Trade_PriceInUSD)
            close: PriceInUSD(maximum: Block_Time)
          }
          count
        }
      }
    }
  `;

  try {
    const res = await fetch("https://streaming.bitquery.io/eap", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${BITQUERY_TOKEN}`,
      },
      body: JSON.stringify({
        query,
        variables: {
          mint,
          program: programAddress,
          since:   fromDate.toISOString(),
          till:    now.toISOString(),
          interval: intervalMin,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[chart-data] Bitquery ${res.status}`);
      return [];
    }
    const data   = await res.json();
    const trades = data?.data?.Solana?.DEXTradeByTokens ?? [];

    return trades
      .map((t: any) => ({
        timestamp: new Date(t.Block?.Time ?? 0).getTime(),
        open:   Number(t.Trade?.open  ?? 0),
        high:   Number(t.Trade?.high  ?? 0),
        low:    Number(t.Trade?.low   ?? 0),
        close:  Number(t.Trade?.close ?? 0),
        volume: parseFloat(String(t.volume ?? "0")),
      }))
      .filter((c: CandleData) => c.open > 0 && c.close > 0 && c.timestamp > 0);
  } catch (e) {
    console.warn("[chart-data] Bitquery error:", (e as any)?.message);
    return [];
  }
}

// ─── GeckoTerminal OHLCV (fallback via pair address) ─────────────────────────

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

async function fetchGeckoTerminal(
  pairAddress: string,
  timeframe: string,
  limit: number,
): Promise<CandleData[]> {
  const { aggregate, tf } = GECKO_TF_MAP[timeframe] ?? GECKO_TF_MAP["1H"];
  const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairAddress}/ohlcv/${tf}` +
              `?aggregate=${aggregate}&limit=${limit}&currency=usd&token=base`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json;version=20230302" },
      signal: AbortSignal.timeout(10000),
    });
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

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { mint, timeframe = "1H" } = await req.json() as {
      mint?: string;
      timeframe?: string;
    };

    if (!mint) {
      return new Response(
        JSON.stringify({ error: "mint is required", candles: [], source: "none" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const limit = TF_LIMIT[timeframe] ?? 100;
    console.log(`[chart-data] mint=${mint.slice(0, 8)} tf=${timeframe} limit=${limit}`);

    // 1. Detect market type
    const { marketType, pairAddress, priceUsd } = await detectMarket(mint);
    console.log(`[chart-data] marketType=${marketType} pair=${pairAddress?.slice(0, 8) ?? "none"}`);

    let candles: CandleData[] = [];
    let source = "none";

    // 2. Try Birdeye (primary — covers most Solana tokens including pump.fun/pumpswap)
    if (BIRDEYE_API_KEY) {
      const raw = await fetchBirdeyeOHLCV(mint, timeframe, limit);
      const normalized = normalizeAndSort(raw);
      if (normalized.length > 0) {
        candles = normalized;
        source  = "birdeye_ohlcv";
        console.log(`[chart-data] birdeye: ${candles.length} candles`);
      }
    }

    // 3. Bitquery fallback for pump.fun bonding curve
    if (candles.length < 5 && marketType === "pumpfun_bonding_curve" && BITQUERY_TOKEN) {
      const raw = await fetchBitqueryOHLCV(mint, PUMPFUN_PROGRAM, timeframe, limit);
      const normalized = normalizeAndSort(raw);
      if (normalized.length > candles.length) {
        candles = normalized;
        source  = "bitquery_pumpfun_ohlcv";
        console.log(`[chart-data] bitquery pumpfun: ${candles.length} candles`);
      }
    }

    // 4. Bitquery fallback for pumpswap
    if (candles.length < 5 && marketType === "pumpswap" && BITQUERY_TOKEN) {
      const raw = await fetchBitqueryOHLCV(mint, PUMPSWAP_PROGRAM, timeframe, limit);
      const normalized = normalizeAndSort(raw);
      if (normalized.length > candles.length) {
        candles = normalized;
        source  = "bitquery_pumpswap_ohlcv";
        console.log(`[chart-data] bitquery pumpswap: ${candles.length} candles`);
      }
    }

    // 5. GeckoTerminal fallback via DexScreener pair address
    if (candles.length < 5 && pairAddress) {
      const raw = await fetchGeckoTerminal(pairAddress, timeframe, limit);
      const normalized = normalizeAndSort(raw);
      if (normalized.length > candles.length) {
        candles = normalized;
        source  = "geckoterminal";
        console.log(`[chart-data] geckoterminal: ${candles.length} candles`);
      }
    }

    // 6. If still no data but we know the type, try Bitquery on any DEX program
    if (candles.length < 5 && BITQUERY_TOKEN) {
      const programs = [PUMPFUN_PROGRAM, PUMPSWAP_PROGRAM];
      for (const program of programs) {
        if (candles.length >= 5) break;
        const raw = await fetchBitqueryOHLCV(mint, program, timeframe, limit);
        const normalized = normalizeAndSort(raw);
        if (normalized.length > candles.length) {
          candles = normalized;
          source  = program === PUMPFUN_PROGRAM ? "bitquery_pumpfun_ohlcv" : "bitquery_pumpswap_ohlcv";
        }
      }
    }

    const reason = candles.length === 0
      ? `No chart data available for this ${marketType} token on ${timeframe}`
      : undefined;

    console.log(`[chart-data] result: source=${source} candles=${candles.length}${reason ? " — " + reason : ""}`);

    return new Response(
      JSON.stringify({ candles, source, marketType, reason }),
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
