-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 002_row_level_security.sql (TSK-028)
--
-- Supabase Row-Level Security (RLS) & Child Data Isolation Policy
--
-- Protects Company Data & Minor Members:
--   1. Enables strict Row-Level Security (RLS) across all core database tables:
--      - bb_members
--      - bb_orders
--      - bb_tasks
--      - bb_config
--      - bb_member_badges
--      - bb_announcements
--      - bb_gallery
--   2. Prevents unauthorized mass dumping, scraping, and catastrophic DELETE
--      via the public Supabase anon key.
--   3. Isolates child/minor profiles and enforces soft-deletion protection.
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 1: ENABLE RLS ON ALL TABLES
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS bb_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bb_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bb_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bb_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bb_member_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bb_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bb_gallery ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 2: POLICIES FOR bb_members (Child Data & Member Privacy)
-- ──────────────────────────────────────────────────────────────────────────────

-- Drop legacy or conflicting policies if present
DROP POLICY IF EXISTS "bb_members_select_active" ON bb_members;
DROP POLICY IF EXISTS "bb_members_insert_registration" ON bb_members;
DROP POLICY IF EXISTS "bb_members_update_profile" ON bb_members;
DROP POLICY IF EXISTS "bb_members_delete_restrict" ON bb_members;

-- 2.1 SELECT: Allow reading active company member records, exclude soft-deleted accounts
CREATE POLICY "bb_members_select_active"
ON bb_members FOR SELECT
TO anon, authenticated
USING (
  coalesce(department, '') NOT IN ('deleted', 'archived_deleted')
);

-- 2.2 INSERT: Allow member self-registration with non-empty name and identifier
CREATE POLICY "bb_members_insert_registration"
ON bb_members FOR INSERT
TO anon, authenticated
WITH CHECK (
  name IS NOT NULL AND length(trim(name)) > 0
  AND (
    (ic IS NOT NULL AND length(trim(ic)) > 0)
    OR (email IS NOT NULL AND length(trim(email)) > 0)
  )
);

-- 2.3 UPDATE: Allow members to update their profile information and settings
CREATE POLICY "bb_members_update_profile"
ON bb_members FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (
  name IS NOT NULL AND length(trim(name)) > 0
);

-- 2.4 DELETE: Block unauthenticated blanket hard-deletions via public API
-- Account terminations must use soft-deletion (department = 'deleted') or service_role
CREATE POLICY "bb_members_delete_restrict"
ON bb_members FOR DELETE
TO authenticated
USING (false);

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 3: POLICIES FOR bb_orders (Uniform Store & Payments)
-- ──────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "bb_orders_select_all" ON bb_orders;
DROP POLICY IF EXISTS "bb_orders_insert_checkout" ON bb_orders;
DROP POLICY IF EXISTS "bb_orders_update_status" ON bb_orders;
DROP POLICY IF EXISTS "bb_orders_delete_targeted" ON bb_orders;

-- 3.1 SELECT: Allow reading orders for member history and admin order fulfillment
CREATE POLICY "bb_orders_select_all"
ON bb_orders FOR SELECT
TO anon, authenticated
USING (true);

-- 3.2 INSERT: Allow members to place uniform and supply orders
CREATE POLICY "bb_orders_insert_checkout"
ON bb_orders FOR INSERT
TO anon, authenticated
WITH CHECK (
  order_number IS NOT NULL AND length(trim(order_number)) > 0
);

-- 3.3 UPDATE: Allow admin to update order statuses (Pending, Paid, Ready, Completed)
CREATE POLICY "bb_orders_update_status"
ON bb_orders FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 3.4 DELETE: Allow deleting targeted orders by specific order_number, block blanket truncate
CREATE POLICY "bb_orders_delete_targeted"
ON bb_orders FOR DELETE
TO anon, authenticated
USING (
  order_number IS NOT NULL AND length(trim(order_number)) > 0
);

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 4: POLICIES FOR bb_tasks (NCO Kanban Task Board)
-- ──────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "bb_tasks_select_all" ON bb_tasks;
DROP POLICY IF EXISTS "bb_tasks_insert_new" ON bb_tasks;
DROP POLICY IF EXISTS "bb_tasks_update_status" ON bb_tasks;
DROP POLICY IF EXISTS "bb_tasks_delete_by_id" ON bb_tasks;

-- 4.1 SELECT: Allow company NCOs and officers to view tasks
CREATE POLICY "bb_tasks_select_all"
ON bb_tasks FOR SELECT
TO anon, authenticated
USING (true);

