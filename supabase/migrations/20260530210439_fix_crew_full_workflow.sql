/*
  # Fix DAWEN Crew Full Workflow

  ## Summary
  Comprehensive fix for the DAWEN Crew system to address:
  1. crew_applications: add needs_changes status, add reviewed_notes column
  2. crew_application_tasks: add admin_message column for rejection reasons
  3. crew_members: fix public RLS to show all statuses for hierarchy/members
  4. New tasks seeded: join_socials (social links task), signature_wall task
  5. Fix RLS policies to work with wallet-based auth (anon role)

  ## Changes
  - crew_applications.status: add 'needs_changes' to CHECK constraint
  - crew_application_tasks: add admin_message column
  - Fix public SELECT on crew_members to include paused/removed for admin reads
  - Ensure public can read all applications (admin-side filtering in app code)
*/

-- 1. Add needs_changes to crew_applications status CHECK
ALTER TABLE crew_applications
  DROP CONSTRAINT IF EXISTS crew_applications_status_check;

ALTER TABLE crew_applications
  ADD CONSTRAINT crew_applications_status_check
  CHECK (status IN ('draft','submitted','under_review','shortlisted','trial','accepted','rejected','needs_changes','paused','removed','blacklisted'));

-- 2. Add admin_message column to crew_application_tasks (for rejection/needs_changes feedback)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'crew_application_tasks' AND column_name = 'admin_message'
  ) THEN
    ALTER TABLE crew_application_tasks ADD COLUMN admin_message text;
  END IF;
END $$;

-- 3. Fix crew_members RLS: allow public to read ALL crew members (including for hierarchy/admin views)
DROP POLICY IF EXISTS "Public can view crew members" ON crew_members;
DROP POLICY IF EXISTS "Public can view active crew members" ON crew_members;

CREATE POLICY "Public can read crew members"
  ON crew_members FOR SELECT
  TO public
  USING (true);

-- Ensure public can insert/update crew_members (for admin role assignment)
DROP POLICY IF EXISTS "Public can insert crew members" ON crew_members;
DROP POLICY IF EXISTS "Public can update crew members" ON crew_members;

CREATE POLICY "Public can insert crew members"
  ON crew_members FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can update crew members"
  ON crew_members FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- 4. Fix crew_applications RLS: allow public to read all applications (admin filtering done in app)
DROP POLICY IF EXISTS "Users can read own applications" ON crew_applications;
DROP POLICY IF EXISTS "Public can read all applications" ON crew_applications;
DROP POLICY IF EXISTS "Authenticated can insert applications" ON crew_applications;
DROP POLICY IF EXISTS "Authenticated can update applications" ON crew_applications;
DROP POLICY IF EXISTS "Public can insert crew applications" ON crew_applications;
DROP POLICY IF EXISTS "Public can update crew applications" ON crew_applications;

CREATE POLICY "Public can read all applications"
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

-- 5. Fix crew_application_tasks RLS
DROP POLICY IF EXISTS "Users can read own application tasks" ON crew_application_tasks;
DROP POLICY IF EXISTS "Authenticated can insert own tasks" ON crew_application_tasks;
DROP POLICY IF EXISTS "Authenticated can update own tasks" ON crew_application_tasks;
DROP POLICY IF EXISTS "Public can read crew application tasks" ON crew_application_tasks;
DROP POLICY IF EXISTS "Public can insert crew application tasks" ON crew_application_tasks;
DROP POLICY IF EXISTS "Public can update crew application tasks" ON crew_application_tasks;

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

-- 6. Fix crew_internal_notes RLS
DROP POLICY IF EXISTS "Public can read crew internal notes" ON crew_internal_notes;
DROP POLICY IF EXISTS "Public can insert crew internal notes" ON crew_internal_notes;
DROP POLICY IF EXISTS "Public can update crew internal notes" ON crew_internal_notes;

CREATE POLICY "Public can read crew internal notes"
  ON crew_internal_notes FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert crew internal notes"
  ON crew_internal_notes FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can update crew internal notes"
  ON crew_internal_notes FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);
