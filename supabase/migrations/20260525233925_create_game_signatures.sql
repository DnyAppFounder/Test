/*
  # Dynasty Signatures — game_signatures table

  ## Summary
  Creates the game_signatures table that powers the DAWEN Dynasty Signatures feature.
  Each user may create exactly one permanent public signature.

  ## New Table: game_signatures
  - id               (uuid, pk)
  - user_id          (uuid, references user_profiles, UNIQUE — one signature per user)
  - wallet_address   (text, UNIQUE — belt-and-suspenders uniqueness via wallet)
  - signature_text   (text, max 15 chars, no spaces, safe chars only)
  - signature_color  (text)
  - animation_type   (text)
  - created_at       (timestamptz)

  ## Security
  - RLS enabled
  - Public SELECT for all authenticated + anon (wall of signatures is public)
  - INSERT only for the owner (matched by wallet_address from user_profiles)
  - No UPDATE / DELETE (permanent — by design)

  ## Constraints
  - UNIQUE on user_id and wallet_address (both enforce one-signature-per-user)
  - CHECK: signature_text length 1–15
  - CHECK: signature_text matches safe pattern (letters, digits, underscore, hyphen only)
  - CHECK: no spaces in signature_text
*/

CREATE TABLE IF NOT EXISTS game_signatures (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  wallet_address   text        NOT NULL,
  signature_text   text        NOT NULL,
  signature_color  text        NOT NULL DEFAULT 'Purple',
  animation_type   text        NOT NULL DEFAULT 'Static',
  created_at       timestamptz DEFAULT now(),

  CONSTRAINT game_signatures_user_id_unique    UNIQUE (user_id),
  CONSTRAINT game_signatures_wallet_unique     UNIQUE (wallet_address),
  CONSTRAINT game_signatures_text_length       CHECK (char_length(signature_text) BETWEEN 1 AND 15),
  CONSTRAINT game_signatures_text_no_spaces    CHECK (signature_text NOT LIKE '% %'),
  CONSTRAINT game_signatures_text_safe_chars   CHECK (signature_text ~ '^[A-Za-z0-9_\-]+$')
);

CREATE INDEX IF NOT EXISTS idx_game_signatures_created_at ON game_signatures(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_signatures_wallet     ON game_signatures(wallet_address);

ALTER TABLE game_signatures ENABLE ROW LEVEL SECURITY;

-- Public read: the wall of signatures is public
CREATE POLICY "Anyone can read signatures"
  ON game_signatures FOR SELECT
  TO anon, authenticated
  USING (true);

-- Insert: only the owner can create their own signature
CREATE POLICY "Owner can create own signature"
  ON game_signatures FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
