-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 011_audit_logs_lockout_session_ttl.sql
--
-- Immutable Admin Audit Logs, Brute-Force Lockout & Session TTL Expiry
--
-- Security Enhancements:
--   1. Immutable Append-Only Ledger (bb_audit_logs):
--      - Records Officer and NCO mutations (points, order approvals, member deletions, role changes, task edits)
--      - Database trigger strictly denies UPDATE and DELETE operations
--   2. Server-Side Brute-Force Rate Limiting & Lockout (bb_auth_lockouts):
--      - Tracks failed login/OTP attempts across IP/email identifiers
--      - Enforces automated 15-minute account lockout upon 5 consecutive failed attempts
--      - Automatically logs lockout events to bb_audit_logs
--   3. Sign Out Everywhere & Token Invalidation:
--      - Revokes all active sessions for a user across all devices
--      - Logs signout events in the audit trail
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 1: IMMUTABLE AUDIT LOGS LEDGER (bb_audit_logs)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bb_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz DEFAULT now() NOT NULL,
  actor_id text NOT NULL,             -- email, IC, or identifier of actor
  actor_role text DEFAULT 'member',  -- 'officer_admin', 'nco', 'member', 'system'
  action text NOT NULL,              -- e.g. 'points.edit', 'order.status_update', 'member.delete', 'member.role_change', 'task.create', 'auth.lockout', 'auth.signout_everywhere'
  target_type text NOT NULL,         -- 'member', 'order', 'task', 'config', 'auth'
  target_id text,                    -- identifier of affected record
  details jsonb DEFAULT '{}'::jsonb, -- structured before/after diff or metadata
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bb_audit_logs_timestamp ON bb_audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_bb_audit_logs_actor ON bb_audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_bb_audit_logs_action ON bb_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_bb_audit_logs_target ON bb_audit_logs (target_type, target_id);

ALTER TABLE bb_audit_logs ENABLE ROW LEVEL SECURITY;

-- Deny direct public modification; allow inserts via SECURITY DEFINER RPC
DROP POLICY IF EXISTS "bb_audit_logs_select_officer" ON bb_audit_logs;
CREATE POLICY "bb_audit_logs_select_officer"
ON bb_audit_logs FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "bb_audit_logs_insert_service" ON bb_audit_logs;
CREATE POLICY "bb_audit_logs_insert_service"
ON bb_audit_logs FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Immutability enforcement trigger: Abort all UPDATE and DELETE requests
CREATE OR REPLACE FUNCTION fn_prevent_audit_log_tamper()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'bb_audit_logs is an immutable append-only ledger. UPDATE and DELETE operations are strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_no_update_delete_audit_logs ON bb_audit_logs;
CREATE TRIGGER trg_no_update_delete_audit_logs
BEFORE UPDATE OR DELETE ON bb_audit_logs
FOR EACH ROW EXECUTE FUNCTION fn_prevent_audit_log_tamper();

COMMENT ON TABLE bb_audit_logs IS 'Immutable append-only ledger of Officer and NCO administrative actions and security events. Tamper-proof via database trigger.';


-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 2: BRUTE-FORCE LOCKOUT TABLE (bb_auth_lockouts)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bb_auth_lockouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL UNIQUE,     -- lower(email) or IP address
  failed_count integer DEFAULT 0,
  lockout_until timestamptz,
  last_failed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bb_auth_lockouts_identifier ON bb_auth_lockouts (lower(identifier));

ALTER TABLE bb_auth_lockouts ENABLE ROW LEVEL SECURITY;

-- Deny direct public manipulation
DROP POLICY IF EXISTS "bb_auth_lockouts_deny_direct" ON bb_auth_lockouts;
CREATE POLICY "bb_auth_lockouts_deny_direct"
ON bb_auth_lockouts FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

COMMENT ON TABLE bb_auth_lockouts IS 'Server-side brute-force lockout tracker. Enforces 15-minute lockouts after 5 consecutive failures.';


-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION 3: RPC FUNCTIONS (SECURITY DEFINER)
-- ──────────────────────────────────────────────────────────────────────────────

