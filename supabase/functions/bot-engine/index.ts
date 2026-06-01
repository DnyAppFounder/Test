import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Module name constants ─────────────────────────────────────────────────────
const MOD_GUARD    = "guard";
const MOD_SENTINEL = "sentinel";
const MOD_WELCOME  = "welcome";
const MOD_PULSE    = "pulse";
const MOD_ORACLE   = "oracle";
const MOD_RAID     = "raid";
const MOD_REWARD   = "reward";

function db() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const action = new URL(req.url).searchParams.get("action") || "process";
    const body = await req.json();
    const supabase = db();

    switch (action) {
      case "process":    return await handleProcess(supabase, body);
      case "create_bot": return await handleCreateBot(supabase, body);
      case "delete_bot": return await handleDeleteBot(supabase, body);
      case "update_bot": return await handleUpdateBot(supabase, body);
      case "save_module": return await handleSaveModule(supabase, body);
      case "get_bots":    return await handleGetBots(supabase, body);
      case "get_logs":    return await handleGetLogs(supabase, body);
      case "mod_action":  return await handleModerationAction(supabase, body);
      case "create_raid": return await handleCreateRaid(supabase, body);
      case "join_raid":   return await handleJoinRaid(supabase, body);
      case "verify_raid": return await handleVerifyRaid(supabase, body);
      case "get_raids":   return await handleGetRaids(supabase, body);
      case "link_x":      return await handleLinkX(supabase, body);
      case "unlink_x":    return await handleUnlinkX(supabase, body);
      default:            return json({ success: false, error: "Unknown action" }, 400);
    }
  } catch (err: any) {
    console.error("[bot-engine] error:", err);
    return json({ success: false, error: err?.message || "Internal error" }, 500);
  }
});

// ── Permission helpers ────────────────────────────────────────────────────────

async function getRole(
  supabase: ReturnType<typeof db>,
  groupId: string,
  userId: string,
): Promise<string | null> {
  const [{ data: gc }, { data: gm }] = await Promise.all([
    supabase.from("group_conversations").select("creator_id").eq("id", groupId).maybeSingle(),
    supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", userId).is("removed_at", null).maybeSingle(),
  ]);
  if (gc?.creator_id === userId) return "creator";
  return gm?.role ?? null;
}

function isAdminRole(role: string | null): boolean {
  return role === "creator" || role === "admin";
}
function isModRole(role: string | null): boolean {
  return role === "creator" || role === "admin" || role === "moderator";
}

// ── process: handle a group message and run matching bot commands ─────────────

async function handleProcess(supabase: ReturnType<typeof db>, body: any) {
  const { group_id, message_id, content, sender_id } = body;
  if (!group_id || !content || !sender_id) {
    return json({ success: true, handled: false });
  }

  const text = (content as string).trim();
  if (!text) return json({ success: true, handled: false });

  // Load active bots for this group
  const { data: bots } = await supabase
    .from("dawen_bots")
    .select("id, bot_name, bot_avatar_url, command_prefix, bot_type, is_enabled")
    .eq("group_id", group_id)
    .eq("is_enabled", true);

  if (!bots?.length) return json({ success: true, handled: false });

  const role = await getRole(supabase, group_id, sender_id);

  // Load sender profile for context
  const { data: senderProfile } = await supabase
    .from("user_profiles")
    .select("username, avatar_url")
    .eq("id", sender_id)
    .maybeSingle();

  const responses: Array<{ bot: any; text: string }> = [];

  for (const bot of bots) {
    if (!text.startsWith(bot.command_prefix)) continue;

    // Extract command name
    const rawCmd = text.slice(bot.command_prefix.length).split(/\s+/)[0].toLowerCase();
    const args = text.slice(bot.command_prefix.length + rawCmd.length).trim();

    // Find matching command
    const { data: cmd } = await supabase
      .from("dawen_bot_cmds")
      .select("id, command, response_text, is_builtin, is_enabled, allowed_roles, cooldown_seconds, module_name, response_card")
      .eq("bot_id", bot.id)
      .eq("command", rawCmd)
      .eq("is_enabled", true)
      .maybeSingle();

    if (!cmd) {
      // Check built-in commands that the bot type handles
      const builtinResponse = await handleBuiltinCommand(
        supabase, bot, rawCmd, args, group_id, sender_id, role, senderProfile
      );
      if (builtinResponse) {
        responses.push({ bot, text: builtinResponse });
      }
      continue;
    }

    // Check role permission
    if (cmd.allowed_roles?.length > 0 && !cmd.allowed_roles.includes(role)) {
      responses.push({ bot, text: "You do not have permission to use this command." });
      continue;
    }

    // Check cooldown
    if (cmd.cooldown_seconds > 0) {
      const { data: cooldown } = await supabase
        .from("dawen_bot_cmd_cooldowns")
        .select("last_used")
        .eq("cmd_id", cmd.id)
        .eq("user_id", sender_id)
        .maybeSingle();

      if (cooldown?.last_used) {
        const elapsed = (Date.now() - new Date(cooldown.last_used).getTime()) / 1000;
        if (elapsed < cmd.cooldown_seconds) {
          const wait = Math.ceil(cmd.cooldown_seconds - elapsed);
          responses.push({ bot, text: `Command on cooldown. Wait ${wait}s.` });
          continue;
        }
      }

      await supabase.from("dawen_bot_cmd_cooldowns").upsert(
        { cmd_id: cmd.id, user_id: sender_id, last_used: new Date().toISOString() },
        { onConflict: "cmd_id,user_id" }
      );
    }

    // Log and respond
    await supabase.from("dawen_bot_logs").insert({
      bot_id: bot.id, group_id, action_type: "command",
      actor_id: sender_id, command: rawCmd,
      details: { content: text, module: cmd.module_name },
    });

    if (cmd.response_text) {
      responses.push({ bot, text: cmd.response_text });
    }
  }

  // Insert bot response messages
  const inserted: any[] = [];
  for (const { bot, text: responseText } of responses) {
    const { data: msg } = await supabase
      .from("group_messages")
      .insert({
        group_id,
        sender_id,
        content: responseText,
        is_bot_message: true,
        bot_name: bot.bot_name,
        bot_username: `dawen_${bot.bot_type}_bot`,
        bot_avatar_url: bot.bot_avatar_url || null,
      })
      .select()
      .single();
    if (msg) inserted.push(msg);
  }

  return json({ success: true, handled: responses.length > 0, responses: inserted });
}

