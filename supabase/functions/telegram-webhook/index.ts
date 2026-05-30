import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Official DAWEN links
const DAWEN_APP    = "https://dawen.app/";
const DAWEN_X      = "https://x.com/willoffd_";
const DAWEN_TG     = "https://t.me/WillOfDCrew";
const DAWEN_DISCORD = "https://discord.gg/AvNV9mDy3";

// Commands that do NOT require a linked account
const FREE_COMMANDS = new Set([
  "/start", "/help", "/link", "/links", "/app",
  "/rewards", "/rules", "/setup",
]);

// Cooldown durations in seconds
const COOLDOWN_NOT_LINKED_SEC = 24 * 60 * 60; // 24 hours
const COOLDOWN_SETUP_SEC      = 24 * 60 * 60; // 24 hours

// In-memory conversation state per "chatId:userId" — survives within one isolate
const conversationState = new Map<string, {
  step: "await_post_text" | "await_post_media" | "confirm_post" | "await_announce_text" | "confirm_announce";
  postText?: string;
  postMedia?: string;
  announceText?: string;
  groupId?: string;
  dawnUserId?: string;
}>();

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
    const url = new URL(req.url);
    const botIdParam = url.searchParams.get("bot_id");
    const update = await req.json();

    const supabase = db();

    // Resolve bot + token from bot_id query param
    let botRecord: any = null;
    let tokenRow: any = null;

    if (botIdParam) {
      const { data: br } = await supabase
        .from("group_telegram_bots")
        .select("id, group_id, bot_username, bot_name, status, settings")
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
    const dawenGroupId = botRecord.group_id;
    const botSettings: Record<string, unknown> = botRecord.settings ?? {};

    // ── Handle my_chat_member: bot was added/removed from a Telegram group ──────
    const myChatMember = update.my_chat_member;
    if (myChatMember) {
      const newStatus = myChatMember.new_chat_member?.status;
      const oldStatus = myChatMember.old_chat_member?.status;
      const chat = myChatMember.chat;

      // Bot was added to a group (wasn't member before, now is)
      if (
        chat &&
        (chat.type === "group" || chat.type === "supergroup") &&
        (oldStatus === "left" || oldStatus === "kicked") &&
        (newStatus === "member" || newStatus === "administrator")
      ) {
        const isAdmin = newStatus === "administrator";
        const welcomeEnabled = botSettings.welcome_enabled !== false;

        if (welcomeEnabled) {
          let welcomeMsg = typeof botSettings.welcome_message === "string" && botSettings.welcome_message.trim()
            ? botSettings.welcome_message.trim()
            : `DAWEN Bot is now active in this group.\n\nUse /help to see available commands.\nAdmins can manage bot settings inside the DAWEN app.`;

          if (!isAdmin) {
            welcomeMsg += `\n\n⚙️ Please make me admin to enable moderation features.`;
          }

          await sendMessage(botToken, chat.id, welcomeMsg);
        } else if (!isAdmin) {
          // Always tell about missing admin perms, even if welcome is off — respects cooldown
          await sendMessageWithCooldown(
            supabase, botToken, chat.id,
            myChatMember.from?.id ?? 0, chat.id,
            "setup_warning",
            COOLDOWN_SETUP_SEC,
            "⚙️ Please make me admin to enable moderation features."
          );
        }
      }
      return new Response("ok", { status: 200 });
    }

    // ── Only process message updates ─────────────────────────────────────────
    const message = update.message;
    if (!message) {
      return new Response("ok", { status: 200 });
    }

    const chatId: number = message.chat?.id;
    const fromId: number = message.from?.id;
    const text: string = (message.text || "").trim();
    const isPrivate = message.chat?.type === "private";
    const isGroup = message.chat?.type === "group" || message.chat?.type === "supergroup";

    // ── CRITICAL: In group chats, only respond to commands ───────────────────
    // Never spam the group for normal messages.
    if (isGroup && !text.startsWith("/")) {
      return new Response("ok", { status: 200 });
    }

    const stateKey = `${chatId}:${fromId}`;

    // ── /link CODE — always allowed, no auth required ────────────────────────
    if (text.toUpperCase().startsWith("/LINK ") || text.toLowerCase().startsWith("/link ")) {
      const code = text.slice(6).trim().toUpperCase();
      await handleLinkCommand(supabase, botToken, chatId, fromId, message.from, code);
      return new Response("ok", { status: 200 });
    }

    // ── /start — free command ────────────────────────────────────────────────
    if (text === "/start" || text.split("@")[0] === "/start") {
      const linkSection = isPrivate
        ? `\n\nTo link your Telegram account:\n1. Open the DAWEN app\n2. Go to Group Settings → Bots → Telegram Bot\n3. Tap *Generate Link Code*\n4. Send */link DAWEN\\-XXXXXX* here`
        : `\n\nType /help to see available commands.`;
      await sendMessage(botToken, chatId,
        `Welcome to *DAWEN Bot*!\n\nDAWEN is a Solana beta app — trade, post, play, and earn on the Solana network.${linkSection}`,
        "MarkdownV2"
      );
      return new Response("ok", { status: 200 });
    }

    // ── /help — free command ─────────────────────────────────────────────────
    if (text === "/help" || text.split("@")[0] === "/help") {
      await sendMessage(botToken, chatId,
        `*DAWEN Bot Commands*\n\n` +
        `/start — Welcome message\n` +
        `/help — Show this help\n` +
        `/link CODE — Link your Telegram to DAWEN\n` +
        `/status — Check your link status\n` +
        `/unlink — Unlink your account\n` +
        `/links — Official DAWEN links\n` +
        `/app — Get the app URL\n` +
        `/rewards — $DAWORLD rewards info\n` +
        `/rules — Community rules\n\n` +
        `*Admin only:*\n` +
        `/setup — Bot setup guide\n` +
        `/settings — Bot configuration\n` +
        `/announce — Send announcement\n` +
        `/post — Create DAWEN Pulse post`,
        "MarkdownV2"
      );
      return new Response("ok", { status: 200 });
    }

    // ── /links — free command ────────────────────────────────────────────────
    if (text === "/links" || text.split("@")[0] === "/links") {
      const linksText = typeof botSettings.links_message === "string" && botSettings.links_message.trim()
        ? botSettings.links_message.trim()
        : `Official DAWEN Links:\n\nApp: ${DAWEN_APP}\nX/Twitter: ${DAWEN_X}\nTelegram: ${DAWEN_TG}\nDiscord: ${DAWEN_DISCORD}`;
      await sendMessage(botToken, chatId, linksText);
      return new Response("ok", { status: 200 });
    }

    // ── /app — free command ──────────────────────────────────────────────────
    if (text === "/app" || text.split("@")[0] === "/app") {
      await sendMessage(botToken, chatId, `DAWEN App: ${DAWEN_APP}`);
      return new Response("ok", { status: 200 });
    }

    // ── /rewards — free command ──────────────────────────────────────────────
    if (text === "/rewards" || text.split("@")[0] === "/rewards") {
      const rewardsText = typeof botSettings.rewards_message === "string" && botSettings.rewards_message.trim()
        ? botSettings.rewards_message.trim()
        : `DAWEN Rewards — $DAWORLD\n\n` +
          `$DAWORLD is the in-app utility token for Dawen World rewards, gaming features, and the future shop/boutique.\n\n` +
          `$DAWORLD is NOT the official DAWEN token.\n\n` +
          `The official DAWEN token has not been revealed yet and will follow the roadmap.\n\n` +
          `Earn $DAWORLD by:\n• Completing games and challenges\n• Referral rewards\n• Community participation\n\n` +
          `More info: ${DAWEN_APP}`;
      await sendMessage(botToken, chatId, rewardsText);
      return new Response("ok", { status: 200 });
    }

    // ── /rules — free command ────────────────────────────────────────────────
    if (text === "/rules" || text.split("@")[0] === "/rules") {
      const rulesText = typeof botSettings.rules_message === "string" && botSettings.rules_message.trim()
        ? botSettings.rules_message.trim()
        : await getGroupBotCommandResponse(supabase, dawenGroupId, "rules") ??
          `DAWEN Community Rules:\n\n• Be respectful to all members\n• No spam or self-promotion\n• No price manipulation or misleading information\n• No NSFW content\n• Follow Telegram's Terms of Service\n\nViolations may result in removal.`;
      await sendMessage(botToken, chatId, rulesText);
      return new Response("ok", { status: 200 });
    }

    // ── /setup — free command (admin info) ───────────────────────────────────
    if (text === "/setup" || text.split("@")[0] === "/setup") {
      await sendMessage(botToken, chatId,
        `DAWEN Bot Setup\n\n` +
        `1. Add this bot to your Telegram group as admin\n` +
        `2. Open DAWEN app\n` +
        `3. Go to Group Settings → Bots → Telegram Bot\n` +
        `4. Configure welcome message, rules, and moderation settings\n\n` +
        `DAWEN app: ${DAWEN_APP}`
      );
      return new Response("ok", { status: 200 });
    }

    // ── Commands beyond this point require a linked account ──────────────────
    const { data: linkedUser } = await supabase
      .from("telegram_linked_users")
      .select("dawen_user_id, telegram_first_name, status")
      .eq("telegram_user_id", fromId)
      .eq("status", "active")
      .maybeSingle();

    if (!linkedUser) {
      // Only send the "not linked" warning with a cooldown, never for every message
      await sendMessageWithCooldown(
        supabase, botToken, chatId,
        fromId, chatId,
        "not_linked_warning",
        COOLDOWN_NOT_LINKED_SEC,
        `Your Telegram account is not linked to DAWEN yet.\n\n` +
        `To link it:\n` +
        `1. Open the DAWEN app\n` +
        `2. Go to Group Settings → Bots → Telegram Bot\n` +
        `3. Tap Generate Link Code\n` +
        `4. Send /link DAWEN-XXXXXX here`
      );
      return new Response("ok", { status: 200 });
    }

    const dawenUserId = linkedUser.dawen_user_id;

    // ── /status ──────────────────────────────────────────────────────────────
    if (text === "/status" || text.split("@")[0] === "/status") {
      const name = linkedUser.telegram_first_name || "your account";
      await sendMessage(botToken, chatId,
        `Your Telegram account is linked to DAWEN.\n\nDAWEN profile: ${name}\nStatus: Active\n\nUse /unlink to disconnect.`
      );
      return new Response("ok", { status: 200 });
    }

    // ── /unlink ───────────────────────────────────────────────────────────────
    if (text === "/unlink" || text.split("@")[0] === "/unlink") {
      await supabase
        .from("telegram_linked_users")
        .update({ status: "unlinked", updated_at: new Date().toISOString() })
        .eq("telegram_user_id", fromId)
        .eq("dawen_user_id", dawenUserId);
      await sendMessage(botToken, chatId,
        "Your Telegram account has been unlinked from DAWEN.\n\nYou can re-link at any time using a new code."
      );
      return new Response("ok", { status: 200 });
    }

    // ── /connect / /groups ───────────────────────────────────────────────────
    if (text === "/connect" || text === "/groups" || text.split("@")[0] === "/connect") {
      const { data: groupRow } = await supabase
        .from("group_conversations")
        .select("name")
        .eq("id", dawenGroupId)
        .maybeSingle();
      await sendMessage(botToken, chatId,
        `Connected DAWEN Group: ${groupRow?.name || dawenGroupId}`
      );
      return new Response("ok", { status: 200 });
    }

    // ── /invite ───────────────────────────────────────────────────────────────
    if (text === "/invite" || text.split("@")[0] === "/invite") {
      const { data: invite } = await supabase
        .from("group_invites")
        .select("invite_code")
        .eq("group_id", dawenGroupId)
        .is("expires_at", null)
        .maybeSingle();
      if (invite?.invite_code) {
        await sendMessage(botToken, chatId,
          `DAWEN Group Invite:\nhttps://dawen.app/chat/group/invite/${invite.invite_code}`
        );
      } else {
        await sendMessage(botToken, chatId, "No invite link available. Create one in DAWEN group settings.");
      }
      return new Response("ok", { status: 200 });
    }

    // ── Admin check for privileged commands ──────────────────────────────────
    const { data: memberRow } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", dawenGroupId)
      .eq("user_id", dawenUserId)
      .is("removed_at", null)
      .maybeSingle();

    const { data: groupRow } = await supabase
      .from("group_conversations")
      .select("creator_id, name")
      .eq("id", dawenGroupId)
      .maybeSingle();

    const isCreator = groupRow?.creator_id === dawenUserId;
    const isAdmin = memberRow?.role === "admin" || memberRow?.role === "creator" || isCreator;

    // ── /settings (admin only) ────────────────────────────────────────────────
    if (text === "/settings" || text.split("@")[0] === "/settings") {
      if (!isAdmin) {
        await sendMessage(botToken, chatId, "Only group admins can access bot settings.");
        return new Response("ok", { status: 200 });
      }
      await sendMessage(botToken, chatId,
        `Bot Settings — ${groupRow?.name || "group"}\n\n` +
        `Manage bot settings in the DAWEN app:\n` +
        `Group Settings → Bots → Telegram Bot\n\n` +
        `Configure: welcome message, rules, rewards info, link requirement, and moderation.`
      );
      return new Response("ok", { status: 200 });
    }

    // ── /announce (admin only) ────────────────────────────────────────────────
    if (text === "/announce" || text.split("@")[0] === "/announce") {
      if (!isAdmin) {
        await sendMessage(botToken, chatId, "Only group admins can send announcements.");
        return new Response("ok", { status: 200 });
      }
      conversationState.set(stateKey, { step: "await_announce_text", groupId: dawenGroupId, dawnUserId: dawenUserId });
      await sendMessage(botToken, chatId, "Send the announcement message, or /cancel to abort.");
      return new Response("ok", { status: 200 });
    }

    // ── /post (admin only) ────────────────────────────────────────────────────
    if (text === "/post" || text.split("@")[0] === "/post") {
      if (!isAdmin) {
        await sendMessage(botToken, chatId, "Only group admins can publish posts via bot.");
        return new Response("ok", { status: 200 });
      }
      conversationState.set(stateKey, { step: "await_post_text", groupId: dawenGroupId, dawnUserId: dawenUserId });
      await sendMessage(botToken, chatId, "Send the post text, or /cancel to abort.");
      return new Response("ok", { status: 200 });
    }

    // ── /mute, /ban, /unban (admin only, stub for future) ────────────────────
    if (["/mute", "/ban", "/unban"].some(c => text === c || text.split("@")[0] === c)) {
      if (!isAdmin) {
        await sendMessage(botToken, chatId, "Only group admins can use moderation commands.");
        return new Response("ok", { status: 200 });
      }
      await sendMessage(botToken, chatId, "Moderation commands are coming soon.");
      return new Response("ok", { status: 200 });
    }

    // ── Conversation flow state machine ──────────────────────────────────────
    const state = conversationState.get(stateKey);

    if (state) {
      if (text === "/cancel") {
        conversationState.delete(stateKey);
        await sendMessage(botToken, chatId, "Cancelled.");
        return new Response("ok", { status: 200 });
      }

      if (state.step === "await_post_text") {
        conversationState.set(stateKey, { ...state, step: "await_post_media", postText: text });
        await sendMessage(botToken, chatId, "Add a media URL or token address, or /skip to continue without media.");
        return new Response("ok", { status: 200 });
      }

      if (state.step === "await_post_media") {
        const media = text === "/skip" ? undefined : text;
        conversationState.set(stateKey, { ...state, step: "confirm_post", postMedia: media });
        await sendMessage(botToken, chatId,
          `Preview:\n\n${state.postText}${media ? `\n\nMedia: ${media}` : ""}\n\nSend /publish to post or /cancel to cancel.`
        );
        return new Response("ok", { status: 200 });
      }

      if (state.step === "confirm_post" && text === "/publish") {
        const media = state.postMedia;
        const isTokenAddr = media && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(media);
        const { error: postErr } = await supabase.from("posts").insert({
          author_id: dawenUserId,
          content: state.postText,
          token_address: isTokenAddr ? media : null,
          image_url: (!isTokenAddr && media) ? media : null,
        });
        conversationState.delete(stateKey);
        await sendMessage(botToken, chatId,
          postErr ? "Failed to publish post. Please try again." : `Post published!\n\nView it at: ${DAWEN_APP}`
        );
        return new Response("ok", { status: 200 });
      }

      if (state.step === "await_announce_text") {
        conversationState.set(stateKey, { ...state, step: "confirm_announce", announceText: text });
        await sendMessage(botToken, chatId,
          `Preview:\n\n${text}\n\nSend /send to post to the DAWEN group or /cancel to cancel.`
        );
        return new Response("ok", { status: 200 });
      }

      if (state.step === "confirm_announce" && text === "/send") {
        const { data: defaultTopic } = await supabase
          .from("group_topics")
          .select("id")
          .eq("group_id", dawenGroupId)
          .eq("is_default", true)
          .maybeSingle();

        await supabase.from("group_messages").insert({
          group_id: dawenGroupId,
          sender_id: dawenUserId,
          content: state.announceText,
          topic_id: defaultTopic?.id || null,
          is_bot_message: true,
          bot_name: botRecord.bot_name,
          bot_username: botRecord.bot_username,
        });
        conversationState.delete(stateKey);
        await sendMessage(botToken, chatId,
          `Announcement sent to "${groupRow?.name || "the group"}"!`
        );
        return new Response("ok", { status: 200 });
      }

      if (state.step === "confirm_post" || state.step === "confirm_announce") {
        const hint = state.step === "confirm_post"
          ? "Send /publish to confirm or /cancel to cancel."
          : "Send /send to confirm or /cancel to cancel.";
        await sendMessage(botToken, chatId, hint);
        return new Response("ok", { status: 200 });
      }
    }

    // ── Unknown command — only reply in private chats to reduce group noise ───
    if (isPrivate && text.startsWith("/")) {
      await sendMessage(botToken, chatId, "Unknown command. Type /help to see available commands.");
    }

    return new Response("ok", { status: 200 });

  } catch (err: any) {
    console.error("[telegram-webhook] error:", err);
    return new Response("ok", { status: 200 });
  }
});

