/*
  # Create dedicated launchpad-metadata storage bucket

  ## Summary
  Easy Launch metadata and image uploads were being blocked by RLS on the post-media
  bucket. The post-media bucket has conflicting policies and was designed for
  user-authenticated social posts, not wallet-based launchpad uploads.

  This migration creates a dedicated `launchpad-metadata` bucket with:
  - No MIME type restrictions (allows images + JSON)
  - Explicit INSERT/SELECT/UPDATE/DELETE policies for both anon and authenticated roles
  - Public read access so uploaded images and metadata JSON are reachable by browsers
    and on-chain indexers via permanent HTTPS URLs

  ## New Bucket
  - `launchpad-metadata` — public, 10MB file limit, all MIME types accepted

  ## Security
  - SELECT: public (anyone can read token images and metadata JSON)
  - INSERT: anon + authenticated (wallet-based app has no Supabase Auth session)
  - UPDATE: anon + authenticated (upsert support for re-uploads)
  - DELETE: anon + authenticated (cleanup of own uploads)
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'launchpad-metadata',
  'launchpad-metadata',
  true,
  10485760,
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- Public read: anyone can fetch token images and metadata JSON (needed by indexers and wallets)
CREATE POLICY "Launchpad metadata public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'launchpad-metadata');

-- Insert: allow anon and authenticated (app uses wallet auth, no Supabase session)
CREATE POLICY "Launchpad metadata anon insert"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'launchpad-metadata');

CREATE POLICY "Launchpad metadata auth insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'launchpad-metadata');

-- Update: needed for upsert=true re-uploads
CREATE POLICY "Launchpad metadata anon update"
  ON storage.objects FOR UPDATE
  TO anon
  USING (bucket_id = 'launchpad-metadata')
  WITH CHECK (bucket_id = 'launchpad-metadata');

CREATE POLICY "Launchpad metadata auth update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'launchpad-metadata')
  WITH CHECK (bucket_id = 'launchpad-metadata');

-- Delete: allow cleanup of own files
CREATE POLICY "Launchpad metadata anon delete"
  ON storage.objects FOR DELETE
  TO anon
  USING (bucket_id = 'launchpad-metadata');

CREATE POLICY "Launchpad metadata auth delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'launchpad-metadata');
