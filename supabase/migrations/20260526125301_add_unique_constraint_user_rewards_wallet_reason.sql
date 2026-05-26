/*
  # Add unique constraint on user_rewards (wallet_address, reason)

  1. Changes
    - Adds a unique index on user_rewards(wallet_address, reason)
    - Enables safe upsert with ignoreDuplicates for dynasty_signature and similar one-per-wallet rewards
    - Does not affect existing data (no rows are deleted or modified)
*/

CREATE UNIQUE INDEX IF NOT EXISTS user_rewards_wallet_reason_unique
  ON user_rewards (wallet_address, reason);
