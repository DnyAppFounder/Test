import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP_API = "https://quote-api.jup.ag/v6/swap";
const JUPITER_PRICE_API = "https://price.jup.ag/v4/price";
const JUPITER_TOKEN_LIST = "https://token.jup.ag/all";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
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

    if (action === "swap" && req.method === "POST") {
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
      const res = await fetch(`${JUPITER_PRICE_API}?ids=${ids}`);
      const data = await res.text();

      return new Response(data, {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "tokens") {
      const res = await fetch(JUPITER_TOKEN_LIST);
      const data = await res.text();

      return new Response(data, {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use: quote, swap, price, tokens" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Jupiter proxy error";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
