-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 015_creator_avatar_outlines.sql
--
-- Custom Profile Avatar Outlines, Gradients & Creator-Granted Animations (TSK-062)
--
-- Features:
--   1. Creator-Governed Profile Customization:
--      - Exclusive authorization for Portal Creator (jeshuakoh2008@gmail.com)
--      - Grants custom avatar outline styles, gradients, and animated borders to members
--   2. Styles Catalog:
--      - Animated Rainbow/RGB Rotating Border (identical to Creator RGB glow)
--      - Multi-Stop Premium Gradients (Purplish-Orange Sunset, Cyber Neon, Gold Flare, Royal Velvet, Aurora)
--      - Vibrant Solid Outline Accents (Red, Blue, Green, Yellow, Orange, Pink, White, Black)
--   3. Layered Above Uploaded Photos:
--      - Dynamic overlay rendering layered directly above custom profile photos (CLS = 0)
--   4. Durability & State Persistence:
--      - Persisted in bb_config (key: bb_custom_avatar_outlines) and bb_members.avatar_outline
-- ==============================================================================

-- 1. Extend bb_members with avatar_outline column
ALTER TABLE IF EXISTS bb_members
  ADD COLUMN IF NOT EXISTS avatar_outline text DEFAULT 'none';

-- 2. Index for quick lookup of members with custom avatar styles
CREATE INDEX IF NOT EXISTS idx_bb_members_avatar_outline
  ON bb_members (avatar_outline);

-- 3. Document schema definitions
COMMENT ON COLUMN bb_members.avatar_outline IS 'Creator-assigned profile avatar outline style: none, rgb, sunset, cyber, gold, velvet, aurora, solid-red, solid-blue, solid-green, solid-yellow, solid-orange, solid-pink, solid-white, solid-black';
