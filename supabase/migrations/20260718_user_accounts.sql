-- ── User accounts: saved leagues ───────────────────────────────────────────
-- Optional accounts (the hybrid plan): guests keep the localStorage flow;
-- signed-in users get their league list saved per-account so it follows them
-- across devices/browsers. Auth is Supabase email + password with "Confirm
-- email" DISABLED in the dashboard (Authentication → Sign In / Up) — no forced
-- verification; nothing here depends on a verified address.
--
-- One row per (user, league). `my_roster_id` carries the "which team is mine"
-- choice (see my-team-store.ts) so it syncs along with the league itself.

CREATE TABLE IF NOT EXISTS user_leagues (
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  root_league_id TEXT NOT NULL,
  name           TEXT NOT NULL,
  season         TEXT NOT NULL,
  my_roster_id   INT,             -- the user's own roster in this league (null until picked)
  added_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, root_league_id)
);

ALTER TABLE user_leagues ENABLE ROW LEVEL SECURITY;

-- Own-rows only, for every verb; anon gets nothing. The client talks to this
-- table directly (no edge function) — RLS is the entire authorization story.
CREATE POLICY user_leagues_select ON user_leagues
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_leagues_insert ON user_leagues
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_leagues_update ON user_leagues
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_leagues_delete ON user_leagues
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
