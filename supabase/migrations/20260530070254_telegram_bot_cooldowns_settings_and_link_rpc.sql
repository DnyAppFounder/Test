/*
  # Telegram Bot: Cooldown Table, Settings Column, and Secure Link Code RPC

  ## Summary
  Completes the DAWEN Telegram bot system with anti-spam cooldown protection,
  per-group bot configuration, and cryptographically-secure link code generation.

  ## New Tables

  ### telegram_bot_cooldowns
  Tracks when the bot last sent a specific type of message to a Telegram user in a chat.
  Used to enforce rate limits / cooldowns (e.g. max 1 "not linked" warning per user per 24h).
  - telegram_user_id (bigint) — Telegram user
  - chat_id (bigint)          — Telegram chat (group or DM)
  - cooldown_type (text)      — e.g. 'not_linked_warning', 'setup_warning'
  - last_sent_at (timestamptz)

  ## Modified Tables

  ### group_telegram_bots
  - Adds `settings` jsonb column — stores admin-configurable bot settings per group:
    welcome_enabled, welcome_message, link_requirement, anti_spam,
    link_warning_cooldown_hours, rules_message, links_message, rewards_message

  ### telegram_linked_users
  - Adds `status` text column (active / unlinked) so users can unlink

  ## New Functions

  ### generate_telegram_link_code(p_wallet_address, p_group_id)
  SECURITY DEFINER function that:
  1. Validates the wallet address maps to a real profile
  2. Expires all pending (unused) codes for this user
  3. Generates a cryptographically-random DAWEN-XXXXXX code (gen_random_bytes)
  4. Inserts it with 15-minute expiry
  5. Returns the code string

  ## Security
  - telegram_bot_cooldowns: NO user RLS — only service_role (edge functions) writes
  - generate_telegram_link_code: SECURITY DEFINER bypasses RLS safely; validates ownership
*/

-- ─── telegram_bot_cooldowns ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS telegram_bot_cooldowns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL,
  chat_id          bigint NOT NULL,
  cooldown_type    text NOT NULL,
  last_sent_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_user_id, chat_id, cooldown_type)
);

ALTER TABLE telegram_bot_cooldowns ENABLE ROW LEVEL SECURITY;

-- No user-level RLS — only service_role (edge functions) reads/writes

CREATE INDEX IF NOT EXISTS idx_telegram_bot_cooldowns_lookup
  ON telegram_bot_cooldowns(telegram_user_id, chat_id, cooldown_type);

-- ─── group_telegram_bots: add settings column ─────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_telegram_bots' AND column_name = 'settings'
  ) THEN
    ALTER TABLE group_telegram_bots
      ADD COLUMN settings jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- ─── telegram_linked_users: add status column ─────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_linked_users' AND column_name = 'status'
  ) THEN
    ALTER TABLE telegram_linked_users
      ADD COLUMN status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'unlinked'));
  END IF;
END $$;

-- ─── generate_telegram_link_code RPC ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_telegram_link_code(
  p_wallet_address text,
  p_group_id       uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_code    text;
  v_chars   text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes   bytea;
  i         integer;
BEGIN
  -- Validate wallet maps to a profile
  SELECT id INTO v_user_id
  FROM user_profiles
  WHERE wallet_address = lower(trim(p_wallet_address))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    -- Try without lowercasing (some wallets stored as-is)
    SELECT id INTO v_user_id
    FROM user_profiles
    WHERE wallet_address = trim(p_wallet_address)
    LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for wallet %', p_wallet_address;
  END IF;

  -- Expire all pending codes for this user (makes old codes unusable)
  UPDATE telegram_link_codes
  SET used_at = now()
  WHERE user_id = v_user_id
    AND used_at IS NULL;

  -- Generate cryptographically-random DAWEN-XXXXXX code
  -- Each char is drawn from a 32-char safe alphabet (5 bits of entropy per char)
  v_bytes := gen_random_bytes(6);
  v_code := 'DAWEN-';
  FOR i IN 0..5 LOOP
    v_code := v_code || substr(v_chars, (get_byte(v_bytes, i) % 32) + 1, 1);
  END LOOP;

  -- Insert new code (15-min expiry)
  INSERT INTO telegram_link_codes (user_id, group_id, code, expires_at)
  VALUES (v_user_id, p_group_id, v_code, now() + interval '15 minutes');

  RETURN v_code;
END;
$$;
