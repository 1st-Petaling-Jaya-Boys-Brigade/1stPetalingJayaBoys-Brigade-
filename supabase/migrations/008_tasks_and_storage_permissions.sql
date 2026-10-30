-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 008_tasks_and_storage_permissions.sql
--
-- 1. Align bb_tasks Schema:
--    Adds missing columns to bb_tasks table to resolve PostgREST PGRST204 errors:
--    - creator_name (text): Name of member/officer who authored the task brief
--    - estimate (text): Time/effort estimate (e.g. '2h', '3d')
--    - project_name (text): Project or sprint tag (e.g. 'Secretariat Sprint')
--    - assignee_ic (text): Member IC for direct assignee association
--
-- 2. Configure Storage Buckets for Browser Media Rendering:
--    - Ensures 'avatars', 'gallery', 'story_highlights', and 'resources' allow public reads (public = true)
--      so HTML <img> and <video> tags can render media without 403 AccessDenied errors.
--    - Preserves strict privacy (public = false) for sensitive payment receipts ('receipts')
--      and child medical/parental waivers ('waivers').
--
-- 3. Row-Level Security (RLS) on storage.objects:
--    - Adds required UPDATE policy on storage.objects to support 'x-upsert' uploads.
--    - Grants INSERT, UPDATE, SELECT, and DELETE permissions for portal media.
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 1: EXTEND bb_tasks COLUMNS
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS bb_tasks ADD COLUMN IF NOT EXISTS creator_name text;
ALTER TABLE IF EXISTS bb_tasks ADD COLUMN IF NOT EXISTS estimate text;
ALTER TABLE IF EXISTS bb_tasks ADD COLUMN IF NOT EXISTS project_name text;
ALTER TABLE IF EXISTS bb_tasks ADD COLUMN IF NOT EXISTS assignee_ic text;

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 2: CONFIGURE STORAGE BUCKETS
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('gallery', 'gallery', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']),
  ('story_highlights', 'story_highlights', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']),
  ('receipts', 'receipts', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('waivers', 'waivers', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('resources', 'resources', true, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 3: STORAGE.OBJECTS RLS POLICIES (ENABLE INSERT + UPDATE UPSERTS)
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3.1 SELECT: Allow reading objects across all configured buckets
DROP POLICY IF EXISTS "Authenticated signed url access for company storage" ON storage.objects;
DROP POLICY IF EXISTS "Allow portal media reads" ON storage.objects;
CREATE POLICY "Allow portal media reads"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (
  bucket_id IN ('avatars', 'gallery', 'story_highlights', 'receipts', 'waivers', 'resources')
);

-- 3.2 INSERT: Allow uploading new files
DROP POLICY IF EXISTS "Allow portal media uploads" ON storage.objects;
CREATE POLICY "Allow portal media uploads"
ON storage.objects FOR INSERT
TO authenticated, anon
WITH CHECK (
  bucket_id IN ('avatars', 'gallery', 'story_highlights', 'receipts', 'waivers', 'resources')
);

-- 3.3 UPDATE: Allow upserting and replacing existing files (Fixes 403 on x-upsert)
DROP POLICY IF EXISTS "Allow portal media updates" ON storage.objects;
CREATE POLICY "Allow portal media updates"
ON storage.objects FOR UPDATE
TO authenticated, anon
USING (
  bucket_id IN ('avatars', 'gallery', 'story_highlights', 'receipts', 'waivers', 'resources')
)
WITH CHECK (
  bucket_id IN ('avatars', 'gallery', 'story_highlights', 'receipts', 'waivers', 'resources')
);

-- 3.4 DELETE: Allow removing obsolete files
DROP POLICY IF EXISTS "Restricted media deletion for storage" ON storage.objects;
CREATE POLICY "Restricted media deletion for storage"
ON storage.objects FOR DELETE
TO authenticated, anon
USING (
  bucket_id IN ('avatars', 'gallery', 'story_highlights', 'receipts', 'waivers', 'resources')
);
