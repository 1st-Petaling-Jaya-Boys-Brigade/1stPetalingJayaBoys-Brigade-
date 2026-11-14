-- Set a new SHA-256 passcode digest in bb_config.admin_password_hash as the database owner before applying.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.bb_config WHERE key = 'admin_password_hash'
      AND trim(value) ~ '^[a-fA-F0-9]{64}$'
  ) THEN
    RAISE EXCEPTION 'Configure a new admin passcode digest before applying this migration';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_set_admin_role(p_token text, p_target_email text, p_role text, p_permissions jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session json := rpc_verify_admin_session(p_token);
  v_email text := v_session->>'officer_email';
BEGIN
  IF NOT coalesce((v_session->>'valid')::boolean, false) OR
     NOT coalesce((rpc_get_user_role(v_email)->>'is_super_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Super Admin session required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bb_admin_roles'));
  RETURN rpc_assign_user_role(v_email, p_target_email, p_role, p_permissions);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_assign_user_role(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE POLICY bb_config_keep_admin_digest_private ON public.bb_config
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (key <> 'admin_password_hash' AND left(key, 15) <> 'bb_audit_event_')
  WITH CHECK (key <> 'admin_password_hash' AND left(key, 15) <> 'bb_audit_event_');

CREATE POLICY bb_config_protect_admin_role_inserts ON public.bb_config
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (key <> 'bb_admin_roles');
CREATE POLICY bb_config_protect_admin_role_updates ON public.bb_config
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (key <> 'bb_admin_roles') WITH CHECK (key <> 'bb_admin_roles');

-- Older sessions may have been issued using the retired browser credential.
DELETE FROM public.bb_admin_sessions;

CREATE OR REPLACE FUNCTION public.rpc_admin_login(
  p_password_hash text,
  p_officer_email text DEFAULT NULL,
  p_officer_rank text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_officer_email, '')));
  v_rank text;
  v_expected_hash text;
  v_token text;
  v_expires timestamptz := now() + interval '2 hours';
  v_blocked jsonb;
  v_role text;
  v_identifier text := 'admin:' || v_email;
