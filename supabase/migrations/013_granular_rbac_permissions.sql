-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 013_granular_rbac_permissions.sql
--
-- Granular Role-Based Access Control (RBAC), Scoped Admin Console & Permissions
--
-- Security Enhancements:
--   1. 3-Tier RBAC Architecture:
--      - Super Admin: Full system control, all admin modules, and role management.
--      - Admin: Scoped administrative privileges restricted to assigned modules.
--      - Member: Standard portal user strictly blocked from Admin routes and APIs.
--   2. Official & Designated Super Admin Accounts:
--      - Pre-assigns Jeshua Koh (jeshuakoh2008@gmail.com).
--   3. Granular Module Permissions:
--      - Modules: members, orders, uniform, tasks, announcements, badges,
--        gallery, attendance, resources, calendar, roles.
--   4. Immutable Audit Integration:
--      - All role assignments, promotions, demotions, and permission modifications
--        are durably logged in bb_audit_logs.
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 1: SEED DEFAULT SUPER ADMINS IN BB_CONFIG
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO bb_config (key, value, updated_at)
VALUES (
  'bb_admin_roles',
  '{
    "super_admins": [
      "jeshuakoh2008@gmail.com"
    ],
    "admins": {}
  }'::text,
  now()
)
ON CONFLICT (key) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 2: SECURITY DEFINER RPC - GET USER ROLE & PERMISSIONS
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rpc_get_user_role(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_email text;
  v_roles_cfg text;
  v_roles_json jsonb;
  v_super_admins jsonb;
  v_admins jsonb;
  v_is_super boolean := false;
  v_is_admin boolean := false;
  v_assigned_perms jsonb := '[]'::jsonb;
  v_all_modules jsonb := '["members","orders","uniform","tasks","announcements","badges","gallery","attendance","resources","calendar","roles"]'::jsonb;
BEGIN
  IF p_email IS NULL OR trim(p_email) = '' THEN
    RETURN jsonb_build_object(
      'role', 'member',
      'permissions', '[]'::jsonb,
      'is_super_admin', false,
      'is_admin', false
    );
  END IF;

  v_clean_email := lower(trim(p_email));

  -- Retrieve bb_admin_roles configuration
  SELECT value INTO v_roles_cfg FROM bb_config WHERE key = 'bb_admin_roles' LIMIT 1;
  IF v_roles_cfg IS NOT NULL AND v_roles_cfg != '' THEN
    BEGIN
      v_roles_json := v_roles_cfg::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_roles_json := '{}'::jsonb;
    END;
  ELSE
    v_roles_json := '{}'::jsonb;
  END IF;

  v_super_admins := COALESCE(v_roles_json->'super_admins', '[]'::jsonb);
  v_admins := COALESCE(v_roles_json->'admins', '{}'::jsonb);

  -- 1. Check Super Admin pre-assigned list & official Google account
  -- 1. Check Super Admin pre-assigned list & Jeshua Koh
  IF v_clean_email = 'jeshuakoh2008@gmail.com' OR
     v_super_admins @> to_jsonb(v_clean_email) THEN
    v_is_super := true;
    RETURN jsonb_build_object(
      'role', 'super_admin',
      'permissions', v_all_modules,
      'is_super_admin', true,
      'is_admin', true
    );
  END IF;

  -- 2. Check Scoped Admin list
  IF v_admins ? v_clean_email THEN
    v_is_admin := true;
    v_assigned_perms := COALESCE(v_admins->v_clean_email->'permissions', '[]'::jsonb);
    RETURN jsonb_build_object(
      'role', 'admin',
      'permissions', v_assigned_perms,
      'is_super_admin', false,
      'is_admin', true
    );
  END IF;

  -- 3. Default: Standard Member
  RETURN jsonb_build_object(
    'role', 'member',
    'permissions', '[]'::jsonb,
    'is_super_admin', false,
    'is_admin', false
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 3: SECURITY DEFINER RPC - ASSIGN USER ROLE & PERMISSIONS
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rpc_assign_user_role(
  p_actor_email text,
  p_target_email text,
  p_new_role text,
  p_permissions jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_clean text;
  v_target_clean text;
  v_role_clean text;
  v_actor_role_info jsonb;
  v_roles_cfg text;
  v_roles_json jsonb;
  v_super_admins jsonb;
  v_admins jsonb;
  v_old_target_info jsonb;
BEGIN
  IF p_actor_email IS NULL OR trim(p_actor_email) = '' THEN
    RAISE EXCEPTION 'Access Denied: Actor email required.';
  END IF;

  IF p_target_email IS NULL OR trim(p_target_email) = '' THEN
    RAISE EXCEPTION 'Invalid target email.';
  END IF;

  v_actor_clean := lower(trim(p_actor_email));
  v_target_clean := lower(trim(p_target_email));
  v_role_clean := lower(trim(COALESCE(p_new_role, 'member')));

  IF v_role_clean NOT IN ('member', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid role. Allowed values: member, admin, super_admin.';
  END IF;

  -- Verify caller has Super Admin privileges
  v_actor_role_info := rpc_get_user_role(v_actor_clean);
  IF NOT (v_actor_role_info->>'is_super_admin')::boolean THEN
    RAISE EXCEPTION 'Access Denied: Only Super Admins can manage roles and permissions.';
  END IF;

  -- Prevent demoting official 1stPJ Google account and founder/super admin
  -- Prevent demoting founder/super admin
  IF v_target_clean = 'jeshuakoh2008@gmail.com' AND v_role_clean != 'super_admin' THEN
    RAISE EXCEPTION 'Protection Error: Jeshua Koh account cannot be demoted.';
  END IF;

  -- Get old role info for audit trail
  v_old_target_info := rpc_get_user_role(v_target_clean);

  -- Load and update bb_admin_roles
  SELECT value INTO v_roles_cfg FROM bb_config WHERE key = 'bb_admin_roles' LIMIT 1;
  IF v_roles_cfg IS NOT NULL AND v_roles_cfg != '' THEN
    BEGIN
      v_roles_json := v_roles_cfg::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_roles_json := '{}'::jsonb;
    END;
  ELSE
    v_roles_json := '{}'::jsonb;
  END IF;

  v_super_admins := COALESCE(v_roles_json->'super_admins', '[]'::jsonb);
  v_admins := COALESCE(v_roles_json->'admins', '{}'::jsonb);

  -- Remove target from both super_admins and admins first
  v_super_admins := jsonb_path_query_array(v_super_admins, format('$[*] ? (@ != %L)', v_target_clean)::jsonpath);
  v_admins := v_admins - v_target_clean;

  -- Apply new role assignment
  IF v_role_clean = 'super_admin' THEN
    v_super_admins := v_super_admins || to_jsonb(v_target_clean);
  ELSIF v_role_clean = 'admin' THEN
    v_admins := jsonb_set(
      v_admins,
      ARRAY[v_target_clean],
      jsonb_build_object(
        'role', 'admin',
        'permissions', COALESCE(p_permissions, '[]'::jsonb),
        'assigned_by', v_actor_clean,
        'assigned_at', now()
      ),
      true
    );
  END IF;

  v_roles_json := jsonb_build_object(
    'super_admins', v_super_admins,
    'admins', v_admins,
    'updated_at', now()
  );

  -- Persist updated roles configuration
  INSERT INTO bb_config (key, value, updated_at)
  VALUES ('bb_admin_roles', v_roles_json::text, now())
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = now();

  -- Record mutation in append-only bb_audit_logs
  INSERT INTO bb_audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_actor_clean,
    'super_admin',
    'admin.role_change',
    'member_role',
    v_target_clean,
    jsonb_build_object(
      'previous_role', v_old_target_info->>'role',
      'previous_permissions', v_old_target_info->'permissions',
      'new_role', v_role_clean,
      'new_permissions', COALESCE(p_permissions, '[]'::jsonb)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'target_email', v_target_clean,
    'new_role', v_role_clean,
    'permissions', COALESCE(p_permissions, '[]'::jsonb)
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 4: SECURITY DEFINER RPC - LIST ADMIN ROLES
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rpc_list_admin_roles(p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_clean text;
  v_actor_role_info jsonb;
  v_roles_cfg text;
BEGIN
  IF p_actor_email IS NULL OR trim(p_actor_email) = '' THEN
    RAISE EXCEPTION 'Access Denied: Actor email required.';
  END IF;

  v_actor_clean := lower(trim(p_actor_email));
  v_actor_role_info := rpc_get_user_role(v_actor_clean);

  IF NOT (v_actor_role_info->>'is_admin')::boolean THEN
    RAISE EXCEPTION 'Access Denied: Admin or Super Admin privileges required.';
  END IF;

  SELECT value INTO v_roles_cfg FROM bb_config WHERE key = 'bb_admin_roles' LIMIT 1;
  IF v_roles_cfg IS NOT NULL AND v_roles_cfg != '' THEN
    RETURN v_roles_cfg::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'super_admins', '["jeshuakoh2008@gmail.com"]'::jsonb,
    'admins', '{}'::jsonb
  );
END;
$$;

-- Grant execution permissions on RPC functions
GRANT EXECUTE ON FUNCTION rpc_get_user_role(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_assign_user_role(text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_list_admin_roles(text) TO authenticated, service_role;
