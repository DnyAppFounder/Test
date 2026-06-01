import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DAWEN_APP     = "https://dawen.app/";
const DAWEN_X       = "https://x.com/willoffd_";
const DAWEN_TG      = "https://t.me/WillOfDCrew";
const DAWEN_DISCORD = "https://discord.gg/AvNV9mDy3";

const COOLDOWN_NOT_LINKED_SEC = 10 * 60;
const COOLDOWN_SETUP_SEC      = 60 * 60;

// ── Conversation state ────────────────────────────────────────────────────────
// Supports multi-step /post and /announce with destination selection.
// States:
//   await_announce_text -> select_announce_dest -> confirm_announce
//   await_post_text -> await_post_media -> select_post_dest -> confirm_post

type ConvStep =
  | "await_post_text"
  | "await_post_media"
  | "select_post_dest"
  | "confirm_post"
  | "await_announce_text"
  | "select_announce_dest"
  | "confirm_announce";

interface ConvState {
  step: ConvStep;
  postText?: string;
  postMedia?: string;
  announceText?: string;
  groupId: string;
  dawenUserId: string;
  // destination list presented to user: array of { label, type, id }
  destinations?: Array<{ label: string; type: "dawen_group" | "dawen_pulse" | "telegram_target"; id: string }>;
  selectedDest?: number; // 1-based index
}