// ── /link command handler ─────────────────────────────────────────────────────

async function handleLinkCommand(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  chatId: number,
  fromId: number,
  fromUser: any,
  code: string,
): Promise<void> {
  if (!code || !code.startsWith("DAWEN-")) {
    await sendMessage(botToken, chatId,
      "Invalid code format. Codes look like DAWEN-XXXXXX.\n\n" +
      "Generate a new code in the DAWEN app under Group Settings → Bots → Telegram Bot."
    );
    return;
  }

  const now = new Date().toISOString();

  // Check if already linked
  const { data: existingLink } = await supabase
    .from("telegram_linked_users")
    .select("id, status")
    .eq("telegram_user_id", fromId)
    .eq("status", "active")
    .maybeSingle();

  if (existingLink) {
    await sendMessage(botToken, chatId, "Your Telegram account is already linked to DAWEN.");
    return;
  }

  // Validate link code
  const { data: linkCode } = await supabase
    .from("telegram_link_codes")
    .select("id, user_id, expires_at, used_at")
    .eq("code", code)
    .maybeSingle();

  if (!linkCode) {
    await sendMessage(botToken, chatId,
      "Invalid or expired code. Generate a new one in the DAWEN app."
    );
    return;
  }
  if (linkCode.used_at) {
    await sendMessage(botToken, chatId,
      "This link code has already been used. Generate a new one in the DAWEN app."
    );
    return;
  }
  if (new Date(linkCode.expires_at) < new Date(now)) {
    await sendMessage(botToken, chatId,
      "This code has expired. Generate a new one in the DAWEN app."
    );
    return;
  }

  // Link the account (upsert so re-linking after unlink works)
  await supabase.from("telegram_linked_users").upsert({
    telegram_user_id: fromId,
    dawen_user_id: linkCode.user_id,
    telegram_username: fromUser?.username ?? null,
    telegram_first_name: fromUser?.first_name ?? null,
    status: "active",
    updated_at: now,
  }, { onConflict: "telegram_user_id,dawen_user_id" });

  // Mark code as used
  await supabase
    .from("telegram_link_codes")
    .update({ used_at: now })
    .eq("id", linkCode.id);

  const firstName = fromUser?.first_name || "there";
  await sendMessage(botToken, chatId,
    `Telegram linked successfully to your DAWEN account.\n\nWelcome, ${firstName}!\n\nType /help to see what I can do.`
  );
}

