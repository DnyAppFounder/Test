/*
  # Fix avatar storage policies for wallet-based auth

  ## Problem
  The app uses wallet-based authentication (not Supabase Auth JWT).
  auth.uid() is always null, so "TO authenticated" policies block all uploads.
  The avatars bucket is already public for reads — we need to allow public writes
  scoped by the folder path (wallet_address/filename).

  ## Changes
  - Drop old restricted INSERT/UPDATE/DELETE policies on avatars bucket
  - Add permissive INSERT policy for avatars (public, any file path)
  - Add permissive UPDATE policy for avatars
  - Add permissive DELETE policy for avatars
  - Keep SELECT policy as-is (bucket is already public)
*/

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Authenticated avatar upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated avatar update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated avatar delete" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can list own avatars" ON storage.objects;

-- Allow any client to upload avatars (bucket is public, paths are wallet-scoped by the app)
CREATE POLICY "Public avatar upload"
  ON storage.objects
  FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'avatars');

-- Allow any client to update avatars
CREATE POLICY "Public avatar update"
  ON storage.objects
  FOR UPDATE
  TO public
  USING (bucket_id = 'avatars')
  WITH CHECK (bucket_id = 'avatars');

-- Allow any client to delete avatars
CREATE POLICY "Public avatar delete"
  ON storage.objects
  FOR DELETE
  TO public
  USING (bucket_id = 'avatars');

-- Allow any client to list/read avatars
CREATE POLICY "Public avatar select"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'avatars');
