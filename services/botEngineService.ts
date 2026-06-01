import { supabase } from "@/lib/supabase";

const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

async function callBotEngine(action: string, body: Record<string, unknown>) {
  const session = await supabase.auth.getSession();
  const token = session.data?.session?.access_token ?? ANON_KEY;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/bot-engine?action=${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Apikey: ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Bot management ────────────────────────────────────────────────────────────

export async function createBot(
  groupId: string,
  walletAddress: string,
  botType: string,
  botName?: string,
  commandPrefix?: string,
  botAvatarUrl?: string,
) {
  return callBotEngine("create_bot", {
    group_id: groupId,
    wallet_address: walletAddress,
    bot_type: botType,
    bot_name: botName,
    command_prefix: commandPrefix,
    bot_avatar_url: botAvatarUrl,
  });
}

export async function deleteBot(groupId: string, walletAddress: string, botId: string) {
  return callBotEngine("delete_bot", { group_id: groupId, wallet_address: walletAddress, bot_id: botId });
}

export async function updateBot(
  groupId: string,
  walletAddress: string,
  botId: string,
  updates: { bot_name?: string; bot_avatar_url?: string; command_prefix?: string; is_enabled?: boolean },
) {
  return callBotEngine("update_bot", {
    group_id: groupId,
    wallet_address: walletAddress,
    bot_id: botId,
    ...updates,
  });
}

export async function saveModule(
  groupId: string,
  walletAddress: string,
  botId: string,
  moduleName: string,
  isEnabled: boolean,
  config: Record<string, unknown>,
) {
  return callBotEngine("save_module", {
    group_id: groupId,
    wallet_address: walletAddress,
    bot_id: botId,
    module_name: moduleName,
    is_enabled: isEnabled,
    config,
  });
}

export async function getBots(groupId: string) {
  return callBotEngine("get_bots", { group_id: groupId });
}

export async function getBotLogs(groupId: string, botId?: string, limit = 50) {
  return callBotEngine("get_logs", { group_id: groupId, bot_id: botId, limit });
}

// ── Message processing (called after each sent message) ──────────────────────

export async function processMessage(
  groupId: string,
  messageId: string,
  content: string,
  senderId: string,
) {
  return callBotEngine("process", {
    group_id: groupId,
    message_id: messageId,
    content,
    sender_id: senderId,
  });
}

// ── Moderation actions (UI-triggered) ────────────────────────────────────────

export async function moderationAction(
  groupId: string,
  walletAddress: string,
  action: "warn" | "mute" | "unmute" | "kick" | "ban" | "unban",
  targetUsername: string,
  reason?: string,
  muteDurationMin?: number,
) {
  return callBotEngine("mod_action", {
    group_id: groupId,
    wallet_address: walletAddress,
    action,
    target_username: targetUsername,
    reason,
    mute_duration_min: muteDurationMin,
  });
}

// ── Raid system ───────────────────────────────────────────────────────────────

export async function createRaid(
  groupId: string,
  walletAddress: string,
  data: {
    title: string;
    description?: string;
    target_url: string;
    required_actions?: string[];
    reward_points?: number;
    ends_at?: string;
    max_participants?: number;
  },
) {
  return callBotEngine("create_raid", { group_id: groupId, wallet_address: walletAddress, ...data });
}

export async function joinRaid(
  raidTaskId: string,
  walletAddress: string,
  actionsDone: string[],
  proofUrl?: string,
  proofNote?: string,
) {
  return callBotEngine("join_raid", {
    raid_task_id: raidTaskId,
    wallet_address: walletAddress,
    actions_done: actionsDone,
    proof_url: proofUrl,
    proof_note: proofNote,
  });
}

export async function verifyRaid(
  raidTaskId: string,
  walletAddress: string,
  participantUserId: string,
  verdict: "approve" | "reject",
) {
  return callBotEngine("verify_raid", {
    raid_task_id: raidTaskId,
    wallet_address: walletAddress,
    participant_user_id: participantUserId,
    verdict,
  });
}

export async function getRaids(groupId: string, status?: "active" | "ended") {
  return callBotEngine("get_raids", { group_id: groupId, status });
}

// ── X account linking ─────────────────────────────────────────────────────────

export async function linkXAccount(
  walletAddress: string,
  xUserId: string,
  xUsername: string,
  xDisplayName?: string,
  xAvatarUrl?: string,
) {
  return callBotEngine("link_x", {
    wallet_address: walletAddress,
    x_user_id: xUserId,
    x_username: xUsername,
    x_display_name: xDisplayName,
    x_avatar_url: xAvatarUrl,
  });
}

export async function unlinkXAccount(walletAddress: string) {
  return callBotEngine("unlink_x", { wallet_address: walletAddress });
}
