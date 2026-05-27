/*
  # Fix referral rewards unique constraints

  ## Problem
  The `user_rewards_wallet_reason_unique` index on (wallet_address, reason) prevents
  referrers from earning multiple `referral_referrer` rewards (one per person they refer).
  This is incorrect — referrers should earn 300 DWORLD for each person they refer.

  ## Changes
  1. Drop the overly broad unique index on (wallet_address, reason)
  2. Keep only the existing per-user unique constraint for `referral_referred`
     (idx_user_rewards_referral_referred_unique) which correctly prevents a referred
     user from getting more than one welcome bonus

  ## Note
  No data is deleted. Only the index definition changes.
*/

DROP INDEX IF EXISTS user_rewards_wallet_reason_unique;
