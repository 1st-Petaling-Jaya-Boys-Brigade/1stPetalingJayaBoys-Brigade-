-- ============================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 001_privacy_auth_migration.sql (TSK-005B)
-- Privacy-First Member Auth & Profile Onboarding Redesign
-- ============================================================

-- 1. Add privacy-first columns to bb_members if they do not exist
ALTER TABLE bb_members ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE bb_members ADD COLUMN IF NOT EXISTS age integer;
ALTER TABLE bb_members ADD COLUMN IF NOT EXISTS section text;

-- 2. Create unique index on email (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bb_members_email_lower ON bb_members (lower(email));

-- 3. Make legacy sensitive columns nullable if any had NOT NULL constraints
ALTER TABLE bb_members ALTER COLUMN date_of_birth DROP NOT NULL;
ALTER TABLE bb_members ALTER COLUMN security_question DROP NOT NULL;
ALTER TABLE bb_members ALTER COLUMN security_answer DROP NOT NULL;

-- 4. Description comments
COMMENT ON COLUMN bb_members.email IS 'Member login email address (replaces sensitive IC/MyKad)';
COMMENT ON COLUMN bb_members.age IS 'Member age at registration (e.g. 14)';
COMMENT ON COLUMN bb_members.section IS 'BB Section: Pre-Junior, Junior, or Senior';
