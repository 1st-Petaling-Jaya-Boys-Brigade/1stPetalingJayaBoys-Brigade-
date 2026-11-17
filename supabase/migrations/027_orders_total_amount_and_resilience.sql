-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 027_orders_total_amount_and_resilience.sql
-- Description: Adds total_amount column to bb_orders for order checkout persistence
-- ==============================================================================

-- 1. Ensure total_amount exists on bb_orders for explicit order pricing
ALTER TABLE IF EXISTS public.bb_orders ADD COLUMN IF NOT EXISTS total_amount numeric;