// ── Built-in command handlers per module ──────────────────────────────────────

async function handleBuiltinCommand(
  supabase: ReturnType<typeof db>,
  bot: any,
  cmd: string,
  args: string,
  groupId: string,
  senderId: string,
  role: string | null,
  senderProfile: any,
): Promise<string | null> {
  // Load module configs for this bot
  const { data: modules } = await supabase
    .from("dawen_bot_modules")
    .select("module_name, is_enabled, config")
    .eq("bot_id", bot.id);

  const moduleMap: Record<string, any> = {};
  for (const m of modules ?? []) {
    moduleMap[m.module_name] = { enabled: m.is_enabled, config: m.config };
  }

  // Core commands always available
  switch (cmd) {
    case "help":
      return buildHelpText(bot, moduleMap);
    case "start":
      return `Welcome to ${bot.bot_name}! Type ${bot.command_prefix}help to see available commands.`;
    case "ping":
      return "Pong!";
  }

  // Oracle module
  if (moduleMap[MOD_ORACLE]?.enabled) {
    const oracleResponse = await handleOracleCommand(supabase, cmd, args, moduleMap[MOD_ORACLE].config);
    if (oracleResponse !== null) return oracleResponse;
  }

  // Reward module
  if (moduleMap[MOD_REWARD]?.enabled) {
    const rewardResponse = await handleRewardCommand(supabase, cmd, senderId, moduleMap[MOD_REWARD].config);
    if (rewardResponse !== null) return rewardResponse;
  }

  // Raid module
  if (moduleMap[MOD_RAID]?.enabled) {
    if (cmd === "raid") {
      const { data: activeRaids } = await supabase
        .from("raid_tasks")
        .select("id, title, target_url, required_actions, participant_count, ends_at")
        .eq("group_id", groupId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(3);

      if (!activeRaids?.length) return "No active raid tasks at the moment.";
      const lines = ["Active Raids:", ""];
      for (const r of activeRaids) {
        lines.push(`• ${r.title}`);
        lines.push(`  ${r.target_url}`);
        lines.push(`  Actions: ${r.required_actions.join(", ")}`);
        lines.push(`  Participants: ${r.participant_count}`);
        lines.push("");
      }
      return lines.join("\n");
    }
  }

  // Sentinel module — moderation commands
  if (moduleMap[MOD_SENTINEL]?.enabled) {
    const sentinelResponse = await handleSentinelCommand(
      supabase, cmd, args, groupId, senderId, role, moduleMap[MOD_SENTINEL].config
    );
    if (sentinelResponse !== null) return sentinelResponse;
  }

  // Welcome module
  if (moduleMap[MOD_WELCOME]?.enabled) {
    if (cmd === "rules") {
      const rules = moduleMap[MOD_WELCOME].config?.rules_text;
      return rules?.trim() ? rules : "No rules have been set. Please ask an admin.";
    }
    if (cmd === "links") {
      const links = moduleMap[MOD_WELCOME].config?.links_text;
      return links?.trim() ? links : "No links have been set. Please ask an admin.";
    }
  }

  return null;
}

function buildHelpText(bot: any, moduleMap: Record<string, any>): string {
  const lines = [`${bot.bot_name} — Commands (prefix: ${bot.command_prefix})`, ""];
  lines.push(`${bot.command_prefix}help — Show this help`);
  lines.push(`${bot.command_prefix}start — Welcome message`);
  lines.push(`${bot.command_prefix}ping — Check bot is alive`);

  if (moduleMap[MOD_WELCOME]?.enabled) {
    lines.push(`${bot.command_prefix}rules — Community rules`);
    lines.push(`${bot.command_prefix}links — Official links`);
  }
  if (moduleMap[MOD_ORACLE]?.enabled) {
    lines.push(`${bot.command_prefix}price TOKEN — Token price`);
    lines.push(`${bot.command_prefix}mcap TOKEN — Market cap`);
    lines.push(`${bot.command_prefix}volume TOKEN — 24h volume`);
    lines.push(`${bot.command_prefix}tokeninfo TOKEN — Token details`);
  }
  if (moduleMap[MOD_REWARD]?.enabled) {
    lines.push(`${bot.command_prefix}rank — Your rank`);
    lines.push(`${bot.command_prefix}points — Your $DAWORLD balance`);
    lines.push(`${bot.command_prefix}referral — Your referral code`);
  }
  if (moduleMap[MOD_RAID]?.enabled) {
    lines.push(`${bot.command_prefix}raid — View active raids`);
  }
  if (moduleMap[MOD_SENTINEL]?.enabled) {
    lines.push(`${bot.command_prefix}warn @user reason — Warn a user (admin/mod)`);
    lines.push(`${bot.command_prefix}mute @user — Mute a user (admin/mod)`);
    lines.push(`${bot.command_prefix}kick @user — Kick a user (admin/mod)`);
    lines.push(`${bot.command_prefix}ban @user — Ban a user (admin)`);
    lines.push(`${bot.command_prefix}warnings @user — View warnings (admin/mod)`);
  }
  return lines.join("\n");
}

async function handleOracleCommand(
  supabase: ReturnType<typeof db>,
  cmd: string,
  args: string,
  _config: any,
): Promise<string | null> {
  const oracleCmds = ["price", "mcap", "volume", "tokeninfo", "chart", "holders", "contract"];
  if (!oracleCmds.includes(cmd)) return null;

  const ticker = args.trim().toUpperCase();
  if (!ticker) return `Usage: /price TOKEN — e.g. /price SOL`;

  // Query from solana_token_registry if available
  const { data: token } = await supabase
    .from("solana_token_registry")
    .select("symbol, name, mint_address")
    .or(`symbol.ilike.${ticker},mint_address.eq.${ticker}`)
    .maybeSingle();

  if (!token) {
    return `No data found for ${ticker}. Make sure the token is listed on DAWEN.`;
  }

  switch (cmd) {
    case "tokeninfo":
    case "contract":
      return [
        `Token: ${token.name} (${token.symbol})`,
        `Contract: ${token.mint_address}`,
        `View on DAWEN: https://dawen.app`,
      ].join("\n");
    default:
      return [
        `${token.name} (${token.symbol})`,
        `Contract: ${token.mint_address}`,
        `View on DAWEN for live price, mcap, and chart.`,
      ].join("\n");
  }
}

async function handleRewardCommand(
  supabase: ReturnType<typeof db>,
  cmd: string,
  senderId: string,
  _config: any,
): Promise<string | null> {
  const rewardCmds = ["rank", "points", "referral", "claim", "rewards"];
  if (!rewardCmds.includes(cmd)) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("username, dawen_score, referral_code")
    .eq("id", senderId)
    .maybeSingle();

  if (!profile) return "Profile not found.";

  switch (cmd) {
    case "rank":
    case "points":
      return [
        `$DAWORLD Balance`,
        `User: ${profile.username || "Unknown"}`,
        `Score: ${profile.dawen_score ?? 0} $DAWORLD`,
        `Open DAWEN app to view full rewards.`,
      ].join("\n");
    case "referral":
      return profile.referral_code
        ? `Your referral code: ${profile.referral_code}\nShare it to earn $DAWORLD!`
        : "No referral code found. Check the DAWEN app.";
    case "claim":
    case "rewards":
      return "Open the DAWEN app to claim your $DAWORLD rewards.";
    default:
      return null;
  }
}

async function handleSentinelCommand(
  supabase: ReturnType<typeof db>,
  cmd: string,
  args: string,
  groupId: string,
  actorId: string,
  actorRole: string | null,
  _config: any,
): Promise<string | null> {
  const sentinelCmds = ["warn", "warnings", "mute", "unmute", "kick", "ban", "unban", "purge", "rules", "setrules"];
  if (!sentinelCmds.includes(cmd)) return null;

  // All sentinel commands require mod+
  if (!isModRole(actorRole)) {
    return "Only moderators and admins can use moderation commands.";
  }

  // Parse target username from args (e.g. "@username reason")
  const parts = args.trim().split(/\s+/);
  const rawTarget = parts[0]?.replace(/^@/, "").toLowerCase();
  const reason = parts.slice(1).join(" ") || "No reason given";

  switch (cmd) {
    case "warn": {
      if (!rawTarget) return "Usage: /warn @username reason";
      const { data: target } = await supabase
        .from("user_profiles")
        .select("id, username")
        .ilike("username", rawTarget)
        .maybeSingle();
      if (!target) return `User @${rawTarget} not found.`;

      if (!isAdminRole(actorRole) && actorRole !== "moderator") {
        return "Only moderators and admins can warn users.";
      }

      await supabase.from("dawen_moderation_cases").insert({
        group_id: groupId, target_id: target.id, actor_id: actorId,
        case_type: "warn", reason, is_active: true,
      });

      const { count } = await supabase
        .from("dawen_moderation_cases")
        .select("*", { count: "exact", head: true })
        .eq("group_id", groupId)
        .eq("target_id", target.id)
        .eq("case_type", "warn")
        .eq("is_active", true);

      return `Warning issued to @${target.username}. Reason: ${reason}\nTotal warnings: ${count ?? 1}`;
    }

    case "warnings": {
      if (!rawTarget) return "Usage: /warnings @username";
      const { data: target } = await supabase
        .from("user_profiles")
        .select("id, username")
        .ilike("username", rawTarget)
        .maybeSingle();
      if (!target) return `User @${rawTarget} not found.`;

      const { data: warns } = await supabase
        .from("dawen_moderation_cases")
        .select("reason, created_at")
        .eq("group_id", groupId)
        .eq("target_id", target.id)
        .eq("case_type", "warn")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!warns?.length) return `@${target.username} has no active warnings.`;
      const lines = [`Warnings for @${target.username}:`];
      warns.forEach((w, i) => lines.push(`${i + 1}. ${w.reason}`));
      return lines.join("\n");
    }

    case "mute": {
      if (!rawTarget) return "Usage: /mute @username [reason]";
      const { data: target } = await supabase
        .from("user_profiles")
        .select("id, username")
        .ilike("username", rawTarget)
        .maybeSingle();
      if (!target) return `User @${rawTarget} not found.`;

      const muteUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h default
      await supabase.from("dawen_moderation_cases").insert({
        group_id: groupId, target_id: target.id, actor_id: actorId,
        case_type: "mute", reason, mute_until: muteUntil, is_active: true,
      });
      return `@${target.username} has been muted for 1 hour. Reason: ${reason}`;
    }

    case "unmute": {
      if (!rawTarget) return "Usage: /unmute @username";
      const { data: target } = await supabase
        .from("user_profiles")
        .select("id, username")
        .ilike("username", rawTarget)
        .maybeSingle();
      if (!target) return `User @${rawTarget} not found.`;

      await supabase.from("dawen_moderation_cases")
        .update({ is_active: false })
        .eq("group_id", groupId)
        .eq("target_id", target.id)
        .eq("case_type", "mute")
        .eq("is_active", true);
      await supabase.from("dawen_moderation_cases").insert({
        group_id: groupId, target_id: target.id, actor_id: actorId,
        case_type: "unmute", reason, is_active: true,
      });
      return `@${target.username} has been unmuted.`;
    }

    case "kick": {
      if (!rawTarget) return "Usage: /kick @username [reason]";
      if (!isAdminRole(actorRole)) return "Only admins can kick users.";
      const { data: target } = await supabase
        .from("user_profiles")
        .select("id, username")
        .ilike("username", rawTarget)
        .maybeSingle();
      if (!target) return `User @${rawTarget} not found.`;

      await supabase.from("dawen_moderation_cases").insert({
        group_id: groupId, target_id: target.id, actor_id: actorId,
        case_type: "kick", reason, is_active: true,
      });
      // Remove from group
      await supabase.from("group_members")
        .update({ removed_at: new Date().toISOString() })
        .eq("group_id", groupId)
        .eq("user_id", target.id);
      return `@${target.username} has been kicked. Reason: ${reason}`;
    }

    case "ban": {
      if (!rawTarget) return "Usage: /ban @username [reason]";
      if (!isAdminRole(actorRole)) return "Only admins can ban users.";
      const { data: target } = await supabase
        .from("user_profiles")
        .select("id, username")
        .ilike("username", rawTarget)
        .maybeSingle();
      if (!target) return `User @${rawTarget} not found.`;

      await supabase.from("dawen_moderation_cases").insert({
        group_id: groupId, target_id: target.id, actor_id: actorId,
        case_type: "ban", reason, is_active: true,
      });
      await supabase.from("group_members")
        .update({ removed_at: new Date().toISOString() })
        .eq("group_id", groupId)
        .eq("user_id", target.id);
      return `@${target.username} has been banned. Reason: ${reason}`;
    }

    case "unban": {
      if (!rawTarget) return "Usage: /unban @username";
      if (!isAdminRole(actorRole)) return "Only admins can unban users.";
      const { data: target } = await supabase
        .from("user_profiles")
        .select("id, username")
        .ilike("username", rawTarget)
        .maybeSingle();
      if (!target) return `User @${rawTarget} not found.`;

      await supabase.from("dawen_moderation_cases")
        .update({ is_active: false })
        .eq("group_id", groupId)
        .eq("target_id", target.id)
        .eq("case_type", "ban")
        .eq("is_active", true);
      await supabase.from("dawen_moderation_cases").insert({
        group_id: groupId, target_id: target.id, actor_id: actorId,
        case_type: "unban", reason, is_active: true,
      });
      return `@${target.username} has been unbanned.`;
    }

    default:
      return null;
  }
}

