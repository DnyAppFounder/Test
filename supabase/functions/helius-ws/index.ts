import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Config ───────────────────────────────────────────────────────────────────

const SOLANA_WS_URL = Deno.env.get("SOLANA_WS_URL") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Candle intervals in milliseconds
const TIMEFRAMES: Record<string, number> = {
  "1m":  60_000,
  "5m":  300_000,
  "15m": 900_000,
  "1H":  3_600_000,
  "4H":  14_400_000,
  "1D":  86_400_000,
};

// Known Solana DEX program IDs we want to watch for swaps
const DEX_PROGRAMS = [
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", // Raydium AMM v4
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK", // Raydium CLMM
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",  // Orca Whirlpool
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP", // Orca swap v2
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymEHe5", // Pump.fun AMM
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",  // Jupiter v6
];

// ─── Supabase client ──────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// ─── Active subscriptions (in-memory, per invocation) ────────────────────────

// mint -> last subscription id
const mintSubscriptions = new Map<string, number>();
// mint -> latest candle state per timeframe
const candleState = new Map<string, Record<string, LiveCandle>>();

interface LiveCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  dirty: boolean; // needs upsert
}

// ─── Candle utilities ─────────────────────────────────────────────────────────

function getCandleOpenTime(ts: number, intervalMs: number): number {
  return Math.floor(ts / intervalMs) * intervalMs;
}

function initCandle(openTime: number, price: number, volume: number): LiveCandle {
  return { openTime, open: price, high: price, low: price, close: price, volume, dirty: true };
}

function updateCandle(candle: LiveCandle, price: number, volume: number): LiveCandle {
  return {
    ...candle,
    high:   Math.max(candle.high, price),
    low:    Math.min(candle.low, price),
    close:  price,
    volume: candle.volume + volume,
    dirty:  true,
  };
}

function processTrade(mint: string, priceUsd: number, volumeUsd: number, ts: number) {
  if (!mint || priceUsd <= 0) return;

  let mintCandles = candleState.get(mint);
  if (!mintCandles) {
    mintCandles = {};
    candleState.set(mint, mintCandles);
  }

  for (const [tf, intervalMs] of Object.entries(TIMEFRAMES)) {
    const openTime = getCandleOpenTime(ts, intervalMs);
    const existing = mintCandles[tf];

    if (!existing || existing.openTime !== openTime) {
      // New candle period
      mintCandles[tf] = initCandle(openTime, priceUsd, volumeUsd);
    } else {
      mintCandles[tf] = updateCandle(existing, priceUsd, volumeUsd);
    }
  }
}

// ─── Flush dirty candles to Supabase ─────────────────────────────────────────

async function flushCandles() {
  const sb = getSupabase();
  const rows: any[] = [];

  for (const [mint, tfMap] of candleState.entries()) {
    for (const [tf, candle] of Object.entries(tfMap)) {
      if (!candle.dirty) continue;
      rows.push({
        token_mint: mint,
        timeframe:  tf,
        open_time:  candle.openTime,
        open:       candle.open,
        high:       candle.high,
        low:        candle.low,
        close:      candle.close,
        volume:     candle.volume,
        is_live:    true,
        updated_at: new Date().toISOString(),
      });
      // mark clean
      (candle as any).dirty = false;
    }
  }

  if (rows.length === 0) return;

  const { error } = await sb
    .from("token_candles")
    .upsert(rows, { onConflict: "token_mint,timeframe,open_time" });

  if (error) console.error("[helius-ws] Flush error:", error.message);
  else console.log(`[helius-ws] Flushed ${rows.length} candle rows`);
}

// ─── Parse price/volume from transaction logs ─────────────────────────────────

/**
 * Attempt to extract a USD price and volume from a Helius-enriched transaction.
 * Helius enhanced transactions include `nativeTransfers`, `tokenTransfers`, and
 * `events.swap` — we use the swap event when available, else fall back to
 * token transfer amounts.
 */
