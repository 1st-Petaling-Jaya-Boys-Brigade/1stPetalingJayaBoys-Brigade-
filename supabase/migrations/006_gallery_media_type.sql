-- Migration 006: Gallery Media Type Support (TSK-010 & TSK-033)
-- Adds 'type' column to bb_gallery for distinguishing photos from video reels.

ALTER TABLE IF EXISTS bb_gallery ADD COLUMN IF NOT EXISTS type text DEFAULT 'image';

-- Ensure public access policy permits reads and inserts
CREATE POLICY IF NOT EXISTS "Allow public read access to bb_gallery"
  ON bb_gallery FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Allow public insert to bb_gallery"
  ON bb_gallery FOR INSERT
  WITH CHECK (true);
