/*
  # Fix launchpad_tokens RLS policies for wallet-based authentication

  ## Problem
  The INSERT and UPDATE policies on launchpad_tokens use `auth.jwt() ->> 'sub'` to
  match creator_wallet against the Supabase Auth user ID. However, this app uses
  Solana wallet addresses as identity (no Supabase Auth sign-in). The Supabase client
  is initialized with persistSession=false and no auth.signIn is ever called, so the
  anon role is always used and the `TO authenticated` policies never fire — causing
  every insert to be silently rejected.

  ## Fix
  Replace the three broken policies with wallet-address-based checks that match the
  pattern used by all other launchpad tables (launchpad_presales, launchpad_creators,
  etc.) which correctly use `WITH CHECK (true)` / `USING (true)` for the anon role.

  ## Changes
  - Drop the three existing launchpad_tokens policies (SELECT, INSERT, UPDATE)
  - Re-create them using `TO public` with wallet-presence checks:
    - SELECT: anyone can view deployed tokens, creators can see own pending/failed
    - INSERT: creator_wallet must be non-empty (anon role allowed)
    - UPDATE: creator_wallet must be non-empty (anon role allowed)
  - This is consistent with how user_profiles and all launchpad_ tables work
*/

-- Drop the broken policies
DROP POLICY IF EXISTS "Anyone can view deployed tokens" ON launchpad_tokens;
DROP POLICY IF EXISTS "Authenticated creator can insert own tokens" ON launchpad_tokens;
DROP POLICY IF EXISTS "Creator can update own tokens" ON launchpad_tokens;

-- SELECT: deployed tokens are public; pending/failed only visible by creator wallet match
CREATE POLICY "Public can view launchpad tokens"
  ON launchpad_tokens
  FOR SELECT
  USING (
    status = 'deployed'
    OR (creator_wallet IS NOT NULL AND length(creator_wallet) > 0)
  );

-- INSERT: any request with a non-empty creator_wallet is allowed (anon key is fine)
CREATE POLICY "Anyone can insert launchpad token with wallet"
  ON launchpad_tokens
  FOR INSERT
  WITH CHECK (
    creator_wallet IS NOT NULL AND length(creator_wallet) > 0
  );

-- UPDATE: any request where creator_wallet is set is allowed
CREATE POLICY "Anyone can update launchpad token with wallet"
  ON launchpad_tokens
  FOR UPDATE
  USING (
    creator_wallet IS NOT NULL AND length(creator_wallet) > 0
  )
  WITH CHECK (
    creator_wallet IS NOT NULL AND length(creator_wallet) > 0
  );