BEGIN
  v_role := rpc_get_user_role(v_email)->>'role';
  IF v_email = '' OR coalesce(v_role, '') NOT IN ('admin', 'super_admin') THEN
    RETURN json_build_object('success', false);
  END IF;

  SELECT rank INTO v_rank FROM bb_members
    WHERE lower(coalesce(nullif(email, ''), ic)) = v_email
      AND coalesce(department, '') NOT IN ('deleted', 'archived_deleted')
    LIMIT 1;
  SELECT value::jsonb INTO v_blocked FROM bb_config WHERE key = 'bb_blocked_emails';
  IF NOT FOUND THEN v_blocked := '[]'::jsonb; END IF;
  IF jsonb_typeof(v_blocked) IS DISTINCT FROM 'array' THEN
    RETURN json_build_object('success', false);
  END IF;
  IF v_rank IS NULL OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_blocked) AS item
    WHERE lower(trim(coalesce(item->>'email', item #>> '{}'))) = v_email
  ) THEN
    RETURN json_build_object('success', false);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_identifier, 0));
  IF (rpc_check_auth_lockout(v_identifier)->>'locked')::boolean THEN
    RETURN json_build_object('success', false);
  END IF;
  SELECT lower(trim(value)) INTO v_expected_hash FROM bb_config WHERE key = 'admin_password_hash';
  IF v_expected_hash IS NULL OR p_password_hash IS DISTINCT FROM v_expected_hash THEN
    PERFORM rpc_record_auth_attempt(v_identifier, false);
    RETURN json_build_object('success', false);
  END IF;
  PERFORM rpc_record_auth_attempt(v_identifier, true);
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO bb_admin_sessions (token_hash, officer_email, officer_rank, expires_at)
    VALUES (encode(digest(v_token, 'sha256'), 'hex'), v_email, v_rank, v_expires);
  RETURN json_build_object('success', true, 'token', v_token, 'role', 'officer_admin', 'expires_at', v_expires);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_verify_admin_session(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session bb_admin_sessions%ROWTYPE;
  v_blocked jsonb;
  v_role jsonb;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN json_build_object('valid', false); END IF;
  SELECT * INTO v_session FROM bb_admin_sessions
    WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex') AND expires_at > now();
  IF NOT FOUND THEN
    RETURN json_build_object('valid', false);
  END IF;
  v_role := rpc_get_user_role(v_session.officer_email);
  IF coalesce(v_role->>'role', '') NOT IN ('admin', 'super_admin') THEN
    RETURN json_build_object('valid', false);
  END IF;
  SELECT coalesce(value::jsonb, '[]'::jsonb) INTO v_blocked FROM bb_config WHERE key = 'bb_blocked_emails';
  IF NOT FOUND THEN v_blocked := '[]'::jsonb; END IF;
  IF jsonb_typeof(v_blocked) <> 'array' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_blocked) AS item
      WHERE lower(trim(coalesce(item->>'email', item #>> '{}'))) = v_session.officer_email
  ) OR NOT EXISTS (
    SELECT 1 FROM bb_members WHERE lower(coalesce(nullif(email, ''), ic)) = v_session.officer_email
      AND coalesce(department, '') NOT IN ('deleted', 'archived_deleted')
  ) THEN RETURN json_build_object('valid', false); END IF;
  RETURN json_build_object('valid', true, 'officer_email', v_session.officer_email,
    'expires_at', v_session.expires_at, 'scope', v_role->>'role', 'permissions', v_role->'permissions');
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_append_admin_config_audit(p_token text, p_entry jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session json;
  v_email text;
  v_id uuid;
BEGIN
  v_session := rpc_verify_admin_session(p_token);
  v_email := v_session->>'officer_email';
  IF NOT coalesce((v_session->>'valid')::boolean, false) OR
     coalesce(rpc_get_user_role(v_email)->>'role', '') NOT IN ('admin', 'super_admin') THEN
    RETURN false;
  END IF;
  IF p_entry->>'action' IS NULL OR length(p_entry::text) > 8192 THEN RETURN false; END IF;
  v_id := (p_entry->>'id')::uuid;
  INSERT INTO bb_config (key, value, updated_at) VALUES (
    'bb_audit_event_' || v_id::text,
    (jsonb_build_object('id', v_id, 'timestamp', now(), 'actor_id', v_email, 'actor_role', 'officer_admin') ||
     jsonb_build_object('action', p_entry->>'action', 'target_type', p_entry->>'target_type',
                        'target_id', p_entry->>'target_id', 'details', p_entry->'details'))::text,
    now()
  ) ON CONFLICT (key) DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_deactivate_member_accounts(p_token text, p_member_ids text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session json := rpc_verify_admin_session(p_token);
  v_email text := v_session->>'officer_email';
  v_role jsonb := rpc_get_user_role(v_email);
  v_count integer := cardinality(p_member_ids);
  v_updated integer;
  v_entry_id uuid := gen_random_uuid();
BEGIN
  IF NOT coalesce((v_session->>'valid')::boolean, false) OR (
     NOT coalesce((v_role->>'is_super_admin')::boolean, false) AND
     NOT coalesce(v_role->'permissions' ? 'members', false)
  ) THEN
    RAISE EXCEPTION 'Member administration session required';
  END IF;
  IF v_count IS NULL OR v_count < 1 OR v_count > 200 OR EXISTS (
    SELECT 1 FROM bb_members m WHERE m.ic = ANY(p_member_ids) AND (
      lower(coalesce(nullif(m.email, ''), m.ic)) = v_email OR
      coalesce((rpc_get_user_role(coalesce(nullif(m.email, ''), m.ic))->>'is_super_admin')::boolean, false)
    )
  ) THEN
    RAISE EXCEPTION 'Invalid deactivation selection';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('bb_deleted_members', 0));
  UPDATE bb_members SET department = 'deleted'
    WHERE ic = ANY(p_member_ids) AND coalesce(department, '') NOT IN ('deleted', 'archived_deleted');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_count THEN RAISE EXCEPTION 'Member selection changed'; END IF;

  INSERT INTO bb_config (key, value, updated_at)
  VALUES ('bb_deleted_members', to_jsonb(p_member_ids)::text, now())
  ON CONFLICT (key) DO UPDATE SET
    value = (bb_config.value::jsonb || excluded.value::jsonb)::text,
    updated_at = excluded.updated_at;
  IF NOT rpc_append_admin_config_audit(p_token, jsonb_build_object(
    'id', v_entry_id, 'action', 'member.deactivate', 'target_type', 'account',
    'details', jsonb_build_object('count', v_count)
  )) THEN RAISE EXCEPTION 'Could not persist deactivation audit'; END IF;
  RETURN v_updated;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_set_admin_role(text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_append_admin_config_audit(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_deactivate_member_accounts(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_set_admin_role(text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_append_admin_config_audit(text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_deactivate_member_accounts(text, text[]) TO anon, authenticated;
