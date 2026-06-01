/*
  # Internal DAWEN Bot and Telegram Target Tables

  ## Summary
  Extends the bot system with two new capabilities:
  1. Each DAWEN group can have its own internal bot that posts messages inside the group
  2. Telegram Bot Connector can target specific Telegram channels/groups for outbound messages

  ## New Tables

  ### dawen_group_bots
  Internal DAWEN bot per group. Appears as a bot user inside the group chat.
  - id, group_id (unique), bot_name, bot_avatar_url, is_enabled, settings (jsonb)
  - created_by, created_at, updated_at

  ### dawen_bot_commands
  Custom commands for the internal DAWEN bot (e.g. /help, /rules, /links).
  - id, group_bot_id (fk → dawen_group_bots), command (text), response_text
  - is_enabled, created_at

  ### telegram_bot_targets
  Telegram channels/groups that the connected bot should be able to post to.
  - id, bot_record_id (fk → group_telegram_bots), chat_id (bigint), chat_name, chat_type
  - is_enabled, created_at

  ## Security
  - dawen_group_bots: group members can read; group admins can insert/update/delete
  - dawen_bot_commands: group members can read; group admins can manage
  - telegram_bot_targets: group admins can read/manage only
*/

-- ─── dawen_group_bots ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dawen_group_bots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       uuid NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  bot_name       text NOT NULL DEFAULT 'DAWEN Bot',
  bot_avatar_url text,
  is_enabled     boolean NOT NULL DEFAULT true,
  settings       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by     uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id)
);

ALTER TABLE dawen_group_bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view DAWEN bot"
  ON dawen_group_bots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = dawen_group_bots.group_id
        AND group_members.user_id = auth.uid()
        AND group_members.removed_at IS NULL
    )
  );

CREATE POLICY "Group admins can insert DAWEN bot"
  ON dawen_group_bots FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_conversations
      WHERE group_conversations.id = group_id
        AND (
          group_conversations.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = dawen_group_bots.group_id
              AND gm.user_id = auth.uid()
              AND gm.role IN ('creator','admin')
              AND gm.removed_at IS NULL
          )
        )
    )
  );

CREATE POLICY "Group admins can update DAWEN bot"
  ON dawen_group_bots FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_conversations
      WHERE group_conversations.id = group_id
        AND (
          group_conversations.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = dawen_group_bots.group_id
              AND gm.user_id = auth.uid()
              AND gm.role IN ('creator','admin')
              AND gm.removed_at IS NULL
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_conversations
      WHERE group_conversations.id = group_id
        AND (
          group_conversations.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = dawen_group_bots.group_id
              AND gm.user_id = auth.uid()
              AND gm.role IN ('creator','admin')
              AND gm.removed_at IS NULL
          )
        )
    )
  );

CREATE POLICY "Group admins can delete DAWEN bot"
  ON dawen_group_bots FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_conversations
      WHERE group_conversations.id = group_id
        AND (
          group_conversations.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = dawen_group_bots.group_id
              AND gm.user_id = auth.uid()
              AND gm.role IN ('creator','admin')
              AND gm.removed_at IS NULL
          )
        )
    )
  );

-- ─── dawen_bot_commands ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dawen_bot_commands (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_bot_id  uuid NOT NULL REFERENCES dawen_group_bots(id) ON DELETE CASCADE,
  command       text NOT NULL,
  response_text text NOT NULL DEFAULT '',
  is_enabled    boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_bot_id, command)
);

ALTER TABLE dawen_bot_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can read bot commands"
  ON dawen_bot_commands FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dawen_group_bots dgb
      JOIN group_members gm ON gm.group_id = dgb.group_id
      WHERE dgb.id = dawen_bot_commands.group_bot_id
        AND gm.user_id = auth.uid()
        AND gm.removed_at IS NULL
    )
  );

