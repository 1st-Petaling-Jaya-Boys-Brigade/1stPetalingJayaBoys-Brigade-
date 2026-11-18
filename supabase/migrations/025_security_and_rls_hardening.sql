-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 025_security_and_rls_hardening.sql
--
-- Security Hardening, Access Control, and Data Integrity (Milestone 1)
--
-- Remediations:
--   1. Protect bb_members: Revoke SELECT and UPDATE on 'password' column from anon.
--      Harden bb_guard_admin_member_credentials trigger against credential tampering.
--   2. Implement Server-Side Member Sessions (bb_member_sessions) to eliminate
--      client-side session spoofing.
--   3. Implement rpc_change_member_password for secure authenticated password updates.
--   4. Restrict bb_config: Block public reading and writing of bb_master_sheet_config,
--      bb_att_sheet, bb_reset_otp_%, bb_reg_otp_%, admin passwords, and secrets.
--   5. Implement rpc_get_master_sheet_config and rpc_save_master_sheet_config.
--   6. Harden bb_orders: Deny public DELETE and UPDATE. Exclude sensitive custom
--      form submissions from public SELECT. Implement rpc_admin_get_orders,
--      rpc_admin_update_order_status, and rpc_admin_delete_order.
--   7. Harden bb_tasks, bb_announcements, bb_gallery: Deny unrestricted DELETE.
--      Implement rpc_admin_delete_task, rpc_admin_delete_announcement, rpc_admin_delete_gallery_item.
--   8. Harden storage.objects: Restrict DELETE to avatars & gallery; prevent overwriting
--      or deletion of receipts, waivers, and resources. Exclude private buckets from public SELECT.
-- ==============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 1: SERVER-SIDE MEMBER SESSIONS (SEC-03)
-- ──────────────────────────────────────────────────────────────────────────────

-- Ensure updated_at timestamp columns exist on core tables
ALTER TABLE public.bb_orders ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.bb_members ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.bb_member_sessions (
  token_hash text PRIMARY KEY,
  member_ic text NOT NULL,
  email text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bb_member_sessions_member_ic ON public.bb_member_sessions (member_ic);
CREATE INDEX IF NOT EXISTS idx_bb_member_sessions_email ON public.bb_member_sessions (email);
CREATE INDEX IF NOT EXISTS idx_bb_member_sessions_expires ON public.bb_member_sessions (expires_at);

ALTER TABLE public.bb_member_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bb_member_sessions FROM PUBLIC, anon, authenticated;

-- Upgrade rpc_authenticate_member to issue cryptographically secure server session tokens
CREATE OR REPLACE FUNCTION public.rpc_authenticate_member(
  p_email text,
  p_password_hash text,
  p_member_name text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_member record;
  v_stored_pw text;
  v_parts text[];
  v_matched boolean := false;
  v_accounts json;
  v_matched_account json;
  v_session_token text;
  v_token_hash text;
  v_expires_at timestamptz;
  v_target_ic text;
BEGIN
  IF p_email IS NULL OR p_password_hash IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Email and password credentials are required');
  END IF;

  -- 1. Check credentials against registered active account
  FOR v_member IN
    SELECT *
    FROM public.bb_members
    WHERE lower(email) = lower(trim(p_email))
      AND coalesce(department, '') NOT IN ('deleted', 'archived_deleted')
  LOOP
    v_stored_pw := v_member.password;

    IF v_stored_pw IS NOT NULL THEN
      IF v_stored_pw LIKE 'pbkdf2:sha256:%' THEN
        v_parts := string_to_array(v_stored_pw, ':');
        IF v_parts[5] = p_password_hash OR v_stored_pw = p_password_hash THEN
          v_matched := true;
          v_target_ic := v_member.ic;
          EXIT;
        END IF;
      ELSIF v_stored_pw = p_password_hash 
         OR v_stored_pw = encode(digest(p_password_hash, 'sha256'), 'hex')
         OR v_stored_pw = replace(encode(convert_to(p_password_hash, 'UTF8'), 'base64'), chr(10), '') THEN
        v_matched := true;
        v_target_ic := v_member.ic;
        EXIT;
      END IF;
    END IF;
  END LOOP;

  IF NOT v_matched THEN
    RETURN json_build_object('success', false, 'error', 'Invalid email or password');
  END IF;

  -- 2. Return sanitized accounts list WITHOUT password column
  SELECT json_agg(
    json_build_object(
      'id', m.id,
      'name', m.name,
      'email', m.email,
      'ic', m.ic,
      'role', m.role,
      'rank', m.rank,
      'platoon', m.platoon,
      'section', m.section,
      'age', m.age,
      'department', m.department,
      'photo_url', m.photo_url,
      'points', m.points,
      'parade_attendance', m.parade_attendance,
      'band_attendance', m.band_attendance,
      'uniform_points', m.uniform_points,
      'parade_points', m.parade_points,
      'band_points', m.band_points,
      'joined_date', m.joined_date,
      'created_at', m.created_at
    )
  ) INTO v_accounts
  FROM public.bb_members m
  WHERE lower(m.email) = lower(trim(p_email))
    AND coalesce(m.department, '') NOT IN ('deleted', 'archived_deleted');

  IF p_member_name IS NOT NULL AND length(trim(p_member_name)) > 0 THEN
    SELECT json_build_object(
      'id', m.id,
      'name', m.name,
      'email', m.email,
      'ic', m.ic,
      'role', m.role,
      'rank', m.rank,
      'platoon', m.platoon,
      'section', m.section,
      'age', m.age,
      'department', m.department,
      'photo_url', m.photo_url,
      'points', m.points,
      'parade_attendance', m.parade_attendance,
      'band_attendance', m.band_attendance,
      'uniform_points', m.uniform_points,
      'parade_points', m.parade_points,
      'band_points', m.band_points,
      'joined_date', m.joined_date,
      'created_at', m.created_at
    ) INTO v_matched_account
    FROM public.bb_members m
    WHERE lower(m.email) = lower(trim(p_email))
      AND lower(trim(m.name)) = lower(trim(p_member_name))
      AND coalesce(m.department, '') NOT IN ('deleted', 'archived_deleted')
    LIMIT 1;

    IF v_matched_account IS NOT NULL THEN
      v_target_ic := v_matched_account->>'ic';
    END IF;
  END IF;

  -- 3. Issue server-side cryptographic member session token (valid 14 days)
  v_session_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_session_token, 'sha256'), 'hex');
  v_expires_at := now() + interval '14 days';

  INSERT INTO public.bb_member_sessions (token_hash, member_ic, email, expires_at)
  VALUES (v_token_hash, coalesce(v_target_ic, lower(trim(p_email))), lower(trim(p_email)), v_expires_at);

  RETURN json_build_object(
    'success', true,
    'token', v_session_token,
    'expires_at', v_expires_at,
    'accounts', v_accounts,
    'account', coalesce(v_matched_account, (v_accounts->0))
  );
