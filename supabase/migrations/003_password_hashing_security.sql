-- ==============================================================================
-- 1st Petaling Jaya Boys' Brigade Web Portal
-- Migration: 003_password_hashing_security.sql (TSK-029)
--
-- Cryptographic Password Hashing & Secret Salt Security Standard
--
-- Specifications:
--   - Algorithm: PBKDF2-HMAC-SHA-256
--   - Salt: 128-bit (16-byte) cryptographically secure pseudorandom salt per user
--   - Iterations: 100,000 rounds (OWASP recommended standard)
--   - Key Length: 256 bits (32 bytes)
--   - Storage Format: pbkdf2:sha256:100000:<saltHex>:<hashHex>
--   - Zero plaintext or reversible Base64 passwords in database or storage
-- ==============================================================================

-- 1. Document the password column's cryptographic security standard
COMMENT ON COLUMN bb_members.password IS 'Cryptographically hashed credential using Web Crypto API PBKDF2-HMAC-SHA256 with 100,000 iterations and unique 128-bit salt (TSK-029). Format: pbkdf2:sha256:100000:<saltHex>:<hashHex>';

-- 2. Verification query: Count accounts using modern PBKDF2 vs legacy format
-- SELECT 
--   count(*) FILTER (WHERE password LIKE 'pbkdf2:sha256:%') AS pbkdf2_accounts,
--   count(*) FILTER (WHERE password NOT LIKE 'pbkdf2:sha256:%' OR password IS NULL) AS pending_auto_migration
-- FROM bb_members;
