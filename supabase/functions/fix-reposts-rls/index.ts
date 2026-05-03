import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Service role bypasses RLS — needed because the reposts table has broken
    // auth.uid()-based policies that don't work with wallet-based auth.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "toggle") {
      // Toggle repost for a user on a post
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
        // Un-repost
        await supabase.from("reposts").delete().eq("id", existing.id);
        const { data: post } = await supabase
          .from("posts").select("reposts_count").eq("id", postId).maybeSingle();
        if (post) {
          await supabase
            .from("posts")
            .update({ reposts_count: Math.max(0, (post.reposts_count || 0) - 1) })
            .eq("id", postId);
        }
        return new Response(
          JSON.stringify({ reposted: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Repost
        await supabase.from("reposts").insert({ post_id: postId, user_id: userId });
        const { data: post } = await supabase
          .from("posts").select("reposts_count").eq("id", postId).maybeSingle();
        if (post) {
          await supabase
            .from("posts")
            .update({ reposts_count: (post.reposts_count || 0) + 1 })
            .eq("id", postId);
        }
        return new Response(
          JSON.stringify({ reposted: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "check") {
      // Returns which postIds the user has reposted
      const body = await req.json();
      const { userId, postIds } = body;
      if (!userId || !Array.isArray(postIds) || postIds.length === 0) {
        return new Response(
          JSON.stringify({ repostedIds: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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

    return new Response(
      JSON.stringify({ error: "Use ?action=toggle or ?action=check" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