function extractTradeFromHeliusTx(tx: any): { mint: string; priceUsd: number; volumeUsd: number; ts: number } | null {
  try {
    const ts = (tx.timestamp ?? Math.floor(Date.now() / 1000)) * 1000;

    // Best case: Helius enriched swap event
    const swapEvent = tx.events?.swap;
    if (swapEvent) {
      const tokenIn  = swapEvent.tokenInputs?.[0];
      const tokenOut = swapEvent.tokenOutputs?.[0];
      const nativeIn  = swapEvent.nativeInput;
      const nativeOut = swapEvent.nativeOutput;

      let mint = "";
      let priceUsd = 0;
      let volumeUsd = 0;

      // SOL -> TOKEN buy
      if (nativeIn && tokenOut) {
        mint = tokenOut.mint || tokenOut.userAccount || "";
        const solAmount = (nativeIn.amount || 0) / 1e9;
        const tokenAmount = (tokenOut.rawTokenAmount?.tokenAmount || tokenOut.tokenAmount || 0) /
          Math.pow(10, tokenOut.rawTokenAmount?.decimals || 6);
        if (tokenAmount > 0 && solAmount > 0) {
          // We don't have SOL/USD here — use volume as SOL amount (price chart will be relative)
          // The chart service also fetches USD price separately
          volumeUsd = solAmount; // in SOL (approximation without price)
          priceUsd  = solAmount / tokenAmount; // price in SOL/token
        }
      }
      // TOKEN -> SOL sell
      else if (tokenIn && nativeOut) {
        mint = tokenIn.mint || "";
        const solAmount = (nativeOut.amount || 0) / 1e9;
        const tokenAmount = (tokenIn.rawTokenAmount?.tokenAmount || tokenIn.tokenAmount || 0) /
          Math.pow(10, tokenIn.rawTokenAmount?.decimals || 6);
        if (tokenAmount > 0 && solAmount > 0) {
          volumeUsd = solAmount;
          priceUsd  = solAmount / tokenAmount;
        }
      }
      // TOKEN -> TOKEN
      else if (tokenIn && tokenOut) {
        mint = tokenOut.mint || "";
        const amtIn  = (tokenIn.rawTokenAmount?.tokenAmount  || 0) / Math.pow(10, tokenIn.rawTokenAmount?.decimals  || 6);
        const amtOut = (tokenOut.rawTokenAmount?.tokenAmount || 0) / Math.pow(10, tokenOut.rawTokenAmount?.decimals || 6);
        if (amtIn > 0 && amtOut > 0) {
          priceUsd  = amtIn / amtOut;
          volumeUsd = amtIn;
        }
      }

      if (mint && priceUsd > 0) {
        return { mint, priceUsd, volumeUsd, ts };
      }
    }

    // Fallback: inspect tokenTransfers for a non-SOL token
    const transfers: any[] = tx.tokenTransfers || [];
    if (transfers.length >= 2) {
      const nonSol = transfers.find((t: any) => t.mint && t.mint !== "So11111111111111111111111111111111111111112");
      if (nonSol) {
        const solTransfer = transfers.find((t: any) => t.mint === "So11111111111111111111111111111111111111112");
        const tokenAmt = parseFloat(nonSol.tokenAmount || "0");
        const solAmt = solTransfer ? parseFloat(solTransfer.tokenAmount || "0") : 0;
        if (tokenAmt > 0 && solAmt > 0) {
          return {
            mint: nonSol.mint,
            priceUsd:  solAmt / tokenAmt,
            volumeUsd: solAmt,
            ts,
          };
        }
      }
    }
  } catch (e) {
    console.warn("[helius-ws] Parse error:", e);
  }
  return null;
}

// ─── Helius WebSocket subscription ───────────────────────────────────────────

let ws: WebSocket | null = null;
let wsReady = false;
let pendingMints: string[] = [];
let subIdCounter = 1;
let flushTimer: number | null = null;

