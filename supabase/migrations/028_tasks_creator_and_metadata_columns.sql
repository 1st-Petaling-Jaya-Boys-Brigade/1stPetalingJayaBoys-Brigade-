-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 028_tasks_creator_and_metadata_columns.sql
-- Description: Ensures bb_tasks table has creator, project, estimate, and assignee columns
-- ==============================================================================

ALTER TABLE IF EXISTS public.bb_tasks ADD COLUMN IF NOT EXISTS creator_name text;
ALTER TABLE IF EXISTS public.bb_tasks ADD COLUMN IF NOT EXISTS creator_ic text;
ALTER TABLE IF EXISTS public.bb_tasks ADD COLUMN IF NOT EXISTS project_name text;
ALTER TABLE IF EXISTS public.bb_tasks ADD COLUMN IF NOT EXISTS estimate text;
ALTER TABLE IF EXISTS public.bb_tasks ADD COLUMN IF NOT EXISTS assignee_ic text;
