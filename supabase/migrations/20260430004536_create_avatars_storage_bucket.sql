/*
  # Create avatars storage bucket

  1. Changes
    - Create `avatars` storage bucket for profile picture uploads
    - Add storage access policies

  2. Security
    - Public read (anyone can view profile pictures)
    - Authenticated write (users store files under their wallet address folder)
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Public avatar access' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Public avatar access"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated avatar upload'  AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Authenticated avatar upload"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated avatar update' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Authenticated avatar update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'avatars')
      WITH CHECK (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated avatar delete' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Authenticated avatar delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'avatars');
  END IF;
END $$;
