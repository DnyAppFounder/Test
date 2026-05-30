/*
  # Fix crew task statuses and add notes UPDATE policy

  1. Changes
    - crew_application_tasks: extend status CHECK to include 'pending_review' and 'needs_changes'
    - crew_internal_notes: add public UPDATE policy (needed for admin edits)

  2. Notes
    - pending_review: task submitted by user, waiting for admin review
    - needs_changes: admin requested the user to revise their proof/answer
    - This aligns with the UI flow: user submits → pending_review → admin approves/rejects
*/

-- Add new status values by dropping and re-adding the constraint
ALTER TABLE crew_application_tasks
  DROP CONSTRAINT IF EXISTS crew_application_tasks_status_check;

ALTER TABLE crew_application_tasks
  ADD CONSTRAINT crew_application_tasks_status_check
  CHECK (status IN ('not_started','submitted','pending_review','needs_changes','approved','rejected'));

-- Add UPDATE policy for internal notes
DROP POLICY IF EXISTS "Public can update crew internal notes" ON crew_internal_notes;

CREATE POLICY "Public can update crew internal notes"
  ON crew_internal_notes FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);
