/*
  # Fix Launchpad RLS for wallet-based (anon) auth + Storage MIME types

  ## Problem
  This app uses Solana wallet addresses as identity — no Supabase Auth sign-in,
  so the Supabase client always runs as the `anon` role. All INSERT/UPDATE policies
  on launchpad_transactions, launchpad_token_metadata, and launchpad_creators are
  scoped to `TO authenticated`, which silently blocks every write from the app.

  ## Changes

  ### launchpad_transactions
  - Drop: "Authenticated users can insert transactions"
  - Drop: "Authenticated users can update transactions"
  - Add: INSERT for public (anon) with non-empty wallet check
  - Add: UPDATE for public (anon) with non-empty wallet check

  ### launchpad_token_metadata
  - Drop: "Authenticated users can insert metadata"
  - Add: INSERT for public (anon)

  ### launchpad_creators
  - Drop: "Authenticated users can insert creator profile"
  - Drop: "Creator can update own profile"
  - Add: INSERT for public (anon) with non-empty wallet check
  - Add: UPDATE for public (anon) with non-empty wallet check

  ### storage.buckets — post-media
  - Add application/json to allowed_mime_types so metadata JSON uploads succeed
*/

-- ── launchpad_transactions ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert transactions" ON launchpad_transactions;
DROP POLICY IF EXISTS "Authenticated users can update transactions" ON launchpad_transactions;

CREATE POLICY "Anyone can insert launchpad transaction with wallet"
  ON launchpad_transactions
  FOR INSERT
  WITH CHECK (wallet IS NOT NULL AND length(wallet) > 0);

CREATE POLICY "Anyone can update launchpad transaction with wallet"
  ON launchpad_transactions
  FOR UPDATE
  USING (wallet IS NOT NULL AND length(wallet) > 0)
  WITH CHECK (wallet IS NOT NULL AND length(wallet) > 0);

-- ── launchpad_token_metadata ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert metadata" ON launchpad_token_metadata;

CREATE POLICY "Anyone can insert token metadata"
  ON launchpad_token_metadata
  FOR INSERT
  WITH CHECK (true);

-- ── launchpad_creators ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert creator profile" ON launchpad_creators;
DROP POLICY IF EXISTS "Creator can update own profile" ON launchpad_creators;

CREATE POLICY "Anyone can insert creator profile with wallet"
  ON launchpad_creators
  FOR INSERT
  WITH CHECK (wallet_address IS NOT NULL AND length(wallet_address) > 0);

CREATE POLICY "Anyone can update creator profile with wallet"
  ON launchpad_creators
  FOR UPDATE
  USING (wallet_address IS NOT NULL AND length(wallet_address) > 0)
  WITH CHECK (wallet_address IS NOT NULL AND length(wallet_address) > 0);

-- ── post-media bucket: allow application/json for metadata uploads ─────────────

UPDATE storage.buckets
SET allowed_mime_types = array_append(
  COALESCE(allowed_mime_types, ARRAY[]::text[]),
  'application/json'
)
WHERE name = 'post-media'
  AND NOT ('application/json' = ANY(COALESCE(allowed_mime_types, ARRAY[]::text[])));
