-- ==============================================================================
-- Migration 033: Lock Down FCM Service Account Secret & Enable Public Resources
-- ==============================================================================
--
-- IMPORTANT TIMING:
--   Run this migration in the Supabase SQL Editor ONLY AFTER:
--     1. Phase 2 PR is merged to main.
--     2. You generated a new Firebase Admin SDK private key, saved it as the
--        Supabase Edge Function secret `FCM_SERVICE_ACCOUNT_JSON`, and deployed
--        the updated `portal-web-push` Edge Function.
--     3. You verified push notifications deliver cleanly via the Edge Function.
--
-- What this migration does:
--   1. Permanently removes `bb_fcm_service_account` from `bb_config`.
--   2. Restricts `bb_config` RLS policies so no anon/authenticated client can
--      ever read, insert, or update `bb_fcm_service_account` or `bb_secret_*`.
--   3. Ensures the `resources` bucket is marked public for CDN caching if used.
-- ==============================================================================

DELETE FROM bb_config WHERE key = 'bb_fcm_service_account';

DROP POLICY IF EXISTS "bb_config_select_public" ON bb_config;
DROP POLICY IF EXISTS "bb_config_insert_upsert" ON bb_config;
DROP POLICY IF EXISTS "bb_config_update_key" ON bb_config;

CREATE POLICY "bb_config_select_public"
ON bb_config FOR SELECT
TO anon, authenticated
USING (
  key <> 'bb_fcm_service_account'
  AND key NOT LIKE 'bb_secret_%'
);

CREATE POLICY "bb_config_insert_upsert"
ON bb_config FOR INSERT
TO anon, authenticated
WITH CHECK (
  key IS NOT NULL
  AND length(trim(key)) > 0
  AND key <> 'bb_fcm_service_account'
  AND key NOT LIKE 'bb_secret_%'
);

CREATE POLICY "bb_config_update_key"
ON bb_config FOR UPDATE
TO anon, authenticated
USING (
  key <> 'bb_fcm_service_account'
  AND key NOT LIKE 'bb_secret_%'
)
WITH CHECK (
  key IS NOT NULL
  AND length(trim(key)) > 0
  AND key <> 'bb_fcm_service_account'
  AND key NOT LIKE 'bb_secret_%'
);

UPDATE storage.buckets
SET public = true
WHERE id = 'resources';
