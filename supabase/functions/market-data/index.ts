import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

const TOP_COINS = [
  "bitcoin",
  "ethereum",
  "solana",
  "binancecoin",
  "ripple",
  "cardano",
  "dogecoin",
  "polkadot",
  "avalanche-2",
  "chainlink",
  "polygon-matic",
  "uniswap",
  "litecoin",
  "cosmos",
  "near",
  "stellar",
  "aptos",
  "sui",
  "arbitrum",
  "optimism",
  "toncoin",
  "internet-computer",
  "filecoin",
  "render-token",
  "injective-protocol",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "top";
    const query = url.searchParams.get("query") || "";

    if (action === "top") {
      const ids = TOP_COINS.join(",");
      const res = await fetch(
        `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=25&page=1&sparkline=true&price_change_percentage=24h`,
        { headers: { accept: "application/json" } }
      );

      if (!res.ok) {
        const fallback = generateFallbackData();
        return new Response(JSON.stringify(fallback), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "search" && query) {
      const res = await fetch(
        `${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`,
        { headers: { accept: "application/json" } }
      );

      if (!res.ok) {
        return new Response(JSON.stringify({ coins: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "coin") {
      const coinId = url.searchParams.get("id") || "bitcoin";
      const res = await fetch(
        `${COINGECKO_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=true`,
        { headers: { accept: "application/json" } }
      );

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: "Coin not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const fallback = generateFallbackData();
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generateFallbackData() {
  const coins = [
    { id: "bitcoin", symbol: "btc", name: "Bitcoin", price: 67234.52, change: 2.34, mcap: 1320000000000, vol: 28000000000, image: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png" },
    { id: "ethereum", symbol: "eth", name: "Ethereum", price: 3521.18, change: 1.87, mcap: 423000000000, vol: 15000000000, image: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" },
    { id: "solana", symbol: "sol", name: "Solana", price: 178.42, change: 4.12, mcap: 82000000000, vol: 3200000000, image: "https://assets.coingecko.com/coins/images/4128/small/solana.png" },
    { id: "binancecoin", symbol: "bnb", name: "BNB", price: 612.34, change: -0.45, mcap: 94000000000, vol: 1800000000, image: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png" },
    { id: "ripple", symbol: "xrp", name: "XRP", price: 2.41, change: 3.21, mcap: 138000000000, vol: 4500000000, image: "https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png" },
    { id: "cardano", symbol: "ada", name: "Cardano", price: 0.72, change: -1.23, mcap: 25000000000, vol: 890000000, image: "https://assets.coingecko.com/coins/images/975/small/cardano.png" },
    { id: "dogecoin", symbol: "doge", name: "Dogecoin", price: 0.185, change: 5.67, mcap: 26500000000, vol: 2100000000, image: "https://assets.coingecko.com/coins/images/5/small/dogecoin.png" },
    { id: "polkadot", symbol: "dot", name: "Polkadot", price: 8.92, change: -0.89, mcap: 12800000000, vol: 450000000, image: "https://assets.coingecko.com/coins/images/12171/small/polkadot.png" },
    { id: "avalanche-2", symbol: "avax", name: "Avalanche", price: 42.15, change: 2.78, mcap: 17200000000, vol: 780000000, image: "https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png" },
    { id: "chainlink", symbol: "link", name: "Chainlink", price: 18.34, change: 1.45, mcap: 11500000000, vol: 620000000, image: "https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png" },
  ];

  return coins.map((c) => ({
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    image: c.image,
    current_price: c.price,
    price_change_percentage_24h: c.change,
    market_cap: c.mcap,
    total_volume: c.vol,
    sparkline_in_7d: { price: generateSparkline(c.price) },
  }));
}

function generateSparkline(basePrice: number) {
  const points = [];
  for (let i = 0; i < 168; i++) {
    const variation = (Math.random() - 0.5) * 0.04 * basePrice;
    points.push(basePrice + variation);
  }
  return points;
}
