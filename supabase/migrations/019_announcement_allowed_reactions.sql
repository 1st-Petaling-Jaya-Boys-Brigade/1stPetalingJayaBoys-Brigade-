-- Migration 019: Optional allowed_reactions column for bb_announcements
-- Adds allowed_reactions JSONB column if not exists to support direct column querying if needed.
-- Note: Portal runtime stores allowed reactions inside reactions->'_allowed' for zero-downtime compatibility.

ALTER TABLE IF EXISTS public.bb_announcements
  ADD COLUMN IF NOT EXISTS allowed_reactions JSONB DEFAULT NULL;
