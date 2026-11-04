-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Portal - Migration 017
-- Announcement Infographics & Poster Attachment Schema
-- ==============================================================================

-- Add optional image_url column to bb_announcements for full-width home page banners & infographics
ALTER TABLE IF EXISTS bb_announcements
  ADD COLUMN IF NOT EXISTS image_url text DEFAULT NULL;

COMMENT ON COLUMN bb_announcements.image_url IS 'Public URL or storage path of the attached announcement infographic/banner image.';
