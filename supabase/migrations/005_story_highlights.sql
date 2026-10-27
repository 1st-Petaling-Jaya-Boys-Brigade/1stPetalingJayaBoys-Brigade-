-- ============================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 005_story_highlights.sql (TSK-033)
-- Instagram-Style Story Highlights & Event Gallery Reel
-- ============================================================

-- 1. Create bb_stories table
CREATE TABLE IF NOT EXISTS bb_stories (
  id text PRIMARY KEY,
  title text NOT NULL,
  cover text,
  items jsonb DEFAULT '[]'::jsonb,
  display_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_bb_stories_order ON bb_stories (display_order, created_at);

-- 3. Row-Level Security
ALTER TABLE bb_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read Stories" ON bb_stories
  FOR SELECT TO anon, authenticated
  USING (active = true);

CREATE POLICY "Officer Manage Stories" ON bb_stories
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Column Documentation
COMMENT ON TABLE bb_stories IS 'Instagram-style circular Story Highlights and Event Gallery reels (TSK-033)';
COMMENT ON COLUMN bb_stories.title IS 'Highlight collection title (e.g. Camps, Awards Day, Band, Drill)';
COMMENT ON COLUMN bb_stories.cover IS 'Circular thumbnail cover image URL for the story bubble';
COMMENT ON COLUMN bb_stories.items IS 'JSON array of story slides [{id, url, caption, date, location}]';
COMMENT ON COLUMN bb_stories.display_order IS 'Sort order for display in the circular highlights reel';
