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

// Standard public Solana RPC WebSocket (fallback when no Helius WS key configured)
const PUBLIC_WS_URL = "wss://api.mainnet-beta.solana.com";

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
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",  // Meteora DLMM
  "Eo7WjKq67rjJQDd1d4dSYkjnwCiRi8zx1RqCj3nmTXWm", // Meteora AMM pools
];

// ─── Supabase client ──────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// ─── Active subscriptions (in-memory, per invocation) ────────────────────────

const mintSubscriptions = new Map<string, number>();
const candleState = new Map<string, Record<string, LiveCandle>>();
const logsSubIds = new Map<string, number>(); // program -> sub id

interface LiveCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  dirty: boolean;
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
  console.log(`[helius-ws] Trade received mint=${mint.slice(0, 8)} price=${priceUsd.toPrecision(6)} vol=${volumeUsd.toFixed(4)}`);

  let mintCandles = candleState.get(mint);
  if (!mintCandles) {
    mintCandles = {};
    candleState.set(mint, mintCandles);
  }

  for (const [tf, intervalMs] of Object.entries(TIMEFRAMES)) {
    const openTime = getCandleOpenTime(ts, intervalMs);
    const existing = mintCandles[tf];

    if (!existing || existing.openTime !== openTime) {
      mintCandles[tf] = initCandle(openTime, priceUsd, volumeUsd);
    } else {
      mintCandles[tf] = updateCandle(existing, priceUsd, volumeUsd);
    }
  }
  console.log(`[helius-ws] Candle updated for mint=${mint.slice(0, 8)}`);
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

