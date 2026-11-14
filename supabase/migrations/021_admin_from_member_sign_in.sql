-- Grant console access from the member's normal sign-in.
CREATE TABLE public.bb_admin_member_signins (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX bb_admin_member_signins_email_idx ON public.bb_admin_member_signins (email);
ALTER TABLE public.bb_admin_member_signins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bb_admin_member_signins FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.rpc_begin_admin_member_signin(p_email text, p_password text, p_remember boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_identifier text := 'admin-member:' || v_email;
  v_stored text;
  v_password_bytes bytea;
  v_blocked jsonb;
  v_salt bytea;
  v_round bytea;
  v_derived bit(256);
  v_valid boolean := false;
  v_token text;
  v_expires timestamptz := now() + CASE WHEN p_remember THEN interval '14 days' ELSE interval '12 hours' END;
BEGIN
  IF v_email = '' OR p_password IS NULL OR length(p_password) NOT BETWEEN 1 AND 1024 OR
     coalesce(rpc_get_user_role(v_email)->>'role', '') NOT IN ('admin', 'super_admin') THEN
    RETURN NULL;
  END IF;
  SELECT value::jsonb INTO v_blocked FROM bb_config WHERE key = 'bb_blocked_emails';
  IF NOT FOUND THEN v_blocked := '[]'::jsonb; END IF;
  IF jsonb_typeof(v_blocked) IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_blocked) AS item
    WHERE lower(trim(coalesce(item->>'email', item #>> '{}'))) = v_email) THEN RETURN NULL; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_identifier, 0));
  IF coalesce((rpc_check_auth_lockout(v_identifier)->>'locked')::boolean, false) THEN RETURN NULL; END IF;

  SELECT password INTO v_stored FROM bb_members
    WHERE lower(coalesce(nullif(email, ''), ic)) = v_email
      AND coalesce(department, '') NOT IN ('deleted', 'archived_deleted')
    ORDER BY created_at, ic LIMIT 1;
  IF v_stored ~ '^pbkdf2:sha256:100000:[a-fA-F0-9]{32}:[a-fA-F0-9]{64}$' THEN
    v_password_bytes := convert_to(p_password, 'UTF8');
    v_salt := decode(split_part(v_stored, ':', 4), 'hex');
    v_round := hmac(v_salt || decode('00000001', 'hex'), v_password_bytes, 'sha256');
    v_derived := ('x' || encode(v_round, 'hex'))::bit(256);
    FOR i IN 2..100000 LOOP
      v_round := hmac(v_round, v_password_bytes, 'sha256');
      v_derived := v_derived # ('x' || encode(v_round, 'hex'))::bit(256);
    END LOOP;
    v_valid := v_derived = ('x' || split_part(v_stored, ':', 5))::bit(256);
  ELSIF v_stored IS NOT NULL THEN
    v_valid := v_stored = replace(encode(convert_to(p_password, 'UTF8'), 'base64'), chr(10), '');
  END IF;
  PERFORM rpc_record_auth_attempt(v_identifier, v_valid);
  IF NOT v_valid THEN RETURN NULL; END IF;

  DELETE FROM bb_admin_member_signins WHERE email = v_email AND expires_at <= now();
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO bb_admin_member_signins VALUES (encode(digest(v_token, 'sha256'), 'hex'), v_email, v_expires);
  RETURN json_build_object('token', v_token, 'expires_at', v_expires);
END;
$$;

CREATE FUNCTION public.rpc_open_member_admin_session(p_member_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_signin bb_admin_member_signins%ROWTYPE;
  v_token text;
  v_hash text;
  v_expires timestamptz;
  v_result json;
BEGIN
  IF p_member_token IS NULL OR p_member_token !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO v_signin FROM bb_admin_member_signins
    WHERE token_hash = encode(digest(p_member_token, 'sha256'), 'hex') AND expires_at > now() FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_expires := least(now() + interval '2 hours', v_signin.expires_at);
  INSERT INTO bb_admin_sessions (token_hash, officer_email, expires_at)
    VALUES (v_hash, v_signin.email, v_expires);
  v_result := rpc_verify_admin_session(v_token);
  IF NOT coalesce((v_result->>'valid')::boolean, false) THEN
    DELETE FROM bb_admin_sessions WHERE token_hash = v_hash;
    RETURN NULL;
  END IF;
  RETURN (v_result::jsonb || jsonb_build_object('token', v_token))::json;
END;
$$;

CREATE FUNCTION public.rpc_end_admin_member_signin(p_member_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  DELETE FROM bb_admin_member_signins WHERE token_hash = encode(digest(p_member_token, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.rpc_sign_out_everywhere(p_actor_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor text := lower(coalesce(trim(p_actor_id), 'anonymous'));
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('admin-member:' || v_actor, 0));
  DELETE FROM bb_admin_member_signins WHERE email = v_actor;
  DELETE FROM bb_admin_sessions WHERE lower(coalesce(officer_email, '')) = v_actor;
  PERFORM rpc_log_audit_event(v_actor, 'member', 'auth.signout_everywhere', 'auth', v_actor,
    jsonb_build_object('message', 'All active sessions invalidated across devices'));
  RETURN json_build_object('success', true, 'message', 'All active sessions have been invalidated across all devices.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_begin_admin_member_signin(text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_open_member_admin_session(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_end_admin_member_signin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_begin_admin_member_signin(text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_open_member_admin_session(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_end_admin_member_signin(text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_admin_login(text, text, text) FROM PUBLIC, anon, authenticated;