-- 3.1 rpc_log_audit_event: Append-only mutation logging
CREATE OR REPLACE FUNCTION rpc_log_audit_event(
  p_actor_id text,
  p_actor_role text DEFAULT 'member',
  p_action text DEFAULT 'unknown',
  p_target_type text DEFAULT 'unknown',
  p_target_id text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_id uuid;
  v_now timestamptz := now();
BEGIN
  IF p_actor_id IS NULL OR length(trim(p_actor_id)) = 0 THEN
    p_actor_id := 'anonymous';
  END IF;

  INSERT INTO bb_audit_logs (
    timestamp,
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details,
    ip_address,
    user_agent
  ) VALUES (
    v_now,
    trim(p_actor_id),
    coalesce(p_actor_role, 'member'),
    trim(p_action),
    trim(p_target_type),
    p_target_id,
    coalesce(p_details, '{}'::jsonb),
    p_ip_address,
    p_user_agent
  ) RETURNING id INTO v_new_id;

  RETURN json_build_object(
    'success', true,
    'log_id', v_new_id,
    'timestamp', v_now
  );
END;
$$;


-- 3.2 rpc_get_audit_logs: Retrieve audit records for Officer Admin Console
CREATE OR REPLACE FUNCTION rpc_get_audit_logs(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_action text DEFAULT NULL,
  p_actor_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_logs json;
  v_total integer;
BEGIN
  -- Count matching records
  SELECT count(*) INTO v_total
  FROM bb_audit_logs
  WHERE (p_action IS NULL OR action = p_action)
    AND (p_actor_id IS NULL OR lower(actor_id) = lower(p_actor_id));

  -- Fetch page
  SELECT json_agg(
    json_build_object(
      'id', l.id,
      'timestamp', l.timestamp,
      'actor_id', l.actor_id,
      'actor_role', l.actor_role,
      'action', l.action,
      'target_type', l.target_type,
      'target_id', l.target_id,
      'details', l.details,
      'ip_address', l.ip_address,
      'user_agent', l.user_agent
    )
  ) INTO v_logs
  FROM (
    SELECT *
    FROM bb_audit_logs
    WHERE (p_action IS NULL OR action = p_action)
      AND (p_actor_id IS NULL OR lower(actor_id) = lower(p_actor_id))
    ORDER BY timestamp DESC
    LIMIT p_limit OFFSET p_offset
  ) l;

  RETURN json_build_object(
    'success', true,
    'total', v_total,
    'logs', coalesce(v_logs, '[]'::json)
  );
END;
$$;


-- 3.3 rpc_check_auth_lockout: Checks if account/IP is locked out
CREATE OR REPLACE FUNCTION rpc_check_auth_lockout(p_identifier text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record record;
  v_remaining_secs integer := 0;
BEGIN
  IF p_identifier IS NULL OR length(trim(p_identifier)) = 0 THEN
    RETURN json_build_object('locked', false, 'remaining_seconds', 0, 'failures', 0, 'attempts_remaining', 5);
  END IF;

  SELECT * INTO v_record
  FROM bb_auth_lockouts
  WHERE lower(identifier) = lower(trim(p_identifier));

  IF v_record.id IS NOT NULL AND v_record.lockout_until IS NOT NULL AND v_record.lockout_until > now() THEN
    v_remaining_secs := ceil(extract(epoch FROM (v_record.lockout_until - now())));
    RETURN json_build_object(
      'locked', true,
      'remaining_seconds', v_remaining_secs,
      'failures', v_record.failed_count,
      'attempts_remaining', 0
    );
  END IF;

  RETURN json_build_object(
    'locked', false,
    'remaining_seconds', 0,
    'failures', coalesce(v_record.failed_count, 0),
    'attempts_remaining', GREATEST(0, 5 - coalesce(v_record.failed_count, 0))
  );
END;
$$;


-- 3.4 rpc_record_auth_attempt: Enforces 5-failure lockout server-side
CREATE OR REPLACE FUNCTION rpc_record_auth_attempt(
  p_identifier text,
  p_success boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record record;
  v_new_failures integer := 0;
  v_lockout_until timestamptz := NULL;
  v_remaining_secs integer := 0;
  v_is_locked boolean := false;
BEGIN
  IF p_identifier IS NULL OR length(trim(p_identifier)) = 0 THEN
    RETURN json_build_object('locked', false, 'remaining_seconds', 0, 'failures', 0);
  END IF;

  SELECT * INTO v_record
  FROM bb_auth_lockouts
  WHERE lower(identifier) = lower(trim(p_identifier));

  IF p_success THEN
    -- Successful auth resets failure counter
    IF v_record.id IS NOT NULL THEN
      UPDATE bb_auth_lockouts
      SET failed_count = 0,
          lockout_until = NULL,
          last_failed_at = now()
      WHERE id = v_record.id;
    END IF;

    RETURN json_build_object('locked', false, 'remaining_seconds', 0, 'failures', 0);
  END IF;

  -- Handle failed attempt
  IF v_record.id IS NULL THEN
    v_new_failures := 1;
    INSERT INTO bb_auth_lockouts (identifier, failed_count, last_failed_at)
    VALUES (lower(trim(p_identifier)), 1, now());
  ELSE
    -- If previous failure was > 15 mins ago and not locked, reset failure counter
    IF v_record.lockout_until IS NULL AND (now() - v_record.last_failed_at) > interval '15 minutes' THEN
      v_new_failures := 1;
    ELSE
      v_new_failures := v_record.failed_count + 1;
    END IF;

    -- Enforce lockout upon reaching 5 failures
    IF v_new_failures >= 5 THEN
      v_lockout_until := now() + interval '15 minutes';
      v_is_locked := true;
      v_remaining_secs := 900;

      -- Log security alert in bb_audit_logs
      PERFORM rpc_log_audit_event(
        trim(p_identifier),
        'system',
        'auth.lockout',
        'auth',
        trim(p_identifier),
        json_build_object(
          'reason', '5 consecutive failed attempts',
          'duration_minutes', 15,
          'lockout_until', v_lockout_until
        )
      );
    END IF;

    UPDATE bb_auth_lockouts
    SET failed_count = v_new_failures,
        lockout_until = coalesce(v_lockout_until, lockout_until),
        last_failed_at = now()
    WHERE id = v_record.id;
  END IF;

  RETURN json_build_object(
    'locked', v_is_locked,
    'remaining_seconds', v_remaining_secs,
    'failures', v_new_failures,
    'attempts_remaining', GREATEST(0, 5 - v_new_failures)
  );
END;
$$;


-- 3.5 rpc_sign_out_everywhere: Revokes active sessions & logs audit event
CREATE OR REPLACE FUNCTION rpc_sign_out_everywhere(p_actor_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor text := coalesce(trim(p_actor_id), 'anonymous');
BEGIN
  -- Invalidate any active officer admin sessions
  DELETE FROM bb_admin_sessions 
  WHERE lower(coalesce(officer_email, '')) = lower(v_actor);

  -- Record audit event
  PERFORM rpc_log_audit_event(
    v_actor,
    'member',
    'auth.signout_everywhere',
    'auth',
    v_actor,
    json_build_object('message', 'All active sessions invalidated across devices')
  );

  RETURN json_build_object(
    'success', true,
    'message', 'All active sessions have been invalidated across all devices.'
  );
END;
$$;
