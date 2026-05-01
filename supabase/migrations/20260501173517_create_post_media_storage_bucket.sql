/*
  # Create post-media storage bucket

  1. New Storage Bucket
    - `post-media` — Public bucket for post images and videos
    - Authenticated users can upload files into path: {userId}/{filename}
    - Public read access for everyone

  2. Security
    - Anyone can read (public posts)
    - Only authenticated users can upload to their own folder
    - Only uploader can delete their own files
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-media',
  'post-media',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Public read policy
CREATE POLICY "Public can view post media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-media');

-- Authenticated users can upload to their own folder
CREATE POLICY "Authenticated users can upload post media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'post-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own files
CREATE POLICY "Users can delete own post media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'post-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