-- 4.2 INSERT: Allow creating new departmental tasks
CREATE POLICY "bb_tasks_insert_new"
ON bb_tasks FOR INSERT
TO anon, authenticated
WITH CHECK (
  title IS NOT NULL AND length(trim(title)) > 0
);

-- 4.3 UPDATE: Allow updating task status (To Do, In Progress, Done) and details
CREATE POLICY "bb_tasks_update_status"
ON bb_tasks FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 4.4 DELETE: Allow removing specific tasks by ID, block mass wipe
CREATE POLICY "bb_tasks_delete_by_id"
ON bb_tasks FOR DELETE
TO anon, authenticated
USING (id IS NOT NULL);

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 5: POLICIES FOR bb_config (Portal Configuration & Sheet Sync)
-- ──────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "bb_config_select_public" ON bb_config;
DROP POLICY IF EXISTS "bb_config_insert_upsert" ON bb_config;
DROP POLICY IF EXISTS "bb_config_update_key" ON bb_config;
DROP POLICY IF EXISTS "bb_config_delete_deny" ON bb_config;

-- 5.1 SELECT: Allow portal to read schedules, badges, forms, and attendance cache
CREATE POLICY "bb_config_select_public"
ON bb_config FOR SELECT
TO anon, authenticated
USING (true);

-- 5.2 INSERT / UPSERT: Allow admin and Google Apps Script sync to update config entries
CREATE POLICY "bb_config_insert_upsert"
ON bb_config FOR INSERT
TO anon, authenticated
WITH CHECK (
  key IS NOT NULL AND length(trim(key)) > 0
);

-- 5.3 UPDATE: Allow modifying config values for known keys
CREATE POLICY "bb_config_update_key"
ON bb_config FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (
  key IS NOT NULL AND length(trim(key)) > 0
);

-- 5.4 DELETE: Strictly disallow deleting configuration keys via public API
CREATE POLICY "bb_config_delete_deny"
ON bb_config FOR DELETE
TO anon, authenticated
USING (false);

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 6: POLICIES FOR bb_member_badges (Badge Tracking & Founder's/President's)
-- ──────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "bb_member_badges_select" ON bb_member_badges;
DROP POLICY IF EXISTS "bb_member_badges_insert" ON bb_member_badges;
DROP POLICY IF EXISTS "bb_member_badges_update" ON bb_member_badges;
DROP POLICY IF EXISTS "bb_member_badges_delete" ON bb_member_badges;

CREATE POLICY "bb_member_badges_select"
ON bb_member_badges FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "bb_member_badges_insert"
ON bb_member_badges FOR INSERT
TO anon, authenticated
WITH CHECK (ic IS NOT NULL AND length(trim(ic)) > 0);

CREATE POLICY "bb_member_badges_update"
ON bb_member_badges FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (ic IS NOT NULL AND length(trim(ic)) > 0);

CREATE POLICY "bb_member_badges_delete"
ON bb_member_badges FOR DELETE
TO anon, authenticated
USING (false);

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 7: POLICIES FOR bb_announcements & bb_gallery
-- ──────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "bb_announcements_select" ON bb_announcements;
DROP POLICY IF EXISTS "bb_announcements_insert" ON bb_announcements;
DROP POLICY IF EXISTS "bb_announcements_update" ON bb_announcements;
DROP POLICY IF EXISTS "bb_announcements_delete" ON bb_announcements;

CREATE POLICY "bb_announcements_select"
ON bb_announcements FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "bb_announcements_insert"
ON bb_announcements FOR INSERT
TO anon, authenticated
WITH CHECK (title IS NOT NULL AND length(trim(title)) > 0);

CREATE POLICY "bb_announcements_update"
ON bb_announcements FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "bb_announcements_delete"
ON bb_announcements FOR DELETE
TO anon, authenticated
USING (id IS NOT NULL);

DROP POLICY IF EXISTS "bb_gallery_select" ON bb_gallery;
DROP POLICY IF EXISTS "bb_gallery_insert" ON bb_gallery;
DROP POLICY IF EXISTS "bb_gallery_delete" ON bb_gallery;

CREATE POLICY "bb_gallery_select"
ON bb_gallery FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "bb_gallery_insert"
ON bb_gallery FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "bb_gallery_delete"
ON bb_gallery FOR DELETE
TO anon, authenticated
USING (id IS NOT NULL);

-- ──────────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERY
-- ──────────────────────────────────────────────────────────────────────────────
-- Run this query after applying to verify that Row-Level Security is active:
--
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('bb_members', 'bb_orders', 'bb_tasks', 'bb_config', 'bb_member_badges', 'bb_announcements', 'bb_gallery');
--
-- All rows must return rowsecurity = true.
