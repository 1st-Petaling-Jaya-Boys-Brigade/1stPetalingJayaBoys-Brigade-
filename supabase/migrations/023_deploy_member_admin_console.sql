-- Install the member-backed console on databases that still use ic as the member key.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.bb_admin_member_signins (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS bb_admin_member_signins_email_idx ON public.bb_admin_member_signins (email);
ALTER TABLE public.bb_admin_member_signins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bb_admin_member_signins FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.bb_admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  officer_email text,
  officer_rank text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.bb_admin_sessions
  ADD COLUMN IF NOT EXISTS member_signin_hash text REFERENCES public.bb_admin_member_signins(token_hash) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS bb_admin_sessions_member_signin_idx ON public.bb_admin_sessions (member_signin_hash);
ALTER TABLE public.bb_admin_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bb_admin_sessions FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.bb_admin_signin_attempts (
  email text PRIMARY KEY,
  failures integer NOT NULL,
  retry_after timestamptz NOT NULL
);
ALTER TABLE public.bb_admin_signin_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bb_admin_signin_attempts FROM PUBLIC, anon, authenticated;

-- Only carry forward role grants from a server that already enforced role writes.
LOCK TABLE public.bb_members, public.bb_config IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE
  v_legacy_roles jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'bb_config'
      AND policyname = 'bb_config_protect_admin_role_updates'
  ) THEN
    SELECT value::jsonb INTO v_legacy_roles FROM public.bb_config WHERE key = 'bb_admin_roles';
    IF EXISTS (
      SELECT FROM public.bb_members m
      CROSS JOIN LATERAL (SELECT lower(trim(coalesce(nullif(m.email, ''), m.ic))) AS email) AS identity
      WHERE identity.email <> 'jeshuakoh2008@gmail.com' AND coalesce(m.department, '') NOT IN ('deleted','archived_deleted')
        AND ((v_legacy_roles->'super_admins') ? identity.email OR (v_legacy_roles->'admins') ? identity.email)
    ) THEN
      RAISE EXCEPTION 'Verify active legacy administrator assignments before installing this migration';
    END IF;
    INSERT INTO public.bb_config (key, value, updated_at)
    VALUES ('bb_admin_roles', '{"super_admins":["jeshuakoh2008@gmail.com"],"admins":{}}', now())
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
  END IF;
END;
$$;

CREATE POLICY bb_config_admin_only_insert ON public.bb_config AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (key NOT IN ('bb_admin_roles', 'admin_password_hash') AND left(key, 15) <> 'bb_audit_event_');
CREATE POLICY bb_config_admin_only_update ON public.bb_config AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (key NOT IN ('bb_admin_roles', 'admin_password_hash') AND left(key, 15) <> 'bb_audit_event_')
  WITH CHECK (key NOT IN ('bb_admin_roles', 'admin_password_hash') AND left(key, 15) <> 'bb_audit_event_');
CREATE POLICY bb_config_admin_only_delete ON public.bb_config AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (key NOT IN ('bb_admin_roles', 'admin_password_hash') AND left(key, 15) <> 'bb_audit_event_');
CREATE POLICY bb_config_hide_retired_admin_digest ON public.bb_config AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (key <> 'admin_password_hash' AND left(key, 15) <> 'bb_audit_event_');

