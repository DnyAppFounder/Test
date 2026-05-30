/*
  # Add missing crew member delete policy and internal notes public policy

  1. Changes
    - crew_members: add public DELETE policy (needed for role removal by admins)
    - crew_internal_notes: add public SELECT/INSERT policies (admin notes panel)
      Notes are admin-only in the UI; RLS is permissive here, access is
      application-level (only shown to admin-role users).

  2. Notes
    - Follows the same wallet-based auth pattern as all other crew tables
*/

-- Allow admins to remove crew members via the UI
DROP POLICY IF EXISTS "Public can delete crew members" ON crew_members;

CREATE POLICY "Public can delete crew members"
  ON crew_members FOR DELETE
  TO public
  USING (true);

-- Allow admins to read/write internal notes
DROP POLICY IF EXISTS "Public can read crew internal notes" ON crew_internal_notes;
DROP POLICY IF EXISTS "Public can insert crew internal notes" ON crew_internal_notes;

CREATE POLICY "Public can read crew internal notes"
  ON crew_internal_notes FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert crew internal notes"
  ON crew_internal_notes FOR INSERT
  TO public
  WITH CHECK (true);
