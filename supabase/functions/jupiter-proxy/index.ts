import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP_API = "https://quote-api.jup.ag/v6/swap";
const JUPITER_PRICE_API = "https://api.jup.ag/price/v3";
const JUPITER_TOKEN_LIST = "https://token.jup.ag/all";

async function handleReposts(req: Request, repostAction: string): Promise<Response> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  if (repostAction === "toggle") {
    const body = await req.json();
    const { postId, userId } = body;
    if (!postId || !userId) {
      return new Response(JSON.stringify({ error: "postId and userId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await supabase
      .from("reposts")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      await supabase.from("reposts").delete().eq("id", existing.id);
      const { data: post } = await supabase.from("posts").select("reposts_count").eq("id", postId).maybeSingle();
      if (post) {
        await supabase.from("posts").update({ reposts_count: Math.max(0, (post.reposts_count || 0) - 1) }).eq("id", postId);
      }
      return new Response(JSON.stringify({ reposted: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      await supabase.from("reposts").insert({ post_id: postId, user_id: userId });
      const { data: post } = await supabase.from("posts").select("reposts_count").eq("id", postId).maybeSingle();
      if (post) {
        await supabase.from("posts").update({ reposts_count: (post.reposts_count || 0) + 1 }).eq("id", postId);
      }
      return new Response(JSON.stringify({ reposted: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  if (repostAction === "check") {
    const body = await req.json();
    const { userId, postIds } = body;
    if (!userId || !Array.isArray(postIds) || postIds.length === 0) {
      return new Response(JSON.stringify({ repostedIds: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data } = await supabase
      .from("reposts")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", postIds);
    return new Response(
      JSON.stringify({ repostedIds: (data || []).map((r: any) => r.post_id) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ error: "Unknown repost_action" }), {
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
    const action = url.searchParams.get("action") || "";
    const repostAction = url.searchParams.get("repost_action") || "";

    if (repostAction) {
      return await handleReposts(req, repostAction);
    }

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