const conversationState = new Map<string, ConvState>();

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

      if (
        chat &&
        (chat.type === "group" || chat.type === "supergroup") &&
        (oldStatus === "left" || oldStatus === "kicked") &&
        (newStatus === "member" || newStatus === "administrator")
      ) {
        const isAdmin = newStatus === "administrator";
        const welcomeEnabled = botSettings.welcome_enabled !== false;

        if (welcomeEnabled) {
          const welcomeMsg = typeof botSettings.welcome_message === "string" && botSettings.welcome_message.trim()
            ? botSettings.welcome_message.trim()
            : `DAWEN Bot is now active in this group.\n\nUse /help to see available commands.\nAdmins can manage bot settings inside the DAWEN app.` +
              (!isAdmin ? `\n\nPlease make me admin to enable moderation features.` : "");
          await sendMessage(botToken, chat.id, welcomeMsg);
        } else if (!isAdmin) {
          await sendMessageWithCooldown(
            supabase, botToken, chat.id,
            myChatMember.from?.id ?? 0, chat.id,
            "setup_warning",
            COOLDOWN_SETUP_SEC,
            "Please make me admin to enable moderation features."
          );
        }
      }
      return new Response("ok", { status: 200 });
    }

    const message = update.message;
    if (!message) {
      return new Response("ok", { status: 200 });
    }

    const chatId: number = message.chat?.id;
    const fromId: number = message.from?.id;
    const text: string = (message.text || "").trim();
    const isPrivate = message.chat?.type === "private";
    const isGroup = message.chat?.type === "group" || message.chat?.type === "supergroup";

    if (isGroup && !text.startsWith("/")) {
      return new Response("ok", { status: 200 });
    }

    const stateKey = `${chatId}:${fromId}`;
    const cmd = text.split(" ")[0].split("@")[0].toLowerCase();

    // ── /link CODE ────────────────────────────────────────────────────────────
    if (cmd === "/link") {
      const code = text.slice(text.indexOf(" ") + 1).trim().toUpperCase();
      if (!code || code === "/LINK") {
        await sendMessage(botToken, chatId,
          "Please provide a link code.\n\nUsage: /link DAWEN-XXXXXX\n\nGenerate a code in the DAWEN app under Group Settings \u2192 Bots \u2192 Telegram Bot."
        );
        return new Response("ok", { status: 200 });
      }
      await handleLinkCommand(supabase, botToken, chatId, fromId, message.from, code, dawenGroupId);
      return new Response("ok", { status: 200 });
    }

    // ── /start ────────────────────────────────────────────────────────────────
    if (cmd === "/start") {
      const linkSection = isPrivate
        ? `\n\nTo link your Telegram account:\n1. Open the DAWEN app\n2. Go to Group Settings \u2192 Bots \u2192 Telegram Bot\n3. Tap <b>Generate Link Code</b>\n4. Send <code>/link DAWEN-XXXXXX</code> here`
        : `\n\nType /help to see available commands.`;
      await sendMessage(botToken, chatId,
        `Welcome to <b>DAWEN Bot</b>!\n\nDAWEN is a Solana beta app \u2014 trade, post, play, and earn on the Solana network.${linkSection}`,
        "HTML"
      );
      return new Response("ok", { status: 200 });
    }

    // ── /help ─────────────────────────────────────────────────────────────────
    if (cmd === "/help") {
      await sendMessage(botToken, chatId,
        `<b>DAWEN Bot Commands</b>\n\n` +
        `/start \u2014 Welcome message\n` +
        `/help \u2014 Show this help\n` +
        `/link CODE \u2014 Link your Telegram to DAWEN\n` +
        `/status \u2014 Check your link status\n` +
        `/unlink \u2014 Unlink your account\n` +
        `/links \u2014 Official DAWEN links\n` +
        `/app \u2014 Get the app URL\n` +
        `/rewards \u2014 $DAWORLD rewards info\n` +
        `/rules \u2014 Community rules\n\n` +
        `<b>Admin only:</b>\n` +
        `/setup \u2014 Bot setup guide\n` +
        `/settings \u2014 Bot configuration\n` +
        `/announce \u2014 Post announcement to a destination\n` +
        `/post \u2014 Publish to DAWEN Pulse`,
        "HTML"
      );
      return new Response("ok", { status: 200 });
    }

    // ── /links ────────────────────────────────────────────────────────────────
    if (cmd === "/links") {
      const linksText = typeof botSettings.links_message === "string" && botSettings.links_message.trim()
        ? botSettings.links_message.trim()
        : `Official DAWEN Links:\n\nApp: ${DAWEN_APP}\nX/Twitter: ${DAWEN_X}\nTelegram: ${DAWEN_TG}\nDiscord: ${DAWEN_DISCORD}`;
      await sendMessage(botToken, chatId, linksText);
      return new Response("ok", { status: 200 });
    }

    // ── /app ──────────────────────────────────────────────────────────────────
    if (cmd === "/app") {
      await sendMessage(botToken, chatId, `DAWEN App: ${DAWEN_APP}`);
      return new Response("ok", { status: 200 });
    }

    // ── /rewards ──────────────────────────────────────────────────────────────
    if (cmd === "/rewards") {
      const rewardsText = typeof botSettings.rewards_message === "string" && botSettings.rewards_message.trim()
        ? botSettings.rewards_message.trim()
        : `DAWEN Rewards \u2014 $DAWORLD\n\n` +
          `$DAWORLD is the in-app utility token for Dawen World rewards, gaming, and the future shop.\n\n` +
          `$DAWORLD is NOT the official DAWEN token. The official DAWEN token has not been revealed yet.\n\n` +
          `Earn $DAWORLD by:\n- Completing games and challenges\n- Referral rewards\n- Community participation\n\n` +
          `More info: ${DAWEN_APP}`;
      await sendMessage(botToken, chatId, rewardsText);
      return new Response("ok", { status: 200 });
    }

    // ── /rules ────────────────────────────────────────────────────────────────
    if (cmd === "/rules") {
      const rulesText = typeof botSettings.rules_message === "string" && botSettings.rules_message.trim()
        ? botSettings.rules_message.trim()
        : `DAWEN Community Rules:\n\n- Be respectful to all members\n- No spam or self-promotion\n- No price manipulation or misleading information\n- No NSFW content\n- Follow Telegram's Terms of Service\n\nViolations may result in removal.`;
      await sendMessage(botToken, chatId, rulesText);
      return new Response("ok", { status: 200 });
    }

    // ── /setup ────────────────────────────────────────────────────────────────
    if (cmd === "/setup") {
      await sendMessage(botToken, chatId,
        `DAWEN Bot Setup\n\n` +
        `1. Add this bot to your Telegram group as admin\n` +
        `2. Open DAWEN app\n` +
        `3. Go to Group Settings \u2192 Bots \u2192 Telegram Bot\n` +
        `4. Configure welcome message, rules, and moderation settings\n\n` +
        `DAWEN app: ${DAWEN_APP}`
      );
      return new Response("ok", { status: 200 });
    }

    // ── Commands beyond this point require a linked account ───────────────────
    const { data: linkedUser } = await supabase
      .from("telegram_linked_users")
      .select("dawen_user_id, telegram_first_name, status")
      .eq("telegram_user_id", fromId)
      .eq("status", "active")
      .maybeSingle();

    if (!linkedUser) {
      await sendMessageWithCooldown(
        supabase, botToken, chatId,
        fromId, chatId,
        "not_linked_warning",
        COOLDOWN_NOT_LINKED_SEC,
        `Your Telegram account is not linked to DAWEN yet.\n\n` +
        `To link it:\n` +
        `1. Open the DAWEN app\n` +
        `2. Go to Group Settings \u2192 Bots \u2192 Telegram Bot\n` +
        `3. Tap Generate Link Code\n` +
        `4. Send /link DAWEN-XXXXXX here`
      );
      return new Response("ok", { status: 200 });
    }

    const dawenUserId = linkedUser.dawen_user_id;

    // ── /status ───────────────────────────────────────────────────────────────
    if (cmd === "/status") {
      const name = linkedUser.telegram_first_name || "your account";
      await sendMessage(botToken, chatId,
        `Your Telegram account is linked to DAWEN.\n\nDAWEN profile: ${name}\nStatus: Active\n\nUse /unlink to disconnect.`
      );
      return new Response("ok", { status: 200 });
    }

    // ── /unlink ───────────────────────────────────────────────────────────────
    if (cmd === "/unlink") {
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

    // ── /connect / /groups ────────────────────────────────────────────────────
    if (cmd === "/connect" || cmd === "/groups") {
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
    if (cmd === "/invite") {
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

    // ── Admin check for privileged commands ───────────────────────────────────
    const [{ data: memberRow }, { data: groupRow }] = await Promise.all([
      supabase
        .from("group_members")
        .select("role")
        .eq("group_id", dawenGroupId)
        .eq("user_id", dawenUserId)
        .is("removed_at", null)
        .maybeSingle(),
      supabase
        .from("group_conversations")
        .select("creator_id, name")
        .eq("id", dawenGroupId)
        .maybeSingle(),
    ]);

    const isCreator = groupRow?.creator_id === dawenUserId;
    const isAdmin = memberRow?.role === "admin" || memberRow?.role === "creator" || isCreator;

    // ── /settings ────────────────────────────────────────────────────────────
    if (cmd === "/settings") {
      if (!isAdmin) {
        await sendMessage(botToken, chatId, "Only group admins can access bot settings.");
        return new Response("ok", { status: 200 });
      }
      await sendMessage(botToken, chatId,
        `Bot Settings \u2014 ${groupRow?.name || "group"}\n\n` +
        `Manage bot settings in the DAWEN app:\n` +
        `Group Settings \u2192 Bots \u2192 Telegram Bot\n\n` +
        `Configure: welcome message, rules, rewards info, link requirement, and moderation.`
      );
      return new Response("ok", { status: 200 });
    }

    // ── /mute, /ban, /unban ───────────────────────────────────────────────────
    if (cmd === "/mute" || cmd === "/ban" || cmd === "/unban") {
      if (!isAdmin) {
        await sendMessage(botToken, chatId, "Only group admins can use moderation commands.");
        return new Response("ok", { status: 200 });
      }
      await sendMessage(botToken, chatId, "Moderation commands are coming soon.");
      return new Response("ok", { status: 200 });
    }

    // ── /cancel ───────────────────────────────────────────────────────────────
    if (cmd === "/cancel") {
      if (conversationState.has(stateKey)) {
        conversationState.delete(stateKey);
        await sendMessage(botToken, chatId, "Cancelled.");
      }
      return new Response("ok", { status: 200 });
    }

    // ── /announce (admin only) ────────────────────────────────────────────────
    if (cmd === "/announce") {
      if (!isAdmin) {
        await sendMessage(botToken, chatId, "Only group admins can send announcements.");
        return new Response("ok", { status: 200 });
      }
      conversationState.set(stateKey, {
        step: "await_announce_text",
        groupId: dawenGroupId,
        dawenUserId,
      });
      await sendMessage(botToken, chatId,
        "Send your announcement text.\n\n/cancel to abort."
      );
      return new Response("ok", { status: 200 });
    }

    // ── /post (admin only) ────────────────────────────────────────────────────
    if (cmd === "/post") {
      if (!isAdmin) {
        await sendMessage(botToken, chatId, "Only group admins can publish posts via bot.");
        return new Response("ok", { status: 200 });
      }
      conversationState.set(stateKey, {
        step: "await_post_text",
        groupId: dawenGroupId,
        dawenUserId,
      });
      await sendMessage(botToken, chatId,
        "Send the post text.\n\n/cancel to abort."
      );
      return new Response("ok", { status: 200 });
    }

    // ── Conversation flow state machine ───────────────────────────────────────
    const state = conversationState.get(stateKey);

    if (state) {
      // ── await_post_text ───────────────────────────────────────────────────
      if (state.step === "await_post_text") {
        if (text.startsWith("/")) {
          await sendMessage(botToken, chatId, "Please send the post text, or /cancel to abort.");
          return new Response("ok", { status: 200 });
        }
        conversationState.set(stateKey, { ...state, step: "await_post_media", postText: text });
        await sendMessage(botToken, chatId,
          "Add a media URL or token address, or /skip to continue without media."
        );
        return new Response("ok", { status: 200 });
      }

      // ── await_post_media ──────────────────────────────────────────────────
      if (state.step === "await_post_media") {
        const media = cmd === "/skip" ? undefined : text;
        // Build destination list
        const dests = await buildDestinations(supabase, botRecord.id, dawenGroupId, groupRow?.name);
        conversationState.set(stateKey, { ...state, step: "select_post_dest", postMedia: media, destinations: dests });
        await sendMessage(botToken, chatId, buildDestinationPrompt(dests, "post"));
        return new Response("ok", { status: 200 });
      }

      // ── select_post_dest ──────────────────────────────────────────────────
      if (state.step === "select_post_dest") {
        const num = parseInt(text);
        const dests = state.destinations ?? [];
        if (isNaN(num) || num < 1 || num > dests.length) {
          await sendMessage(botToken, chatId,
            `Please reply with a number between 1 and ${dests.length}, or /cancel.`
          );
          return new Response("ok", { status: 200 });
        }
        const dest = dests[num - 1];
        const preview = state.postText ?? "";
        const mediaPreview = state.postMedia ? `\n\nMedia: ${state.postMedia}` : "";
        conversationState.set(stateKey, { ...state, step: "confirm_post", selectedDest: num });
        await sendMessage(botToken, chatId,
          `Preview:\n\n${preview}${mediaPreview}\n\nDestination: ${dest.label}\n\nSend /publish to confirm or /cancel to abort.`
        );
        return new Response("ok", { status: 200 });
      }

      // ── confirm_post ──────────────────────────────────────────────────────
      if (state.step === "confirm_post") {
        if (cmd !== "/publish") {
          await sendMessage(botToken, chatId, "Send /publish to confirm or /cancel to abort.");
          return new Response("ok", { status: 200 });
        }
        const dest = (state.destinations ?? [])[( state.selectedDest ?? 1) - 1];
        await executePost(supabase, state, dest, botRecord);
        conversationState.delete(stateKey);
        await sendMessage(botToken, chatId,
          `Post published to ${dest?.label ?? "the destination"}!`
        );
        return new Response("ok", { status: 200 });
      }

      // ── await_announce_text ───────────────────────────────────────────────
      if (state.step === "await_announce_text") {
        if (text.startsWith("/")) {
          await sendMessage(botToken, chatId, "Please send the announcement text, or /cancel to abort.");
          return new Response("ok", { status: 200 });
        }
        // Build destination list
        const dests = await buildDestinations(supabase, botRecord.id, dawenGroupId, groupRow?.name);
        conversationState.set(stateKey, { ...state, step: "select_announce_dest", announceText: text, destinations: dests });
        await sendMessage(botToken, chatId, buildDestinationPrompt(dests, "announcement"));
        return new Response("ok", { status: 200 });
      }

      // ── select_announce_dest ──────────────────────────────────────────────
      if (state.step === "select_announce_dest") {
        const num = parseInt(text);
        const dests = state.destinations ?? [];
        if (isNaN(num) || num < 1 || num > dests.length) {
          await sendMessage(botToken, chatId,
            `Please reply with a number between 1 and ${dests.length}, or /cancel.`
          );
          return new Response("ok", { status: 200 });
        }
        const dest = dests[num - 1];
        conversationState.set(stateKey, { ...state, step: "confirm_announce", selectedDest: num });
        await sendMessage(botToken, chatId,
          `Preview:\n\n${state.announceText}\n\nDestination: ${dest.label}\n\nSend /send to confirm or /cancel to abort.`
        );
        return new Response("ok", { status: 200 });
      }

      // ── confirm_announce ──────────────────────────────────────────────────
      if (state.step === "confirm_announce") {
        if (cmd !== "/send") {
          await sendMessage(botToken, chatId, "Send /send to confirm or /cancel to abort.");
          return new Response("ok", { status: 200 });
        }
        const dest = (state.destinations ?? [])[(state.selectedDest ?? 1) - 1];
        await executeAnnounce(supabase, state, dest, botRecord, botToken);
        conversationState.delete(stateKey);
        await sendMessage(botToken, chatId,
          `Announcement sent to ${dest?.label ?? "the destination"}!`
        );
        return new Response("ok", { status: 200 });
      }
    }

    if (isPrivate && text.startsWith("/")) {
      await sendMessage(botToken, chatId, "Unknown command. Type /help to see available commands.");
    }

    return new Response("ok", { status: 200 });

  } catch (err: any) {
    console.error("[telegram-webhook] error:", err);
    return new Response("ok", { status: 200 });
  }
});

