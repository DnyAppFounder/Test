/*
  # Fix user_rewards.user_id — make nullable

  ## Problem
  user_rewards.user_id is NOT NULL with no default value.
  The create_signature_wall_reward() DB function inserts with v_user_id which
  can be NULL when the wallet has no row in user_profiles (e.g. wallet-only users
  who signed the wall but never went through the profile creation flow).
  This causes "null value in column user_id violates not-null constraint" →
  RPC returns error → ensureReward() returns null →
  UI shows "Could not create your Signature Wall reward."

  ## Fix
  Drop the NOT NULL constraint on user_rewards.user_id.
  wallet_address is the authoritative identity column — user_id is supplemental.
  All existing data is unaffected (existing rows already have valid user_ids).

  ## Security
  No RLS changes required. Existing policies are unaffected.
*/

ALTER TABLE user_rewards ALTER COLUMN user_id DROP NOT NULL;
