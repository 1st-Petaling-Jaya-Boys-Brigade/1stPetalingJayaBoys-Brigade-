-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 014_member_presence_tracking.sql
--
-- Member Online, Idle & Offline Presence Tracking for Admin Console
--
-- Features:
--   1. Real-time Member Presence Tracking:
--      - Tracks active sessions, last seen timestamps, and idle activity
--      - Columns on bb_members: last_active_at (timestamptz) and presence_status (text)
--   2. High-Performance Presence Registry (bb_config key: bb_member_presence):
--      - In-memory/JSON snapshot of active members for single-query retrieval
--      - Prunes stale records older than 24 hours
--   3. Officer & Super Admin Visibility:
--      - Empowers Admins/Super Admins to inspect real-time connection status in Member Management
-- ==============================================================================

-- 1. Extend bb_members with presence fields
ALTER TABLE IF EXISTS bb_members
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS presence_status text DEFAULT 'offline';

-- 2. Index for fast querying by presence and activity
CREATE INDEX IF NOT EXISTS idx_bb_members_presence_status
  ON bb_members (presence_status);

CREATE INDEX IF NOT EXISTS idx_bb_members_last_active
  ON bb_members (last_active_at DESC);

-- 3. Document the bb_config presence key
COMMENT ON COLUMN bb_members.last_active_at IS 'Timestamp of member last user activity or heartbeat ping';
COMMENT ON COLUMN bb_members.presence_status IS 'Connection state: online, idle, or offline';
