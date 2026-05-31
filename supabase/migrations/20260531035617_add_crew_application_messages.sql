/*
  # Add Crew Application Messages System

  ## Summary
  Adds a dedicated messaging table for crew application conversations between
  admins/managers and applicants. Also adds a crew_application_id column to
  notifications so crew message notifications can reference the correct thread.

  ## New Tables
  - `crew_application_messages`
    - `id` (uuid, primary key)
    - `application_id` (uuid, FK to crew_applications)
    - `sender_id` (uuid, FK to user_profiles - the sender)
    - `message` (text - the message content)
    - `sender_role` ('admin' | 'applicant') - who sent it
    - `is_internal` (boolean, default false) - internal admin-only notes not shown to applicant
    - `created_at` (timestamptz)

  ## Modified Tables
  - `notifications`
    - Add `crew_application_id` (uuid, nullable) - references crew_applications for crew message notifications

  ## Security
  - Enable RLS on crew_application_messages
  - Admins (crew_members with founder/community_manager) can read/write all messages for their apps
  - Applicants can only read/write messages for their own applications (non-internal only)
*/

-- Create crew application messages table
CREATE TABLE IF NOT EXISTS crew_application_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    uuid NOT NULL REFERENCES crew_applications(id) ON DELETE CASCADE,
  sender_id         uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  message           text NOT NULL,
  sender_role       text NOT NULL DEFAULT 'admin' CHECK (sender_role IN ('admin', 'applicant')),
  is_internal       boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_app_messages_application_id
  ON crew_application_messages(application_id, created_at DESC);

ALTER TABLE crew_application_messages ENABLE ROW LEVEL SECURITY;

-- Admins (founder/community_manager crew members) can read all messages
CREATE POLICY "Crew admins can read application messages"
  ON crew_application_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crew_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.role_key IN ('founder', 'community_manager')
        AND cm.status = 'active'
    )
  );

-- Admins can insert messages for any application
CREATE POLICY "Crew admins can insert application messages"
  ON crew_application_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crew_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.role_key IN ('founder', 'community_manager')
        AND cm.status = 'active'
    )
    AND sender_id = auth.uid()
  );

-- Applicants can read non-internal messages for their own applications
CREATE POLICY "Applicants can read their own application messages"
  ON crew_application_messages FOR SELECT
  TO anon
  USING (
    is_internal = false
    AND EXISTS (
      SELECT 1 FROM crew_applications ca
      WHERE ca.id = crew_application_messages.application_id
        AND ca.user_id = auth.uid()
    )
  );

-- Applicants can reply (insert messages with sender_role='applicant')
CREATE POLICY "Applicants can reply to application messages"
  ON crew_application_messages FOR INSERT
  TO anon
  WITH CHECK (
    is_internal = false
    AND sender_role = 'applicant'
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM crew_applications ca
      WHERE ca.id = crew_application_messages.application_id
        AND ca.user_id = auth.uid()
    )
  );

-- Add crew_application_id column to notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'crew_application_id'
  ) THEN
    ALTER TABLE notifications ADD COLUMN crew_application_id uuid REFERENCES crew_applications(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_crew_application_id
  ON notifications(crew_application_id)
  WHERE crew_application_id IS NOT NULL;
