/*
  # Telegram Bot Integration Tables

  ## Summary
  Creates tables to support Telegram bot connections for DAWEN groups.
  Bot tokens are stored ONLY in a separate secured table with strict RLS —
  normal users and even group members cannot read the encrypted token column.
  The frontend never receives token data.

  ## New Tables

  ### group_telegram_bots
  Stores the public-safe metadata about a connected Telegram bot.
  The actual token is stored in `group_telegram_bot_tokens` (separate secured table).
  - id, group_id, bot_id, bot_username, bot_name
  - status: connected | disabled | error
  - created_by (user_id of group owner who connected it)
  - webhook_set (bool: whether Telegram webhook is registered)
  - created_at, updated_at

  ### group_telegram_bot_tokens
  Stores the encrypted Telegram bot token. RLS restricts to service_role only.
  Frontend never reads from this table.
  - id, bot_record_id (fk → group_telegram_bots), encrypted_token (text)
  - created_at

  ### telegram_link_codes
  One-time codes for linking a Telegram user to a DAWEN user.
  - id, user_id (DAWEN profile id), group_id
  - code (10-char random), expires_at, used_at
  - created_at

  ### telegram_linked_users
  Maps Telegram user_id ↔ DAWEN user profile id.
  - id, telegram_user_id (bigint), dawen_user_id (fk user_profiles)
  - telegram_username, telegram_first_name
  - group_id (optional: group context for the link)
  - created_at, updated_at

  ### group_bot_commands
  Configurable bot commands per group.
  - id, group_id, command (e.g. 'rules', 'links'), response_text
  - enabled, cooldown_seconds, allowed_roles (text[])
  - created_at, updated_at

  ## Security
  - group_telegram_bots: group creator/admin can read/write; members can read status
  - group_telegram_bot_tokens: NO user-level RLS — only service_role (edge functions) can access
  - telegram_link_codes: owner can insert/read own; service_role validates
  - telegram_linked_users: user can read own; service_role manages
  - group_bot_commands: group creator/admin can manage; members can read enabled commands
*/

-- ─── group_telegram_bots ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS group_telegram_bots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  bot_id            bigint NOT NULL,
  bot_username      text NOT NULL,
  bot_name          text NOT NULL,
  status            text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','disabled','error')),
  webhook_set       boolean NOT NULL DEFAULT false,
  created_by        uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id)
);

ALTER TABLE group_telegram_bots ENABLE ROW LEVEL SECURITY;

-- Group members can read bot status (no token here)
CREATE POLICY "Group members can view bot info"
  ON group_telegram_bots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_telegram_bots.group_id
        AND group_members.user_id = auth.uid()
        AND group_members.removed_at IS NULL
    )
    OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = group_telegram_bots.created_by
        AND user_profiles.wallet_address = current_setting('app.wallet_address', true)
    )
  );

-- Only group creator can insert
CREATE POLICY "Group creator can connect bot"
  ON group_telegram_bots FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_conversations
      WHERE group_conversations.id = group_id
        AND EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = group_conversations.creator_id
            AND user_profiles.wallet_address = current_setting('app.wallet_address', true)
        )
    )
    OR
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_telegram_bots.group_id
        AND group_members.role IN ('creator','admin')
        AND EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = group_members.user_id
            AND user_profiles.wallet_address = current_setting('app.wallet_address', true)
        )
    )
  );

-- Only group creator/admin can update
CREATE POLICY "Group admin can update bot"
  ON group_telegram_bots FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_telegram_bots.group_id
        AND group_members.role IN ('creator','admin')
        AND EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = group_members.user_id
            AND user_profiles.wallet_address = current_setting('app.wallet_address', true)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_telegram_bots.group_id
        AND group_members.role IN ('creator','admin')
        AND EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = group_members.user_id
            AND user_profiles.wallet_address = current_setting('app.wallet_address', true)
        )
    )
  );

-- Only group creator/admin can delete
CREATE POLICY "Group admin can delete bot"
  ON group_telegram_bots FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_telegram_bots.group_id
        AND group_members.role IN ('creator','admin')
        AND EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = group_members.user_id
            AND user_profiles.wallet_address = current_setting('app.wallet_address', true)
        )
    )
  );

-- ─── group_telegram_bot_tokens ────────────────────────────────────────────────
-- Token table: NO user RLS. Only service_role (edge functions) can access.

