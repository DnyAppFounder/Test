/*
  # Social & Premium Features Migration

  ## New Tables
  - `user_blocks` — tracks who blocked whom
  - `conversation_preferences` — per-user archive/hide/delete state for DM threads
  - `group_conversations` — premium group chat rooms
  - `group_members` — group membership roster
  - `group_messages` — messages within group chats

  ## Modified Tables
  - `posts`: `post_animated` boolean, `text_color` text (premium)
  - `user_profiles`: `name_color` text (premium)

  ## Security
  - RLS enabled on all new tables with ownership-based policies
*/

-- ── user_blocks ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id  uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);

CREATE POLICY "Users can view their own blocks"
  ON user_blocks FOR SELECT TO authenticated
  USING (blocker_id IN (SELECT id FROM user_profiles WHERE wallet_address = lower((auth.jwt()->>'sub')::text)));

CREATE POLICY "Users can create blocks"
  ON user_blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id IN (SELECT id FROM user_profiles WHERE wallet_address = lower((auth.jwt()->>'sub')::text)));

CREATE POLICY "Users can delete their own blocks"
  ON user_blocks FOR DELETE TO authenticated
  USING (blocker_id IN (SELECT id FROM user_profiles WHERE wallet_address = lower((auth.jwt()->>'sub')::text)));

-- ── conversation_preferences ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_preferences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  partner_id  uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  is_archived boolean DEFAULT false,
  is_hidden   boolean DEFAULT false,
  is_deleted  boolean DEFAULT false,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, partner_id)
);
ALTER TABLE conversation_preferences ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_conv_prefs_user ON conversation_preferences(user_id);

CREATE POLICY "Users can view their own conversation preferences"
  ON conversation_preferences FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM user_profiles WHERE wallet_address = lower((auth.jwt()->>'sub')::text)));

CREATE POLICY "Users can insert their own conversation preferences"
  ON conversation_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM user_profiles WHERE wallet_address = lower((auth.jwt()->>'sub')::text)));

CREATE POLICY "Users can update their own conversation preferences"
  ON conversation_preferences FOR UPDATE TO authenticated
  USING (user_id IN (SELECT id FROM user_profiles WHERE wallet_address = lower((auth.jwt()->>'sub')::text)))
  WITH CHECK (user_id IN (SELECT id FROM user_profiles WHERE wallet_address = lower((auth.jwt()->>'sub')::text)));

-- ── group_conversations ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL DEFAULT '',
  creator_id  uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  avatar_url  text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE group_conversations ENABLE ROW LEVEL SECURITY;

-- ── group_members ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_members (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  uuid NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

-- ── group_messages ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  content     text NOT NULL DEFAULT '',
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id, created_at DESC);

-- ── Policies that reference cross-tables (added after both tables exist) ──────

CREATE POLICY "Group members can view group conversations"
  ON group_conversations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_conversations.id
        AND gm.user_id IN (SELECT id FROM user_profiles WHERE wallet_address = lower((auth.jwt()->>'sub')::text))
    )
  );

CREATE POLICY "Users can create group conversations"
  ON group_conversations FOR INSERT TO authenticated
  WITH CHECK (creator_id IN (SELECT id FROM user_profiles WHERE wallet_address = lower((auth.jwt()->>'sub')::text)));

CREATE POLICY "Members can view group memberships"
  ON group_members FOR SELECT TO authenticated
  USING (
    user_id IN (SELECT id FROM user_profiles WHERE wallet_address = lower((auth.jwt()->>'sub')::text))
    OR
    EXISTS (
      SELECT 1 FROM group_members gm2
      WHERE gm2.group_id = group_members.group_id
        AND gm2.user_id IN (SELECT id FROM user_profiles WHERE wallet_address = lower((auth.jwt()->>'sub')::text))
    )
  );

CREATE POLICY "Group creators can add members"
  ON group_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_conversations gc
      WHERE gc.id = group_id
        AND gc.creator_id IN (SELECT id FROM user_profiles WHERE wallet_address = lower((auth.jwt()->>'sub')::text))
    )
    OR
    user_id IN (SELECT id FROM user_profiles WHERE wallet_address = lower((auth.jwt()->>'sub')::text))
  );

CREATE POLICY "Group members can view messages"
  ON group_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_messages.group_id
        AND gm.user_id IN (SELECT id FROM user_profiles WHERE wallet_address = lower((auth.jwt()->>'sub')::text))
    )
  );

CREATE POLICY "Group members can send messages"
  ON group_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id IN (SELECT id FROM user_profiles WHERE wallet_address = lower((auth.jwt()->>'sub')::text))
    AND
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_messages.group_id
        AND gm.user_id = sender_id
    )
  );

-- ── posts: premium columns ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='post_animated') THEN
    ALTER TABLE posts ADD COLUMN post_animated boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='text_color') THEN
    ALTER TABLE posts ADD COLUMN text_color text;
  END IF;
END $$;

-- ── user_profiles: name_color ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='name_color') THEN
    ALTER TABLE user_profiles ADD COLUMN name_color text;
  END IF;
END $$;

-- ── Realtime ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE group_messages;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;
