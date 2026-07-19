-- ── Manual rank adjustments ─────────────────────────────────────────────────
-- The rankings board gains direct editing: ▲▼ nudges and set-exact-rank on
-- /u/<me>. Those write the user's own user_player_ratings rows from the
-- client, so the table needs own-row write policies. The integrity story is
-- unchanged where it matters: RLS still makes it impossible to touch anyone
-- ELSE's board; a user freely shaping their own rankings is the feature.
CREATE POLICY user_player_ratings_insert ON user_player_ratings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_player_ratings_update ON user_player_ratings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_player_ratings_delete ON user_player_ratings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
