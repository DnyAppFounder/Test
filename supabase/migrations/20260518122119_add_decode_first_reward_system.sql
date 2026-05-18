/*
  # Decode the 7 Fragments — First-Time Reward System

  ## Summary
  Adds persistent tracking for the one-time first-completion reward for "Decode the 7 Fragments"
  Free Practice mode. A player who finds all 7 fragments in Free Practice for the first time
  unlocks 15,000 DWORLD. Ranked and SOL Duel modes do NOT grant this reward.

  ## New Tables
  - `decode_reward_status`
    - `id` (uuid, pk)
    - `wallet_address` (text, unique) — one record per wallet ever
    - `user_id` (uuid, nullable, fk → user_profiles)
    - `free_practice_completed` (boolean) — set true on first full solve in Free Practice
    - `completed_at` (timestamptz)
    - `reward_unlocked` (boolean) — true once 15k DWORLD is available to claim
    - `unlocked_at` (timestamptz)
    - `first_message_shown` (boolean) — true after the lore message was displayed once
    - `claimed` (boolean) — true after successful DWORLD transfer
    - `claimed_at` (timestamptz)
    - `claim_tx_signature` (text) — Solana tx sig of the transfer
    - `created_at` / `updated_at`

  ## New Functions (SECURITY DEFINER)
  - `grant_decode_first_reward(p_wallet_address, p_user_id)` — atomically inserts
    `decode_reward_status` and `user_rewards` record (15k DWORLD, reason
    'decode_first_completion'). Returns `{success, reason}` JSON. Idempotent.
  - `mark_decode_message_shown(p_wallet_address)` — marks `first_message_shown = true`.

  ## Security
  - RLS enabled; public SELECT only (wallet-auth app, no auth.uid() available).
  - All INSERT / UPDATE go through SECURITY DEFINER functions so RLS cannot be bypassed.
*/

-- ─── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS decode_reward_status (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address        text        UNIQUE NOT NULL,
  user_id               uuid        REFERENCES user_profiles(id) ON DELETE SET NULL,
  free_practice_completed boolean   DEFAULT false,
  completed_at          timestamptz,
  reward_unlocked       boolean     DEFAULT false,
  unlocked_at           timestamptz,
  first_message_shown   boolean     DEFAULT false,
  claimed               boolean     DEFAULT false,
  claimed_at            timestamptz,
  claim_tx_signature    text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE decode_reward_status ENABLE ROW LEVEL SECURITY;

-- Public read: client queries by wallet_address
CREATE POLICY "Anyone can read decode reward status"
  ON decode_reward_status FOR SELECT
  TO public
  USING (true);

-- All writes go through SECURITY DEFINER functions — no direct DML policies needed

-- ─── grant_decode_first_reward ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.grant_decode_first_reward(
  p_wallet_address text,
  p_user_id        uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_id  uuid;
  v_reward_id  uuid;
BEGIN
  -- Idempotency: already unlocked for this wallet?
  IF EXISTS (
    SELECT 1 FROM decode_reward_status
    WHERE wallet_address = p_wallet_address
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_unlocked');
  END IF;

  -- Insert status record (unique constraint is the final guard against races)
  INSERT INTO decode_reward_status (
    wallet_address, user_id,
    free_practice_completed, completed_at,
    reward_unlocked, unlocked_at
  ) VALUES (
    p_wallet_address, p_user_id,
    true, now(),
    true, now()
  )
  ON CONFLICT (wallet_address) DO NOTHING
  RETURNING id INTO v_status_id;

  -- Conflict means another concurrent call already inserted — abort gracefully
  IF v_status_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'conflict');
  END IF;

  -- Ensure no duplicate user_reward for the same wallet + reason
  IF NOT EXISTS (
    SELECT 1 FROM user_rewards
    WHERE wallet_address = p_wallet_address
      AND reason = 'decode_first_completion'
  ) THEN
    INSERT INTO user_rewards (
      user_id, wallet_address,
      reward_token_mint, reward_amount,
      reason, status
    ) VALUES (
      p_user_id, p_wallet_address,
      'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump',
      15000,
      'decode_first_completion',
      'ready'
    )
    RETURNING id INTO v_reward_id;
  END IF;

  RETURN jsonb_build_object(
    'success',    true,
    'status_id',  v_status_id::text,
    'reward_id',  COALESCE(v_reward_id::text, 'existing')
  );
END;
$$;

-- ─── mark_decode_message_shown ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_decode_message_shown(
  p_wallet_address text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE decode_reward_status
  SET first_message_shown = true,
      updated_at = now()
  WHERE wallet_address = p_wallet_address;
END;
$$;
