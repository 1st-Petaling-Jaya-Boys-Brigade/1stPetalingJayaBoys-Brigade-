-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 026_missing_columns_sync_resilience.sql
-- Description: Adds missing columns to bb_members, bb_orders, and bb_gallery
-- ==============================================================================

-- 1. Ensure updated_at exists on bb_members for delta sync and member tracking
ALTER TABLE IF EXISTS public.bb_members ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. Ensure email column exists on bb_orders for cross-device order sync lookups
ALTER TABLE IF EXISTS public.bb_orders ADD COLUMN IF NOT EXISTS email text;

-- 3. Ensure type column exists on bb_gallery for distinguishing images and video reels
ALTER TABLE IF EXISTS public.bb_gallery ADD COLUMN IF NOT EXISTS type text DEFAULT 'image';