// ── Build destination list ────────────────────────────────────────────────────

async function buildDestinations(
  supabase: ReturnType<typeof createClient>,
  botRecordId: string,
  dawenGroupId: string,
  dawenGroupName?: string,
): Promise<ConvState["destinations"]> {
  const dests: ConvState["destinations"] = [];

  // 1. DAWEN group
  dests.push({
    type: "dawen_group",
    id: dawenGroupId,
    label: `DAWEN Group: ${dawenGroupName || dawenGroupId}`,
  });

  // 2. DAWEN Pulse
  dests.push({
    type: "dawen_pulse",
    id: "pulse",
    label: "DAWEN Pulse (public feed)",
  });

  // 3. Telegram targets linked to this bot
  const { data: targets } = await supabase
    .from("telegram_bot_targets")
    .select("id, chat_name, chat_type")
    .eq("bot_record_id", botRecordId)
    .eq("is_enabled", true)
    .order("created_at");

  for (const t of targets ?? []) {
    dests.push({
      type: "telegram_target",
      id: t.id,
      label: `Telegram: ${t.chat_name || t.id} (${t.chat_type})`,
    });
  }

  return dests;
}

function buildDestinationPrompt(
  dests: ConvState["destinations"],
  kind: "post" | "announcement",
): string {
  const lines = [`Where do you want to send this ${kind}?\n`];
  for (let i = 0; i < (dests?.length ?? 0); i++) {
    lines.push(`${i + 1}. ${dests![i].label}`);
  }
  lines.push("\nReply with a number, or /cancel.");
  return lines.join("\n");
}