function extractTradeFromHeliusTx(tx: any): { mint: string; priceUsd: number; volumeUsd: number; ts: number } | null {
  try {
    const ts = (tx.timestamp ?? Math.floor(Date.now() / 1000)) * 1000;

    const swapEvent = tx.events?.swap;
    if (swapEvent) {
      const tokenIn  = swapEvent.tokenInputs?.[0];
      const tokenOut = swapEvent.tokenOutputs?.[0];
      const nativeIn  = swapEvent.nativeInput;
      const nativeOut = swapEvent.nativeOutput;

      let mint = "";
      let priceUsd = 0;
      let volumeUsd = 0;

      if (nativeIn && tokenOut) {
        mint = tokenOut.mint || tokenOut.userAccount || "";
        const solAmount = (nativeIn.amount || 0) / 1e9;
        const tokenAmount = (tokenOut.rawTokenAmount?.tokenAmount || tokenOut.tokenAmount || 0) /
          Math.pow(10, tokenOut.rawTokenAmount?.decimals || 6);
        if (tokenAmount > 0 && solAmount > 0) {
          volumeUsd = solAmount;
          priceUsd  = solAmount / tokenAmount;
        }
      } else if (tokenIn && nativeOut) {
        mint = tokenIn.mint || "";
        const solAmount = (nativeOut.amount || 0) / 1e9;
        const tokenAmount = (tokenIn.rawTokenAmount?.tokenAmount || tokenIn.tokenAmount || 0) /
          Math.pow(10, tokenIn.rawTokenAmount?.decimals || 6);
        if (tokenAmount > 0 && solAmount > 0) {
          volumeUsd = solAmount;
          priceUsd  = solAmount / tokenAmount;
        }
      } else if (tokenIn && tokenOut) {
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

    // Fallback: inspect tokenTransfers
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

// ─── Helius WebSocket (transactionSubscribe — Helius premium) ─────────────────

let ws: WebSocket | null = null;
let wsReady = false;
let pendingMints: string[] = [];
let subIdCounter = 1;
let flushTimer: number | null = null;

// ─── Standard WS for logsSubscribe (works without Helius premium) ─────────────

let publicWs: WebSocket | null = null;
let publicWsReady = false;
let publicPendingMints: string[] = [];

function scheduleFlush() {
  if (!flushTimer) {
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      await flushCandles();
    }, 2000) as unknown as number;
  }
}

// ─── Public WS logsSubscribe ──────────────────────────────────────────────────

function ensurePublicWs() {
  if (publicWs && publicWsReady) return;

  const url = SOLANA_WS_URL || PUBLIC_WS_URL;
  console.log("[helius-ws] Connecting public WS for logsSubscribe:", url.substring(0, 60));
  publicWs = new WebSocket(url);

  publicWs.onopen = () => {
    console.log("[helius-ws] Public WebSocket connected");
    publicWsReady = true;

    for (const mint of publicPendingMints) {
      subscribeMintLogs(mint);
    }
    publicPendingMints = [];

    // Subscribe to all active mints too
    for (const mint of mintSubscriptions.keys()) {
      subscribeMintLogs(mint);
    }
  };

  publicWs.onmessage = async (event: MessageEvent) => {
    try {
      const msg = JSON.parse(typeof event.data === "string" ? event.data : await event.data.text());

      if (msg.result && typeof msg.result === "number") {
        console.log("[helius-ws] logsSubscribe confirmed, id:", msg.result);
        return;
      }

      const params = msg.params;
      if (!params?.result) return;

      const txValue = params.result.value ?? params.result;

      // logsSubscribe gives signature + logs, not full tx — extract what we can
      const logs: string[] = txValue.logs || [];
      const signature: string = txValue.signature || "";
      if (!signature || logs.length === 0) return;

      // Check which watched mint is mentioned in logs
      for (const mint of mintSubscriptions.keys()) {
        const mintMentioned = logs.some((l: string) => l.includes(mint));
        if (!mintMentioned) continue;

        // We have a confirmed trade signature for this mint.
        // Fetch enriched tx data from Helius REST API to get price.
        fetchAndProcessTx(signature, mint).catch(() => {});
        break;
      }
    } catch (e) {
      console.warn("[helius-ws] Public WS message error:", e);
    }
  };

  publicWs.onerror = () => {
    console.error("[helius-ws] Public WebSocket error");
    publicWsReady = false;
  };

  publicWs.onclose = () => {
    console.log("[helius-ws] Public WebSocket closed, reconnecting in 5s");
    publicWsReady = false;
    publicWs = null;
    setTimeout(ensurePublicWs, 5000);
  };
}

function subscribeMintLogs(mint: string) {
  if (!publicWs || !publicWsReady) {
    if (!publicPendingMints.includes(mint)) publicPendingMints.push(mint);
    return;
  }

  const id = subIdCounter++;
  const payload = {
    jsonrpc: "2.0",
    id,
    method: "logsSubscribe",
    params: [
      { mentions: [mint] },
      { commitment: "confirmed" },
    ],
  };
  publicWs.send(JSON.stringify(payload));
  console.log(`[helius-ws] logsSubscribe for mint=${mint.slice(0, 8)} (id=${id})`);
}

// ─── Helius REST: fetch enriched tx for price extraction ─────────────────────

async function fetchAndProcessTx(signature: string, hint_mint: string) {
  try {
    // Use Helius enhanced transactions API if SOLANA_WS_URL is a Helius endpoint
    // Extract API key from WS URL: wss://atlas-mainnet.helius-rpc.com?api-key=XXX
    const wsUrl = SOLANA_WS_URL;
    const apiKeyMatch = wsUrl.match(/api-key=([^&]+)/i) || wsUrl.match(/apiKey=([^&]+)/i);
    const apiKey = apiKeyMatch?.[1] || "";

    if (!apiKey) {
      // No Helius key — skip REST enrichment, price poll in client handles it
      return;
    }

    const res = await fetch(`https://api.helius.xyz/v0/transactions?api-key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions: [signature] }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return;
    const txs: any[] = await res.json();
    if (!txs || txs.length === 0) return;

    const trade = extractTradeFromHeliusTx(txs[0]);
    if (!trade) return;

    // If the mint from the enriched tx is one we're watching, use it
    if (mintSubscriptions.has(trade.mint)) {
      processTrade(trade.mint, trade.priceUsd, trade.volumeUsd, trade.ts);
      scheduleFlush();
    } else if (hint_mint && trade.priceUsd > 0) {
      // Fallback: use hint mint from logsSubscribe
      processTrade(hint_mint, trade.priceUsd, trade.volumeUsd, trade.ts);
      scheduleFlush();
    }
  } catch {
    // Non-fatal
  }
}

// ─── Helius WS transactionSubscribe (premium) ─────────────────────────────────

function ensureWs() {
  if (ws && wsReady) return;
  if (!SOLANA_WS_URL) {
    console.log("[helius-ws] No SOLANA_WS_URL set, using logsSubscribe only");
    return;
  }

  console.log("[helius-ws] Connecting to Helius WebSocket (transactionSubscribe)...");
  ws = new WebSocket(SOLANA_WS_URL);

  ws.onopen = () => {
    console.log("[helius-ws] WebSocket connected");
    wsReady = true;

    for (const mint of pendingMints) {
      subscribeToMint(mint);
    }
    pendingMints = [];

    for (const mint of mintSubscriptions.keys()) {
      subscribeToMint(mint);
    }
  };

  ws.onmessage = async (event: MessageEvent) => {
    try {
      const msg = JSON.parse(typeof event.data === "string" ? event.data : await event.data.text());

      if (msg.result && typeof msg.result === "number") {
        console.log("[helius-ws] Subscribed, id:", msg.result);
        return;
      }

      const params = msg.params;
      if (!params?.result) return;

      const txResult = params.result;
      const txValue = txResult.value ?? txResult;

      if (txValue.signature && !txValue.transaction) return;

      const trade = extractTradeFromHeliusTx(txValue.transaction ?? txValue);
      if (!trade) return;

      processTrade(trade.mint, trade.priceUsd, trade.volumeUsd, trade.ts);
      scheduleFlush();
    } catch (e) {
      console.warn("[helius-ws] Message parse error:", e);
    }
  };

  ws.onerror = () => {
    console.error("[helius-ws] WebSocket error");
    wsReady = false;
  };

  ws.onclose = () => {
    console.log("[helius-ws] WebSocket closed, reconnecting in 5s");
    wsReady = false;
    ws = null;
    setTimeout(ensureWs, 5000);
  };
}

function subscribeToMint(mint: string) {
  if (!ws || !wsReady) {
    if (!pendingMints.includes(mint)) pendingMints.push(mint);
    return;
  }

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
  console.log(`[helius-ws] transactionSubscribe for mint=${mint.slice(0, 8)} (id=${id})`);
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
      console.log(`[helius-ws] Watch request for mint=${mint.slice(0, 8)}`);

      // Start both WS connections
      ensureWs();
      ensurePublicWs();

      if (!mintSubscriptions.has(mint)) {
        mintSubscriptions.set(mint, subIdCounter++);
        subscribeToMint(mint);
        subscribeMintLogs(mint);
        console.log(`[helius-ws] Detected pools/pairs for mint=${mint.slice(0, 8)}, watching DEX activity`);
      }

      EdgeRuntime.waitUntil(
        new Promise<void>((resolve) => {
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
          publicWsConnected: publicWsReady,
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
