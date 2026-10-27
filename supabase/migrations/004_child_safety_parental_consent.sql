-- ============================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 004_child_safety_parental_consent.sql (TSK-032)
-- Child Safety (COPPA/PDPA) & Parental Consent Governance
-- ============================================================

-- 1. Ensure child safety and parental consent columns exist on bb_members
ALTER TABLE bb_members ADD COLUMN IF NOT EXISTS parent_name text;
ALTER TABLE bb_members ADD COLUMN IF NOT EXISTS parent_contact text;
ALTER TABLE bb_members ADD COLUMN IF NOT EXISTS parental_consent_signed boolean DEFAULT false;
ALTER TABLE bb_members ADD COLUMN IF NOT EXISTS parental_consent_date timestamptz;
ALTER TABLE bb_members ADD COLUMN IF NOT EXISTS media_consent boolean DEFAULT false;
ALTER TABLE bb_members ADD COLUMN IF NOT EXISTS att_section text;

-- 2. Compliance and Governance Comments (Malaysian PDPA 2010 & COPPA Principles)
COMMENT ON COLUMN bb_members.parent_name IS 'Full legal name of parent or legal guardian providing consent for Pre-Junior (6-8) and Junior (9-11) members (PDPA 2010 & COPPA)';
COMMENT ON COLUMN bb_members.parent_contact IS 'Verified contact phone or email address of parent or legal guardian (TSK-032)';
COMMENT ON COLUMN bb_members.parental_consent_signed IS 'Verifiable electronic signature flag indicating parental consent has been affirmatively recorded';
COMMENT ON COLUMN bb_members.parental_consent_date IS 'ISO timestamp when verifiable parental consent e-signature was submitted';
COMMENT ON COLUMN bb_members.media_consent IS 'Privacy-first media & photography release flag. False by default (no public photos without explicit parental opt-in)';
COMMENT ON COLUMN bb_members.att_section IS 'Boys Brigade Section: Pre-Junior, Junior, or Senior (TSK-032)';

-- 3. Audit trail note
-- Verifiable parental consent records are durably mirrored in bb_config under key 'bb_consent_<email>'
-- to guarantee persistent auditability, right-to-erasure cleanup, and cross-table governance.