// ── Bot management actions ────────────────────────────────────────────────────

async function handleCreateBot(supabase: ReturnType<typeof db>, body: any) {
  const { group_id, wallet_address, bot_type, bot_name, bot_avatar_url, command_prefix } = body;
  if (!group_id || !wallet_address || !bot_type) {
    return json({ success: false, error: "group_id, wallet_address, and bot_type required" }, 400);
  }

  const { data: profile } = await supabase
    .from("user_profiles").select("id").eq("wallet_address", wallet_address).maybeSingle();
  if (!profile) return json({ success: false, error: "Profile not found" }, 403);

  const role = await getRole(supabase, group_id, profile.id);
  if (!isAdminRole(role)) return json({ success: false, error: "Admin access required" }, 403);

  const { data: bot, error } = await supabase
    .from("dawen_bots")
    .upsert({
      group_id,
      bot_type,
      bot_name: (bot_name || defaultBotName(bot_type)).trim(),
      bot_avatar_url: bot_avatar_url || null,
      command_prefix: command_prefix || "/",
      is_enabled: true,
      created_by: profile.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "group_id,bot_type" })
    .select()
    .single();

  if (error || !bot) return json({ success: false, error: error?.message || "Failed to create bot" }, 500);

  // Seed default commands for this bot type
  const defaultCmds = getDefaultCommands(bot_type, bot.id);
  if (defaultCmds.length > 0) {
    await supabase.from("dawen_bot_cmds").upsert(defaultCmds, { onConflict: "bot_id,command" });
  }

  // Seed default modules for core bot
  if (bot_type === "core") {
    const allModules = ["guard","sentinel","welcome","pulse","oracle","raid","reward"];
    const moduleRows = allModules.map(m => ({
      bot_id: bot.id, module_name: m, is_enabled: false, config: defaultModuleConfig(m),
    }));
    await supabase.from("dawen_bot_modules").upsert(moduleRows, { onConflict: "bot_id,module_name" });
  } else {
    // Single-module bot — seed its module
    await supabase.from("dawen_bot_modules").upsert({
      bot_id: bot.id, module_name: bot_type, is_enabled: true, config: defaultModuleConfig(bot_type),
    }, { onConflict: "bot_id,module_name" });
  }

  const { data: cmds } = await supabase.from("dawen_bot_cmds").select("*").eq("bot_id", bot.id);
  const { data: mods } = await supabase.from("dawen_bot_modules").select("*").eq("bot_id", bot.id);
  return json({ success: true, bot, commands: cmds ?? [], modules: mods ?? [] });
}

