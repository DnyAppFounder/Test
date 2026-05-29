/*
  # Add Message Reactions, Shared Posts, and Group Invites

  1. New Tables
    - `message_reactions` — emoji reactions on DM messages
      - `id` (uuid, pk)
      - `message_id` (uuid, fk → messages)
      - `user_id` (uuid, fk → user_profiles)
      - `emoji` (text, one of a fixed set)
      - `created_at` (timestamptz)
      - UNIQUE (message_id, user_id, emoji)

    - `group_message_reactions` — emoji reactions on group messages
      - `id` (uuid, pk)
      - `message_id` (uuid, fk → group_messages)
      - `user_id` (uuid, fk → user_profiles)
      - `emoji` (text)
      - `created_at` (timestamptz)
      - UNIQUE (message_id, user_id, emoji)

    - `shared_posts` — posts shared as messages (DM or group)
      - `id` (uuid, pk)
      - `post_id` (uuid, fk → posts)
      - `sender_id` (uuid, fk → user_profiles)
      - `receiver_id` (uuid, nullable — for DMs)
      - `group_id` (uuid, nullable — for groups)
      - `created_at` (timestamptz)

    - `group_invites` — shareable invite links for groups
      - `id` (uuid, pk)
      - `group_id` (uuid, fk → group_conversations)
      - `invite_code` (text, unique random code)
      - `created_by` (uuid, fk → user_profiles)
      - `max_uses` (int, null = unlimited)
      - `uses` (int, default 0)
      - `expires_at` (timestamptz, null = no expiry)
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on all tables
    - Reactions: authenticated users can read all, insert/delete own
    - Shared posts: participants can read, sender can insert
    - Group invites: group members can read/create, admin can delete
*/

-- ── message_reactions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  emoji       text NOT NULL CHECK (emoji IN ('👍','😂','🔥','👀','😮','❤️')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view message reactions"
  ON message_reactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can add own reactions"
  ON message_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own reactions"
  ON message_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ── group_message_reactions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_message_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  emoji       text NOT NULL CHECK (emoji IN ('👍','😂','🔥','👀','😮','❤️')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE group_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view group message reactions"
  ON group_message_reactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can add own group reactions"
  ON group_message_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own group reactions"
  ON group_message_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ── shared_posts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  receiver_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  group_id    uuid REFERENCES group_conversations(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  CHECK (receiver_id IS NOT NULL OR group_id IS NOT NULL)
);

ALTER TABLE shared_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view shared posts"
  ON shared_posts FOR SELECT
  TO authenticated
  USING (
    auth.uid() = sender_id
    OR auth.uid() = receiver_id
    OR (
      group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM group_members
        WHERE group_members.group_id = shared_posts.group_id
          AND group_members.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Authenticated users can share posts"
  ON shared_posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- ── group_invites ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE,
  created_by  uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  max_uses    int,
  uses        int NOT NULL DEFAULT 0,
  expires_at  timestamptz,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE group_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view invites"
  ON group_invites FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_invites.group_id
        AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Group admins and creators can create invites"
  ON group_invites FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND (
      EXISTS (
        SELECT 1 FROM group_conversations
        WHERE group_conversations.id = group_invites.group_id
          AND group_conversations.creator_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM group_members
        WHERE group_members.group_id = group_invites.group_id
          AND group_members.user_id = auth.uid()
          AND group_members.role = 'admin'
      )
    )
  );

CREATE POLICY "Invite creator can delete invites"
  ON group_invites FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Allow unauthenticated read for join-by-link flow (just the code lookup)
CREATE POLICY "Anyone can look up an invite by code"
  ON group_invites FOR SELECT
  TO anon
  USING (true);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_group_message_reactions_message_id ON group_message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_shared_posts_receiver_id ON shared_posts(receiver_id);
CREATE INDEX IF NOT EXISTS idx_shared_posts_group_id ON shared_posts(group_id);
CREATE INDEX IF NOT EXISTS idx_group_invites_code ON group_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_group_invites_group_id ON group_invites(group_id);

-- ── Enable realtime ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'group_message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE group_message_reactions;
  END IF;
END $$;
