import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function db() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { group_id, wallet_address, message, parse_mode } = await req.json();

    if (!group_id || !wallet_address || !message) {
      return json({ success: false, error: "group_id, wallet_address, and message are required" }, 400);
    }

    const supabase = db();

    // Verify caller is group admin/creator
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

    const { data: groupRow } = await supabase
      .from("group_conversations")
      .select("creator_id")
      .eq("id", group_id)
      .maybeSingle();

    const isCreator = groupRow?.creator_id === profile.id;
    const isAdmin = memberRow?.role === "admin" || memberRow?.role === "creator" || isCreator;

    if (!isAdmin) {
      return json({ success: false, error: "Only group admins can send bot messages" }, 403);
    }

    // Get the connected bot for this group
    const { data: botRecord } = await supabase
      .from("group_telegram_bots")
      .select("id, bot_username, bot_name, status")
      .eq("group_id", group_id)
      .eq("status", "connected")
      .maybeSingle();

    if (!botRecord) {
      return json({ success: false, error: "No connected bot found for this group" }, 404);
    }

    // Get linked Telegram users for this group to broadcast
    const { data: linkedUsers } = await supabase
      .from("telegram_linked_users")
      .select("telegram_user_id")
      .eq("group_id", group_id);

    if (!linkedUsers || linkedUsers.length === 0) {
      return json({ success: false, error: "No linked Telegram users in this group" }, 404);
    }

    // Get token
    const { data: tokenRow } = await supabase
      .from("group_telegram_bot_tokens")
      .select("token")
      .eq("bot_record_id", botRecord.id)
      .maybeSingle();

    if (!tokenRow?.token) {
      return json({ success: false, error: "Bot token not found" }, 500);
    }

    const botToken = tokenRow.token;
    let sent = 0;
    let failed = 0;

    // Send to all linked users
    await Promise.all(
      linkedUsers.map(async (lu) => {
        const body: Record<string, unknown> = {
          chat_id: lu.telegram_user_id,
          text: message,
        };
        if (parse_mode) body.parse_mode = parse_mode;

        const res = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        ).catch(() => null);

        if (res?.ok) {
          sent++;
        } else {
          failed++;
        }
      })
    );

    return json({ success: true, sent, failed });
  } catch (err: any) {
    console.error("[send-telegram-bot-message] error:", err);
    return json({ success: false, error: err?.message || "Internal error" }, 500);
  }
});
