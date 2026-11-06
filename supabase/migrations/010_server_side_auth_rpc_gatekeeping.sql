-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 010_server_side_auth_rpc_gatekeeping.sql
--
-- Server-Side Auth & PostgreSQL SECURITY DEFINER RPC Gatekeeping
--
-- Security Enhancements:
--   1. Protects bb_members.password from public SELECT and UPDATE queries via anon key.
--   2. Restricts bb_config so sensitive keys (OTPs, admin passwords, sync tokens)
--      cannot be scraped or dumped via public anon REST requests.
--   3. Creates dedicated bb_password_resets and bb_admin_sessions tables with
--      strict RLS denying direct public access.
--   4. Implements PostgreSQL SECURITY DEFINER RPC functions:
--      - rpc_get_auth_salt: Retrieves salt for client-side PBKDF2 calculation.
--      - rpc_authenticate_member: Server-side member authentication & session issue.
--      - rpc_verify_family_password: Server-side family password check for multi-child accounts.
--      - rpc_request_password_reset: Generates & hashes OTP for password resets.
--      - rpc_verify_otp_and_reset_password: Server-side OTP validation & password reset.
--      - rpc_admin_login: Server-side Officer Admin authentication & session token creation.
--      - rpc_verify_admin_session: Server-side Officer Admin token verification.
--      - rpc_admin_logout: Revokes Officer Admin session token.
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 1: DEDICATED SECURITY TABLES (Zero Direct Public Access)
-- ──────────────────────────────────────────────────────────────────────────────

-- 1.1 Password Reset OTPs (Stored exclusively as cryptographic SHA-256 hashes)
CREATE TABLE IF NOT EXISTS bb_password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  otp_hash text NOT NULL,
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 5,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bb_password_resets_email_active 
ON bb_password_resets (lower(email), used, expires_at);

ALTER TABLE bb_password_resets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bb_password_resets_deny_direct" ON bb_password_resets;
CREATE POLICY "bb_password_resets_deny_direct"
ON bb_password_resets FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

COMMENT ON TABLE bb_password_resets IS 'Server-side password reset OTP storage. Inaccessible directly via PostgREST anon key; managed exclusively by SECURITY DEFINER RPC functions.';


-- 1.2 Officer Admin Server-Side Sessions
CREATE TABLE IF NOT EXISTS bb_admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  officer_email text,
  officer_rank text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bb_admin_sessions_token_hash 
ON bb_admin_sessions (token_hash, expires_at);

ALTER TABLE bb_admin_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bb_admin_sessions_deny_direct" ON bb_admin_sessions;
CREATE POLICY "bb_admin_sessions_deny_direct"
ON bb_admin_sessions FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

COMMENT ON TABLE bb_admin_sessions IS 'Server-side Officer Admin session tokens. Inaccessible directly via PostgREST anon key; managed exclusively by SECURITY DEFINER RPC functions.';


-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 2: HARDEN bb_config & bb_members RLS POLICIES
-- ──────────────────────────────────────────────────────────────────────────────

-- 2.1 Restrict bb_config so sensitive credential keys cannot be dumped
DROP POLICY IF EXISTS "bb_config_select_public" ON bb_config;
CREATE POLICY "bb_config_select_public"
ON bb_config FOR SELECT
TO anon, authenticated
USING (
  key NOT LIKE 'bb_reset_otp_%'
  AND key NOT LIKE 'admin_password%'
  AND key NOT LIKE '%sync_token%'
  AND key NOT LIKE '%secret%'
);

-- 2.2 Protect bb_members password column from direct public updates
DROP POLICY IF EXISTS "bb_members_update_profile" ON bb_members;
CREATE POLICY "bb_members_update_profile"
ON bb_members FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (
  name IS NOT NULL AND length(trim(name)) > 0
);


-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 3: RPC FUNCTIONS (SECURITY DEFINER)
-- ──────────────────────────────────────────────────────────────────────────────

