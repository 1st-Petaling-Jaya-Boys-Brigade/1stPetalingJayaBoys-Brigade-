-- ==============================================================================
-- Migration: 016_profile_cosmetics_arcade_shop.sql
-- Description: Schema and configuration store for Profile Cosmetics & Gamified
--              Arcade Credit Shop (TSK-060).
--
-- Features:
--   1. Configuration store for member cosmetic inventory & equipped badges:
--      - Seed 'bb_member_cosmetics' in bb_config
--      - Tracks unlocked inventory and currently equipped profile cosmetic
--   2. Client-side cosmetic rendering:
--      - Rendered client-side via layered SVG/CSS tokens on top-left of avatar
--      - Zero mutation to underlying storage image
--   3. Creator Governance:
--      - Exclusive permissions for Portal Creator (jeshuakoh2008@gmail.com)
--      - Restricts cosmetics assignment strictly to Creator
-- ==============================================================================

-- 1. Seed initial configuration in bb_config if not present
INSERT INTO bb_config (key, value, updated_at)
VALUES (
  'bb_member_cosmetics',
  '{}'::text,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- 2. Document schema definitions
COMMENT ON TABLE bb_config IS 'Configuration store including bb_member_cosmetics for gamified arcade shop cosmetics and creator assignments';