CREATE OR REPLACE FUNCTION public.rpc_get_user_role(p_email text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH cfg AS (SELECT coalesce((SELECT value::jsonb FROM public.bb_config WHERE key = 'bb_admin_roles'), '{}'::jsonb) AS roles),
       identity AS (SELECT lower(trim(p_email)) AS email),
       checked AS (
         SELECT coalesce(email = 'jeshuakoh2008@gmail.com' OR ((roles->'super_admins') ? email), false) AS super_admin,
                roles->'admins'->email AS perms FROM cfg CROSS JOIN identity
       )
  SELECT jsonb_build_object(
    'role', CASE WHEN super_admin THEN 'super_admin' WHEN jsonb_typeof(perms) = 'array' THEN 'admin' ELSE 'member' END,
    'is_super_admin', super_admin,
    'is_admin', super_admin OR coalesce(jsonb_typeof(perms) = 'array', false),
    'permissions', CASE WHEN super_admin THEN '["members","orders","uniform","tasks","announcements","badges","gallery","attendance","resources","calendar","roles"]'::jsonb
                       WHEN jsonb_typeof(perms) = 'array' THEN perms ELSE '[]'::jsonb END
  ) FROM checked;
$$;

-- Member profiles are still edited via the Data API. Shield the identity and password
-- used by the console while allowing edits such as ranks, squads and ordinary departments.
CREATE FUNCTION public.bb_guard_admin_member_credentials()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  old_email text;
  new_email text;
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'UPDATE' AND ROW(new.ic, new.email, new.password, coalesce(new.department, '') IN ('deleted','archived_deleted'))
       IS NOT DISTINCT FROM ROW(old.ic, old.email, old.password, coalesce(old.department, '') IN ('deleted','archived_deleted')) THEN
      RETURN new;
    END IF;
    IF TG_OP <> 'INSERT' THEN old_email := coalesce(nullif(old.email, ''), old.ic); END IF;
    IF TG_OP <> 'DELETE' THEN new_email := coalesce(nullif(new.email, ''), new.ic); END IF;
    IF (public.rpc_get_user_role(old_email)->>'is_admin')::boolean
       OR (public.rpc_get_user_role(new_email)->>'is_admin')::boolean THEN
      RAISE EXCEPTION 'Administrator credentials require a verified server operation' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN old; END IF;
  RETURN new;
END;
$$;
CREATE TRIGGER bb_guard_admin_member_credentials BEFORE INSERT OR UPDATE OR DELETE ON public.bb_members
  FOR EACH ROW EXECUTE FUNCTION public.bb_guard_admin_member_credentials();

CREATE FUNCTION public.bb_admin_member_is_active(p_email text)
RETURNS boolean LANGUAGE sql STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.bb_members WHERE lower(trim(coalesce(nullif(email, ''), ic))) = p_email
    AND coalesce(department,'') NOT IN ('deleted','archived_deleted'))
  AND NOT EXISTS (SELECT 1 FROM public.bb_config c
    CROSS JOIN LATERAL jsonb_array_elements(c.value::jsonb) AS blocked(item)
    WHERE c.key = 'bb_blocked_emails' AND lower(trim(coalesce(item->>'email', item #>> '{}'))) = p_email);
$$;

CREATE OR REPLACE FUNCTION public.rpc_begin_admin_member_signin(p_email text, p_password text, p_remember boolean)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_stored text;
  v_password_bytes bytea;
  v_round bytea;
  v_derived bit(256);
  v_token text;
  v_expires timestamptz := now() + CASE WHEN p_remember THEN interval '14 days' ELSE interval '12 hours' END;
BEGIN
  IF v_email = '' OR p_password IS NULL OR length(p_password) NOT BETWEEN 1 AND 1024
     OR NOT (public.rpc_get_user_role(v_email)->>'is_admin')::boolean
     OR NOT public.bb_admin_member_is_active(v_email) THEN RETURN NULL; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('admin-member:' || v_email, 0));
  IF EXISTS (SELECT FROM public.bb_admin_signin_attempts WHERE email = v_email AND failures >= 5 AND retry_after > now()) THEN
    RETURN NULL;
  END IF;
  SELECT password INTO v_stored FROM public.bb_members
    WHERE lower(trim(coalesce(nullif(email, ''), ic))) = v_email AND coalesce(department, '') NOT IN ('deleted','archived_deleted')
    ORDER BY ic LIMIT 1;
  IF v_stored IS NULL OR v_stored !~ '^pbkdf2:sha256:100000:[a-fA-F0-9]{32}:[a-fA-F0-9]{64}$' THEN RETURN NULL; END IF;
  v_password_bytes := convert_to(p_password, 'UTF8');
  v_round := hmac(decode(split_part(v_stored, ':', 4) || '00000001', 'hex'), v_password_bytes, 'sha256');
  v_derived := ('x' || encode(v_round, 'hex'))::bit(256);
  FOR i IN 2..100000 LOOP
    v_round := hmac(v_round, v_password_bytes, 'sha256');
    v_derived := v_derived # ('x' || encode(v_round, 'hex'))::bit(256);
  END LOOP;
  IF v_derived <> ('x' || split_part(v_stored, ':', 5))::bit(256) THEN
    INSERT INTO public.bb_admin_signin_attempts AS attempts VALUES (v_email, 1, now() + interval '15 minutes')
    ON CONFLICT (email) DO UPDATE SET failures = CASE WHEN attempts.retry_after <= now() THEN 1 ELSE attempts.failures + 1 END,
      retry_after = excluded.retry_after;
    RETURN NULL;
  END IF;
  DELETE FROM public.bb_admin_signin_attempts WHERE email = v_email;
  DELETE FROM public.bb_admin_member_signins WHERE email = v_email AND expires_at <= now();
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.bb_admin_member_signins VALUES (encode(digest(v_token, 'sha256'), 'hex'), v_email, v_expires);
  RETURN json_build_object('token', v_token, 'expires_at', v_expires);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_verify_admin_session(p_token text)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_session public.bb_admin_sessions%ROWTYPE;
  v_role jsonb;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN json_build_object('valid', false); END IF;
  SELECT s.* INTO v_session FROM public.bb_admin_sessions s JOIN public.bb_admin_member_signins m ON m.token_hash = s.member_signin_hash
    WHERE s.token_hash = encode(digest(p_token, 'sha256'), 'hex') AND least(s.expires_at, m.expires_at) > now();
  IF NOT FOUND THEN RETURN json_build_object('valid', false); END IF;
  v_role := public.rpc_get_user_role(v_session.officer_email);
  IF NOT (v_role->>'is_admin')::boolean OR NOT public.bb_admin_member_is_active(v_session.officer_email) THEN
    RETURN json_build_object('valid', false);
  END IF;
  RETURN json_build_object('valid', true, 'officer_email', v_session.officer_email, 'expires_at', v_session.expires_at,
    'scope', v_role->>'role', 'permissions', v_role->'permissions');
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_open_member_admin_session(p_member_token text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_signin public.bb_admin_member_signins%ROWTYPE;
  v_token text;
  v_role jsonb;
BEGIN
  IF p_member_token IS NULL OR p_member_token !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO v_signin FROM public.bb_admin_member_signins
    WHERE token_hash = encode(digest(p_member_token, 'sha256'), 'hex') AND expires_at > now() FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_role := public.rpc_get_user_role(v_signin.email);
  IF NOT (v_role->>'is_admin')::boolean OR NOT public.bb_admin_member_is_active(v_signin.email) THEN RETURN NULL; END IF;
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.bb_admin_sessions (token_hash, officer_email, expires_at, member_signin_hash)
    VALUES (encode(digest(v_token, 'sha256'), 'hex'), v_signin.email, v_signin.expires_at, v_signin.token_hash);
  RETURN json_build_object('valid', true, 'token', v_token, 'officer_email', v_signin.email,
    'expires_at', v_signin.expires_at, 'scope', v_role->>'role', 'permissions', v_role->'permissions');
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_end_admin_member_signin(p_member_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
  DELETE FROM public.bb_admin_member_signins WHERE token_hash = encode(digest(p_member_token, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_logout(p_token text)
RETURNS json LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
  DELETE FROM public.bb_admin_sessions WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex');
  SELECT json_build_object('success', true);
$$;

CREATE OR REPLACE FUNCTION public.rpc_append_admin_config_audit(p_token text, p_entry jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_session json := public.rpc_verify_admin_session(p_token);
  v_id uuid;
BEGIN
  IF NOT (v_session->>'valid')::boolean OR p_entry->>'action' IS NULL OR length(p_entry::text) > 8192 THEN RETURN false; END IF;
  v_id := coalesce((p_entry->>'id')::uuid, gen_random_uuid());
  INSERT INTO public.bb_config (key, value, updated_at) VALUES (
    'bb_audit_event_' || v_id::text,
    (jsonb_build_object('id', v_id, 'timestamp', now(), 'actor_id', v_session->>'officer_email', 'actor_role', 'officer_admin') ||
     (p_entry - 'id' - 'actor_id' - 'actor_role' - 'timestamp'))::text,
    now()
  ) ON CONFLICT (key) DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_set_admin_role(p_token text, p_target_email text, p_role text, p_permissions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_session json := public.rpc_verify_admin_session(p_token);
  v_email text := lower(trim(coalesce(p_target_email, '')));
  v_roles jsonb;
  v_supers jsonb;
  v_admins jsonb;
BEGIN
  IF NOT coalesce(v_session->>'scope' = 'super_admin', false) THEN RAISE EXCEPTION 'Super Admin session required' USING ERRCODE = '42501'; END IF;
  IF v_email = '' OR p_role IS NULL OR p_role NOT IN ('member', 'admin', 'super_admin')
     OR (v_email = 'jeshuakoh2008@gmail.com' AND p_role <> 'super_admin')
     OR (p_role = 'admin' AND jsonb_typeof(p_permissions) IS DISTINCT FROM 'array') THEN
    RAISE EXCEPTION 'Invalid role assignment';
  END IF;
  LOCK TABLE public.bb_members IN SHARE ROW EXCLUSIVE MODE;
  PERFORM pg_advisory_xact_lock(hashtext('bb_admin_roles'));
  IF NOT coalesce(public.rpc_verify_admin_session(p_token)->>'scope' = 'super_admin', false) THEN
    RAISE EXCEPTION 'Super Admin session required' USING ERRCODE = '42501';
  END IF;
  IF p_role <> 'member' AND NOT public.bb_admin_member_is_active(v_email) THEN RAISE EXCEPTION 'An active member account is required'; END IF;
  SELECT value::jsonb INTO v_roles FROM public.bb_config WHERE key = 'bb_admin_roles';
  v_supers := coalesce(v_roles->'super_admins', '[]'::jsonb) - v_email;
  v_admins := coalesce(v_roles->'admins', '{}'::jsonb) - v_email;
  IF p_role = 'super_admin' THEN v_supers := v_supers || to_jsonb(v_email); END IF;
  IF p_role = 'admin' THEN v_admins := v_admins || jsonb_build_object(v_email, p_permissions - 'roles'); END IF;
  UPDATE public.bb_config SET value = jsonb_build_object('super_admins', v_supers, 'admins', v_admins)::text, updated_at = now()
    WHERE key = 'bb_admin_roles';
  IF p_role = 'member' THEN DELETE FROM public.bb_admin_member_signins WHERE email = v_email; END IF;
  PERFORM public.rpc_append_admin_config_audit(p_token, jsonb_build_object(
    'action', 'rbac.role_change', 'target_type', 'account', 'target_id', v_email, 'details', jsonb_build_object('role', p_role)));
  RETURN jsonb_build_object('success', true, 'role', p_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_deactivate_member_accounts(p_token text, p_member_ids text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_session json := public.rpc_verify_admin_session(p_token);
  v_count integer := cardinality(p_member_ids);
  v_updated integer;
BEGIN
  IF NOT (v_session->>'valid')::boolean OR NOT coalesce(v_session->>'scope' = 'super_admin' OR (v_session->'permissions')::jsonb ? 'members', false) THEN
    RAISE EXCEPTION 'Member administration session required' USING ERRCODE = '42501';
  END IF;
  IF v_count IS NULL OR v_count NOT BETWEEN 1 AND 200 OR EXISTS (
    SELECT FROM public.bb_members m WHERE m.ic = ANY(p_member_ids) AND (
      lower(trim(coalesce(nullif(m.email, ''), m.ic))) = v_session->>'officer_email' OR
      (public.rpc_get_user_role(coalesce(nullif(m.email, ''), m.ic))->>'is_super_admin')::boolean)
  ) THEN RAISE EXCEPTION 'Invalid deactivation selection'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bb_admin_roles'));
  UPDATE public.bb_members SET department = 'deleted'
    WHERE ic = ANY(p_member_ids) AND coalesce(department, '') NOT IN ('deleted', 'archived_deleted');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_count THEN RAISE EXCEPTION 'Member selection changed'; END IF;
  INSERT INTO public.bb_config (key, value, updated_at) VALUES ('bb_deleted_members', to_jsonb(p_member_ids)::text, now())
  ON CONFLICT (key) DO UPDATE SET value = (bb_config.value::jsonb || excluded.value::jsonb)::text, updated_at = now();
  IF NOT public.rpc_append_admin_config_audit(p_token, jsonb_build_object(
    'action', 'member.deactivate', 'target_type', 'account', 'details', jsonb_build_object('count', v_count)
  )) THEN RAISE EXCEPTION 'Could not persist deactivation audit'; END IF;
  RETURN v_updated;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.rpc_admin_login(text,text,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rpc_admin_login(text,text,text) FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.rpc_assign_user_role(text,text,text,jsonb)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rpc_assign_user_role(text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.rpc_sign_out_everywhere(text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rpc_sign_out_everywhere(text) FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bb_admin_member_is_active(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_get_user_role(text), public.rpc_begin_admin_member_signin(text,text,boolean),
  public.rpc_open_member_admin_session(text), public.rpc_verify_admin_session(text), public.rpc_end_admin_member_signin(text),
  public.rpc_admin_logout(text), public.rpc_append_admin_config_audit(text,jsonb), public.rpc_set_admin_role(text,text,text,jsonb),
  public.rpc_deactivate_member_accounts(text,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_user_role(text), public.rpc_begin_admin_member_signin(text,text,boolean),
  public.rpc_open_member_admin_session(text), public.rpc_verify_admin_session(text), public.rpc_end_admin_member_signin(text),
  public.rpc_admin_logout(text), public.rpc_append_admin_config_audit(text,jsonb), public.rpc_set_admin_role(text,text,text,jsonb),
  public.rpc_deactivate_member_accounts(text,text[]) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
