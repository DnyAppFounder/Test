import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SOLANA_RPC_URL = Deno.env.get("SOLANA_RPC_URL") || "";
if (!SOLANA_RPC_URL) {
  console.error("[solana-rpc] SOLANA_RPC_URL not set");
}

// Jupiter v6 (quote-api.jup.ag) has been sunset — DNS fails for that domain.
// Use lite-api.jup.ag/swap/v1 (free, no key) with api.jup.ag/swap/v1 as fallback.
const JUPITER_QUOTE_ENDPOINTS = [
  "https://lite-api.jup.ag/swap/v1/quote",
  "https://api.jup.ag/swap/v1/quote",
];
const JUPITER_SWAP_ENDPOINTS = [
  "https://lite-api.jup.ag/swap/v1/swap",
  "https://api.jup.ag/swap/v1/swap",
];
const JUPITER_PRICE_API = "https://api.jup.ag/price/v3";
const JUPITER_TOKEN_LIST_ALL    = "https://lite-api.jup.ag/tokens/v1/all";
const JUPITER_TOKEN_LIST_STRICT = "https://lite-api.jup.ag/tokens/v1/tagged/verified";

// ─── Solana JSON-RPC proxy ─────────────────────────────────────────────────

async function handleSolanaRpc(body: string): Promise<Response> {
  if (!SOLANA_RPC_URL) {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "SOLANA_RPC_URL not configured" }, id: null }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const response = await fetch(SOLANA_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const text = await response.text();
    return new Response(text, {
      status: response.ok ? 200 : response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: msg }, id: null }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ─── Helius DAS proxy ──────────────────────────────────────────────────────
// Forwards DAS API calls (getAsset, getAssetBatch) to the Helius RPC endpoint.
// Helius Premium supports DAS at the same RPC URL.

async function handleDas(req: Request): Promise<Response> {
  if (!SOLANA_RPC_URL) {
    return new Response(JSON.stringify({ error: "SOLANA_RPC_URL not configured" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: string;
  try {
    body = await req.text();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[das] Forwarding DAS request, body length:", body.length);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(SOLANA_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const text = await res.text();
      console.log("[das] DAS response status:", res.status, "body:", text.slice(0, 200));
      return new Response(text, {
        status: res.ok ? 200 : res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[das] Attempt ${attempt + 1} failed:`, msg);
      if (attempt < 1) await new Promise(r => setTimeout(r, 500));
    }
  }

  return new Response(JSON.stringify({ error: "DAS request failed" }), {
    status: 502,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── pump.fun proxy ────────────────────────────────────────────────────────
// Proxies requests to pump.fun API to avoid browser CORS restrictions.

async function handlePumpFun(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mint = url.searchParams.get("mint") || "";
  if (!mint) {
    return new Response(JSON.stringify({ error: "mint required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const res = await fetch(`https://frontend-api.pump.fun/coins/${mint}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();
    return new Response(text, {
      status: res.ok ? 200 : res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

// ─── Jupiter proxy ─────────────────────────────────────────────────────────

async function handleJupiter(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";

  // ── quote ──────────────────────────────────────────────────────────────
  if (action === "quote") {
    const inputMint  = url.searchParams.get("inputMint") || "";
    const outputMint = url.searchParams.get("outputMint") || "";
    const amount     = url.searchParams.get("amount") || "";
    const slippageBps = url.searchParams.get("slippageBps") || "50";
    const restrictIntermediateTokens = url.searchParams.get("restrictIntermediateTokens") || "true";

    const params = new URLSearchParams({ inputMint, outputMint, amount, slippageBps, restrictIntermediateTokens });
    const queryString = params.toString();
    console.log("[quote] Request:", queryString.slice(0, 150));

    let lastErr = "";
    for (const endpoint of JUPITER_QUOTE_ENDPOINTS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(`${endpoint}?${queryString}`);
          const data = await res.text();
          console.log(`[quote] ${endpoint} → HTTP ${res.status}, body:`, data.slice(0, 150));
          if (res.ok || res.status === 400) {
            return new Response(data, {
              status: res.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          lastErr = `${endpoint} returned ${res.status}: ${data.slice(0, 80)}`;
        } catch (e) {
          lastErr = `${endpoint}: ${e instanceof Error ? e.message : String(e)}`;
          console.error(`[quote] Attempt ${attempt + 1} failed for ${endpoint}:`, lastErr);
          if (attempt === 0) await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    console.error("[quote] All endpoints failed:", lastErr);
    return new Response(JSON.stringify({ error: `Jupiter quote unavailable: ${lastErr}` }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── swap ───────────────────────────────────────────────────────────────
  if (action === "swap") {
    const body = await req.text();
    let lastErr = "";

    for (const endpoint of JUPITER_SWAP_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const data = await res.text();
        if (res.ok || res.status === 400) {
          return new Response(data, {
            status: res.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        lastErr = `${endpoint} returned ${res.status}: ${data.slice(0, 80)}`;
      } catch (e) {
        lastErr = `${endpoint}: ${e instanceof Error ? e.message : String(e)}`;
        console.error("[swap] Endpoint failed:", lastErr);
      }
    }

    return new Response(JSON.stringify({ error: `Jupiter swap unavailable: ${lastErr}` }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── price ──────────────────────────────────────────────────────────────
  if (action === "price") {
    const ids = url.searchParams.get("ids") || "";
    const SOL_MINT = "So11111111111111111111111111111111111111112";

    try {
      const jupRes = await fetch(`${JUPITER_PRICE_API}?ids=${ids}`);
      const rawText = await jupRes.text();
      if (jupRes.ok) {
        let parsed: Record<string, any> = {};
        try { parsed = JSON.parse(rawText); } catch {}
        const mintList = ids.split(",").map(s => s.trim()).filter(Boolean);
        const hasRealPrices = mintList.some(m => parsed[m]?.usdPrice > 0);
        if (hasRealPrices) {
          return new Response(rawText, {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } catch (e) {
      console.error("[price] Jupiter fetch error:", e);
    }

    if (ids.includes(SOL_MINT)) {
      try {
        const cgRes = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true"
        );
        if (cgRes.ok) {
          const cgData = await cgRes.json();
          const usdPrice = cgData?.solana?.usd;
          const priceChange24h = cgData?.solana?.usd_24h_change ?? 0;
          if (usdPrice > 0) {
            const result: Record<string, any> = {};
            for (const mint of ids.split(",").map(s => s.trim()).filter(Boolean)) {
              if (mint === SOL_MINT) result[mint] = { usdPrice, priceChange24h, decimals: 9 };
            }
            return new Response(JSON.stringify(result), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } catch {}
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── tokens ─────────────────────────────────────────────────────────────
  if (action === "tokens") {
    const list = url.searchParams.get("list");
    const tokenListUrl = list === "strict" ? JUPITER_TOKEN_LIST_STRICT : JUPITER_TOKEN_LIST_ALL;
    try {
      const res = await fetch(tokenListUrl);
      const data = await res.text();
      return new Response(data, {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ error: "Unknown action" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // DAS proxy: POST requests with ?action=das
    if (action === "das") {
      return await handleDas(req);
    }

    // pump.fun proxy: GET with ?action=pumpfun&mint=xxx
    if (action === "pumpfun") {
      return await handlePumpFun(req);
    }

    // Jupiter proxy: GET/POST with ?action=quote|swap|price|tokens
    if (action) {
      return await handleJupiter(req);
    }

    // Solana RPC proxy: POST with JSON-RPC body
    if (req.method === "POST") {
      const body = await req.text();
      return await handleSolanaRpc(body);
    }

    return new Response(
      JSON.stringify({ error: "Send POST with JSON-RPC body, or use ?action= for Jupiter/DAS" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy error";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
