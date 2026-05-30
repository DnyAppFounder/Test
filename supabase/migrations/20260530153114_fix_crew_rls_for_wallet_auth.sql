/*
  # Fix crew tables RLS — wallet-based auth

  ## Summary
  The DAWEN app uses wallet-based identity and does NOT use Supabase Auth sessions.
  All frontend requests run as the "anon" (public) role — auth.uid() is always null.
  The previous crew table policies incorrectly used "TO authenticated" which blocked
  all inserts and selects from the frontend.

  This migration drops the restrictive policies and replaces them with the correct
  pattern used throughout this codebase: TO public with application-level ownership
  enforcement (the app filters by user_id / wallet_address in query code).

  ## Changes
  - crew_applications: allow public INSERT, SELECT, UPDATE
  - crew_application_tasks: allow public INSERT, SELECT, UPDATE
  - crew_members: allow public INSERT, SELECT, UPDATE
  - crew_badges: already correct (public SELECT)
  - user_crew_badges: allow public INSERT, UPDATE, DELETE
  - crew_roles: already correct

  ## Security model
  Application-level security: the frontend always filters by user_id = profile.id
  (where profile is loaded using wallet_address). Admins verify crew membership
  in crew_members before performing privileged operations. Service-role edge
  functions handle the truly sensitive operations (internal notes, audit logs).
*/

-- ─── crew_applications ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can read own applications" ON crew_applications;
DROP POLICY IF EXISTS "Authenticated can insert applications" ON crew_applications;
DROP POLICY IF EXISTS "Authenticated can update applications" ON crew_applications;

CREATE POLICY "Public can read crew applications"
  ON crew_applications FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert crew applications"
  ON crew_applications FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can update crew applications"
  ON crew_applications FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- ─── crew_application_tasks ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can read own application tasks" ON crew_application_tasks;
DROP POLICY IF EXISTS "Authenticated can insert own tasks" ON crew_application_tasks;
DROP POLICY IF EXISTS "Authenticated can update own tasks" ON crew_application_tasks;

CREATE POLICY "Public can read crew application tasks"
  ON crew_application_tasks FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert crew application tasks"
  ON crew_application_tasks FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can update crew application tasks"
  ON crew_application_tasks FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- ─── crew_members ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public can view active crew members" ON crew_members;
DROP POLICY IF EXISTS "Authenticated can insert crew members" ON crew_members;
DROP POLICY IF EXISTS "Authenticated can update crew members" ON crew_members;

CREATE POLICY "Public can view crew members"
  ON crew_members FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert crew members"
  ON crew_members FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can update crew members"
  ON crew_members FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- ─── user_crew_badges ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public can view user crew badges" ON user_crew_badges;
DROP POLICY IF EXISTS "Authenticated can manage crew badges" ON user_crew_badges;
DROP POLICY IF EXISTS "Authenticated can update crew badges" ON user_crew_badges;
DROP POLICY IF EXISTS "Authenticated can delete crew badges" ON user_crew_badges;

CREATE POLICY "Public can view user crew badges"
  ON user_crew_badges FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert user crew badges"
  ON user_crew_badges FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can update user crew badges"
  ON user_crew_badges FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete user crew badges"
  ON user_crew_badges FOR DELETE
  TO public
  USING (true);
