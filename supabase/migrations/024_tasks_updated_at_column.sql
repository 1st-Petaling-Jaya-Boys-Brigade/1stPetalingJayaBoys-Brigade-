-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 024_tasks_updated_at_column.sql
-- Description: Adds updated_at timestamptz column to bb_tasks table for tracking updates
-- ==============================================================================

ALTER TABLE IF EXISTS public.bb_tasks ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