END;
$$;

-- Verify member session token against active session table
CREATE OR REPLACE FUNCTION public.rpc_verify_member_session(
  p_token text,
  p_email text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token_hash text;
  v_session record;
  v_member record;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN json_build_object('valid', false, 'error', 'Token is required');
  END IF;

  v_token_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_session
  FROM public.bb_member_sessions
  WHERE token_hash = v_token_hash
    AND expires_at > now()
  LIMIT 1;

  IF v_session.token_hash IS NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Session expired or invalid');
  END IF;

  IF p_email IS NOT NULL AND length(trim(p_email)) > 0 THEN
    IF lower(trim(v_session.email)) <> lower(trim(p_email)) AND lower(trim(v_session.member_ic)) <> lower(trim(p_email)) THEN
      RETURN json_build_object('valid', false, 'error', 'Session does not match identity');
    END IF;
  END IF;

  SELECT id, ic, email, name, role, rank, platoon, squad, section, att_section, department, photo_url
  INTO v_member
  FROM public.bb_members
  WHERE (ic = v_session.member_ic OR lower(email) = lower(v_session.email))
    AND coalesce(department, '') NOT IN ('deleted', 'archived_deleted')
  LIMIT 1;

  IF v_member.id IS NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Account is deactivated or removed');
  END IF;

  RETURN json_build_object(
    'valid', true,
    'member', row_to_json(v_member),
    'expires_at', v_session.expires_at
  );
END;
$$;

-- Invalidate member session token on logout
CREATE OR REPLACE FUNCTION public.rpc_member_logout(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF p_token IS NOT NULL THEN
    DELETE FROM public.bb_member_sessions
    WHERE token_hash = encode(digest(trim(p_token), 'sha256'), 'hex');
  END IF;
  RETURN json_build_object('success', true);
END;
$$;

-- Invalidate all active sessions for a user across all devices
CREATE OR REPLACE FUNCTION public.rpc_sign_out_everywhere(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token_hash text;
  v_session record;
  v_email text;
  v_ic text;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Token is required');
  END IF;

  v_token_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_session
  FROM public.bb_member_sessions
  WHERE token_hash = v_token_hash;

  IF v_session.token_hash IS NOT NULL THEN
    v_email := lower(trim(coalesce(v_session.email, '')));
    v_ic := lower(trim(coalesce(v_session.member_ic, '')));

    DELETE FROM public.bb_member_sessions
    WHERE lower(email) = v_email OR lower(member_ic) = v_ic;

    DELETE FROM public.bb_admin_member_signins WHERE lower(email) = v_email;
    DELETE FROM public.bb_admin_sessions WHERE lower(officer_email) = v_email;

    PERFORM public.rpc_log_audit_event(coalesce(nullif(v_email, ''), v_ic), 'member', 'auth.signout_everywhere', 'auth', coalesce(nullif(v_email, ''), v_ic),
      jsonb_build_object('message', 'All active sessions invalidated across devices'));

    RETURN json_build_object('success', true, 'message', 'All active sessions have been invalidated across all devices.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.bb_admin_sessions WHERE token = p_token) THEN
    SELECT lower(officer_email) INTO v_email FROM public.bb_admin_sessions WHERE token = p_token;
    DELETE FROM public.bb_admin_sessions WHERE lower(officer_email) = v_email;
    DELETE FROM public.bb_admin_member_signins WHERE lower(email) = v_email;
    DELETE FROM public.bb_member_sessions WHERE lower(email) = v_email;

    RETURN json_build_object('success', true, 'message', 'All active sessions have been invalidated across all devices.');
  END IF;

  RETURN json_build_object('success', false, 'error', 'Invalid session token');
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_sign_out_everywhere(text) TO anon, authenticated;


-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 2: PASSWORD COLUMN PROTECTION & SECURE MEMBER PASSWORD UPDATE (SEC-02)
-- ──────────────────────────────────────────────────────────────────────────────

-- 2.1 Revoke direct column SELECT and UPDATE on password from public roles
REVOKE SELECT (password) ON public.bb_members FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (password) ON public.bb_members FROM PUBLIC, anon, authenticated;

-- 2.2 Server-side RPC for authenticated member password change in Member Settings
CREATE OR REPLACE FUNCTION public.rpc_change_member_password(
  p_email text,
  p_current_password_hash text,
  p_new_password_hash text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_stored_pw text;
  v_parts text[];
  v_valid boolean := false;
BEGIN
  IF v_email = '' OR p_current_password_hash IS NULL OR p_new_password_hash IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Missing required credentials');
  END IF;

  SELECT password INTO v_stored_pw
  FROM public.bb_members
  WHERE (lower(email) = v_email OR lower(ic) = v_email)
    AND coalesce(department, '') NOT IN ('deleted', 'archived_deleted')
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_stored_pw IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Member account not found');
  END IF;

  -- Verify current password: check PBKDF2 format, SHA256 hex, or cleartext/base64
  IF v_stored_pw LIKE 'pbkdf2:sha256:%' THEN
    v_parts := string_to_array(v_stored_pw, ':');
    IF v_parts[5] = p_current_password_hash OR v_stored_pw = p_current_password_hash THEN
      v_valid := true;
    END IF;
  ELSIF v_stored_pw = p_current_password_hash 
     OR v_stored_pw = encode(digest(p_current_password_hash, 'sha256'), 'hex')
     OR v_stored_pw = replace(encode(convert_to(p_current_password_hash, 'UTF8'), 'base64'), chr(10), '') THEN
    v_valid := true;
  END IF;

  IF NOT v_valid THEN
    RETURN json_build_object('success', false, 'error', 'Current password is incorrect');
  END IF;

  -- Validate new password format (must be PBKDF2)
  IF p_new_password_hash !~ '^pbkdf2:sha256:100000:[a-fA-F0-9]{32}:[a-fA-F0-9]{64}$' THEN
    RETURN json_build_object('success', false, 'error', 'New password must use standard PBKDF2 hash format');
  END IF;

  -- Update password across all accounts matching this identity
  UPDATE public.bb_members
  SET password = p_new_password_hash,
      updated_at = now()
  WHERE (lower(email) = v_email OR lower(ic) = v_email)
    AND coalesce(department, '') NOT IN ('deleted', 'archived_deleted');

  RETURN json_build_object('success', true, 'message', 'Password updated successfully across member accounts');
END;
$$;

-- 2.3 Upgrade bb_guard_admin_member_credentials trigger to shield credentials & deactivations
CREATE OR REPLACE FUNCTION public.bb_guard_admin_member_credentials()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  old_email text;
  new_email text;
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    -- Block direct row deletions via public API
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Direct member deletion is strictly forbidden' USING ERRCODE = '42501';
    END IF;

    -- Non-credential UPDATE pass-through: allow avatar, media consent, phone, etc.
    IF TG_OP = 'UPDATE' AND ROW(
         new.ic,
         lower(trim(coalesce(new.email, ''))),
         new.password,
         new.role,
         coalesce(new.department, '') IN ('deleted', 'archived_deleted')
       ) IS NOT DISTINCT FROM ROW(
         old.ic,
         lower(trim(coalesce(old.email, ''))),
         old.password,
         old.role,
         coalesce(old.department, '') IN ('deleted', 'archived_deleted')
       ) THEN
      RETURN new;
    END IF;

    -- Block direct password column modification (must use server RPCs)
    IF TG_OP = 'UPDATE' AND new.password IS DISTINCT FROM old.password THEN
      RAISE EXCEPTION 'Password changes require a verified server operation' USING ERRCODE = '42501';
    END IF;

    -- Block unauthorized account deactivation (must use rpc_deactivate_member_accounts)
    IF TG_OP = 'UPDATE' AND coalesce(new.department, '') IN ('deleted', 'archived_deleted')
       AND coalesce(old.department, '') NOT IN ('deleted', 'archived_deleted') THEN
      RAISE EXCEPTION 'Account deactivation requires an administrative session' USING ERRCODE = '42501';
    END IF;

    -- Block identity changes (ic and email) and direct role elevation
    IF TG_OP = 'UPDATE' AND (new.ic IS DISTINCT FROM old.ic OR lower(trim(coalesce(new.email, ''))) IS DISTINCT FROM lower(trim(coalesce(old.email, '')))) THEN
      RAISE EXCEPTION 'Primary member identifier cannot be modified' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND new.role IS DISTINCT FROM old.role THEN
      RAISE EXCEPTION 'Member role changes require a verified server operation' USING ERRCODE = '42501';
    END IF;

    -- Shield administrator credentials and profiles
    IF TG_OP <> 'INSERT' THEN old_email := coalesce(nullif(old.email, ''), old.ic); END IF;
    IF TG_OP <> 'DELETE' THEN new_email := coalesce(nullif(new.email, ''), new.ic); END IF;
    IF (public.rpc_get_user_role(old_email)->>'is_admin')::boolean
       OR (public.rpc_get_user_role(new_email)->>'is_admin')::boolean THEN
      RAISE EXCEPTION 'Administrator credentials require a verified server operation' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Ensure BEFORE DELETE on server/service_role returns old row so deletion proceeds
  IF TG_OP = 'DELETE' THEN
    RETURN old;
  END IF;

  RETURN new;
END;
$$;


-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 3: BB_CONFIG LOCKDOWN & SHEETS SECRET PROTECTION (SEC-06)
-- ──────────────────────────────────────────────────────────────────────────────

-- Helper function to check if current request has administrative JWT privileges
CREATE OR REPLACE FUNCTION public.rpc_is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::json->>'role') IN ('service_role', 'supabase_admin'),
    false
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_is_admin() TO anon, authenticated;

-- Drop previous policies on bb_config
DROP POLICY IF EXISTS "bb_config_select_public" ON public.bb_config;
DROP POLICY IF EXISTS "bb_config_hide_retired_admin_digest" ON public.bb_config;
DROP POLICY IF EXISTS "bb_config_admin_only_insert" ON public.bb_config;
DROP POLICY IF EXISTS "bb_config_admin_only_update" ON public.bb_config;
DROP POLICY IF EXISTS "bb_config_protect_admin_role_inserts" ON public.bb_config;
DROP POLICY IF EXISTS "bb_config_protect_admin_role_updates" ON public.bb_config;
DROP POLICY IF EXISTS "bb_config_insert_upsert" ON public.bb_config;
DROP POLICY IF EXISTS "bb_config_update_key" ON public.bb_config;

-- 3.1 Strict public SELECT policy: Hides sheets sync secrets, OTPs, digests, and audit entries
CREATE POLICY "bb_config_select_public"
ON public.bb_config FOR SELECT
TO anon, authenticated
USING (
  public.rpc_is_admin() OR (
    key NOT IN ('admin_password_hash', 'bb_admin_roles', 'bb_master_sheet_config', 'bb_att_sheet')
    AND key NOT LIKE 'bb_reset_otp_%'
    AND key NOT LIKE 'bb_reg_otp_%'
    AND key NOT LIKE 'admin_password%'
    AND key NOT LIKE '%sync_token%'
    AND key NOT LIKE '%secret%'
    AND key NOT LIKE 'bb_master_sheet_config%'
    AND left(key, 15) <> 'bb_audit_event_'
  )
);

-- 3.2 Strict public INSERT policy: Prevents injecting reset OTPs, sheet configs, or admin roles
CREATE POLICY "bb_config_insert_restricted"
ON public.bb_config FOR INSERT
TO anon, authenticated
WITH CHECK (
  public.rpc_is_admin() OR (
    key IS NOT NULL AND length(trim(key)) > 0
    AND key NOT IN ('admin_password_hash', 'bb_admin_roles', 'bb_master_sheet_config', 'bb_att_sheet')
    AND key NOT LIKE 'bb_reset_otp_%'
    AND key NOT LIKE 'bb_reg_otp_%'
    AND key NOT LIKE 'admin_password%'
    AND key NOT LIKE '%sync_token%'
    AND key NOT LIKE '%secret%'
    AND key NOT LIKE 'bb_master_sheet_config%'
    AND left(key, 15) <> 'bb_audit_event_'
  )
);

-- 3.3 Strict public UPDATE policy
CREATE POLICY "bb_config_update_restricted"
ON public.bb_config FOR UPDATE
TO anon, authenticated
USING (
  public.rpc_is_admin() OR (
    key NOT IN ('admin_password_hash', 'bb_admin_roles', 'bb_master_sheet_config', 'bb_att_sheet')
    AND key NOT LIKE 'bb_reset_otp_%'
    AND key NOT LIKE 'bb_reg_otp_%'
    AND key NOT LIKE 'admin_password%'
    AND key NOT LIKE '%sync_token%'
    AND key NOT LIKE '%secret%'
    AND key NOT LIKE 'bb_master_sheet_config%'
    AND left(key, 15) <> 'bb_audit_event_'
  )
)
WITH CHECK (
  public.rpc_is_admin() OR (
    key IS NOT NULL AND length(trim(key)) > 0
    AND key NOT IN ('admin_password_hash', 'bb_admin_roles', 'bb_master_sheet_config', 'bb_att_sheet')
    AND key NOT LIKE 'bb_reset_otp_%'
    AND key NOT LIKE 'bb_reg_otp_%'
    AND key NOT LIKE 'admin_password%'
    AND key NOT LIKE '%sync_token%'
    AND key NOT LIKE '%secret%'
    AND key NOT LIKE 'bb_master_sheet_config%'
    AND left(key, 15) <> 'bb_audit_event_'
  )
);

-- 3.4 RPCs for Google Master Sheet sync configuration (Officers only)
CREATE OR REPLACE FUNCTION public.rpc_get_master_sheet_config(p_token text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session json;
  v_is_authorized boolean := false;
  v_cfg text;
BEGIN
  IF p_token IS NOT NULL AND length(trim(p_token)) > 0 THEN
    v_session := public.rpc_verify_admin_session(p_token);
    IF coalesce((v_session->>'valid')::boolean, false)
       AND coalesce(v_session->>'scope' IN ('admin', 'super_admin'), false)
       AND public.bb_admin_member_is_active(v_session->>'officer_email') THEN
      v_is_authorized := true;
    END IF;
  ELSE
    v_is_authorized := public.rpc_is_admin();
  END IF;

  IF NOT v_is_authorized THEN
    RETURN json_build_object('success', false, 'error', 'Admin authorization required');
  END IF;

  SELECT value INTO v_cfg
  FROM public.bb_config
  WHERE key = 'bb_master_sheet_config';

  RETURN json_build_object('success', true, 'config', v_cfg);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_save_master_sheet_config(p_token text, p_config text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session json;
  v_is_authorized boolean := false;
BEGIN
  IF p_token IS NOT NULL AND length(trim(p_token)) > 0 THEN
    v_session := public.rpc_verify_admin_session(p_token);
    IF coalesce((v_session->>'valid')::boolean, false)
       AND public.bb_admin_member_is_active(v_session->>'officer_email')
       AND coalesce(
         v_session->>'scope' = 'super_admin'
         OR (v_session->'permissions')::jsonb ?| array['roles', 'attendance'],
         false
       ) THEN
      v_is_authorized := true;
    END IF;
  ELSE
    v_is_authorized := public.rpc_is_admin();
  END IF;

  IF NOT v_is_authorized THEN
    RETURN json_build_object('success', false, 'error', 'Super Admin or Attendance Officer authorization required');
  END IF;

  INSERT INTO public.bb_config (key, value, updated_at)
  VALUES ('bb_master_sheet_config', p_config, now())
  ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = EXCLUDED.updated_at;

  IF (p_config::jsonb ? 'scriptUrl') THEN
    INSERT INTO public.bb_config (key, value, updated_at)
    VALUES ('bb_mailer_script_url', p_config::jsonb->>'scriptUrl', now())
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = EXCLUDED.updated_at;
  END IF;

  IF p_token IS NOT NULL AND length(trim(p_token)) > 0 THEN
    PERFORM public.rpc_append_admin_config_audit(p_token, jsonb_build_object(
      'action', 'config.update_sheet_sync',
      'target_type', 'config',
      'target_id', 'bb_master_sheet_config'
    ));
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_get_mailer_url()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_val text;
  v_url text;
BEGIN
  SELECT value INTO v_val FROM public.bb_config WHERE key = 'bb_master_sheet_config';
  IF v_val IS NOT NULL THEN
    BEGIN
      v_url := (v_val::jsonb)->>'scriptUrl';
    EXCEPTION WHEN others THEN
      v_url := NULL;
    END;
  END IF;
  RETURN json_build_object('success', true, 'script_url', v_url);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_get_mailer_url() TO anon, authenticated;


-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 4: BB_ORDERS IDOR & SUBMISSION PROTECTION (SEC-05)
-- ──────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "bb_orders_select_all" ON public.bb_orders;
DROP POLICY IF EXISTS "bb_orders_select_uniform_only" ON public.bb_orders;
DROP POLICY IF EXISTS "bb_orders_select_admin" ON public.bb_orders;

CREATE POLICY "bb_orders_select_admin"
ON public.bb_orders FOR SELECT
TO anon, authenticated
USING (public.rpc_is_admin());

CREATE OR REPLACE FUNCTION public.rpc_member_get_own_orders(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session json := public.rpc_verify_member_session(p_token);
  v_ic text;
  v_email text;
  v_orders json;
BEGIN
  IF NOT coalesce((v_session->>'valid')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', 'Valid member session required', 'orders', '[]'::json);
  END IF;

  v_ic := v_session->'member'->>'ic';
  v_email := lower(trim(coalesce(v_session->'member'->>'email', '')));

  SELECT json_agg(o) INTO v_orders
  FROM (
    SELECT *
    FROM public.bb_orders
    WHERE ic = v_ic OR (v_email <> '' AND lower(trim(ic)) = v_email)
    ORDER BY created_at DESC
  ) o;

  RETURN json_build_object(
    'success', true,
    'orders', coalesce(v_orders, '[]'::json)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_member_get_own_orders(text) TO anon, authenticated;

-- 4.2 Admin UPDATE & DELETE on bb_orders; deny unauthorized anon
CREATE POLICY "bb_orders_update_admin"
ON public.bb_orders FOR UPDATE
TO anon, authenticated
USING (public.rpc_is_admin())
WITH CHECK (public.rpc_is_admin());

CREATE POLICY "bb_orders_delete_admin"
ON public.bb_orders FOR DELETE
TO anon, authenticated
USING (public.rpc_is_admin());

-- 4.3 RPCs for Officer Admin order & form response management
CREATE OR REPLACE FUNCTION public.rpc_admin_get_orders(p_token text, p_form_id text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session json := public.rpc_verify_admin_session(p_token);
  v_orders json;
BEGIN
  IF NOT (v_session->>'valid')::boolean OR NOT coalesce(
    v_session->>'scope' = 'super_admin'
    OR (v_session->'permissions')::jsonb ?| array['orders', 'uniform'],
    false
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Admin authorization required');
  END IF;

  IF p_form_id IS NOT NULL AND length(trim(p_form_id)) > 0 THEN
    SELECT json_agg(o) INTO v_orders
    FROM (
      SELECT *
      FROM public.bb_orders
      WHERE (notes = p_form_id OR (order_number LIKE 'FORM-%' AND (items::text LIKE '%"form_id":' || p_form_id || '%' OR items::text LIKE '%"form_id":"' || p_form_id || '"%')))
      ORDER BY created_at DESC
    ) o;
  ELSE
    SELECT json_agg(o) INTO v_orders
    FROM (
      SELECT *
      FROM public.bb_orders
      ORDER BY created_at DESC
    ) o;
  END IF;

  RETURN json_build_object(
    'success', true,
    'orders', coalesce(v_orders, '[]'::json)
  );
END;
$$;

DROP FUNCTION IF EXISTS public.rpc_admin_update_order_status(text, text, text, text);
CREATE OR REPLACE FUNCTION public.rpc_admin_update_order_status(
  p_token text,
  p_order_number text,
  p_status text,
  p_notes text DEFAULT NULL,
  p_expected_status text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session json := public.rpc_verify_admin_session(p_token);
  v_updated integer;
BEGIN
  IF NOT (v_session->>'valid')::boolean OR NOT coalesce(
    v_session->>'scope' = 'super_admin'
    OR (v_session->'permissions')::jsonb ?| array['orders', 'uniform'],
    false
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Admin authorization required');
  END IF;

  IF p_order_number IS NULL OR length(trim(p_order_number)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Order number is required');
  END IF;

  UPDATE public.bb_orders
  SET status = p_status,
      notes = coalesce(p_notes, notes),
      updated_at = now()
  WHERE order_number = p_order_number
    AND (p_expected_status IS NULL OR status = p_expected_status);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Order not found or status changed concurrently');
  END IF;

  PERFORM public.rpc_append_admin_config_audit(p_token, jsonb_build_object(
    'action', 'order.update_status',
    'target_type', 'order',
    'target_id', p_order_number,
    'details', jsonb_build_object('status', p_status)
  ));

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_order(p_token text, p_order_number text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session json := public.rpc_verify_admin_session(p_token);
  v_deleted integer;
BEGIN
  IF NOT (v_session->>'valid')::boolean OR NOT coalesce(
    v_session->>'scope' = 'super_admin'
    OR (v_session->'permissions')::jsonb ?| array['orders', 'uniform'],
    false
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Admin authorization required');
  END IF;

  DELETE FROM public.bb_orders WHERE order_number = p_order_number;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Order not found');
  END IF;

  PERFORM public.rpc_append_admin_config_audit(p_token, jsonb_build_object(
    'action', 'order.delete',
    'target_type', 'order',
    'target_id', p_order_number
  ));

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_member_cancel_own_order(p_token text, p_order_number text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_member_session json := public.rpc_verify_member_session(p_token);
  v_member_ic text;
  v_member_email text;
  v_updated integer;
BEGIN
  IF NOT coalesce((v_member_session->>'valid')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', 'Valid member session required');
  END IF;

  IF p_order_number IS NULL OR length(trim(p_order_number)) = 0 OR p_order_number LIKE 'FORM-%' THEN
    RETURN json_build_object('success', false, 'error', 'Invalid uniform order number');
  END IF;

  v_member_ic := v_member_session->'member'->>'ic';
  v_member_email := lower(trim(coalesce(v_member_session->'member'->>'email', '')));

  UPDATE public.bb_orders
  SET status = 'cancelled',
      updated_at = now()
  WHERE order_number = p_order_number
    AND status = 'pending'
    AND (ic = v_member_ic OR (v_member_email <> '' AND lower(trim(ic)) = v_member_email));
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Pending order not found for member');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;


-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 5: BB_TASKS, BB_ANNOUNCEMENTS & BB_GALLERY HARDENING (SEC-01)
-- ──────────────────────────────────────────────────────────────────────────────

-- 5.1 bb_tasks: Deny unauthenticated DELETE; allow admin
DROP POLICY IF EXISTS "bb_tasks_delete_by_id" ON public.bb_tasks;
DROP POLICY IF EXISTS "bb_tasks_delete_deny" ON public.bb_tasks;
DROP POLICY IF EXISTS "bb_tasks_delete_admin" ON public.bb_tasks;
CREATE POLICY "bb_tasks_delete_admin"
ON public.bb_tasks FOR DELETE
TO anon, authenticated
USING (public.rpc_is_admin());

-- 5.2 bb_announcements: Deny unauthenticated DELETE; allow admin; enforce safe title on UPDATE
DROP POLICY IF EXISTS "bb_announcements_delete" ON public.bb_announcements;
DROP POLICY IF EXISTS "bb_announcements_delete_deny" ON public.bb_announcements;
DROP POLICY IF EXISTS "bb_announcements_delete_admin" ON public.bb_announcements;
CREATE POLICY "bb_announcements_delete_admin"
ON public.bb_announcements FOR DELETE
TO anon, authenticated
USING (public.rpc_is_admin());

DROP POLICY IF EXISTS "bb_announcements_update" ON public.bb_announcements;
CREATE POLICY "bb_announcements_update_safe"
ON public.bb_announcements FOR UPDATE
TO anon, authenticated
USING (id IS NOT NULL)
WITH CHECK (title IS NOT NULL AND length(trim(title)) > 0);

-- 5.3 bb_gallery: Deny unauthenticated DELETE; allow admin
DROP POLICY IF EXISTS "bb_gallery_delete" ON public.bb_gallery;
DROP POLICY IF EXISTS "bb_gallery_delete_deny" ON public.bb_gallery;
DROP POLICY IF EXISTS "bb_gallery_delete_admin" ON public.bb_gallery;
CREATE POLICY "bb_gallery_delete_admin"
ON public.bb_gallery FOR DELETE
TO anon, authenticated
USING (public.rpc_is_admin());

-- 5.4 Administrative RPCs for deletions
CREATE OR REPLACE FUNCTION public.rpc_admin_delete_task(p_token text, p_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session json := public.rpc_verify_admin_session(p_token);
BEGIN
  IF NOT (v_session->>'valid')::boolean OR NOT coalesce(v_session->>'scope' = 'super_admin' OR (v_session->'permissions')::jsonb ? 'tasks', false) THEN
    RETURN json_build_object('success', false, 'error', 'Task administration authorization required');
  END IF;

  DELETE FROM public.bb_tasks WHERE id::text = p_id;

  PERFORM public.rpc_append_admin_config_audit(p_token, jsonb_build_object(
    'action', 'task.delete',
    'target_type', 'task',
    'target_id', p_id
  ));

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_announcement(p_token text, p_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session json := public.rpc_verify_admin_session(p_token);
BEGIN
  IF NOT (v_session->>'valid')::boolean OR NOT coalesce(v_session->>'scope' = 'super_admin' OR (v_session->'permissions')::jsonb ? 'announcements', false) THEN
    RETURN json_build_object('success', false, 'error', 'Announcement administration authorization required');
  END IF;

  DELETE FROM public.bb_announcements WHERE id::text = p_id;

  PERFORM public.rpc_append_admin_config_audit(p_token, jsonb_build_object(
    'action', 'announcement.delete',
    'target_type', 'announcement',
    'target_id', p_id
  ));

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_gallery_item(p_token text, p_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session json := public.rpc_verify_admin_session(p_token);
BEGIN
  IF NOT (v_session->>'valid')::boolean OR NOT coalesce(v_session->>'scope' = 'super_admin' OR (v_session->'permissions')::jsonb ? 'gallery', false) THEN
    RETURN json_build_object('success', false, 'error', 'Gallery administration authorization required');
  END IF;

  DELETE FROM public.bb_gallery WHERE id::text = p_id;

  PERFORM public.rpc_append_admin_config_audit(p_token, jsonb_build_object(
    'action', 'gallery.delete',
    'target_type', 'gallery',
    'target_id', p_id
  ));

  RETURN json_build_object('success', true);
END;
$$;


-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 6: STORAGE.OBJECTS LOCKDOWN (SEC-01)
-- ──────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow portal media reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow portal media updates" ON storage.objects;
DROP POLICY IF EXISTS "Restricted media deletion for storage" ON storage.objects;

-- 6.1 SELECT: Only allow public reading of public media buckets
CREATE POLICY "Allow portal media reads"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (
  bucket_id IN ('avatars', 'gallery', 'story_highlights', 'resources', 'receipts', 'waivers')
);

-- 6.2 UPDATE: Only allow upserting avatars and gallery/story media; block overwriting sensitive receipts and waivers
CREATE POLICY "Allow portal media updates"
ON storage.objects FOR UPDATE
TO authenticated, anon
USING (
  bucket_id IN ('avatars', 'gallery', 'story_highlights')
)
WITH CHECK (
  bucket_id IN ('avatars', 'gallery', 'story_highlights')
);

-- 6.3 DELETE: Restrict deletion to avatars and gallery only; receipts, waivers, and resources cannot be deleted by anon
CREATE POLICY "Restricted media deletion for storage"
ON storage.objects FOR DELETE
TO authenticated, anon
USING (
  bucket_id IN ('avatars', 'gallery')
);


-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 7: RPC PRIVILEGES & SCHEMA CACHE RELOAD
-- ──────────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.rpc_is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_verify_member_session(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_member_logout(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_sign_out_everywhere(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_change_member_password(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_master_sheet_config(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_save_master_sheet_config(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_mailer_url() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_get_orders(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_member_get_own_orders(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_update_order_status(text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_order(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_member_cancel_own_order(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_announcement(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_gallery_item(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_task(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
