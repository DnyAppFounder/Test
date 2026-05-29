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

// In-memory conversation state per telegram chat (survives within a single isolate lifetime)
// Keys: `${telegram_chat_id}:${telegram_user_id}` → conversation step
const conversationState = new Map<string, {
  step: "await_post_text" | "await_post_media" | "await_announce_text" | "confirm_post" | "confirm_announce";
  postText?: string;
  postMedia?: string;
  announceText?: string;
  groupId?: string;
  dawnUserId?: string;
}>();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Extract bot_id from query param (set when webhook was registered)
    const url = new URL(req.url);
    const botIdParam = url.searchParams.get("bot_id");

    const update = await req.json();

    // Only process message updates
    const message = update.message;
    if (!message) {
      return new Response("ok", { status: 200 });
    }

    const chatId = message.chat?.id;
    const fromId = message.from?.id;
    const text: string = message.text || "";
    const supabase = db();

    // Look up which DAWEN group this bot belongs to using bot_id
    let botRecord: any = null;
    let tokenRow: any = null;

    if (botIdParam) {
      const { data: br } = await supabase
        .from("group_telegram_bots")
        .select("id, group_id, bot_username, bot_name, status")
        .eq("bot_id", parseInt(botIdParam))
        .eq("status", "connected")
        .maybeSingle();
      botRecord = br;

      if (botRecord) {
        const { data: tr } = await supabase
          .from("group_telegram_bot_tokens")
          .select("token")
          .eq("bot_record_id", botRecord.id)
          .maybeSingle();
        tokenRow = tr;
      }
    }

    if (!botRecord || !tokenRow?.token) {
      return new Response("ok", { status: 200 });
    }

    const botToken = tokenRow.token;
    const groupId = botRecord.group_id;
    const stateKey = `${chatId}:${fromId}`;

    // Look up the linked DAWEN user for this Telegram user
    const { data: linkedUser } = await supabase
      .from("telegram_linked_users")
      .select("dawen_user_id, telegram_first_name")
      .eq("telegram_user_id", fromId)
      .maybeSingle();

    // ── Handle /link CODE command (no auth required for this one) ──────
    if (text.startsWith("/link ")) {
      const code = text.slice(6).trim().toUpperCase();
      const now = new Date().toISOString();

      const { data: linkCode } = await supabase
        .from("telegram_link_codes")
        .select("id, user_id, expires_at, used_at")
        .eq("code", code)
        .maybeSingle();

      if (!linkCode) {
        await sendMessage(botToken, chatId, "❌ Invalid link code. Generate a new one in DAWEN group settings.");
        return new Response("ok", { status: 200 });
      }
      if (linkCode.used_at) {
        await sendMessage(botToken, chatId, "❌ This code has already been used. Generate a new one.");
        return new Response("ok", { status: 200 });
      }
      if (new Date(linkCode.expires_at) < new Date(now)) {
        await sendMessage(botToken, chatId, "❌ Code expired. Generate a new one in DAWEN group settings.");
        return new Response("ok", { status: 200 });
      }

      // Save link
      await supabase.from("telegram_linked_users").upsert({
        telegram_user_id: fromId,
        dawen_user_id: linkCode.user_id,
        telegram_username: message.from?.username || null,
        telegram_first_name: message.from?.first_name || null,
        group_id: groupId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "telegram_user_id,dawen_user_id" });

      // Mark code as used
      await supabase.from("telegram_link_codes").update({ used_at: now }).eq("id", linkCode.id);

      const firstName = message.from?.first_name || "User";
      await sendMessage(botToken, chatId, `✅ Linked! Welcome ${firstName}. Your Telegram account is now connected to DAWEN.\n\nType /help to see available commands.`);
      return new Response("ok", { status: 200 });
    }

    // ── Commands that require linking ──────────────────────────────────
    if (!linkedUser) {
      if (text.startsWith("/start")) {
        await sendMessage(botToken, chatId,
          `👋 Welcome to the DAWEN Bot!\n\nTo use bot commands, link your Telegram account:\n\n1. Open DAWEN app\n2. Go to Group Settings → Bots\n3. Tap "Link Telegram"\n4. Copy the code and send:\n\n/link YOUR_CODE\n\nType /help for available commands.`
        );
      } else {
        await sendMessage(botToken, chatId, "⚠️ Your Telegram account is not linked to DAWEN yet.\n\nSend /start to see how to link it.");
      }
      return new Response("ok", { status: 200 });
    }

    const dawnUserId = linkedUser.dawen_user_id;

    // Check if user is group admin/creator for privileged commands
    const { data: memberRow } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", dawnUserId)
      .is("removed_at", null)
      .maybeSingle();

    const { data: groupRow } = await supabase
      .from("group_conversations")
      .select("creator_id, name")
      .eq("id", groupId)
      .maybeSingle();

    const isCreator = groupRow?.creator_id === dawnUserId;
    const isAdmin = memberRow?.role === "admin" || memberRow?.role === "creator" || isCreator;

    // ── Conversation flow state machine ───────────────────────────────
    const state = conversationState.get(stateKey);

    if (state) {
      // Cancel any flow
      if (text === "/cancel") {
        conversationState.delete(stateKey);
        await sendMessage(botToken, chatId, "❌ Cancelled.");
        return new Response("ok", { status: 200 });
      }

      if (state.step === "await_post_text") {
        if (!text.trim()) {
          await sendMessage(botToken, chatId, "Please send the post text, or /cancel to abort.");
          return new Response("ok", { status: 200 });
        }
        conversationState.set(stateKey, { ...state, step: "await_post_media", postText: text.trim() });
        await sendMessage(botToken, chatId, "📎 Add a media URL or token address, or type /skip to continue without media.");
        return new Response("ok", { status: 200 });
      }

      if (state.step === "await_post_media") {
        const media = text === "/skip" ? undefined : text.trim();
        const postText = state.postText!;
        conversationState.set(stateKey, { ...state, step: "confirm_post", postMedia: media });

        const preview = `📋 *Preview:*\n\n${escapeMarkdown(postText)}${media ? `\n\n📎 ${escapeMarkdown(media)}` : ""}\n\nType /publish to publish or /cancel to cancel.`;
        await sendMessage(botToken, chatId, preview, "Markdown");
        return new Response("ok", { status: 200 });
      }

      if (state.step === "confirm_post") {
        if (text === "/publish") {
          const postText = state.postText!;
          // Detect if media looks like a token address (base58, 32-44 chars)
          const media = state.postMedia;
          const isTokenAddr = media && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(media);

          const { data: newPost, error: postErr } = await supabase
            .from("posts")
            .insert({
              author_id: dawnUserId,
              content: postText,
              token_address: isTokenAddr ? media : null,
              image_url: (!isTokenAddr && media) ? media : null,
            })
            .select("id")
            .single();

          conversationState.delete(stateKey);

          if (postErr || !newPost) {
            await sendMessage(botToken, chatId, "❌ Failed to publish post. Please try again.");
          } else {
            await sendMessage(botToken, chatId, `✅ Post published!\n\nView it at: https://dawen.app`);
          }
        } else {
          await sendMessage(botToken, chatId, "Type /publish to publish or /cancel to cancel.");
        }
        return new Response("ok", { status: 200 });
      }

      if (state.step === "await_announce_text") {
        if (!text.trim()) {
          await sendMessage(botToken, chatId, "Please send the announcement text, or /cancel to abort.");
          return new Response("ok", { status: 200 });
        }
        conversationState.set(stateKey, { ...state, step: "confirm_announce", announceText: text.trim() });
        const preview = `📋 *Preview:*\n\n${escapeMarkdown(text.trim())}\n\nType /send to send to the DAWEN group or /cancel to cancel.`;
        await sendMessage(botToken, chatId, preview, "Markdown");
        return new Response("ok", { status: 200 });
      }

      if (state.step === "confirm_announce") {
        if (text === "/send") {
          const announceText = state.announceText!;

          // Get default topic for the group
          const { data: defaultTopic } = await supabase
            .from("group_topics")
            .select("id")
            .eq("group_id", groupId)
            .eq("is_default", true)
            .maybeSingle();

          // Insert bot message into group chat
          await supabase.from("group_messages").insert({
            group_id: groupId,
            sender_id: dawnUserId,
            content: announceText,
            topic_id: defaultTopic?.id || null,
            is_bot_message: true,
            bot_name: botRecord.bot_name,
            bot_username: botRecord.bot_username,
          });

          conversationState.delete(stateKey);
          await sendMessage(botToken, chatId, `✅ Announcement sent to "${groupRow?.name || "the group"}"!`);
        } else {
          await sendMessage(botToken, chatId, "Type /send to send or /cancel to cancel.");
        }
        return new Response("ok", { status: 200 });
      }
    }

    // ── Top-level commands ─────────────────────────────────────────────

    if (text === "/start") {
      await sendMessage(botToken, chatId,
        `👋 Hello ${linkedUser.telegram_first_name || ""}!\n\nYou're linked to DAWEN group: *${escapeMarkdown(groupRow?.name || groupId)}*\n\nType /help to see available commands.`,
        "Markdown"
      );
      return new Response("ok", { status: 200 });
    }

    if (text === "/help") {
      const adminCmds = isAdmin
        ? "\n\n*Admin Commands:*\n/post — Create a DAWEN Pulse post\n/announce — Send announcement to group"
        : "";
      await sendMessage(botToken, chatId,
        `*DAWEN Bot Commands*\n\n/start — Welcome message\n/help — Show this help\n/connect — Show connected group\n/groups — Show your groups\n/rules — Group rules\n/links — Official links\n/invite — Get group invite link\n/cancel — Cancel current action${adminCmds}`,
        "Markdown"
      );
      return new Response("ok", { status: 200 });
    }

    if (text === "/connect" || text === "/groups") {
      await sendMessage(botToken, chatId,
        `🔗 Connected DAWEN Group:\n*${escapeMarkdown(groupRow?.name || groupId)}*`,
        "Markdown"
      );
      return new Response("ok", { status: 200 });
    }

    if (text === "/invite") {
      // Get or create an invite
      const { data: invite } = await supabase
        .from("group_invites")
        .select("invite_code, expires_at")
        .eq("group_id", groupId)
        .is("expires_at", null)
        .maybeSingle();

      if (invite?.invite_code) {
        await sendMessage(botToken, chatId, `🔗 Group Invite Link:\nhttps://dawen.app/chat/group/invite/${invite.invite_code}`);
      } else {
        await sendMessage(botToken, chatId, "No invite link available. Create one in DAWEN group settings.");
      }
      return new Response("ok", { status: 200 });
    }

    if (text === "/rules") {
      const { data: cmd } = await supabase
        .from("group_bot_commands")
        .select("response_text")
        .eq("group_id", groupId)
        .eq("command", "rules")
        .eq("enabled", true)
        .maybeSingle();

      await sendMessage(botToken, chatId, cmd?.response_text || "No rules configured for this group yet.");
      return new Response("ok", { status: 200 });
    }

    if (text === "/links") {
      const { data: cmd } = await supabase
        .from("group_bot_commands")
        .select("response_text")
        .eq("group_id", groupId)
        .eq("command", "links")
        .eq("enabled", true)
        .maybeSingle();

      await sendMessage(botToken, chatId, cmd?.response_text || "🔗 Official DAWEN Links:\n• App: https://dawen.app\n• Twitter: https://x.com/willoffd_\n• Telegram: https://t.me/WillOfDCrew\n• Discord: https://discord.gg/AvNV9mDy3");
      return new Response("ok", { status: 200 });
    }

    if (text === "/post") {
      if (!isAdmin) {
        await sendMessage(botToken, chatId, "❌ Only group admins can publish posts via bot.");
        return new Response("ok", { status: 200 });
      }
      conversationState.set(stateKey, { step: "await_post_text", groupId, dawnUserId });
      await sendMessage(botToken, chatId, "📝 Send the post text:");
      return new Response("ok", { status: 200 });
    }

    if (text === "/announce") {
      if (!isAdmin) {
        await sendMessage(botToken, chatId, "❌ Only group admins can send announcements via bot.");
        return new Response("ok", { status: 200 });
      }
      conversationState.set(stateKey, { step: "await_announce_text", groupId, dawnUserId });
      await sendMessage(botToken, chatId, "📣 Send the announcement message:");
      return new Response("ok", { status: 200 });
    }

    // ── In-group commands (when bot is used in a Telegram group) ───────
    // (These arrive with message.chat.type != 'private')
    if (message.chat?.type !== "private" && text.startsWith("/")) {
      await handleGroupCommand(supabase, botToken, chatId, text, groupId, botRecord);
      return new Response("ok", { status: 200 });
    }

    // Default fallback
    await sendMessage(botToken, chatId, "Unknown command. Type /help to see available commands.");
    return new Response("ok", { status: 200 });

  } catch (err: any) {
    console.error("[telegram-webhook] error:", err);
    return new Response("ok", { status: 200 });
  }
});

async function handleGroupCommand(
  supabase: ReturnType<typeof db>,
  botToken: string,
  chatId: number,
  text: string,
  groupId: string,
  botRecord: any,
) {
  const cmd = text.split(" ")[0].replace("/", "").split("@")[0];

  const { data: botCmd } = await supabase
    .from("group_bot_commands")
    .select("response_text, enabled")
    .eq("group_id", groupId)
    .eq("command", cmd)
    .maybeSingle();

  if (botCmd?.enabled && botCmd.response_text) {
    await sendMessage(botToken, chatId, botCmd.response_text);
  }
}

async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  parseMode?: string,
) {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((e) => console.error("[sendMessage] error:", e));
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