function ensureWs() {
  if (ws && wsReady) return;

  if (!SOLANA_WS_URL) {
    console.error("[helius-ws] SOLANA_WS_URL not set");
    return;
  }

  console.log("[helius-ws] Connecting to Helius WebSocket...");
  ws = new WebSocket(SOLANA_WS_URL);

  ws.onopen = () => {
    console.log("[helius-ws] WebSocket connected");
    wsReady = true;

    // Subscribe to all pending mints
    for (const mint of pendingMints) {
      subscribeToMint(mint);
    }
    pendingMints = [];

    // Also subscribe to all active mints
    for (const mint of mintSubscriptions.keys()) {
      subscribeToMint(mint);
    }
  };

  ws.onmessage = async (event: MessageEvent) => {
    try {
      const msg = JSON.parse(typeof event.data === "string" ? event.data : await event.data.text());

      // Subscription confirmation
      if (msg.result && typeof msg.result === "number") {
        console.log("[helius-ws] Subscribed, id:", msg.result);
        return;
      }

      // Notification with transaction
      const params = msg.params;
      if (!params?.result) return;

      const txResult = params.result;
      // Helius logsSubscribe gives: { value: { logs, signature, err } }
      // Helius transactionSubscribe gives the full parsed tx
      const txValue = txResult.value ?? txResult;

      // If it's just logs (from logsSubscribe), we only have the signature
      if (txValue.signature && !txValue.transaction) {
        // We could fetch the full tx, but for now we rely on transactionSubscribe below
        return;
      }

      // Parse the enriched transaction
      const trade = extractTradeFromHeliusTx(txValue.transaction ?? txValue);
      if (!trade) return;

      processTrade(trade.mint, trade.priceUsd, trade.volumeUsd, trade.ts);

      // Flush candles every 2 seconds max
      if (!flushTimer) {
        flushTimer = setTimeout(async () => {
          flushTimer = null;
          await flushCandles();
        }, 2000) as unknown as number;
      }
    } catch (e) {
      console.warn("[helius-ws] Message parse error:", e);
    }
  };

  ws.onerror = (e: Event) => {
    console.error("[helius-ws] WebSocket error");
    wsReady = false;
  };

  ws.onclose = () => {
    console.log("[helius-ws] WebSocket closed");
    wsReady = false;
    ws = null;
    // Reconnect after 5s
    setTimeout(ensureWs, 5000);
  };
}

function subscribeToMint(mint: string) {
  if (!ws || !wsReady) {
    if (!pendingMints.includes(mint)) pendingMints.push(mint);
    return;
  }

  // Use Helius transactionSubscribe (premium) for full enriched tx data
  // This subscribes to all confirmed transactions mentioning this account/mint
  const id = subIdCounter++;
  mintSubscriptions.set(mint, id);

  const subPayload = {
    jsonrpc: "2.0",
    id,
    method: "transactionSubscribe",
    params: [
      {
        accountInclude: [mint],
        failed: false,
      },
      {
        commitment: "confirmed",
        encoding: "jsonParsed",
        transactionDetails: "full",
        maxSupportedTransactionVersion: 0,
      },
    ],
  };

  ws.send(JSON.stringify(subPayload));
  console.log(`[helius-ws] Subscribed to mint ${mint.slice(0, 8)}... (sub id ${id})`);
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "";
    const mint: string = body.mint || "";

    if (action === "watch" && mint) {
      console.log(`[helius-ws] Watch request for mint: ${mint.slice(0, 8)}...`);

      // Ensure WS is running
      ensureWs();

      if (!mintSubscriptions.has(mint)) {
        subscribeToMint(mint);
      }

      // Keep the function alive so the WS connection persists
      // Use EdgeRuntime.waitUntil to keep running in background
      EdgeRuntime.waitUntil(
        new Promise<void>((resolve) => {
          // Run for up to 25 minutes (Supabase edge function max wall time)
          setTimeout(resolve, 25 * 60 * 1000);
        })
      );

      return new Response(
        JSON.stringify({ ok: true, mint, watching: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "status") {
      return new Response(
        JSON.stringify({
          ok: true,
          wsConnected: wsReady,
          monitoredMints: [...mintSubscriptions.keys()],
          candleStateKeys: [...candleState.keys()],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use: watch, status" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[helius-ws] Handler error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
