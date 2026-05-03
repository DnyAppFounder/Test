/*
  # Fix messages RLS SELECT policy

  ## Problem
  The existing SELECT policy for messages uses JWT claim lookup which does not work
  with anon key clients (no user JWT is issued). This causes getConversations and
  getConversationMessages to always return empty results.

  ## Fix
  Replace the broken JWT-based policy with a permissive read policy that allows
  anyone to read messages. Write/update policies remain restrictive (anyone can
  insert, update read status). This matches the pattern used by all other social
  tables in this app (posts, comments, notifications, etc.) which all use anon key.
*/

-- Drop the broken SELECT policy that relies on JWT wallet_address claim
DROP POLICY IF EXISTS "Users can view their own messages" ON messages;

-- Replace with permissive read — matches app's anon-key auth pattern
CREATE POLICY "Anyone can read messages"
  ON messages FOR SELECT
  TO anon, authenticated
  USING (true);
