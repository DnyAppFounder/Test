/*
  # Add proof_media_urls to crew_application_tasks

  ## Summary
  Adds a `proof_media_urls` column to `crew_application_tasks` so applicants
  can attach image/video URLs as proof when submitting tasks. Admin can view
  these in the application review page.

  ## Changes
  - `crew_application_tasks.proof_media_urls` — text array, nullable, default empty array
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'crew_application_tasks' AND column_name = 'proof_media_urls'
  ) THEN
    ALTER TABLE public.crew_application_tasks ADD COLUMN proof_media_urls text[] DEFAULT '{}';
  END IF;
END $$;
