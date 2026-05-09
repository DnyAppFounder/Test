/*
  # Allow JSON uploads in post-media storage bucket

  ## Summary
  The post-media bucket's allowed_mime_types only included image and video types.
  Launchpad metadata JSON files (uploaded before token launch) were being rejected
  with a MIME-type-not-allowed error, blocking Easy Launch entirely.

  ## Changes
  - Adds `application/json` and `text/plain` to `post-media` bucket allowed MIME types
    so that launchpad/metadata/{tokenId}.json files can be stored alongside media files.

  ## Notes
  - Does not change any RLS policies (public upload policy remains in place)
  - Does not affect existing image/video uploads
*/

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'application/json',
  'text/plain'
]
WHERE id = 'post-media';
