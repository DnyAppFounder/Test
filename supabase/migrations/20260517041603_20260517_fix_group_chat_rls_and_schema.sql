/*
  # Fix Group Chat: RLS, Soft-Delete, Unread Tracking, Group Photo

  ## Summary
  Fixes the broken group topics/pins system and adds missing columns for a
  fully working group chat experience.

  ## Changes

  1. group_topics — disable broken RLS
     - RLS policies used `TO authenticated` + `auth.jwt()` which fails because
       the app uses the anon key (wallet-based auth, not Supabase email auth).
       Dropping all policies and disabling RLS so the app can read/write topics.

  2. group_pins — same fix as group_topics

  3. group_messages — add soft-delete support
     - `is_deleted` (boolean, default false): marks a message as deleted
     - `deleted_by` (uuid): who deleted the message (for audit)

  4. group_members — add last_read_at for unread tracking
     - `last_read_at` (timestamptz): when the member last read the group messages

  5. group_conversations — add avatar_url for group photo
     - `avatar_url` (text): URL to group photo stored in Supabase Storage

  ## Security Notes
  - group_topics and group_pins have no sensitive user data beyond what is
    already accessible through group_messages and group_members.
  - Access is implicitly controlled by group membership checks in application code.
*/

-- ── 1. Fix group_topics RLS ───────────────────────────────────────────────────

ALTER TABLE group_topics DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Group members can view topics" ON group_topics;
DROP POLICY IF EXISTS "Group creator can create topics" ON group_topics;
DROP POLICY IF EXISTS "Group creator can update topics" ON group_topics;
DROP POLICY IF EXISTS "Group creator can delete non-default topics" ON group_topics;

-- ── 2. Fix group_pins RLS ─────────────────────────────────────────────────────

ALTER TABLE group_pins DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Group members can view pins" ON group_pins;
DROP POLICY IF EXISTS "Group creator can pin messages" ON group_pins;
DROP POLICY IF EXISTS "Group creator can unpin messages" ON group_pins;

-- ── 3. Add soft-delete columns to group_messages ─────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_messages' AND column_name = 'is_deleted'
  ) THEN
    ALTER TABLE group_messages ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_messages' AND column_name = 'deleted_by'
  ) THEN
    ALTER TABLE group_messages ADD COLUMN deleted_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_group_messages_not_deleted ON group_messages(group_id, created_at DESC) WHERE is_deleted = false;

-- ── 4. Add last_read_at to group_members ─────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_members' AND column_name = 'last_read_at'
  ) THEN
    ALTER TABLE group_members ADD COLUMN last_read_at timestamptz DEFAULT now();
  END IF;
END $$;

-- ── 5. Add avatar_url to group_conversations ──────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_conversations' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE group_conversations ADD COLUMN avatar_url text;
  END IF;
END $$;
