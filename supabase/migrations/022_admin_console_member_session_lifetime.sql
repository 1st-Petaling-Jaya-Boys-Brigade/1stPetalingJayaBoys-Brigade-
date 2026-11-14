-- Console sessions inherit the server-verified member sign-in's lifetime.
ALTER TABLE public.bb_admin_sessions
  ADD COLUMN member_signin_hash text REFERENCES public.bb_admin_member_signins(token_hash) ON DELETE CASCADE;
CREATE INDEX bb_admin_sessions_member_signin_idx ON public.bb_admin_sessions (member_signin_hash);

CREATE OR REPLACE FUNCTION public.rpc_open_member_admin_session(p_member_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_signin bb_admin_member_signins%ROWTYPE;
  v_token text;
  v_hash text;
  v_result json;
BEGIN
  IF p_member_token IS NULL OR p_member_token !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO v_signin FROM bb_admin_member_signins
    WHERE token_hash = encode(digest(p_member_token, 'sha256'), 'hex') AND expires_at > now() FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');
  INSERT INTO bb_admin_sessions (token_hash, officer_email, expires_at, member_signin_hash)
    VALUES (v_hash, v_signin.email, v_signin.expires_at, v_signin.token_hash);
  v_result := rpc_verify_admin_session(v_token);
  IF NOT coalesce((v_result->>'valid')::boolean, false) THEN
    DELETE FROM bb_admin_sessions WHERE token_hash = v_hash;
    RETURN NULL;
  END IF;
  RETURN (v_result::jsonb || jsonb_build_object('token', v_token))::json;
END;
$$;

NOTIFY pgrst, 'reload schema';
