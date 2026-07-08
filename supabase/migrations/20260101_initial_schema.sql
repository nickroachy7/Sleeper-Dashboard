-- ============================================================================
-- Initial Schema (reconstructed)
-- ============================================================================
-- The original Supabase project was created by hand from DATABASE_DESIGN.md
-- and later removed after free-tier inactivity, taking the schema with it.
-- This migration reconstructs every table the app and edge functions actually
-- use, based on the generated types in dashboard/src/types/database.ts (which
-- reflect the last live schema) cross-checked against DATABASE_DESIGN.md.
--
-- Intentionally omitted (existed but never used by the app):
--   articles, player_projections, playoff_brackets, trade_analyses, yf_*
--
-- Ordering: runs before 20260402 (realtime/cron) and 20260707 (value history
-- + upsert unique indexes), which build on these tables.
--
-- Security model: RLS is enabled everywhere with read-only public policies.
-- The frontend only ever reads (anon key); all writes go through edge
-- functions using the service role, which bypasses RLS.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Core entities ───────────────────────────────────────────────────────────

CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  username TEXT,
  display_name TEXT,
  avatar TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE leagues (
  league_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  status TEXT NOT NULL,
  sport TEXT,
  total_rosters INT NOT NULL,
  roster_positions TEXT[],
  scoring_settings JSONB,
  settings JSONB,
  avatar TEXT,
  draft_id TEXT,
  previous_league_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE league_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  display_name TEXT,
  team_name TEXT,
  avatar TEXT,
  is_owner BOOLEAN DEFAULT FALSE,
  is_co_owner BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (league_id, user_id)
);

CREATE INDEX idx_league_users_league ON league_users(league_id);
CREATE INDEX idx_league_users_user ON league_users(user_id);

CREATE TABLE players (
  player_id TEXT PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  search_full_name TEXT,
  position TEXT,
  fantasy_positions TEXT[],
  team TEXT,
  status TEXT,
  injury_status TEXT,
  age INT,
  number INT,
  height TEXT,
  weight TEXT,
  college TEXT,
  years_exp INT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_players_position ON players(position);
CREATE INDEX idx_players_team ON players(team);
CREATE INDEX idx_players_search_name ON players USING gin (search_full_name gin_trgm_ops);

-- ── League data ─────────────────────────────────────────────────────────────

CREATE TABLE rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  roster_id INT NOT NULL,
  owner_id TEXT REFERENCES users(user_id),
  co_owners TEXT[],
  players TEXT[],
  starters TEXT[],
  reserve TEXT[],
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  ties INT DEFAULT 0,
  fpts DECIMAL(10,2) DEFAULT 0,
  fpts_decimal DECIMAL(10,2) DEFAULT 0,
  fpts_against DECIMAL(10,2) DEFAULT 0,
  fpts_against_decimal DECIMAL(10,2) DEFAULT 0,
  total_moves INT DEFAULT 0,
  waiver_position INT,
  waiver_budget_used INT DEFAULT 0,
  settings JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (league_id, roster_id)
);

CREATE INDEX idx_rosters_league ON rosters(league_id);
CREATE INDEX idx_rosters_owner ON rosters(owner_id);

CREATE TABLE matchups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  week INT NOT NULL,
  matchup_id INT NOT NULL,
  roster_id INT NOT NULL,
  points DECIMAL(10,2),
  custom_points DECIMAL(10,2),
  starters TEXT[],
  players TEXT[],
  starters_points DECIMAL(10,2)[],
  players_points JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (league_id, week, roster_id)
);

CREATE INDEX idx_matchups_league_week ON matchups(league_id, week);

CREATE TABLE transactions (
  transaction_id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  week INT,
  roster_ids INT[],
  adds JSONB,
  drops JSONB,
  draft_picks JSONB,
  waiver_budget JSONB,
  settings JSONB,
  metadata JSONB,
  creator TEXT REFERENCES users(user_id),
  consenter_ids INT[],
  status_updated BIGINT,
  created BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_league ON transactions(league_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_week ON transactions(league_id, week);
CREATE INDEX idx_transactions_created ON transactions(created DESC);

CREATE TABLE traded_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  round INT NOT NULL,
  roster_id INT NOT NULL,       -- original owner
  previous_owner_id INT NOT NULL,
  owner_id INT NOT NULL,        -- current owner
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
  -- unique index added in 20260707_value_history_and_upsert_constraints
);

CREATE INDEX idx_traded_picks_league ON traded_picks(league_id);
CREATE INDEX idx_traded_picks_owner ON traded_picks(owner_id);

CREATE TABLE drafts (
  draft_id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  season TEXT NOT NULL,
  settings JSONB,
  draft_order JSONB,
  slot_to_roster_id JSONB,
  start_time BIGINT,
  last_picked BIGINT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drafts_league ON drafts(league_id);
CREATE INDEX idx_drafts_season ON drafts(season);

CREATE TABLE draft_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id TEXT NOT NULL REFERENCES drafts(draft_id) ON DELETE CASCADE,
  round INT NOT NULL,
  pick_no INT NOT NULL,
  draft_slot INT,
  player_id TEXT,   -- deliberately no FK: picks can reference players not yet synced
  picked_by TEXT,
  roster_id INT,
  is_keeper BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (draft_id, pick_no)
);

CREATE INDEX idx_draft_picks_draft ON draft_picks(draft_id);
CREATE INDEX idx_draft_picks_player ON draft_picks(player_id);

-- ── Values & state ──────────────────────────────────────────────────────────

CREATE TABLE player_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  value INT NOT NULL,
  rank INT,
  position_rank INT,
  tier INT,
  trend INT DEFAULT 0,
  superflex BOOLEAN DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'keeptradecut',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
  -- unique index added in 20260707_value_history_and_upsert_constraints
);

CREATE INDEX idx_player_values_player ON player_values(player_id);
CREATE INDEX idx_player_values_rank ON player_values(rank);

CREATE TABLE pick_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_type TEXT NOT NULL,
  pick_year TEXT NOT NULL,
  pick_round INT NOT NULL,
  pick_tier TEXT,              -- 'Early' | 'Mid' | 'Late' | NULL (generic)
  value INT NOT NULL DEFAULT 0,
  rank INT,
  superflex BOOLEAN DEFAULT TRUE,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
  -- unique index added in 20260707_value_history_and_upsert_constraints
);

CREATE INDEX idx_pick_values_year_round ON pick_values(pick_year, pick_round);

CREATE TABLE nfl_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season TEXT NOT NULL,
  season_type TEXT NOT NULL,
  week INT NOT NULL,
  display_week INT NOT NULL,
  leg INT NOT NULL,
  season_start_date DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  league_id TEXT REFERENCES leagues(league_id),
  records_processed INT,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ── Row Level Security: public read, no public writes ──────────────────────

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'leagues', 'league_users', 'players', 'rosters', 'matchups',
    'transactions', 'traded_picks', 'drafts', 'draft_picks',
    'player_values', 'pick_values', 'nfl_state', 'sync_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Public read access" ON %I FOR SELECT USING (true)', t);
  END LOOP;
END $$;
