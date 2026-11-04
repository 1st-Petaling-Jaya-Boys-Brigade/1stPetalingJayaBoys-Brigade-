-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 018_remove_legacy_super_admin_emails.sql
--
-- Remove Legacy Super Admin Emails from Database and PostgreSQL Functions
-- Preserves Super Admin status exclusively for:
--   - jeshuakoh2008@gmail.com
-- ==============================================================================

-- 1. Prune legacy emails from bb_config -> bb_admin_roles (keep only jeshuakoh2008@gmail.com)
DO $$
DECLARE
  v_roles_cfg text;
  v_roles_json jsonb;
  v_super_admins jsonb;
BEGIN
  SELECT value INTO v_roles_cfg FROM bb_config WHERE key = 'bb_admin_roles' LIMIT 1;
  IF v_roles_cfg IS NOT NULL AND v_roles_cfg != '' THEN
    BEGIN
      v_roles_json := v_roles_cfg::jsonb;
      -- Retain strictly jeshuakoh2008@gmail.com
      v_super_admins := jsonb_build_array('jeshuakoh2008@gmail.com');
      v_roles_json := jsonb_set(v_roles_json, '{super_admins}', v_super_admins);
      UPDATE bb_config SET value = v_roles_json::text, updated_at = now() WHERE key = 'bb_admin_roles';
    EXCEPTION WHEN OTHERS THEN
      -- ignore if malformed
    END;
  END IF;
END;
$$;

-- 2. Update rpc_get_user_role
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
    v_assigned_perms := COALESCE(v_admins->v_clean_email, '[]'::jsonb);
    RETURN jsonb_build_object(
      'role', 'admin',
      'permissions', v_assigned_perms,
      'is_super_admin', false,
      'is_admin', true
    );
  END IF;

  -- 3. Default to Standard Member
  RETURN jsonb_build_object(
    'role', 'member',
    'permissions', '[]'::jsonb,
    'is_super_admin', false,
    'is_admin', false
  );
END;
$$;

-- 3. Update rpc_assign_user_role
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
  v_old_target_info jsonb;
  v_roles_cfg text;
  v_roles_json jsonb;
  v_super_admins jsonb;
  v_admins jsonb;
BEGIN
  IF p_actor_email IS NULL OR trim(p_actor_email) = '' THEN
    RAISE EXCEPTION 'Actor email is required.';
  END IF;
  IF p_target_email IS NULL OR trim(p_target_email) = '' THEN
    RAISE EXCEPTION 'Target email is required.';
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
    IF NOT (v_super_admins @> to_jsonb(v_target_clean)) THEN
      v_super_admins := v_super_admins || to_jsonb(v_target_clean);
    END IF;
  ELSIF v_role_clean = 'admin' THEN
    v_admins := jsonb_set(
      v_admins,
      ARRAY[v_target_clean],
      COALESCE(p_permissions, '[]'::jsonb)
    );
  END IF;

  v_roles_json := jsonb_set(v_roles_json, '{super_admins}', v_super_admins);
  v_roles_json := jsonb_set(v_roles_json, '{admins}', v_admins);

  INSERT INTO bb_config (key, value, updated_at)
  VALUES ('bb_admin_roles', v_roles_json::text, now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = EXCLUDED.updated_at;

  -- Durable audit trail recording in bb_audit_logs if exists
  BEGIN
    INSERT INTO bb_audit_logs (actor_email, action, target_user, old_values, new_values, ip_address)
    VALUES (
      v_actor_clean,
      'assign_role',
      v_target_clean,
      v_old_target_info,
      jsonb_build_object('role', v_role_clean, 'permissions', p_permissions),
      '127.0.0.1'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Continue if audit log table not migrated
  END;

  RETURN jsonb_build_object(
    'success', true,
    'target_email', v_target_clean,
    'role', v_role_clean,
    'permissions', COALESCE(p_permissions, '[]'::jsonb)
  );
END;
$$;

-- 4. Update rpc_list_admin_roles
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
    RAISE EXCEPTION 'Actor email is required.';
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