// ── Cooldown-protected message sender ────────────────────────────────────────

async function sendMessageWithCooldown(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  chatId: number,
  telegramUserId: number,
  cooldownChatId: number,
  cooldownType: string,
  cooldownSeconds: number,
  text: string,
): Promise<void> {
  // Check if cooldown has expired
  const { data: cooldown } = await supabase
    .from("telegram_bot_cooldowns")
    .select("last_sent_at")
    .eq("telegram_user_id", telegramUserId)
    .eq("chat_id", cooldownChatId)
    .eq("cooldown_type", cooldownType)
    .maybeSingle();

  if (cooldown?.last_sent_at) {
    const elapsed = (Date.now() - new Date(cooldown.last_sent_at).getTime()) / 1000;
    if (elapsed < cooldownSeconds) {
      return; // Cooldown active — stay quiet
    }
  }

  // Send the message
  await sendMessage(botToken, chatId, text);

  // Record cooldown
  await supabase.from("telegram_bot_cooldowns").upsert({
    telegram_user_id: telegramUserId,
    chat_id: cooldownChatId,
    cooldown_type: cooldownType,
    last_sent_at: new Date().toISOString(),
  }, { onConflict: "telegram_user_id,chat_id,cooldown_type" });
}

// ── Read custom command response from DB ──────────────────────────────────────

async function getGroupBotCommandResponse(
  supabase: ReturnType<typeof createClient>,
  groupId: string,
  command: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("group_bot_commands")
    .select("response_text, enabled")
    .eq("group_id", groupId)
    .eq("command", command)
    .eq("enabled", true)
    .maybeSingle();
  return data?.response_text ?? null;
}

// ── Send Telegram message ──────────────────────────────────────────────────────

async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  parseMode?: string,
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((e) => console.error("[sendMessage] error:", e));
}