CREATE TABLE IF NOT EXISTS group_telegram_bot_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_record_id   uuid NOT NULL REFERENCES group_telegram_bots(id) ON DELETE CASCADE,
  token           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_record_id)
);

ALTER TABLE group_telegram_bot_tokens ENABLE ROW LEVEL SECURITY;

-- No user-facing policies — only service_role can read/write tokens
-- (Supabase edge functions use service_role key)

-- ─── telegram_link_codes ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  group_id    uuid REFERENCES group_conversations(id) ON DELETE CASCADE,
  code        text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE telegram_link_codes ENABLE ROW LEVEL SECURITY;

-- Users can insert their own link codes
CREATE POLICY "Users can create own link codes"
  ON telegram_link_codes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = user_id
        AND user_profiles.wallet_address = current_setting('app.wallet_address', true)
    )
  );

-- Users can read their own link codes
CREATE POLICY "Users can read own link codes"
  ON telegram_link_codes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = user_id
        AND user_profiles.wallet_address = current_setting('app.wallet_address', true)
    )
  );

-- ─── telegram_linked_users ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS telegram_linked_users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id     bigint NOT NULL,
  dawen_user_id        uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  telegram_username    text,
  telegram_first_name  text,
  group_id             uuid REFERENCES group_conversations(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_user_id, dawen_user_id)
);

ALTER TABLE telegram_linked_users ENABLE ROW LEVEL SECURITY;

-- Users can read their own linked Telegram accounts
CREATE POLICY "Users can read own telegram links"
  ON telegram_linked_users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = dawen_user_id
        AND user_profiles.wallet_address = current_setting('app.wallet_address', true)
    )
  );

-- ─── group_bot_commands ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS group_bot_commands (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         uuid NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  command          text NOT NULL,
  response_text    text NOT NULL DEFAULT '',
  enabled          boolean NOT NULL DEFAULT true,
  cooldown_seconds integer NOT NULL DEFAULT 30,
  allowed_roles    text[] NOT NULL DEFAULT ARRAY['creator','admin','member'],
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, command)
);

ALTER TABLE group_bot_commands ENABLE ROW LEVEL SECURITY;

-- Members can read enabled commands
CREATE POLICY "Group members can read commands"
  ON group_bot_commands FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_bot_commands.group_id
        AND group_members.user_id = auth.uid()
        AND group_members.removed_at IS NULL
    )
  );

-- Admins can manage commands
CREATE POLICY "Group admins can insert commands"
  ON group_bot_commands FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_bot_commands.group_id
        AND group_members.role IN ('creator','admin')
        AND EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = group_members.user_id
            AND user_profiles.wallet_address = current_setting('app.wallet_address', true)
        )
    )
  );

CREATE POLICY "Group admins can update commands"
  ON group_bot_commands FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_bot_commands.group_id
        AND group_members.role IN ('creator','admin')
        AND EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = group_members.user_id
            AND user_profiles.wallet_address = current_setting('app.wallet_address', true)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_bot_commands.group_id
        AND group_members.role IN ('creator','admin')
        AND EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = group_members.user_id
            AND user_profiles.wallet_address = current_setting('app.wallet_address', true)
        )
    )
  );

CREATE POLICY "Group admins can delete commands"
  ON group_bot_commands FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_bot_commands.group_id
        AND group_members.role IN ('creator','admin')
        AND EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = group_members.user_id
            AND user_profiles.wallet_address = current_setting('app.wallet_address', true)
        )
    )
  );

-- ─── group_messages: add is_bot_message flag ──────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_messages' AND column_name = 'is_bot_message'
  ) THEN
    ALTER TABLE group_messages ADD COLUMN is_bot_message boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_messages' AND column_name = 'bot_name'
  ) THEN
    ALTER TABLE group_messages ADD COLUMN bot_name text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_messages' AND column_name = 'bot_username'
  ) THEN
    ALTER TABLE group_messages ADD COLUMN bot_username text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_messages' AND column_name = 'bot_avatar_url'
  ) THEN
    ALTER TABLE group_messages ADD COLUMN bot_avatar_url text;
  END IF;
END $$;

-- Index for fast bot lookup
CREATE INDEX IF NOT EXISTS idx_group_telegram_bots_group_id ON group_telegram_bots(group_id);
CREATE INDEX IF NOT EXISTS idx_telegram_linked_users_tg_id ON telegram_linked_users(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_code ON telegram_link_codes(code);
CREATE INDEX IF NOT EXISTS idx_group_bot_commands_group_id ON group_bot_commands(group_id);
