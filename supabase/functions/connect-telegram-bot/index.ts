import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_FN_URL = `${SUPABASE_URL}/functions/v1/telegram-webhook`;

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

async function verifyAdmin(supabase: ReturnType<typeof db>, group_id: string, wallet_address: string) {
  const { data: profile } = await supabase
    .from("user_profiles").select("id").eq("wallet_address", wallet_address).maybeSingle();
  if (!profile) return { ok: false, userId: null as string | null };

  const { data: memberRow } = await supabase
    .from("group_members").select("role")
    .eq("group_id", group_id).eq("user_id", profile.id).is("removed_at", null).maybeSingle();

  const { data: groupRow } = await supabase
    .from("group_conversations").select("creator_id").eq("id", group_id).maybeSingle();

  const isAdmin = groupRow?.creator_id === profile.id
    || memberRow?.role === "admin" || memberRow?.role === "creator";
  return { ok: isAdmin, userId: profile.id };
}

async function getBotToken(supabase: ReturnType<typeof db>, botRecordId: string): Promise<string | null> {
  const { data } = await supabase
    .from("group_telegram_bot_tokens").select("token")
    .eq("bot_record_id", botRecordId).maybeSingle();
  return data?.token ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const action = new URL(req.url).searchParams.get("action") || "connect";
    const supabase = db();

    // ── connect / test ──────────────────────────────────────────────────────
    if (action === "connect" || action === "test") {
      const { token, group_id, wallet_address } = await req.json();

      if (!token || typeof token !== "string" || !token.includes(":")) {
        return json({ success: false, error: "Invalid bot token format" }, 400);
      }
      if (!group_id) return json({ success: false, error: "group_id required" }, 400);
      if (!wallet_address) return json({ success: false, error: "wallet_address required" }, 400);

      const { ok, userId } = await verifyAdmin(supabase, group_id, wallet_address);
      if (!ok) return json({ success: false, error: "Only group owner/admin can connect a bot" }, 403);

      // Validate token with Telegram getMe
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const tgData = await tgRes.json();
      if (!tgData.ok) {
        return json({ success: false, error: `Invalid bot token: ${tgData.description || "getMe failed"}` }, 400);
      }

      const botInfo = tgData.result as { id: number; username: string; first_name: string; is_bot: boolean };
      if (!botInfo.is_bot) return json({ success: false, error: "The token does not belong to a bot" }, 400);

      // Test only — return metadata without saving
      if (action === "test") {
        return json({ success: true, bot_id: botInfo.id, bot_username: botInfo.username, bot_name: botInfo.first_name });
      }

      // CONNECT: upsert bot record
      const { data: botRecord, error: upsertErr } = await supabase
        .from("group_telegram_bots")
        .upsert({
          group_id,
          bot_id: botInfo.id,
          bot_username: botInfo.username,
          bot_name: botInfo.first_name,
          status: "connected",
          webhook_set: false,
          created_by: userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "group_id", ignoreDuplicates: false })
        .select().single();

      if (upsertErr || !botRecord) {
        return json({ success: false, error: "Failed to save bot record" }, 500);
      }

      // Store token securely
      await supabase.from("group_telegram_bot_tokens").upsert(
        { bot_record_id: botRecord.id, token },
        { onConflict: "bot_record_id", ignoreDuplicates: false }
      );

      // Register Telegram webhook
      const webhookUrl = `${WEBHOOK_FN_URL}?bot_id=${botInfo.id}`;
      const whRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message", "callback_query", "my_chat_member"],
        }),
      });
      const whData = await whRes.json();

      if (whData.ok) {
        await supabase.from("group_telegram_bots").update({ webhook_set: true }).eq("id", botRecord.id);
      } else {
        console.warn("[connect-telegram-bot] setWebhook failed:", whData);
      }

      // Load targets for this bot
      const { data: targets } = await supabase
        .from("telegram_bot_targets").select("*")
        .eq("bot_record_id", botRecord.id).order("created_at");

      return json({
        success: true,
        bot_id: botInfo.id,
        bot_username: botInfo.username,
        bot_name: botInfo.first_name,
        status: "connected",
        webhook_set: whData.ok,
        targets: targets ?? [],
      });
    }

    // ── disconnect ───────────────────────────────────────────────────────────
    if (action === "disconnect") {
      const { group_id, wallet_address } = await req.json();
      if (!group_id || !wallet_address) return json({ success: false, error: "group_id and wallet_address required" }, 400);

      const { ok } = await verifyAdmin(supabase, group_id, wallet_address);
      if (!ok) return json({ success: false, error: "Admin access required" }, 403);

      const { data: botRecord } = await supabase
        .from("group_telegram_bots").select("id").eq("group_id", group_id).maybeSingle();

      if (botRecord) {
        const token = await getBotToken(supabase, botRecord.id);
        if (token) {
          await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`).catch(() => {});
        }
        await supabase.from("group_telegram_bots").delete().eq("id", botRecord.id);
      }

      return json({ success: true });
    }

    // ── toggle (enable/disable) ──────────────────────────────────────────────
    if (action === "toggle") {
      const { group_id, wallet_address, enabled } = await req.json();
      if (!group_id || !wallet_address) return json({ success: false, error: "group_id and wallet_address required" }, 400);

      const { ok } = await verifyAdmin(supabase, group_id, wallet_address);
      if (!ok) return json({ success: false, error: "Admin access required" }, 403);

      await supabase.from("group_telegram_bots")
        .update({ status: enabled ? "connected" : "disabled", updated_at: new Date().toISOString() })
        .eq("group_id", group_id);

      return json({ success: true });
    }

    // ── generate_code — secure Telegram link code ────────────────────────────
    if (action === "generate_code") {
      const { group_id, wallet_address } = await req.json();
      if (!wallet_address) return json({ success: false, error: "wallet_address required" }, 400);

      const { data: profile } = await supabase
        .from("user_profiles").select("id").eq("wallet_address", wallet_address).maybeSingle();
      if (!profile) return json({ success: false, error: "Profile not found" }, 403);

      const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const bytes = new Uint8Array(6);
      crypto.getRandomValues(bytes);
      const code = "DAWEN-" + Array.from(bytes).map(b => ALPHABET[b % ALPHABET.length]).join("");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      await supabase.from("telegram_link_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("user_id", profile.id).is("used_at", null);

      const { error: insertErr } = await supabase.from("telegram_link_codes").insert({
        user_id: profile.id,
        group_id: group_id ?? null,
        code,
        expires_at: expiresAt,
      });

      if (insertErr) return json({ success: false, error: "Could not generate link code" }, 500);
      return json({ success: true, code, expires_at: expiresAt });
    }

    // ── update_settings — save admin bot config ──────────────────────────────
    if (action === "update_settings") {
      const { group_id, wallet_address, settings } = await req.json();
      if (!group_id || !wallet_address || !settings) return json({ success: false, error: "Missing fields" }, 400);

      const { ok } = await verifyAdmin(supabase, group_id, wallet_address);
      if (!ok) return json({ success: false, error: "Admin access required" }, 403);

      await supabase.from("group_telegram_bots")
        .update({ settings, updated_at: new Date().toISOString() }).eq("group_id", group_id);

      return json({ success: true });
    }

    // ── add_target — add a Telegram channel/group target ────────────────────
    if (action === "add_target") {
      const { group_id, wallet_address, chat_id, chat_name } = await req.json();
      if (!group_id || !wallet_address || !chat_id) return json({ success: false, error: "group_id, wallet_address, chat_id required" }, 400);

      const { ok } = await verifyAdmin(supabase, group_id, wallet_address);
      if (!ok) return json({ success: false, error: "Admin access required" }, 403);

      const { data: botRecord } = await supabase
        .from("group_telegram_bots").select("id, status").eq("group_id", group_id).maybeSingle();
      if (!botRecord) return json({ success: false, error: "No connected bot found" }, 404);

      const token = await getBotToken(supabase, botRecord.id);
      if (!token) return json({ success: false, error: "Bot token not found" }, 500);

      // Validate the chat by calling Telegram's getChat
      const chatIdNum = typeof chat_id === "string" ? chat_id : String(chat_id);
      const chatRes = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatIdNum }),
      });
      const chatData = await chatRes.json();

      if (!chatData.ok) {
        return json({
          success: false,
          error: `Cannot access chat: ${chatData.description || "Chat not found. Make sure the bot is a member/admin of this chat."}`,
        }, 400);
      }

      const chat = chatData.result;
      const resolvedName = chat_name?.trim() || chat.title || chat.username || String(chat_id);
      const resolvedType = chat.type === "channel" ? "channel"
        : chat.type === "supergroup" ? "supergroup" : "group";

      const { data: target, error: insertErr } = await supabase
        .from("telegram_bot_targets")
        .upsert({
          bot_record_id: botRecord.id,
          chat_id: BigInt(chatIdNum),
          chat_name: resolvedName,
          chat_type: resolvedType,
          is_enabled: true,
        }, { onConflict: "bot_record_id,chat_id", ignoreDuplicates: false })
        .select().single();

      if (insertErr) return json({ success: false, error: insertErr.message }, 500);
      return json({ success: true, target });
    }

    // ── remove_target ────────────────────────────────────────────────────────
    if (action === "remove_target") {
      const { group_id, wallet_address, target_id } = await req.json();
      if (!group_id || !wallet_address || !target_id) return json({ success: false, error: "Missing fields" }, 400);

      const { ok } = await verifyAdmin(supabase, group_id, wallet_address);
      if (!ok) return json({ success: false, error: "Admin access required" }, 403);

      await supabase.from("telegram_bot_targets").delete().eq("id", target_id);
      return json({ success: true });
    }

    // ── send_to_target — send a message to a specific Telegram target ─────────
    if (action === "send_to_target") {
      const { group_id, wallet_address, target_id, message } = await req.json();
      if (!group_id || !wallet_address || !target_id || !message?.trim()) {
        return json({ success: false, error: "group_id, wallet_address, target_id, message required" }, 400);
      }

      const { ok } = await verifyAdmin(supabase, group_id, wallet_address);
      if (!ok) return json({ success: false, error: "Admin access required" }, 403);

      const { data: botRecord } = await supabase
        .from("group_telegram_bots").select("id").eq("group_id", group_id).eq("status", "connected").maybeSingle();
      if (!botRecord) return json({ success: false, error: "No connected bot found" }, 404);

      const token = await getBotToken(supabase, botRecord.id);
      if (!token) return json({ success: false, error: "Bot token not found" }, 500);

      const { data: target } = await supabase
        .from("telegram_bot_targets").select("chat_id, chat_name")
        .eq("id", target_id).maybeSingle();
      if (!target) return json({ success: false, error: "Target not found" }, 404);

      const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: String(target.chat_id), text: message.trim() }),
      });
      const tgData = await tgRes.json();

      if (!tgData.ok) {
        return json({
          success: false,
          error: `Telegram error: ${tgData.description || "Failed to send message"}`,
        }, 400);
      }

      return json({ success: true, sent_to: target.chat_name });
    }

    // ── test_bot — comprehensive test ─────────────────────────────────────────
    if (action === "test_bot") {
      const { group_id, wallet_address } = await req.json();
      if (!group_id || !wallet_address) return json({ success: false, error: "Missing fields" }, 400);

      const { ok } = await verifyAdmin(supabase, group_id, wallet_address);
      if (!ok) return json({ success: false, error: "Admin access required" }, 403);

      const { data: botRecord } = await supabase
        .from("group_telegram_bots").select("*").eq("group_id", group_id).maybeSingle();

      if (!botRecord) return json({ success: false, error: "No bot connected to this group" }, 404);

      const token = await getBotToken(supabase, botRecord.id);
      if (!token) return json({ success: false, error: "Bot token not found in secure storage" }, 500);

      const results: Record<string, unknown> = {};

      // Test 1: getMe
      const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`).then(r => r.json()).catch(() => null);
      results.token_valid = meRes?.ok === true;
      results.bot_username = meRes?.result?.username ?? null;
      results.bot_name = meRes?.result?.first_name ?? null;

      // Test 2: webhook info
      const whRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then(r => r.json()).catch(() => null);
      const expectedUrl = `${WEBHOOK_FN_URL}?bot_id=${botRecord.bot_id}`;
      results.webhook_set = whRes?.ok === true;
      results.webhook_url = whRes?.result?.url ?? null;
      results.webhook_correct = whRes?.result?.url === expectedUrl;
      results.webhook_pending_count = whRes?.result?.pending_update_count ?? 0;
      results.webhook_last_error = whRes?.result?.last_error_message ?? null;

      // Test 3: DAWEN group connection
      const { data: groupRow } = await supabase
        .from("group_conversations").select("name").eq("id", group_id).maybeSingle();
      results.dawen_group_connected = !!groupRow;
      results.dawen_group_name = groupRow?.name ?? null;

      // Test 4: bot status in DB
      results.bot_status = botRecord.status;
      results.bot_id_stored = botRecord.bot_id;

      // Fix webhook if wrong URL
      if (!results.webhook_correct) {
        const fixRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: expectedUrl,
            allowed_updates: ["message", "callback_query", "my_chat_member"],
          }),
        }).then(r => r.json()).catch(() => null);
        results.webhook_fixed = fixRes?.ok === true;
        if (fixRes?.ok) {
          await supabase.from("group_telegram_bots").update({ webhook_set: true }).eq("id", botRecord.id);
        }
      }

      const allGood = results.token_valid && results.webhook_set && results.webhook_correct && results.dawen_group_connected;
      return json({ success: true, all_ok: allGood, results });
    }

    // ── list_targets ──────────────────────────────────────────────────────────
    if (action === "list_targets") {
      const { group_id } = await req.json();
      if (!group_id) return json({ success: false, error: "group_id required" }, 400);

      const { data: botRecord } = await supabase
        .from("group_telegram_bots").select("id").eq("group_id", group_id).maybeSingle();

      if (!botRecord) return json({ success: true, targets: [] });

      const { data: targets } = await supabase
        .from("telegram_bot_targets").select("*")
        .eq("bot_record_id", botRecord.id).order("created_at");

      return json({ success: true, targets: targets ?? [] });
    }

    return json({ success: false, error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("[connect-telegram-bot] error:", err);
    return json({ success: false, error: err?.message || "Internal error" }, 500);
  }
});