async function handleDeleteBot(supabase: ReturnType<typeof db>, body: any) {
  const { group_id, wallet_address, bot_id } = body;
  if (!group_id || !wallet_address || !bot_id) {
    return json({ success: false, error: "group_id, wallet_address, and bot_id required" }, 400);
  }
  const { data: profile } = await supabase
    .from("user_profiles").select("id").eq("wallet_address", wallet_address).maybeSingle();
  if (!profile) return json({ success: false, error: "Profile not found" }, 403);
  const role = await getRole(supabase, group_id, profile.id);
  if (!isAdminRole(role)) return json({ success: false, error: "Admin access required" }, 403);
  await supabase.from("dawen_bots").delete().eq("id", bot_id).eq("group_id", group_id);
  return json({ success: true });
}

async function handleUpdateBot(supabase: ReturnType<typeof db>, body: any) {
  const { group_id, wallet_address, bot_id, bot_name, bot_avatar_url, command_prefix, is_enabled } = body;
  if (!group_id || !wallet_address || !bot_id) {
    return json({ success: false, error: "Missing required fields" }, 400);
  }
  const { data: profile } = await supabase
    .from("user_profiles").select("id").eq("wallet_address", wallet_address).maybeSingle();
  if (!profile) return json({ success: false, error: "Profile not found" }, 403);
  const role = await getRole(supabase, group_id, profile.id);
  if (!isAdminRole(role)) return json({ success: false, error: "Admin access required" }, 403);

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (bot_name !== undefined) update.bot_name = bot_name;
  if (bot_avatar_url !== undefined) update.bot_avatar_url = bot_avatar_url;
  if (command_prefix !== undefined) update.command_prefix = command_prefix;
  if (is_enabled !== undefined) update.is_enabled = is_enabled;

  const { data: bot, error } = await supabase
    .from("dawen_bots").update(update).eq("id", bot_id).eq("group_id", group_id).select().single();

  if (error) return json({ success: false, error: error.message }, 500);
  return json({ success: true, bot });
}