CREATE POLICY "Group admins can manage bot commands"
  ON dawen_bot_commands FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dawen_group_bots dgb
      JOIN group_conversations gc ON gc.id = dgb.group_id
      WHERE dgb.id = dawen_bot_commands.group_bot_id
        AND (
          gc.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = dgb.group_id
              AND gm.user_id = auth.uid()
              AND gm.role IN ('creator','admin')
              AND gm.removed_at IS NULL
          )
        )
    )
  );

CREATE POLICY "Group admins can update bot commands"
  ON dawen_bot_commands FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dawen_group_bots dgb
      JOIN group_conversations gc ON gc.id = dgb.group_id
      WHERE dgb.id = dawen_bot_commands.group_bot_id
        AND (
          gc.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = dgb.group_id
              AND gm.user_id = auth.uid()
              AND gm.role IN ('creator','admin')
              AND gm.removed_at IS NULL
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dawen_group_bots dgb
      JOIN group_conversations gc ON gc.id = dgb.group_id
      WHERE dgb.id = dawen_bot_commands.group_bot_id
        AND (
          gc.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = dgb.group_id
              AND gm.user_id = auth.uid()
              AND gm.role IN ('creator','admin')
              AND gm.removed_at IS NULL
          )
        )
    )
  );

CREATE POLICY "Group admins can delete bot commands"
  ON dawen_bot_commands FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dawen_group_bots dgb
      JOIN group_conversations gc ON gc.id = dgb.group_id
      WHERE dgb.id = dawen_bot_commands.group_bot_id
        AND (
          gc.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = dgb.group_id
              AND gm.user_id = auth.uid()
              AND gm.role IN ('creator','admin')
              AND gm.removed_at IS NULL
          )
        )
    )
  );

-- ─── telegram_bot_targets ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS telegram_bot_targets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_record_id  uuid NOT NULL REFERENCES group_telegram_bots(id) ON DELETE CASCADE,
  chat_id        bigint NOT NULL,
  chat_name      text NOT NULL DEFAULT '',
  chat_type      text NOT NULL DEFAULT 'channel' CHECK (chat_type IN ('channel', 'group', 'supergroup')),
  is_enabled     boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_record_id, chat_id)
);

ALTER TABLE telegram_bot_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group admins can manage telegram targets"
  ON telegram_bot_targets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_telegram_bots gtb
      JOIN group_conversations gc ON gc.id = gtb.group_id
      WHERE gtb.id = telegram_bot_targets.bot_record_id
        AND (
          gc.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = gtb.group_id
              AND gm.user_id = auth.uid()
              AND gm.role IN ('creator','admin')
              AND gm.removed_at IS NULL
          )
        )
    )
  );

CREATE POLICY "Group admins can insert telegram targets"
  ON telegram_bot_targets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_telegram_bots gtb
      JOIN group_conversations gc ON gc.id = gtb.group_id
      WHERE gtb.id = telegram_bot_targets.bot_record_id
        AND (
          gc.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = gtb.group_id
              AND gm.user_id = auth.uid()
              AND gm.role IN ('creator','admin')
              AND gm.removed_at IS NULL
          )
        )
    )
  );

CREATE POLICY "Group admins can delete telegram targets"
  ON telegram_bot_targets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_telegram_bots gtb
      JOIN group_conversations gc ON gc.id = gtb.group_id
      WHERE gtb.id = telegram_bot_targets.bot_record_id
        AND (
          gc.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = gtb.group_id
              AND gm.user_id = auth.uid()
              AND gm.role IN ('creator','admin')
              AND gm.removed_at IS NULL
          )
        )
    )
  );

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_dawen_group_bots_group_id ON dawen_group_bots(group_id);
CREATE INDEX IF NOT EXISTS idx_dawen_bot_commands_group_bot_id ON dawen_bot_commands(group_bot_id);
CREATE INDEX IF NOT EXISTS idx_telegram_bot_targets_bot_record_id ON telegram_bot_targets(bot_record_id);
