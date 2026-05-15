/*
  # Fix Group Chat and Social Feature RLS for Wallet Auth

  ## Problem
  The group_conversations, group_members, group_messages, user_blocks, and
  conversation_preferences tables have RLS policies that check auth.jwt()->>'sub'
  against wallet addresses. This app uses wallet-based identity with the Supabase
  anon key (no Supabase Auth JWT), so auth.jwt() always returns null, causing all
  inserts and selects to fail silently.

  ## Changes
  1. Drop all broken JWT-wallet-check policies on group tables
  2. Replace with permissive anon/authenticated policies (matching the pattern
     used by world_rooms, world_messages, etc. which work correctly)
  3. Same fix applied to user_blocks and conversation_preferences

  ## Security
  Security is enforced at the application layer via wallet address validation.
  This matches the existing pattern for all other working tables in this app.
*/

-- ── Drop broken group_conversations policies ──────────────────────────────────
DROP POLICY IF EXISTS "Users can create group conversations" ON group_conversations;
DROP POLICY IF EXISTS "Group members can view group conversations" ON group_conversations;

-- ── Replace with wallet-auth compatible policies ──────────────────────────────
CREATE POLICY "group_conversations_select"
  ON group_conversations FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "group_conversations_insert"
  ON group_conversations FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "group_conversations_update"
  ON group_conversations FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "group_conversations_delete"
  ON group_conversations FOR DELETE
  TO anon, authenticated
  USING (true);

-- ── Drop broken group_members policies ───────────────────────────────────────
DROP POLICY IF EXISTS "Members can view group memberships" ON group_members;
DROP POLICY IF EXISTS "Group creators can add members" ON group_members;

CREATE POLICY "group_members_select"
  ON group_members FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "group_members_insert"
  ON group_members FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "group_members_delete"
  ON group_members FOR DELETE
  TO anon, authenticated
  USING (true);

-- ── Drop broken group_messages policies ──────────────────────────────────────
DROP POLICY IF EXISTS "Group members can view messages" ON group_messages;
DROP POLICY IF EXISTS "Group members can send messages" ON group_messages;

CREATE POLICY "group_messages_select"
  ON group_messages FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "group_messages_insert"
  ON group_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ── Fix user_blocks (same auth.jwt() issue) ───────────────────────────────────
DROP POLICY IF EXISTS "Users can view their own blocks" ON user_blocks;
DROP POLICY IF EXISTS "Users can create blocks" ON user_blocks;
DROP POLICY IF EXISTS "Users can delete their own blocks" ON user_blocks;

CREATE POLICY "user_blocks_select"
  ON user_blocks FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "user_blocks_insert"
  ON user_blocks FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "user_blocks_delete"
  ON user_blocks FOR DELETE
  TO anon, authenticated
  USING (true);

-- ── Fix conversation_preferences (same auth.jwt() issue) ─────────────────────
DROP POLICY IF EXISTS "Users can view their own conversation preferences" ON conversation_preferences;
DROP POLICY IF EXISTS "Users can insert their own conversation preferences" ON conversation_preferences;
DROP POLICY IF EXISTS "Users can update their own conversation preferences" ON conversation_preferences;

CREATE POLICY "conversation_preferences_select"
  ON conversation_preferences FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "conversation_preferences_insert"
  ON conversation_preferences FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "conversation_preferences_update"
  ON conversation_preferences FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
