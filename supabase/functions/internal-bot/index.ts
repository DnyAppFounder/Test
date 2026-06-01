import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_COMMANDS = [
  { command: "help",    response_text: "Available commands: /help, /rules, /links, /rewards, /invite" },
  { command: "rules",   response_text: "Community rules:\n- Be respectful\n- No spam\n- No NSFW content" },
  { command: "links",   response_text: "Official DAWEN links:\nApp: https://dawen.app\nX: https://x.com/willoffd_\nTelegram: https://t.me/WillOfDCrew" },
  { command: "rewards", response_text: "$DAWORLD is the in-app utility token for Dawen World rewards, gaming, and the future shop.\n\nEarn $DAWORLD through games, referrals, and community participation.\n\nMore: https://dawen.app" },
  { command: "invite",  response_text: "" },
];

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
    .from("user_profiles")
    .select("id")
    .eq("wallet_address", wallet_address)
    .maybeSingle();
  if (!profile) return { ok: false, userId: null as string | null };

  const { data: gc } = await supabase
    .from("group_conversations")
    .select("creator_id")
    .eq("id", group_id)
    .maybeSingle();

  const { data: gm } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", group_id)
    .eq("user_id", profile.id)
    .is("removed_at", null)
    .maybeSingle();

  const isAdmin = gc?.creator_id === profile.id || gm?.role === "admin" || gm?.role === "creator";
  return { ok: isAdmin, userId: profile.id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const action = new URL(req.url).searchParams.get("action") || "upsert";
    const body = await req.json();
    const supabase = db();

    // ── upsert — create or update internal DAWEN bot ─────────────────────────
    if (action === "upsert") {
      const { group_id, wallet_address, bot_name, bot_avatar_url, is_enabled, settings } = body;
      if (!group_id || !wallet_address) return json({ success: false, error: "group_id and wallet_address required" }, 400);

      const { ok, userId } = await verifyAdmin(supabase, group_id, wallet_address);
      if (!ok) return json({ success: false, error: "Admin access required" }, 403);

      // Upsert the bot record
      const { data: bot, error: upsertErr } = await supabase
        .from("dawen_group_bots")
        .upsert({
          group_id,
          bot_name: (bot_name || "DAWEN Bot").trim(),
          bot_avatar_url: bot_avatar_url || null,
          is_enabled: is_enabled !== false,
          settings: settings ?? {},
          created_by: userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "group_id" })
        .select()
        .single();

      if (upsertErr || !bot) {
        return json({ success: false, error: upsertErr?.message || "Failed to save bot" }, 500);
      }

      // Seed default commands if this is a new bot (no commands yet)
      const { data: existingCmds } = await supabase
        .from("dawen_bot_commands")
        .select("command")
        .eq("group_bot_id", bot.id);

      if (!existingCmds || existingCmds.length === 0) {
        await supabase.from("dawen_bot_commands").insert(
          DEFAULT_COMMANDS.map(c => ({ group_bot_id: bot.id, ...c }))
        );
      }

      const { data: commands } = await supabase
        .from("dawen_bot_commands")
        .select("id, command, response_text, is_enabled")
        .eq("group_bot_id", bot.id)
        .order("created_at");

      return json({ success: true, bot, commands: commands ?? [] });
    }

    // ── get — load bot + commands ─────────────────────────────────────────────
    if (action === "get") {
      const { group_id } = body;
      if (!group_id) return json({ success: false, error: "group_id required" }, 400);

      const { data: bot } = await supabase
        .from("dawen_group_bots")
        .select("*")
        .eq("group_id", group_id)
        .maybeSingle();

      if (!bot) return json({ success: true, bot: null, commands: [] });

      const { data: commands } = await supabase
        .from("dawen_bot_commands")
        .select("id, command, response_text, is_enabled")
        .eq("group_bot_id", bot.id)
        .order("created_at");

      return json({ success: true, bot, commands: commands ?? [] });
    }

    // ── update_command — update a command's response text or enabled status ───
    if (action === "update_command") {
      const { group_id, wallet_address, command_id, response_text, is_enabled } = body;
      if (!group_id || !wallet_address || !command_id) return json({ success: false, error: "Missing fields" }, 400);

      const { ok } = await verifyAdmin(supabase, group_id, wallet_address);
      if (!ok) return json({ success: false, error: "Admin access required" }, 403);

      const update: Record<string, unknown> = {};
      if (response_text !== undefined) update.response_text = response_text;
      if (is_enabled !== undefined) update.is_enabled = is_enabled;

      await supabase.from("dawen_bot_commands").update(update).eq("id", command_id);
      return json({ success: true });
    }

    // ── send_message — send a message as the DAWEN bot into the group ─────────
    if (action === "send_message") {
      const { group_id, wallet_address, content, topic_id } = body;
      if (!group_id || !wallet_address || !content?.trim()) {
        return json({ success: false, error: "group_id, wallet_address, and content required" }, 400);
      }

      const { ok, userId } = await verifyAdmin(supabase, group_id, wallet_address);
      if (!ok) return json({ success: false, error: "Admin access required" }, 403);

      const { data: bot } = await supabase
        .from("dawen_group_bots")
        .select("bot_name, bot_avatar_url, is_enabled")
        .eq("group_id", group_id)
        .maybeSingle();

      if (!bot?.is_enabled) {
        return json({ success: false, error: "Internal bot is not enabled for this group" }, 400);
      }

      const { data: msg, error: msgErr } = await supabase
        .from("group_messages")
        .insert({
          group_id,
          sender_id: userId,
          content: content.trim(),
          topic_id: topic_id || null,
          is_bot_message: true,
          bot_name: bot.bot_name,
          bot_username: "dawen_bot",
          bot_avatar_url: bot.bot_avatar_url || null,
        })
        .select()
        .single();

      if (msgErr) return json({ success: false, error: msgErr.message }, 500);
      return json({ success: true, message: msg });
    }

    // ── process_command — called after every group message to detect commands ──
    if (action === "process_command") {
      const { group_id, sender_id, content } = body;
      if (!group_id || !sender_id || !content?.trim()) {
        return json({ success: true, handled: false });
      }

      const text = (content as string).trim();
      if (!text.startsWith("/")) return json({ success: true, handled: false });

      const { data: bot } = await supabase
        .from("dawen_group_bots")
        .select("id, bot_name, bot_avatar_url, is_enabled")
        .eq("group_id", group_id)
        .maybeSingle();

      if (!bot?.is_enabled) return json({ success: true, handled: false });

      const withoutSlash = text.slice(1);
      const cmdName = withoutSlash.split(/\s+/)[0].toLowerCase();

      // Look up stored command
      const { data: cmd } = await supabase
        .from("dawen_bot_commands")
        .select("command, response_text, is_enabled")
        .eq("group_bot_id", bot.id)
        .eq("command", cmdName)
        .maybeSingle();

      if (cmd && !cmd.is_enabled) return json({ success: true, handled: false });

      let responseText = "";

      if (cmd?.response_text) {
        responseText = cmd.response_text;
      } else {
        // Built-in fallback commands
        switch (cmdName) {
          case "start":
            responseText = `Welcome to this group! Type /help to see available commands.`;
            break;
          case "ping":
            responseText = "Pong!";
            break;
          case "help":
            responseText = "Available commands:\n/help — Show this help\n/rules — Community rules\n/links — Official links\n/rewards — $DAWORLD info\n/invite — Group invite link";
            break;
          case "invite": {
            const { data: invite } = await supabase
              .from("group_invites")
              .select("invite_code")
              .eq("group_id", group_id)
              .is("expires_at", null)
              .maybeSingle();
            responseText = invite?.invite_code
              ? `Invite link: https://dawen.app/chat/group/invite/${invite.invite_code}`
              : "No invite link available. Ask an admin to generate one.";
            break;
          }
          default:
            return json({ success: true, handled: false });
        }
      }

      const { data: msg, error: msgErr } = await supabase
        .from("group_messages")
        .insert({
          group_id,
          sender_id,
          content: responseText,
          is_bot_message: true,
          bot_name: bot.bot_name,
          bot_username: "dawen_bot",
          bot_avatar_url: bot.bot_avatar_url || null,
        })
        .select()
        .single();

      if (msgErr) return json({ success: false, error: msgErr.message }, 500);
      return json({ success: true, handled: true, message: msg });
    }

    // ── get_invite_link — generate and return a group invite link ─────────────
    if (action === "get_invite_link") {
      const { group_id } = body;
      const { data: invite } = await supabase
        .from("group_invites")
        .select("invite_code")
        .eq("group_id", group_id)
        .is("expires_at", null)
        .maybeSingle();
      const link = invite?.invite_code
        ? `https://dawen.app/chat/group/invite/${invite.invite_code}`
        : null;
      return json({ success: true, link });
    }

    return json({ success: false, error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("[internal-bot] error:", err);
    return json({ success: false, error: err?.message || "Internal error" }, 500);
  }
});
