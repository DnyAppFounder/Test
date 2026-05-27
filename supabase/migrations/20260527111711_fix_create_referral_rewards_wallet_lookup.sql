/*
  # Fix create_referral_rewards to ensure referrer wallet address is populated

  ## Problem
  When applyReferralCode is called, it fetches the referrer's wallet_address from
  user_profiles and passes it to create_referral_rewards. However if the profile
  row has wallet_address = NULL or '' (e.g. connected/external wallet users),
  the reward row gets an empty wallet_address and cannot be claimed via
  the reward-claim edge function which matches by wallet_address.

  ## Fix
  Update create_referral_rewards to:
  1. If p_referrer_wallet is empty, look up the wallet_address directly from
     user_profiles using p_referrer_user_id as a fallback
  2. Only insert the referrer reward if a valid wallet address is found
     (otherwise the reward would be unclaimable)
  3. The referred reward always uses p_referred_wallet (passed from applyReferralCode
     which has the active connected wallet address)
*/

CREATE OR REPLACE FUNCTION create_referral_rewards(
  p_referrer_user_id uuid,
  p_referrer_wallet   text,
  p_referred_user_id  uuid,
  p_referred_wallet   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_amount  integer := 300;
  v_referred_amount  integer := 150;
  v_mint             text    := 'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump';
  v_referrer_wallet  text    := p_referrer_wallet;
BEGIN
  -- If referrer wallet was not provided or is empty, look it up from the profile
  IF v_referrer_wallet IS NULL OR trim(v_referrer_wallet) = '' THEN
    SELECT wallet_address INTO v_referrer_wallet
    FROM user_profiles
    WHERE id = p_referrer_user_id
    LIMIT 1;
  END IF;

  -- Only create referrer reward if we have a valid wallet address to send to
  IF v_referrer_wallet IS NOT NULL AND trim(v_referrer_wallet) != '' THEN
    INSERT INTO user_rewards
      (user_id, wallet_address, reward_token_mint, reward_amount, reason, status)
    VALUES
      (p_referrer_user_id, v_referrer_wallet, v_mint, v_referrer_amount, 'referral_referrer', 'ready');
  END IF;

  -- Referred user reward (unique index prevents duplicates)
  INSERT INTO user_rewards
    (user_id, wallet_address, reward_token_mint, reward_amount, reason, status)
  VALUES
    (p_referred_user_id, COALESCE(p_referred_wallet, ''), v_mint, v_referred_amount, 'referral_referred', 'ready')
  ON CONFLICT DO NOTHING;
END;
$$;