async function handleSaveModule(supabase: ReturnType<typeof db>, body: any) {
  const { group_id, wallet_address, bot_id, module_name, is_enabled, config } = body;
  if (!group_id || !wallet_address || !bot_id || !module_name) {
    return json({ success: false, error: "Missing required fields" }, 400);
  }
  const { data: profile } = await supabase
    .from("user_profiles").select("id").eq("wallet_address", wallet_address).maybeSingle();
  if (!profile) return json({ success: false, error: "Profile not found" }, 403);
  const role = await getRole(supabase, group_id, profile.id);
  if (!isAdminRole(role)) return json({ success: false, error: "Admin access required" }, 403);

  const { data: mod, error } = await supabase
    .from("dawen_bot_modules")
    .upsert({
      bot_id, module_name,
      is_enabled: is_enabled ?? true,
      config: config ?? {},
      updated_at: new Date().toISOString(),
    }, { onConflict: "bot_id,module_name" })
    .select()
    .single();

  if (error) return json({ success: false, error: error.message }, 500);
  return json({ success: true, module: mod });
}

async function handleGetBots(supabase: ReturnType<typeof db>, body: any) {
  const { group_id } = body;
  if (!group_id) return json({ success: false, error: "group_id required" }, 400);

  const { data: bots } = await supabase
    .from("dawen_bots").select("*").eq("group_id", group_id).order("created_at");

  const result = [];
  for (const bot of bots ?? []) {
    const [{ data: modules }, { data: cmds }] = await Promise.all([
      supabase.from("dawen_bot_modules").select("*").eq("bot_id", bot.id),
      supabase.from("dawen_bot_cmds").select("*").eq("bot_id", bot.id).order("created_at"),
    ]);
    result.push({ ...bot, modules: modules ?? [], commands: cmds ?? [] });
  }

  return json({ success: true, bots: result });
}

