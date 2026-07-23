-- ── Public Sleeper link on profiles ────────────────────────────────────────
-- A profile (/u/<username>) is a PUBLIC, shareable page, and every league
-- table (rosters, matchups, standings) is already publicly readable. What was
-- missing is the bridge: which Sleeper manager (owner_id) is this account?
-- That link lived only in private auth user_metadata (sleeper_user_id), so a
-- visitor viewing someone else's profile couldn't resolve their league history.
--
-- Expose it as a public, nullable column so the Trophies tab can compute a
-- manager's league achievements on ANY shared profile — not just their own.
-- It's a low-sensitivity, already-public identifier (Sleeper user ids are
-- visible in every public league API response), so publishing it is safe.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sleeper_user_id TEXT;

-- Owners may set their own link (mirrors the existing profiles_update policy;
-- the client writes it during onboarding, alongside the avatar).

-- Backfill existing accounts from the auth metadata they already captured, so
-- trophies light up for current users without re-onboarding. One-time, safe to
-- re-run (only fills NULLs).
UPDATE profiles p
   SET sleeper_user_id = u.raw_user_meta_data->>'sleeper_user_id'
  FROM auth.users u
 WHERE u.id = p.user_id
   AND p.sleeper_user_id IS NULL
   AND (u.raw_user_meta_data->>'sleeper_user_id') IS NOT NULL;

-- Fast profile → owner_id lookups (one row per manager who has linked).
CREATE INDEX IF NOT EXISTS idx_profiles_sleeper_user
  ON profiles (sleeper_user_id) WHERE sleeper_user_id IS NOT NULL;
