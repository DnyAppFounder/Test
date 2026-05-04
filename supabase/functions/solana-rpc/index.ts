import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SOLANA_RPC_URL = Deno.env.get("SOLANA_RPC_URL");
if (!SOLANA_RPC_URL) {
  console.error("[solana-rpc] RPC error: SOLANA_RPC_URL environment variable is not set.");
}
const RPC_ENDPOINTS = [SOLANA_RPC_URL].filter(Boolean) as string[];

const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP_API = "https://quote-api.jup.ag/v6/swap";
const JUPITER_PRICE_API = "https://api.jup.ag/price/v3";
const JUPITER_TOKEN_LIST_ALL = "https://token.jup.ag/all";
const JUPITER_TOKEN_LIST_STRICT = "https://token.jup.ag/strict";

async function handleSolanaRpc(body: string): Promise<Response> {
  let lastError: string = "All RPC endpoints failed";

  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (response.ok) {
        const text = await response.text();
        return new Response(text, {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      lastError = `${endpoint} returned ${response.status}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: lastError }, id: null }),
    { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleJupiter(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";

  if (action === "quote") {
    const inputMint = url.searchParams.get("inputMint") || "";
    const outputMint = url.searchParams.get("outputMint") || "";
    const amount = url.searchParams.get("amount") || "";
    const slippageBps = url.searchParams.get("slippageBps") || "50";

    const params = new URLSearchParams({ inputMint, outputMint, amount, slippageBps });
    const res = await fetch(`${JUPITER_QUOTE_API}?${params.toString()}`);
    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (action === "swap") {
    const body = await req.text();
    const res = await fetch(JUPITER_SWAP_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (action === "price") {
    const ids = url.searchParams.get("ids") || "";
    const SOL_MINT = "So11111111111111111111111111111111111111112";

    try {
      const jupRes = await fetch(`${JUPITER_PRICE_API}?ids=${ids}`);
      const rawText = await jupRes.text();
      console.log("[price] Jupiter v3 status:", jupRes.status, "body:", rawText.slice(0, 300));

      if (jupRes.ok) {
        let parsed: Record<string, any> = {};
        try { parsed = JSON.parse(rawText); } catch {}

        // Check if we got valid prices (v3 returns { mint: { usdPrice } } at top level)
        const mintList = ids.split(",").map(s => s.trim()).filter(Boolean);
        const hasRealPrices = mintList.some(m => parsed[m]?.usdPrice > 0);

        if (hasRealPrices) {
          return new Response(rawText, {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.warn("[price] Jupiter v3 returned no prices for ids:", ids.slice(0, 100));
      }
    } catch (e) {
      console.error("[price] Jupiter fetch error:", e);
    }

    // Fallback: CoinGecko for SOL price
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
            console.log("[price] CoinGecko SOL price:", usdPrice);
            const result: Record<string, any> = {};
            // Build response in v3 format for all requested mints
            for (const mint of ids.split(",").map(s => s.trim()).filter(Boolean)) {
              if (mint === SOL_MINT) {
                result[mint] = { usdPrice, priceChange24h, decimals: 9 };
              }
            }
            return new Response(JSON.stringify(result), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } catch (cgErr) {
        console.error("[price] CoinGecko fallback error:", cgErr);
      }
    }

    // Return empty result — client will handle gracefully
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (action === "tokens") {
    const list = url.searchParams.get("list");
    const tokenListUrl = list === "strict" ? JUPITER_TOKEN_LIST_STRICT : JUPITER_TOKEN_LIST_ALL;
    const res = await fetch(tokenListUrl);
    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Unknown jupiter action" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Jupiter proxy: requests with ?action=quote|swap|price|tokens
    if (action) {
      return await handleJupiter(req);
    }

    // Solana RPC proxy: POST with JSON-RPC body
    if (req.method === "POST") {
      const body = await req.text();
      return await handleSolanaRpc(body);
    }

    return new Response(JSON.stringify({ error: "Send POST with JSON-RPC body, or use ?action= for Jupiter" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy error";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