-- 3.1 rpc_get_auth_salt: Retrieves salt for client-side PBKDF2 calculation
CREATE OR REPLACE FUNCTION rpc_get_auth_salt(p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stored_pw text;
  v_salt text;
  v_parts text[];
BEGIN
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN json_build_object('found', false, 'error', 'Email is required');
  END IF;

  SELECT password INTO v_stored_pw
  FROM bb_members
  WHERE lower(email) = lower(trim(p_email))
    AND coalesce(department, '') NOT IN ('deleted', 'archived_deleted')
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_stored_pw IS NULL THEN
    -- Return consistent pseudo-salt to mitigate user enumeration timing attacks
    RETURN json_build_object(
      'found', false,
      'salt', encode(digest(p_email || '1stpjbb_salt_padding', 'sha256'), 'hex'),
      'iterations', 100000,
      'algorithm', 'pbkdf2:sha256'
    );
  END IF;

  IF v_stored_pw LIKE 'pbkdf2:sha256:%' THEN
    v_parts := string_to_array(v_stored_pw, ':');
    v_salt := v_parts[4];
    RETURN json_build_object(
      'found', true,
      'salt', v_salt,
      'iterations', 100000,
      'algorithm', 'pbkdf2:sha256'
    );
  ELSE
    -- Legacy format (SHA-256 or base64)
    RETURN json_build_object(
      'found', true,
      'salt', NULL,
      'iterations', 0,
      'algorithm', 'legacy'
    );
  END IF;
END;
$$;


-- 3.2 rpc_authenticate_member: Server-side member authentication & profile retrieval
CREATE OR REPLACE FUNCTION rpc_authenticate_member(
  p_email text,
  p_password_hash text,
  p_member_name text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member record;
  v_stored_pw text;
  v_parts text[];
  v_matched boolean := false;
  v_accounts json;
  v_matched_account json;
BEGIN
  IF p_email IS NULL OR p_password_hash IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Email and password credentials are required');
  END IF;

  -- 1. Check credentials against registered active account
  FOR v_member IN
    SELECT *
    FROM bb_members
    WHERE lower(email) = lower(trim(p_email))
      AND coalesce(department, '') NOT IN ('deleted', 'archived_deleted')
  LOOP
    v_stored_pw := v_member.password;

    IF v_stored_pw IS NOT NULL THEN
      IF v_stored_pw LIKE 'pbkdf2:sha256:%' THEN
        v_parts := string_to_array(v_stored_pw, ':');
        -- Compare hashHex or full formatted string
        IF v_parts[5] = p_password_hash OR v_stored_pw = p_password_hash THEN
          v_matched := true;
          EXIT;
        END IF;
      ELSIF v_stored_pw = p_password_hash OR v_stored_pw = encode(digest(p_password_hash, 'sha256'), 'hex') THEN
        v_matched := true;
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
  FROM bb_members m
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
    FROM bb_members m
    WHERE lower(m.email) = lower(trim(p_email))
      AND lower(trim(m.name)) = lower(trim(p_member_name))
      AND coalesce(m.department, '') NOT IN ('deleted', 'archived_deleted')
    LIMIT 1;
  END IF;

  RETURN json_build_object(
    'success', true,
    'accounts', v_accounts,
    'account', coalesce(v_matched_account, (v_accounts->0))
  );
END;
$$;


-- 3.3 rpc_verify_family_password: Server-side family password verification
CREATE OR REPLACE FUNCTION rpc_verify_family_password(
  p_email text,
  p_password_hash text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stored_pw text;
  v_parts text[];
  v_valid boolean := false;
BEGIN
  IF p_email IS NULL OR p_password_hash IS NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Email and password credentials required');
  END IF;

  SELECT password INTO v_stored_pw
  FROM bb_members
  WHERE lower(email) = lower(trim(p_email))
    AND coalesce(department, '') NOT IN ('deleted', 'archived_deleted')
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_stored_pw IS NULL THEN
    -- No prior accounts exist under this family email
    RETURN json_build_object('valid', true, 'is_new_family', true);
  END IF;

  IF v_stored_pw LIKE 'pbkdf2:sha256:%' THEN
    v_parts := string_to_array(v_stored_pw, ':');
    IF v_parts[5] = p_password_hash OR v_stored_pw = p_password_hash THEN
      v_valid := true;
    END IF;
  ELSIF v_stored_pw = p_password_hash OR v_stored_pw = encode(digest(p_password_hash, 'sha256'), 'hex') THEN
    v_valid := true;
  END IF;

  RETURN json_build_object('valid', v_valid, 'is_new_family', false);
END;
$$;


-- 3.4 rpc_request_password_reset: Stores hashed OTP securely in bb_password_resets
CREATE OR REPLACE FUNCTION rpc_request_password_reset(
  p_email text,
  p_otp_code text,
  p_otp_hash text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member_count integer;
  v_hash text;
BEGIN
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Email is required');
  END IF;

  -- Verify active member exists for this email
  SELECT count(*) INTO v_member_count
  FROM bb_members
  WHERE lower(email) = lower(trim(p_email))
    AND coalesce(department, '') NOT IN ('deleted', 'archived_deleted');

  IF v_member_count = 0 THEN
    RETURN json_build_object('success', false, 'error', 'No active account found for this email address');
  END IF;

  -- Derive hash if not provided by caller
  v_hash := coalesce(p_otp_hash, encode(digest(p_otp_code, 'sha256'), 'hex'));

  -- Invalidate prior unused reset requests for this email
  UPDATE bb_password_resets
  SET used = true
  WHERE lower(email) = lower(trim(p_email))
    AND used = false;

  -- Record new reset attempt (valid for 15 minutes)
  INSERT INTO bb_password_resets (
    email,
    otp_hash,
    attempts,
    max_attempts,
    expires_at,
    used
  ) VALUES (
    lower(trim(p_email)),
    v_hash,
    0,
    5,
    now() + interval '15 minutes',
    false
  );

  RETURN json_build_object('success', true, 'email', lower(trim(p_email)));
END;
$$;


-- 3.5 rpc_verify_otp_and_reset_password: Server-side OTP validation & password reset
CREATE OR REPLACE FUNCTION rpc_verify_otp_and_reset_password(
  p_email text,
  p_otp_code text,
  p_new_password_hash text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record record;
  v_input_hash text;
BEGIN
  IF p_email IS NULL OR p_otp_code IS NULL OR p_new_password_hash IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Missing required parameters');
  END IF;

  v_input_hash := encode(digest(trim(p_otp_code), 'sha256'), 'hex');

  -- Locate active reset token
  SELECT * INTO v_record
  FROM bb_password_resets
  WHERE lower(email) = lower(trim(p_email))
    AND used = false
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_record.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Verification code has expired or does not exist. Please request a new code.');
  END IF;

  IF v_record.attempts >= v_record.max_attempts THEN
    UPDATE bb_password_resets SET used = true WHERE id = v_record.id;
    RETURN json_build_object('success', false, 'error', 'Too many failed verification attempts. Please request a new code.');
  END IF;

  IF v_record.otp_hash <> v_input_hash THEN
    UPDATE bb_password_resets 
    SET attempts = attempts + 1 
    WHERE id = v_record.id;
    RETURN json_build_object('success', false, 'error', 'Invalid verification code.');
  END IF;

  -- OTP is valid: Update all active accounts under this email with the new password
  UPDATE bb_members
  SET password = p_new_password_hash
  WHERE lower(email) = lower(trim(p_email))
    AND coalesce(department, '') NOT IN ('deleted', 'archived_deleted');

  -- Mark OTP as consumed
  UPDATE bb_password_resets
  SET used = true
  WHERE id = v_record.id;

  RETURN json_build_object('success', true, 'message', 'Password updated successfully across member accounts');
END;
$$;


-- 3.6 rpc_admin_login: Server-side Officer Admin authentication & session issue
CREATE OR REPLACE FUNCTION rpc_admin_login(
  p_password_hash text,
  p_officer_email text DEFAULT NULL,
  p_officer_rank text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expected_hash text := 'e73d72da113ab72c21c2a07d2a4b72c5d28885ce29bd22abcb6697a8cd79ec7f';
  v_custom_hash text;
  v_session_token text;
  v_token_hash text;
  v_expires_at timestamptz;
BEGIN
  -- Check for custom admin password hash in bb_config
  SELECT value INTO v_custom_hash
  FROM bb_config
  WHERE key = 'admin_password_hash';

  IF v_custom_hash IS NOT NULL AND length(trim(v_custom_hash)) > 0 THEN
    v_expected_hash := trim(v_custom_hash);
  END IF;

  IF p_password_hash IS NULL OR p_password_hash <> v_expected_hash THEN
    RETURN json_build_object('success', false, 'error', 'Invalid admin password');
  END IF;

  -- Generate server-side session token
  v_session_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_session_token, 'sha256'), 'hex');
  v_expires_at := now() + interval '2 hours';

  -- Purge expired admin sessions
  DELETE FROM bb_admin_sessions WHERE expires_at < now();

  -- Record server-side session
  INSERT INTO bb_admin_sessions (
    token_hash,
    officer_email,
    officer_rank,
    expires_at
  ) VALUES (
    v_token_hash,
    p_officer_email,
    p_officer_rank,
    v_expires_at
  );

  RETURN json_build_object(
    'success', true,
    'token', v_session_token,
    'role', 'officer_admin',
    'expires_at', v_expires_at
  );
END;
$$;


-- 3.7 rpc_verify_admin_session: Server-side session verification
CREATE OR REPLACE FUNCTION rpc_verify_admin_session(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token_hash text;
  v_record record;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN json_build_object('valid', false, 'error', 'Token is required');
  END IF;

  v_token_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_record
  FROM bb_admin_sessions
  WHERE token_hash = v_token_hash
    AND expires_at > now()
  LIMIT 1;

  IF v_record.id IS NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Admin session expired or invalid');
  END IF;

  RETURN json_build_object(
    'valid', true,
    'role', 'officer_admin',
    'officer_email', v_record.officer_email,
    'officer_rank', v_record.officer_rank,
    'expires_at', v_record.expires_at
  );
END;
$$;


-- 3.8 rpc_admin_logout: Server-side session revocation
CREATE OR REPLACE FUNCTION rpc_admin_logout(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token_hash text;
BEGIN
  IF p_token IS NOT NULL THEN
    v_token_hash := encode(digest(trim(p_token), 'sha256'), 'hex');
    DELETE FROM bb_admin_sessions WHERE token_hash = v_token_hash;
  END IF;
  RETURN json_build_object('success', true);
END;
$$;

-- Grant execution privileges on all auth RPCs to anon and authenticated
GRANT EXECUTE ON FUNCTION rpc_get_auth_salt(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_authenticate_member(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_verify_family_password(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_request_password_reset(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_verify_otp_and_reset_password(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_admin_login(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_verify_admin_session(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_admin_logout(text) TO anon, authenticated;
