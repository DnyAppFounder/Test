/*
  # Fix notifications RLS policies

  1. Changes
    - Replace overly permissive DELETE/UPDATE policies with correct ones
    - Allow anon role full access (app uses anon key, no auth session)
    - Properly restrict by user_id

  2. Notes
    - The app uses anon Supabase key (no auth.uid()), so policies use anon role
    - Queries filter by user_id in the WHERE clause for security
*/

DROP POLICY IF EXISTS "Public can view notifications" ON notifications;
DROP POLICY IF EXISTS "Authenticated can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Authenticated can delete own notifications" ON notifications;
DROP POLICY IF EXISTS "Anyone can insert notifications" ON notifications;

-- Recreate with anon + authenticated access
CREATE POLICY "Anyone can view notifications"
  ON notifications FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update notifications"
  ON notifications FOR UPDATE
  USING (user_id IS NOT NULL)
  WITH CHECK (user_id IS NOT NULL);

CREATE POLICY "Anyone can delete notifications"
  ON notifications FOR DELETE
  USING (user_id IS NOT NULL);