// ── Execute post to selected destination ─────────────────────────────────────

async function executePost(
  supabase: ReturnType<typeof createClient>,
  state: ConvState,
  dest: ConvState["destinations"][0] | undefined,
  botRecord: any,
): Promise<void> {
  if (!dest) return;

  if (dest.type === "dawen_pulse") {
    const media = state.postMedia;
    const isTokenAddr = media && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(media);
    await supabase.from("posts").insert({
      author_id: state.dawenUserId,
      content: state.postText,
      token_address: isTokenAddr ? media : null,
      image_url: (!isTokenAddr && media) ? media : null,
    });
    return;
  }

  if (dest.type === "dawen_group") {
    const { data: defaultTopic } = await supabase
      .from("group_topics")
      .select("id")
      .eq("group_id", dest.id)
      .eq("is_default", true)
      .maybeSingle();
    await supabase.from("group_messages").insert({
      group_id: dest.id,
      sender_id: state.dawenUserId,
      content: state.postText,
      topic_id: defaultTopic?.id || null,
      is_bot_message: true,
      bot_name: botRecord.bot_name,
      bot_username: botRecord.bot_username,
    });
    return;
  }

  if (dest.type === "telegram_target") {
    // Look up the token and chat_id for this target
    const { data: target } = await supabase
      .from("telegram_bot_targets")
      .select("chat_id")
      .eq("id", dest.id)
      .maybeSingle();
    if (!target) return;

    const { data: tokenRow } = await supabase
      .from("group_telegram_bot_tokens")
      .select("token")
      .eq("bot_record_id", botRecord.id)
      .maybeSingle();
    if (!tokenRow?.token) return;

    await fetch(`https://api.telegram.org/bot${tokenRow.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: target.chat_id, text: state.postText }),
    }).catch(() => null);
  }
}

// ── Execute announce to selected destination ──────────────────────────────────

async function executeAnnounce(
  supabase: ReturnType<typeof createClient>,
  state: ConvState,
  dest: ConvState["destinations"][0] | undefined,
  botRecord: any,
  botToken: string,
): Promise<void> {
  if (!dest) return;

  if (dest.type === "dawen_group") {
    const { data: defaultTopic } = await supabase
      .from("group_topics")
      .select("id")
      .eq("group_id", dest.id)
      .eq("is_default", true)
      .maybeSingle();
    await supabase.from("group_messages").insert({
      group_id: dest.id,
      sender_id: state.dawenUserId,
      content: state.announceText,
      topic_id: defaultTopic?.id || null,
      is_bot_message: true,
      bot_name: botRecord.bot_name,
      bot_username: botRecord.bot_username,
    });
    return;
  }

  if (dest.type === "dawen_pulse") {
    await supabase.from("posts").insert({
      author_id: state.dawenUserId,
      content: state.announceText,
    });
    return;
  }

  if (dest.type === "telegram_target") {
    const { data: target } = await supabase
      .from("telegram_bot_targets")
      .select("chat_id")
      .eq("id", dest.id)
      .maybeSingle();
    if (!target) return;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: target.chat_id, text: state.announceText }),
    }).catch(() => null);
  }
}

// ── /link command handler ─────────────────────────────────────────────────────

async function handleLinkCommand(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  chatId: number,
  fromId: number,
  fromUser: any,
  code: string,
  dawenGroupId: string,
): Promise<void> {
  if (!code.startsWith("DAWEN-")) {
    await sendMessage(botToken, chatId,
      "Invalid code format. Codes look like DAWEN-XXXXXX.\n\n" +
      "Generate a new code in the DAWEN app under Group Settings \u2192 Bots \u2192 Telegram Bot."
    );
    return;
  }

  const { data: existingLink } = await supabase
    .from("telegram_linked_users")
    .select("id")
    .eq("telegram_user_id", fromId)
    .eq("status", "active")
    .maybeSingle();

  if (existingLink) {
    await sendMessage(botToken, chatId, "Your Telegram account is already linked to DAWEN.");
    return;
  }

  const now = new Date().toISOString();

  const { data: linkCode } = await supabase
    .from("telegram_link_codes")
    .select("id, user_id, group_id, expires_at, used_at")
    .eq("code", code)
    .maybeSingle();

  if (!linkCode) {
    await sendMessage(botToken, chatId, "Invalid or expired code. Generate a new one in the DAWEN app.");
    return;
  }
  if (linkCode.used_at) {
    await sendMessage(botToken, chatId, "This link code has already been used. Generate a new one in the DAWEN app.");
    return;
  }
  if (new Date(linkCode.expires_at) < new Date(now)) {
    await sendMessage(botToken, chatId, "This code has expired. Generate a new one in the DAWEN app.");
    return;
  }

  await supabase.from("telegram_linked_users").upsert({
    telegram_user_id: fromId,
    dawen_user_id: linkCode.user_id,
    telegram_username: fromUser?.username ?? null,
    telegram_first_name: fromUser?.first_name ?? null,
    group_id: linkCode.group_id ?? dawenGroupId ?? null,
    status: "active",
    updated_at: now,
  }, { onConflict: "telegram_user_id,dawen_user_id" });

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
  const { data: cooldown } = await supabase
    .from("telegram_bot_cooldowns")
    .select("last_sent_at")
    .eq("telegram_user_id", telegramUserId)
    .eq("chat_id", cooldownChatId)
    .eq("cooldown_type", cooldownType)
    .maybeSingle();

  if (cooldown?.last_sent_at) {
    const elapsed = (Date.now() - new Date(cooldown.last_sent_at).getTime()) / 1000;
    if (elapsed < cooldownSeconds) return;
  }

  await sendMessage(botToken, chatId, text);

  await supabase.from("telegram_bot_cooldowns").upsert({
    telegram_user_id: telegramUserId,
    chat_id: cooldownChatId,
    cooldown_type: cooldownType,
    last_sent_at: new Date().toISOString(),
  }, { onConflict: "telegram_user_id,chat_id,cooldown_type" });
}

// ── Send Telegram message ─────────────────────────────────────────────────────

async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  parseMode?: string,
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((e) => {
    console.error("[sendMessage] network error:", e);
    return null;
  });

  if (res && !res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error("[sendMessage] Telegram API error:", res.status, errBody);
  }
}
