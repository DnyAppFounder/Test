import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// The public URL of the telegram-webhook edge function
const WEBHOOK_FN_URL = `${SUPABASE_URL}/functions/v1/telegram-webhook`;

function db() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const action = new URL(req.url).searchParams.get("action") || "connect";

    // ── connect / test ──────────────────────────────────────────────────
    if (action === "connect" || action === "test") {
      const { token, group_id, wallet_address } = await req.json();

      if (!token || typeof token !== "string" || !token.includes(":")) {
        return json({ success: false, error: "Invalid bot token format" }, 400);
      }
      if (!group_id) {
        return json({ success: false, error: "group_id required" }, 400);
      }
      if (!wallet_address) {
        return json({ success: false, error: "wallet_address required" }, 400);
      }

      const supabase = db();

      // Verify the caller is the group creator/admin
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("wallet_address", wallet_address)
        .maybeSingle();

      if (!profile) {
        return json({ success: false, error: "Profile not found" }, 403);
      }

      const { data: memberRow } = await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", group_id)
        .eq("user_id", profile.id)
        .is("removed_at", null)
        .maybeSingle();

      // Also allow group creator via group_conversations
      const { data: groupRow } = await supabase
        .from("group_conversations")
        .select("creator_id")
        .eq("id", group_id)
        .maybeSingle();

      const isCreator = groupRow?.creator_id === profile.id;
      const isAdmin = memberRow?.role === "admin" || memberRow?.role === "creator";

      if (!isCreator && !isAdmin) {
        return json({ success: false, error: "Only group owner/admin can connect a bot" }, 403);
      }

      // Validate token with Telegram getMe
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const tgData = await tgRes.json();

      if (!tgData.ok) {
        return json({
          success: false,
          error: `Invalid Telegram token: ${tgData.description || "getMe failed"}`,
        }, 400);
      }

      const botInfo = tgData.result as {
        id: number;
        username: string;
        first_name: string;
        is_bot: boolean;
      };

      if (!botInfo.is_bot) {
        return json({ success: false, error: "The token does not belong to a bot" }, 400);
      }

      // If only testing, return metadata without saving
      if (action === "test") {
        return json({
          success: true,
          bot_id: botInfo.id,
          bot_username: botInfo.username,
          bot_name: botInfo.first_name,
        });
      }

      // ── CONNECT: persist bot record (upsert) ──────────────────────────

      // Upsert bot record (safe metadata — no token)
      const { data: botRecord, error: upsertErr } = await supabase
        .from("group_telegram_bots")
        .upsert(
          {
            group_id,
            bot_id: botInfo.id,
            bot_username: botInfo.username,
            bot_name: botInfo.first_name,
            status: "connected",
            webhook_set: false,
            created_by: profile.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "group_id", ignoreDuplicates: false }
        )
        .select()
        .single();

      if (upsertErr || !botRecord) {
        console.error("[connect-telegram-bot] upsert error:", upsertErr);
        return json({ success: false, error: "Failed to save bot record" }, 500);
      }

      // Upsert token in the secured table (no user can read this)
      await supabase
        .from("group_telegram_bot_tokens")
        .upsert(
          { bot_record_id: botRecord.id, token },
          { onConflict: "bot_record_id", ignoreDuplicates: false }
        );

      // Register Telegram webhook pointing to our edge function
      const webhookUrl = `${WEBHOOK_FN_URL}?bot_id=${botInfo.id}`;
      const whRes = await fetch(
        `https://api.telegram.org/bot${token}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: webhookUrl,
            allowed_updates: ["message", "callback_query"],
          }),
        }
      );
      const whData = await whRes.json();

      if (whData.ok) {
        await supabase
          .from("group_telegram_bots")
          .update({ webhook_set: true })
          .eq("id", botRecord.id);
      } else {
        console.warn("[connect-telegram-bot] setWebhook failed:", whData);
      }

      return json({
        success: true,
        bot_id: botInfo.id,
        bot_username: botInfo.username,
        bot_name: botInfo.first_name,
        status: "connected",
        webhook_set: whData.ok,
      });
    }

    // ── disconnect ──────────────────────────────────────────────────────
    if (action === "disconnect") {
      const { group_id, wallet_address } = await req.json();
      if (!group_id || !wallet_address) {
        return json({ success: false, error: "group_id and wallet_address required" }, 400);
      }

      const supabase = db();

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("wallet_address", wallet_address)
        .maybeSingle();

      if (!profile) return json({ success: false, error: "Profile not found" }, 403);

      // Get bot record to revoke webhook
      const { data: botRecord } = await supabase
        .from("group_telegram_bots")
        .select("id")
        .eq("group_id", group_id)
        .maybeSingle();

      if (botRecord) {
        // Get token to delete webhook
        const { data: tokenRow } = await supabase
          .from("group_telegram_bot_tokens")
          .select("token")
          .eq("bot_record_id", botRecord.id)
          .maybeSingle();

        if (tokenRow?.token) {
          await fetch(
            `https://api.telegram.org/bot${tokenRow.token}/deleteWebhook`
          ).catch(() => {});
        }

        // Delete bot record (cascades to token table)
        await supabase.from("group_telegram_bots").delete().eq("id", botRecord.id);
      }

      return json({ success: true });
    }

    // ── toggle (enable/disable) ─────────────────────────────────────────
    if (action === "toggle") {
      const { group_id, wallet_address, enabled } = await req.json();
      if (!group_id || !wallet_address) {
        return json({ success: false, error: "group_id and wallet_address required" }, 400);
      }
      const supabase = db();
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("wallet_address", wallet_address)
        .maybeSingle();
      if (!profile) return json({ success: false, error: "Profile not found" }, 403);

      await supabase
        .from("group_telegram_bots")
        .update({ status: enabled ? "connected" : "disabled", updated_at: new Date().toISOString() })
        .eq("group_id", group_id);

      return json({ success: true });
    }

    // ── generate_code — secure server-side link code generation ────────────
    if (action === "generate_code") {
      const { group_id, wallet_address } = await req.json();
      if (!wallet_address) {
        return json({ success: false, error: "wallet_address required" }, 400);
      }

      const supabase = db();

      // Call the SECURITY DEFINER RPC that validates ownership and generates
      // a cryptographically-random DAWEN-XXXXXX code with 15-min expiry.
      const { data: code, error: rpcErr } = await supabase
        .rpc("generate_telegram_link_code", {
          p_wallet_address: wallet_address,
          p_group_id: group_id ?? null,
        });

      if (rpcErr || !code) {
        console.error("[connect-telegram-bot] generate_code error:", rpcErr);
        return json({
          success: false,
          error: rpcErr?.message || "Could not generate Telegram link code. Please try again.",
        }, 500);
      }

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      return json({ success: true, code, expires_at: expiresAt });
    }

    // ── update_settings — save admin bot config ─────────────────────────────
    if (action === "update_settings") {
      const { group_id, wallet_address, settings } = await req.json();
      if (!group_id || !wallet_address || !settings) {
        return json({ success: false, error: "group_id, wallet_address, and settings required" }, 400);
      }

      const supabase = db();

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("wallet_address", wallet_address)
        .maybeSingle();
      if (!profile) return json({ success: false, error: "Profile not found" }, 403);

      const { data: memberRow } = await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", group_id)
        .eq("user_id", profile.id)
        .is("removed_at", null)
        .maybeSingle();

      const { data: groupRow } = await supabase
        .from("group_conversations")
        .select("creator_id")
        .eq("id", group_id)
        .maybeSingle();

      const isCreator = groupRow?.creator_id === profile.id;
      const isAdmin = memberRow?.role === "admin" || memberRow?.role === "creator" || isCreator;

      if (!isAdmin) {
        return json({ success: false, error: "Only group admins can update bot settings" }, 403);
      }

      const { error: updateErr } = await supabase
        .from("group_telegram_bots")
        .update({ settings, updated_at: new Date().toISOString() })
        .eq("group_id", group_id);

      if (updateErr) {
        return json({ success: false, error: updateErr.message }, 500);
      }

      return json({ success: true });
    }

    return json({ success: false, error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("[connect-telegram-bot] unexpected error:", err);
    return json({ success: false, error: err?.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
