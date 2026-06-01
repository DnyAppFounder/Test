/*
  # Update post-media bucket for video support

  ## Summary
  The post-media bucket had a 10MB file size limit, blocking video uploads.
  Video uploads for Dawen Pulse posts were silently failing.

  ## Changes
  - Increase file size limit from 10MB to 100MB to support video posts
  - Add additional video MIME types: video/webm, video/x-msvideo, video/x-matroska
  - Also allow application/octet-stream as fallback for videos with unknown MIME
*/

UPDATE storage.buckets
SET
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-msvideo',
    'video/x-matroska',
    'application/json',
    'text/plain',
    'application/octet-stream'
  ]
WHERE id = 'post-media';