async function handleGetLogs(supabase: ReturnType<typeof db>, body: any) {
  const { group_id, bot_id, limit = 50 } = body;
  if (!group_id) return json({ success: false, error: "group_id required" }, 400);

  let query = supabase
    .from("dawen_bot_logs")
    .select("*, actor:actor_id(username, avatar_url), target:target_id(username)")
    .eq("group_id", group_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (bot_id) query = query.eq("bot_id", bot_id);

  const { data: logs } = await query;
  return json({ success: true, logs: logs ?? [] });
}

// ── Moderation action (called from UI, not via chat command) ──────────────────

async function handleModerationAction(supabase: ReturnType<typeof db>, body: any) {
  const { group_id, wallet_address, action, target_username, reason, mute_duration_min } = body;
  if (!group_id || !wallet_address || !action || !target_username) {
    return json({ success: false, error: "Missing required fields" }, 400);
  }

  const { data: profile } = await supabase
    .from("user_profiles").select("id").eq("wallet_address", wallet_address).maybeSingle();
  if (!profile) return json({ success: false, error: "Profile not found" }, 403);

  const role = await getRole(supabase, group_id, profile.id);
  if (!isModRole(role)) return json({ success: false, error: "Moderator access required" }, 403);

  const { data: target } = await supabase
    .from("user_profiles").select("id, username").ilike("username", target_username).maybeSingle();
  if (!target) return json({ success: false, error: `User @${target_username} not found` }, 404);

  if (!["warn","mute","unmute","kick","ban","unban"].includes(action)) {
    return json({ success: false, error: "Invalid action" }, 400);
  }

  // ban/kick/unban require admin
  if (["kick","ban","unban"].includes(action) && !isAdminRole(role)) {
    return json({ success: false, error: "Admin access required for this action" }, 403);
  }

  let muteUntil: string | null = null;
  if (action === "mute") {
    const dur = mute_duration_min ?? 60;
    muteUntil = new Date(Date.now() + dur * 60 * 1000).toISOString();
  }

  await supabase.from("dawen_moderation_cases").insert({
    group_id, target_id: target.id, actor_id: profile.id,
    case_type: action, reason: reason || "No reason given",
    mute_until: muteUntil, is_active: true,
  });

  if (action === "kick" || action === "ban") {
    await supabase.from("group_members")
      .update({ removed_at: new Date().toISOString() })
      .eq("group_id", group_id)
      .eq("user_id", target.id);
  }
  if (action === "unmute" || action === "unban") {
    await supabase.from("dawen_moderation_cases")
      .update({ is_active: false })
      .eq("group_id", group_id)
      .eq("target_id", target.id)
      .eq("case_type", action === "unmute" ? "mute" : "ban")
      .eq("is_active", true);
  }

  return json({ success: true, action, target: target.username });
}

// ── Raid actions ──────────────────────────────────────────────────────────────

async function handleCreateRaid(supabase: ReturnType<typeof db>, body: any) {
  const { group_id, wallet_address, title, description, target_url, required_actions, reward_points, ends_at, max_participants } = body;
  if (!group_id || !wallet_address || !title || !target_url) {
    return json({ success: false, error: "Missing required fields" }, 400);
  }

  const { data: profile } = await supabase
    .from("user_profiles").select("id").eq("wallet_address", wallet_address).maybeSingle();
  if (!profile) return json({ success: false, error: "Profile not found" }, 403);

  const role = await getRole(supabase, group_id, profile.id);
  if (!isAdminRole(role)) return json({ success: false, error: "Admin access required" }, 403);

  const { data: raid, error } = await supabase
    .from("raid_tasks")
    .insert({
      group_id,
      created_by: profile.id,
      title: title.trim(),
      description: description?.trim() || "",
      target_url: target_url.trim(),
      target_type: "x_post",
      required_actions: required_actions ?? ["like","repost"],
      reward_points: reward_points ?? 0,
      max_participants: max_participants || null,
      ends_at: ends_at || null,
      status: "active",
    })
    .select()
    .single();

  if (error || !raid) return json({ success: false, error: error?.message || "Failed to create raid" }, 500);

  // Post raid announcement to group via the Raid bot
  const { data: raidBot } = await supabase
    .from("dawen_bots")
    .select("id, bot_name, bot_avatar_url")
    .eq("group_id", group_id)
    .in("bot_type", ["raid","core"])
    .eq("is_enabled", true)
    .maybeSingle();

  if (raidBot) {
    const actions = (required_actions ?? ["like","repost"]).join(", ");
    await supabase.from("group_messages").insert({
      group_id,
      sender_id: profile.id,
      content: [
        `New Raid: ${title}`,
        `${target_url}`,
        `Required actions: ${actions}`,
        description ? description : null,
        reward_points > 0 ? `Reward: ${reward_points} $DAWORLD` : null,
        `Use /raid to see all active raids.`,
      ].filter(Boolean).join("\n"),
      is_bot_message: true,
      bot_name: raidBot.bot_name,
      bot_username: "dawen_raid_bot",
      bot_avatar_url: raidBot.bot_avatar_url,
    });
  }

  return json({ success: true, raid });
}

async function handleJoinRaid(supabase: ReturnType<typeof db>, body: any) {
  const { raid_task_id, wallet_address, actions_done, proof_url, proof_note } = body;
  if (!raid_task_id || !wallet_address) {
    return json({ success: false, error: "raid_task_id and wallet_address required" }, 400);
  }

  const { data: profile } = await supabase
    .from("user_profiles").select("id").eq("wallet_address", wallet_address).maybeSingle();
  if (!profile) return json({ success: false, error: "Profile not found" }, 403);

  const { data: raid } = await supabase
    .from("raid_tasks").select("status, required_actions, max_participants, participant_count").eq("id", raid_task_id).maybeSingle();
  if (!raid || raid.status !== "active") return json({ success: false, error: "Raid is not active" }, 400);

  if (raid.max_participants && raid.participant_count >= raid.max_participants) {
    return json({ success: false, error: "Raid is full" }, 400);
  }

  const hasProof = !!proof_url?.trim();
  const { data: participant, error } = await supabase
    .from("raid_participants")
    .upsert({
      raid_task_id,
      user_id: profile.id,
      actions_done: actions_done ?? [],
      proof_url: proof_url?.trim() || null,
      proof_note: proof_note?.trim() || null,
      status: hasProof ? "submitted" : "pending",
      submitted_at: hasProof ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "raid_task_id,user_id" })
    .select()
    .single();

  if (error) return json({ success: false, error: error.message }, 500);
  return json({ success: true, participant });
}

async function handleVerifyRaid(supabase: ReturnType<typeof db>, body: any) {
  const { raid_task_id, wallet_address, participant_user_id, verdict } = body;
  if (!raid_task_id || !wallet_address || !participant_user_id || !verdict) {
    return json({ success: false, error: "Missing required fields" }, 400);
  }

  const { data: profile } = await supabase
    .from("user_profiles").select("id").eq("wallet_address", wallet_address).maybeSingle();
  if (!profile) return json({ success: false, error: "Profile not found" }, 403);

  const { data: raid } = await supabase
    .from("raid_tasks").select("group_id").eq("id", raid_task_id).maybeSingle();
  if (!raid) return json({ success: false, error: "Raid not found" }, 404);

  const role = await getRole(supabase, raid.group_id, profile.id);
  if (!isAdminRole(role)) return json({ success: false, error: "Admin access required" }, 403);

  const { data: participant, error } = await supabase
    .from("raid_participants")
    .update({
      status: verdict === "approve" ? "verified" : "rejected",
      verified_at: new Date().toISOString(),
      verified_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("raid_task_id", raid_task_id)
    .eq("user_id", participant_user_id)
    .select()
    .single();

  if (error) return json({ success: false, error: error.message }, 500);
  return json({ success: true, participant });
}

async function handleGetRaids(supabase: ReturnType<typeof db>, body: any) {
  const { group_id, status } = body;
  if (!group_id) return json({ success: false, error: "group_id required" }, 400);

  let query = supabase
    .from("raid_tasks")
    .select("*, creator:created_by(username, avatar_url)")
    .eq("group_id", group_id)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data: raids } = await query.limit(20);
  return json({ success: true, raids: raids ?? [] });
}

// ── X account linking ─────────────────────────────────────────────────────────

async function handleLinkX(supabase: ReturnType<typeof db>, body: any) {
  const { wallet_address, x_user_id, x_username, x_display_name, x_avatar_url } = body;
  if (!wallet_address || !x_user_id || !x_username) {
    return json({ success: false, error: "wallet_address, x_user_id, and x_username required" }, 400);
  }

  const { data: profile } = await supabase
    .from("user_profiles").select("id").eq("wallet_address", wallet_address).maybeSingle();
  if (!profile) return json({ success: false, error: "Profile not found" }, 403);

  const { data: link, error } = await supabase
    .from("x_account_links")
    .upsert({
      user_id: profile.id,
      x_user_id, x_username,
      x_display_name: x_display_name || null,
      x_avatar_url: x_avatar_url || null,
      status: "active",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) return json({ success: false, error: error.message }, 500);
  return json({ success: true, link });
}

async function handleUnlinkX(supabase: ReturnType<typeof db>, body: any) {
  const { wallet_address } = body;
  if (!wallet_address) return json({ success: false, error: "wallet_address required" }, 400);

  const { data: profile } = await supabase
    .from("user_profiles").select("id").eq("wallet_address", wallet_address).maybeSingle();
  if (!profile) return json({ success: false, error: "Profile not found" }, 403);

  await supabase.from("x_account_links")
    .update({ status: "unlinked", updated_at: new Date().toISOString() })
    .eq("user_id", profile.id);

  return json({ success: true });
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

function defaultBotName(botType: string): string {
  const names: Record<string, string> = {
    core: "DAWEN Core Bot",
    guard: "DAWEN Guard Bot",
    sentinel: "DAWEN Sentinel Bot",
    welcome: "DAWEN Welcome Bot",
    pulse: "DAWEN Pulse Bot",
    oracle: "DAWEN Oracle Bot",
    raid: "DAWEN Raid Bot",
    reward: "DAWEN Reward Bot",
  };
  return names[botType] ?? "DAWEN Bot";
}

function getDefaultCommands(botType: string, botId: string): any[] {
  const base = [
    { bot_id: botId, command: "help", description: "Show available commands", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: [], cooldown_seconds: 5 },
    { bot_id: botId, command: "start", description: "Welcome message", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: [], cooldown_seconds: 5 },
    { bot_id: botId, command: "ping", description: "Check bot is alive", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: [], cooldown_seconds: 5 },
  ];

  const moduleSpecific: Record<string, any[]> = {
    welcome: [
      { bot_id: botId, command: "rules", description: "Group rules", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: [], cooldown_seconds: 10, module_name: "welcome" },
      { bot_id: botId, command: "links", description: "Group links", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: [], cooldown_seconds: 10, module_name: "welcome" },
    ],
    oracle: [
      { bot_id: botId, command: "price", description: "Token price", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: [], cooldown_seconds: 15, module_name: "oracle" },
      { bot_id: botId, command: "mcap", description: "Token market cap", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: [], cooldown_seconds: 15, module_name: "oracle" },
      { bot_id: botId, command: "volume", description: "Token 24h volume", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: [], cooldown_seconds: 15, module_name: "oracle" },
      { bot_id: botId, command: "tokeninfo", description: "Token details", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: [], cooldown_seconds: 15, module_name: "oracle" },
    ],
    sentinel: [
      { bot_id: botId, command: "warn", description: "Warn a user", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: ["creator","admin","moderator"], cooldown_seconds: 0, module_name: "sentinel" },
      { bot_id: botId, command: "warnings", description: "View user warnings", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: ["creator","admin","moderator"], cooldown_seconds: 0, module_name: "sentinel" },
      { bot_id: botId, command: "mute", description: "Mute a user", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: ["creator","admin","moderator"], cooldown_seconds: 0, module_name: "sentinel" },
      { bot_id: botId, command: "unmute", description: "Unmute a user", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: ["creator","admin","moderator"], cooldown_seconds: 0, module_name: "sentinel" },
      { bot_id: botId, command: "kick", description: "Kick a user", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: ["creator","admin"], cooldown_seconds: 0, module_name: "sentinel" },
      { bot_id: botId, command: "ban", description: "Ban a user", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: ["creator","admin"], cooldown_seconds: 0, module_name: "sentinel" },
      { bot_id: botId, command: "unban", description: "Unban a user", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: ["creator","admin"], cooldown_seconds: 0, module_name: "sentinel" },
    ],
    raid: [
      { bot_id: botId, command: "raid", description: "View active raids", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: [], cooldown_seconds: 10, module_name: "raid" },
    ],
    reward: [
      { bot_id: botId, command: "rank", description: "Your rank", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: [], cooldown_seconds: 30, module_name: "reward" },
      { bot_id: botId, command: "points", description: "Your $DAWORLD balance", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: [], cooldown_seconds: 30, module_name: "reward" },
      { bot_id: botId, command: "referral", description: "Your referral code", response_text: "", is_builtin: true, is_enabled: true, allowed_roles: [], cooldown_seconds: 30, module_name: "reward" },
    ],
  };

  // For core bot, include all modules' commands
  if (botType === "core") {
    const allModuleCmds = Object.values(moduleSpecific).flat();
    return [...base, ...allModuleCmds];
  }

  return [...base, ...(moduleSpecific[botType] ?? [])];
}

function defaultModuleConfig(moduleName: string): Record<string, unknown> {
  const configs: Record<string, Record<string, unknown>> = {
    guard: {
      captcha_enabled: false,
      captcha_timeout_sec: 120,
      anti_spam_enabled: false,
      anti_flood_enabled: false,
      anti_flood_max_msgs: 5,
      anti_flood_window_sec: 10,
      anti_link_enabled: false,
      anti_link_allowlist: [],
      auto_mute_threshold: 3,
      auto_kick_threshold: 5,
    },
    sentinel: {
      log_actions: true,
      banned_words: [],
      max_warns_before_mute: 3,
      max_warns_before_ban: 5,
      default_mute_duration_min: 60,
    },
    welcome: {
      welcome_enabled: true,
      welcome_message: "Welcome to the group! Please read the rules.",
      rules_text: "",
      links_text: "",
      goodbye_enabled: false,
      goodbye_message: "Goodbye!",
    },
    pulse: {
      announcement_channel: null,
      require_confirm: true,
      allow_media: true,
    },
    oracle: {
      price_decimals: 6,
      show_chart_link: true,
    },
    raid: {
      require_x_link: false,
      allow_manual_proof: true,
      auto_verify: false,
    },
    reward: {
      remind_claim: true,
      show_leaderboard: true,
    },
  };
  return configs[moduleName] ?? {};
}
