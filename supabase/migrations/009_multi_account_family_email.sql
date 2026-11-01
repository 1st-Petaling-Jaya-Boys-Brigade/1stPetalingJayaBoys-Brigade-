-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 009_multi_account_family_email.sql
--
-- Enables Multiple Accounts per Family Email (e.g. Parents with Multiple Children)
-- ==============================================================================

-- Drop the unique constraint index on lower(email) if present
DROP INDEX IF EXISTS idx_bb_members_email_lower;

-- Create a non-unique index to maintain performant lookups by lower(email)
CREATE INDEX IF NOT EXISTS idx_bb_members_email_lower ON bb_members (lower(email));

COMMENT ON INDEX idx_bb_members_email_lower IS 'Non-unique index allowing multiple members/children to share a family parent email';
