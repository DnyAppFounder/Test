/*
  # Upgrade Social Chat: Media, Group Topics, Group Pins

  ## Changes

  1. Messages table — add media support
     - `media_url` (text): URL to uploaded media in Supabase Storage
     - `media_type` (text): 'image' | 'video'
     - `media_thumbnail_url` (text): video thumbnail URL

  2. Group Messages table — add media + topic support
     - `media_url`, `media_type`, `media_thumbnail_url`: same as above
     - `topic_id` (uuid): FK to group_topics (nullable = General/default thread)

  3. New table: `group_topics`
     - Topics/channels inside a group (like Telegram topics)
     - Each group has a default "General" topic
     - Creator/admin can add/rename/delete topics

  4. New table: `group_pins`
     - Pinned messages inside a group
     - Only group creator/admin can pin/unpin

  ## Security
  - RLS enabled on all new tables
  - group_topics: members can read; only creator can insert/update/delete
  - group_pins: members can read; only creator can insert/delete
*/

-- ── 1. Add media columns to messages (DM) ────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='media_url') THEN
    ALTER TABLE messages ADD COLUMN media_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='media_type') THEN
    ALTER TABLE messages ADD COLUMN media_type text CHECK (media_type IN ('image','video'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='media_thumbnail_url') THEN
    ALTER TABLE messages ADD COLUMN media_thumbnail_url text;
  END IF;
END $$;

-- ── 2. Add media + topic columns to group_messages ───────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='group_messages' AND column_name='media_url') THEN
    ALTER TABLE group_messages ADD COLUMN media_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='group_messages' AND column_name='media_type') THEN
    ALTER TABLE group_messages ADD COLUMN media_type text CHECK (media_type IN ('image','video'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='group_messages' AND column_name='media_thumbnail_url') THEN
    ALTER TABLE group_messages ADD COLUMN media_thumbnail_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='group_messages' AND column_name='topic_id') THEN
    ALTER TABLE group_messages ADD COLUMN topic_id uuid;
  END IF;
END $$;

-- ── 3. group_topics ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS group_topics (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  name       text NOT NULL DEFAULT 'General',
  created_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(group_id, name)
);

ALTER TABLE group_topics ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_group_topics_group ON group_topics(group_id);

-- Add FK from group_messages to group_topics (after table exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name='group_messages_topic_id_fkey'
  ) THEN
    ALTER TABLE group_messages
      ADD CONSTRAINT group_messages_topic_id_fkey
      FOREIGN KEY (topic_id) REFERENCES group_topics(id) ON DELETE SET NULL;
  END IF;
END $$;

-- RLS: group members can read topics
CREATE POLICY "Group members can view topics"
  ON group_topics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_topics.group_id
        AND gm.user_id IN (
          SELECT id FROM user_profiles
          WHERE wallet_address = lower((auth.jwt()->>'sub')::text)
        )
    )
  );

-- RLS: only group creator can insert topics
CREATE POLICY "Group creator can create topics"
  ON group_topics FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_conversations gc
      WHERE gc.id = group_topics.group_id
        AND gc.creator_id IN (
          SELECT id FROM user_profiles
          WHERE wallet_address = lower((auth.jwt()->>'sub')::text)
        )
    )
  );

-- RLS: only group creator can update topics
CREATE POLICY "Group creator can update topics"
  ON group_topics FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_conversations gc
      WHERE gc.id = group_topics.group_id
        AND gc.creator_id IN (
          SELECT id FROM user_profiles
          WHERE wallet_address = lower((auth.jwt()->>'sub')::text)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_conversations gc
      WHERE gc.id = group_topics.group_id
        AND gc.creator_id IN (
          SELECT id FROM user_profiles
          WHERE wallet_address = lower((auth.jwt()->>'sub')::text)
        )
    )
  );

-- RLS: only group creator can delete topics (not the default one)
CREATE POLICY "Group creator can delete non-default topics"
  ON group_topics FOR DELETE
  TO authenticated
  USING (
    is_default = false
    AND EXISTS (
      SELECT 1 FROM group_conversations gc
      WHERE gc.id = group_topics.group_id
        AND gc.creator_id IN (
          SELECT id FROM user_profiles
          WHERE wallet_address = lower((auth.jwt()->>'sub')::text)
        )
    )
  );

-- ── 4. group_pins ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS group_pins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  message_id  uuid NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
  pinned_by   uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  pinned_at   timestamptz DEFAULT now(),
  UNIQUE(group_id, message_id)
);

ALTER TABLE group_pins ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_group_pins_group ON group_pins(group_id, pinned_at DESC);

-- RLS: group members can read pins
CREATE POLICY "Group members can view pins"
  ON group_pins FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_pins.group_id
        AND gm.user_id IN (
          SELECT id FROM user_profiles
          WHERE wallet_address = lower((auth.jwt()->>'sub')::text)
        )
    )
  );

-- RLS: only group creator can add pins
CREATE POLICY "Group creator can pin messages"
  ON group_pins FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_conversations gc
      WHERE gc.id = group_pins.group_id
        AND gc.creator_id IN (
          SELECT id FROM user_profiles
          WHERE wallet_address = lower((auth.jwt()->>'sub')::text)
        )
    )
  );

-- RLS: only group creator can remove pins
CREATE POLICY "Group creator can unpin messages"
  ON group_pins FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_conversations gc
      WHERE gc.id = group_pins.group_id
        AND gc.creator_id IN (
          SELECT id FROM user_profiles
          WHERE wallet_address = lower((auth.jwt()->>'sub')::text)
        )
    )
  );
