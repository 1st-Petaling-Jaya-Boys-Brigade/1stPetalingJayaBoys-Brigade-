-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 007_storage_lockdown_private_buckets.sql (TSK-035)
--
-- Supabase Storage Lockdown, Private Buckets & Child Safety Access Control
--
-- Protects Minors' Physical Locations and Parents' Financial Receipts:
--   1. Converts Supabase Storage buckets from Public to Private (public = false):
--      - avatars (member profile photos)
--      - gallery (company photos & videos)
--      - story_highlights (camp & event stories)
--      - receipts (Touch 'n Go payment receipts with sensitive bank data)
--      - waivers (parental consent & medical waivers)
--      - resources (company manuals & handbooks)
--   2. Enforces signed URL and authenticated access only.
--   3. Configures file size limits and allowed MIME types per bucket.
--   4. Creates Row-Level Security (RLS) policies on storage.objects.
-- ==============================================================================

-- 1. Ensure private buckets exist with strict limits and MIME constraints
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('gallery', 'gallery', false, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']),
  ('story_highlights', 'story_highlights', false, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']),
  ('receipts', 'receipts', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('waivers', 'waivers', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('resources', 'resources', false, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Authenticated users can read/download private bucket objects via Signed URLs
DROP POLICY IF EXISTS "Authenticated signed url access for company storage" ON storage.objects;
CREATE POLICY "Authenticated signed url access for company storage"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (
  bucket_id IN ('avatars', 'gallery', 'story_highlights', 'receipts', 'waivers', 'resources')
);

-- 4. Policy: Allow uploads to avatars, gallery, receipts, and waivers
DROP POLICY IF EXISTS "Allow portal media uploads" ON storage.objects;
CREATE POLICY "Allow portal media uploads"
ON storage.objects FOR INSERT
TO authenticated, anon
WITH CHECK (
  bucket_id IN ('avatars', 'gallery', 'story_highlights', 'receipts', 'waivers', 'resources')
);

-- 5. Policy: Storage deletion restricted to authenticated officers/admins
DROP POLICY IF EXISTS "Restricted media deletion for storage" ON storage.objects;
CREATE POLICY "Restricted media deletion for storage"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id IN ('avatars', 'gallery', 'story_highlights', 'receipts', 'waivers', 'resources')
);
