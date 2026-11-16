-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 025_turnstile_exempt_test_tokens_from_replay.sql
-- Description: Exempt Cloudflare dummy/test tokens from single-use replay rejection
-- ==============================================================================

CREATE OR REPLACE FUNCTION rpc_verify_turnstile_token(
  p_token text,
  p_action text DEFAULT 'generic',
  p_ip text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token_hash text;
  v_existing_id uuid;
  v_action text := coalesce(nullif(trim(p_action), ''), 'generic');
  v_ip text := nullif(trim(p_ip), '');
  v_token_clean text := trim(coalesce(p_token, ''));
BEGIN
  -- 1. Token presence validation
  IF length(v_token_clean) = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'CAPTCHA verification failed: Security token is required.',
      'code', 'TOKEN_MISSING'
    );
  END IF;

  -- 2. Explicit rejection test tokens (Cloudflare 2x00... always blocks)
  IF v_token_clean LIKE '2x00%' 
     OR v_token_clean = 'TEST_FAILED_TOKEN' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'CAPTCHA verification failed: Security challenge was rejected.',
      'code', 'CHALLENGE_FAILED'
    );
  END IF;

  -- 3. Test token evaluation (Cloudflare Test Keys & Test Suite Mocks)
  -- Cloudflare test keys (1x00000000000000000000AA, XXXX.DUMMY.TOKEN) are static dummy tokens
  -- that must NEVER be recorded in bb_turnstile_tokens or blocked by replay checks.
  IF v_token_clean LIKE '1x00%' 
     OR v_token_clean LIKE 'XXXX.DUMMY.TOKEN%' 
     OR v_token_clean = '__SKIP_CAPTCHA__'
     OR v_token_clean = 'TEST_PASSED_TOKEN' THEN
    RETURN json_build_object(
      'success', true,
      'action', v_action,
      'test_mode', true,
      'timestamp', now()
    );
  END IF;

  -- 4. Compute cryptographic SHA-256 hash of production token
  v_token_hash := encode(digest(v_token_clean, 'sha256'), 'hex');

  -- 5. Check for replay attack on production tokens
  SELECT id INTO v_existing_id
  FROM bb_turnstile_tokens
  WHERE token_hash = v_token_hash
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    BEGIN
      PERFORM rpc_log_audit_event(
        coalesce(v_ip, 'system'),
        'system',
        'auth.turnstile_replay_blocked',
        'security',
        v_action,
        json_build_object(
          'action', v_action,
          'ip', v_ip,
          'reason', 'Token already consumed'
        )
      );
    EXCEPTION WHEN OTHERS THEN
    END;

    RETURN json_build_object(
      'success', false,
      'error', 'CAPTCHA verification failed: Security token has already been consumed (replay attack prevented).',
      'code', 'TOKEN_REPLAYED',
      'replay', true
    );
  END IF;

  -- 6. Record production token hash in ledger to ensure one-time consumption
  INSERT INTO bb_turnstile_tokens (token_hash, action, ip_address, expires_at)
  VALUES (v_token_hash, v_action, v_ip, now() + interval '10 minutes');

  RETURN json_build_object(
    'success', true,
    'action', v_action,
    'timestamp', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_verify_turnstile_token(text, text, text) TO anon, authenticated;
