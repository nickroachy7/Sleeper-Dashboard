# Sleeper League Dashboard - Database Design Document

## Overview

This document outlines the database schema, relationships, and data synchronization strategy for the Sleeper Fantasy Football League Dashboard. The design follows best practices for Supabase/PostgreSQL, optimizing for performance, data integrity, and maintainability.

---

## Table of Contents

1. [Data Sources from Sleeper API](#data-sources-from-sleeper-api)
2. [Database Schema](#database-schema)
3. [Table Relationships (ERD)](#table-relationships-erd)
4. [Row Level Security (RLS)](#row-level-security-rls)
5. [Data Sync Strategy](#data-sync-strategy)
6. [Edge Functions & Cron Jobs](#edge-functions--cron-jobs)
7. [Indexes & Performance](#indexes--performance)
8. [Migration Plan](#migration-plan)

---

## Data Sources from Sleeper API

The Sleeper API is **read-only** and provides the following endpoints we'll utilize:

| Endpoint | Description | Rate Limit |
|----------|-------------|------------|
| `GET /user/<username_or_id>` | User profile information | < 1000/min |
| `GET /user/<user_id>/leagues/nfl/<season>` | All leagues for a user | < 1000/min |
| `GET /league/<league_id>` | Specific league details | < 1000/min |
| `GET /league/<league_id>/users` | All users in a league | < 1000/min |
| `GET /league/<league_id>/rosters` | All rosters in a league | < 1000/min |
| `GET /league/<league_id>/matchups/<week>` | Matchups for a specific week | < 1000/min |
| `GET /league/<league_id>/transactions/<week>` | Transactions (trades, waivers, FA) | < 1000/min |
| `GET /league/<league_id>/traded_picks` | All traded draft picks | < 1000/min |
| `GET /league/<league_id>/drafts` | All drafts for a league | < 1000/min |
| `GET /draft/<draft_id>/picks` | All picks in a draft | < 1000/min |
| `GET /players/nfl` | All NFL players (~5MB) | Once per day |
| `GET /state/nfl` | Current NFL state (week, season) | < 1000/min |

---

## Database Schema

### Core Tables

#### 1. `nfl_state`
Tracks the current NFL season state. Updated frequently during the season.

```sql
CREATE TABLE nfl_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season TEXT NOT NULL,
  season_type TEXT NOT NULL, -- 'pre', 'regular', 'post'
  week INT NOT NULL,
  leg INT NOT NULL,
  display_week INT NOT NULL,
  season_start_date DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2. `players`
Master table of all NFL players. Updated once daily.

```sql
CREATE TABLE players (
  player_id TEXT PRIMARY KEY, -- Sleeper's player_id (e.g., "3086", "DET")
  first_name TEXT,
  last_name TEXT,
  full_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  position TEXT,
  team TEXT, -- NFL team abbreviation
  age INT,
  years_exp INT,
  college TEXT,
  height TEXT,
  weight TEXT,
  number INT,
  status TEXT, -- 'Active', 'Inactive', 'Injured Reserve', etc.
  injury_status TEXT,
  fantasy_positions TEXT[], -- Array of positions
  search_full_name TEXT, -- Lowercase for search
  metadata JSONB, -- Additional flexible data
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_players_team ON players(team);
CREATE INDEX idx_players_position ON players(position);
CREATE INDEX idx_players_search ON players(search_full_name);
```

#### 3. `users`
Sleeper user accounts. These can be in multiple leagues.

```sql
CREATE TABLE users (
  user_id TEXT PRIMARY KEY, -- Sleeper's user_id
  username TEXT,
  display_name TEXT,
  avatar TEXT, -- Avatar ID for CDN URL
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
```

#### 4. `leagues`
Fantasy leagues configuration and settings.

```sql
CREATE TABLE leagues (
  league_id TEXT PRIMARY KEY, -- Sleeper's league_id
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pre_draft', 'drafting', 'in_season', 'complete'
  sport TEXT DEFAULT 'nfl',
  total_rosters INT NOT NULL,
  roster_positions TEXT[], -- Array of roster slots
  scoring_settings JSONB, -- Complete scoring configuration
  settings JSONB, -- League settings (playoff weeks, etc.)
  avatar TEXT,
  draft_id TEXT,
  previous_league_id TEXT REFERENCES leagues(league_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leagues_season ON leagues(season);
CREATE INDEX idx_leagues_status ON leagues(status);
```

#### 5. `league_users`
Junction table linking users to leagues with league-specific metadata.

```sql
CREATE TABLE league_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  display_name TEXT, -- League-specific display name
  team_name TEXT, -- Custom team name in this league
  avatar TEXT, -- League-specific avatar
  is_owner BOOLEAN DEFAULT FALSE, -- Commissioner flag
  is_co_owner BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, user_id)
);

CREATE INDEX idx_league_users_league ON league_users(league_id);
CREATE INDEX idx_league_users_user ON league_users(user_id);
```

#### 6. `rosters`
Team rosters within a league. Updated frequently during the season.

```sql
CREATE TABLE rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id INT NOT NULL, -- Sleeper's roster_id (1-12 typically)
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  owner_id TEXT REFERENCES users(user_id),
  co_owners TEXT[], -- Array of co-owner user_ids
  players TEXT[], -- Array of player_ids on roster
  starters TEXT[], -- Array of player_ids in starting lineup
  reserve TEXT[], -- IR/Taxi squad
  -- Season stats
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  ties INT DEFAULT 0,
  fpts DECIMAL(10,2) DEFAULT 0, -- Fantasy points scored
  fpts_decimal INT DEFAULT 0,
  fpts_against DECIMAL(10,2) DEFAULT 0,
  fpts_against_decimal INT DEFAULT 0,
  -- Waiver info
  waiver_position INT,
  waiver_budget_used INT DEFAULT 0,
  total_moves INT DEFAULT 0,
  settings JSONB, -- Additional roster settings
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, roster_id)
);

CREATE INDEX idx_rosters_league ON rosters(league_id);
CREATE INDEX idx_rosters_owner ON rosters(owner_id);
CREATE INDEX idx_rosters_players ON rosters USING GIN(players);
```

#### 7. `matchups`
Weekly matchup results between teams.

```sql
CREATE TABLE matchups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  week INT NOT NULL,
  matchup_id INT NOT NULL, -- Teams with same matchup_id play each other
  roster_id INT NOT NULL,
  points DECIMAL(10,2),
  custom_points DECIMAL(10,2), -- Commissioner overrides
  starters TEXT[], -- Player IDs in starting slots
  players TEXT[], -- All player IDs in matchup
  starters_points DECIMAL(10,2)[], -- Points per starter
  players_points JSONB, -- Points per player {player_id: points}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, week, roster_id)
);

CREATE INDEX idx_matchups_league_week ON matchups(league_id, week);
CREATE INDEX idx_matchups_matchup ON matchups(league_id, week, matchup_id);
```

#### 8. `transactions`
All league transactions: trades, waivers, free agent adds/drops.

```sql
CREATE TABLE transactions (
  transaction_id TEXT PRIMARY KEY, -- Sleeper's transaction_id
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'trade', 'waiver', 'free_agent'
  status TEXT NOT NULL, -- 'complete', 'pending', 'failed'
  week INT,
  roster_ids INT[], -- Roster IDs involved
  adds JSONB, -- {player_id: roster_id}
  drops JSONB, -- {player_id: roster_id}
  draft_picks JSONB, -- Array of draft pick objects
  waiver_budget JSONB, -- FAAB transfers
  settings JSONB, -- Waiver bid amount, etc.
  metadata JSONB,
  creator TEXT REFERENCES users(user_id),
  consenter_ids INT[], -- Roster IDs who approved
  status_updated BIGINT, -- Unix timestamp
  created BIGINT, -- Unix timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_league ON transactions(league_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_week ON transactions(league_id, week);
CREATE INDEX idx_transactions_created ON transactions(created DESC);
```

#### 9. `traded_picks`
Tracks ownership of draft picks (especially for dynasty leagues).

```sql
CREATE TABLE traded_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  round INT NOT NULL,
  roster_id INT NOT NULL, -- Original owner
  previous_owner_id INT NOT NULL,
  owner_id INT NOT NULL, -- Current owner
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, season, round, roster_id)
);

CREATE INDEX idx_traded_picks_league ON traded_picks(league_id);
CREATE INDEX idx_traded_picks_owner ON traded_picks(owner_id);
```

#### 10. `drafts`
Draft configurations and metadata.

```sql
CREATE TABLE drafts (
  draft_id TEXT PRIMARY KEY, -- Sleeper's draft_id
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'snake', 'linear', 'auction'
  status TEXT NOT NULL, -- 'pre_draft', 'drafting', 'complete'
  season TEXT NOT NULL,
  settings JSONB, -- Teams, slots, rounds, pick_timer, etc.
  draft_order JSONB, -- {user_id: slot}
  slot_to_roster_id JSONB, -- {slot: roster_id}
  start_time BIGINT, -- Unix timestamp
  last_picked BIGINT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drafts_league ON drafts(league_id);
CREATE INDEX idx_drafts_season ON drafts(season);
```

#### 11. `draft_picks`
Individual picks made in drafts.

```sql
CREATE TABLE draft_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id TEXT NOT NULL REFERENCES drafts(draft_id) ON DELETE CASCADE,
  round INT NOT NULL,
  pick_no INT NOT NULL,
  draft_slot INT,
  player_id TEXT REFERENCES players(player_id),
  picked_by TEXT REFERENCES users(user_id),
  roster_id INT,
  is_keeper BOOLEAN DEFAULT FALSE,
  metadata JSONB, -- Player info at time of pick
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(draft_id, pick_no)
);

CREATE INDEX idx_draft_picks_draft ON draft_picks(draft_id);
CREATE INDEX idx_draft_picks_player ON draft_picks(player_id);
```

#### 12. `playoff_brackets`
Playoff bracket matchups (winners and losers brackets).

```sql
CREATE TABLE playoff_brackets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  bracket_type TEXT NOT NULL, -- 'winners', 'losers'
  round INT NOT NULL,
  match_id INT NOT NULL,
  team1_roster_id INT,
  team2_roster_id INT,
  team1_from JSONB, -- {w: match_id} or {l: match_id}
  team2_from JSONB,
  winner_roster_id INT,
  loser_roster_id INT,
  placement INT, -- Final placement (1st, 2nd, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, bracket_type, match_id)
);

CREATE INDEX idx_playoff_brackets_league ON playoff_brackets(league_id);
```

### Analytics & Dashboard Tables

#### 13. `player_projections` (Optional - for trade evaluation)
Store weekly projections for trade analysis.

```sql
CREATE TABLE player_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  week INT NOT NULL,
  projected_points DECIMAL(10,2),
  source TEXT, -- 'sleeper', 'espn', 'custom'
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, season, week, source)
);

CREATE INDEX idx_projections_player_week ON player_projections(player_id, season, week);
```

#### 14. `trade_analysis` (For trade evaluator feature)
Store trade evaluations for reference.

```sql
CREATE TABLE trade_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  transaction_id TEXT REFERENCES transactions(transaction_id),
  analysis_data JSONB, -- Full analysis results
  fairness_score DECIMAL(5,2), -- -100 to 100 scale
  winning_side INT, -- roster_id of "winning" side
  created_by TEXT REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trade_analyses_league ON trade_analyses(league_id);
```

---

## Table Relationships (ERD)

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   users     │───┬───│ league_users│───────│   leagues   │
└─────────────┘   │   └─────────────┘       └──────┬──────┘
                  │                                 │
                  │   ┌─────────────┐               │
                  └───│   rosters   │───────────────┤
                      └──────┬──────┘               │
                             │                      │
                  ┌──────────┼──────────┐           │
                  │          │          │           │
           ┌──────▼──┐  ┌────▼────┐  ┌──▼───────────▼───┐
           │ matchups│  │ players │  │   transactions   │
           └─────────┘  └────┬────┘  └──────────────────┘
                             │
                  ┌──────────┼──────────┐
                  │          │          │
           ┌──────▼───┐ ┌────▼────┐ ┌───▼──────────┐
           │draft_picks│ │ drafts  │ │traded_picks  │
           └───────────┘ └─────────┘ └──────────────┘
```

### Key Relationships:

| Parent | Child | Type | Description |
|--------|-------|------|-------------|
| `users` | `league_users` | 1:N | User can be in many leagues |
| `leagues` | `league_users` | 1:N | League has many users |
| `leagues` | `rosters` | 1:N | League has many rosters |
| `users` | `rosters` | 1:N | User owns roster(s) |
| `leagues` | `matchups` | 1:N | League has weekly matchups |
| `leagues` | `transactions` | 1:N | League has transactions |
| `leagues` | `drafts` | 1:N | League can have multiple drafts |
| `drafts` | `draft_picks` | 1:N | Draft has many picks |
| `players` | `draft_picks` | 1:N | Player can be drafted |
| `leagues` | `traded_picks` | 1:N | League tracks pick trades |
| `leagues` | `playoff_brackets` | 1:N | League has playoff brackets |

---

## Row Level Security (RLS)

For a league dashboard, you may want to restrict data access based on league membership.

```sql
-- Enable RLS on sensitive tables
ALTER TABLE rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchups ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_analyses ENABLE ROW LEVEL SECURITY;

-- Example: Users can only see rosters from leagues they're in
CREATE POLICY "Users can view rosters in their leagues"
ON rosters FOR SELECT TO authenticated USING (
  league_id IN (
    SELECT league_id FROM league_users 
    WHERE user_id = (SELECT auth.uid()::TEXT)
  )
);

-- Example: Users can only see transactions from their leagues
CREATE POLICY "Users can view transactions in their leagues"
ON transactions FOR SELECT TO authenticated USING (
  league_id IN (
    SELECT league_id FROM league_users 
    WHERE user_id = (SELECT auth.uid()::TEXT)
  )
);
```

**Note:** If this is a public dashboard for your league, you may choose to disable RLS or create more permissive policies.

---

## Data Sync Strategy

### Sync Frequency Matrix

| Data Type | Frequency | Trigger | Priority |
|-----------|-----------|---------|----------|
| `nfl_state` | Every 5 min (in-season) | Cron | High |
| `players` | Once daily (4 AM) | Cron | Low |
| `leagues` | Once daily + on demand | Cron/Event | Medium |
| `rosters` | Every 15 min (in-season) | Cron | High |
| `matchups` | Every 5 min (game days) | Cron | Critical |
| `transactions` | Every 15 min | Cron | High |
| `traded_picks` | Every hour | Cron | Low |
| `drafts` | During draft: 30 sec | Cron/Event | Critical |
| `playoff_brackets` | Every 15 min (playoffs) | Cron | Medium |

### Sync Logic Flow

```
┌────────────────┐
│  Cron Trigger  │
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ Check NFL State │
└───────┬────────┘
        │
        ▼
┌────────────────────────────────────┐
│ Is it in-season & game day/time?  │
└───────┬──────────────┬─────────────┘
        │ YES          │ NO
        ▼              ▼
┌──────────────┐  ┌──────────────┐
│ High-freq    │  │ Low-freq     │
│ sync mode    │  │ sync mode    │
│ (5-15 min)   │  │ (1-24 hrs)   │
└──────────────┘  └──────────────┘
```

---

## Edge Functions & Cron Jobs

### Edge Function Architecture

```
/supabase/functions/
├── sync-nfl-state/        # Get current NFL week/season
├── sync-players/          # Daily player database update
├── sync-league/           # Full league data sync
├── sync-rosters/          # Roster updates
├── sync-matchups/         # Weekly matchup data
├── sync-transactions/     # Transaction history
├── sync-drafts/           # Draft data during draft season
└── evaluate-trade/        # Trade analysis endpoint
```

### Cron Job Schedule

Configure these in Supabase Dashboard → Database → Extensions → pg_cron:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- NFL State: Every 5 minutes during season
SELECT cron.schedule(
  'sync-nfl-state',
  '*/5 * * * *',
  $$SELECT net.http_post(
    'https://YOUR_PROJECT.supabase.co/functions/v1/sync-nfl-state',
    '{}',
    '{"Authorization": "Bearer YOUR_SERVICE_KEY"}'
  )$$
);

-- Players: Daily at 4 AM UTC
SELECT cron.schedule(
  'sync-players',
  '0 4 * * *',
  $$SELECT net.http_post(
    'https://YOUR_PROJECT.supabase.co/functions/v1/sync-players',
    '{}',
    '{"Authorization": "Bearer YOUR_SERVICE_KEY"}'
  )$$
);

-- Rosters: Every 15 minutes
SELECT cron.schedule(
  'sync-rosters',
  '*/15 * * * *',
  $$SELECT net.http_post(
    'https://YOUR_PROJECT.supabase.co/functions/v1/sync-rosters',
    '{}',
    '{"Authorization": "Bearer YOUR_SERVICE_KEY"}'
  )$$
);

-- Matchups: Every 5 minutes (adjust based on game times)
SELECT cron.schedule(
  'sync-matchups',
  '*/5 * * * *',
  $$SELECT net.http_post(
    'https://YOUR_PROJECT.supabase.co/functions/v1/sync-matchups',
    '{}',
    '{"Authorization": "Bearer YOUR_SERVICE_KEY"}'
  )$$
);

-- Transactions: Every 15 minutes
SELECT cron.schedule(
  'sync-transactions',
  '*/15 * * * *',
  $$SELECT net.http_post(
    'https://YOUR_PROJECT.supabase.co/functions/v1/sync-transactions',
    '{}',
    '{"Authorization": "Bearer YOUR_SERVICE_KEY"}'
  )$$
);
```

### Sample Edge Function: `sync-rosters`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SLEEPER_API = "https://api.sleeper.app/v1";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Get all active leagues
  const { data: leagues } = await supabase
    .from("leagues")
    .select("league_id")
    .eq("status", "in_season");

  for (const league of leagues || []) {
    // Fetch rosters from Sleeper API
    const response = await fetch(
      `${SLEEPER_API}/league/${league.league_id}/rosters`
    );
    const rosters = await response.json();

    // Upsert each roster
    for (const roster of rosters) {
      await supabase.from("rosters").upsert({
        roster_id: roster.roster_id,
        league_id: league.league_id,
        owner_id: roster.owner_id,
        players: roster.players,
        starters: roster.starters,
        reserve: roster.reserve,
        wins: roster.settings?.wins || 0,
        losses: roster.settings?.losses || 0,
        ties: roster.settings?.ties || 0,
        fpts: roster.settings?.fpts || 0,
        fpts_decimal: roster.settings?.fpts_decimal || 0,
        fpts_against: roster.settings?.fpts_against || 0,
        waiver_position: roster.settings?.waiver_position,
        waiver_budget_used: roster.settings?.waiver_budget_used || 0,
        total_moves: roster.settings?.total_moves || 0,
        settings: roster.settings,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "league_id,roster_id",
      });
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

### Smart Sync Optimization

To avoid unnecessary API calls during off-season or non-game times:

```sql
-- Create a function to check if we should sync
CREATE OR REPLACE FUNCTION should_sync_high_frequency()
RETURNS BOOLEAN AS $$
DECLARE
  current_state RECORD;
  current_hour INT;
  current_dow INT; -- 0 = Sunday, 6 = Saturday
BEGIN
  SELECT * INTO current_state FROM nfl_state ORDER BY updated_at DESC LIMIT 1;
  
  -- Don't sync frequently if not in regular season
  IF current_state.season_type != 'regular' THEN
    RETURN FALSE;
  END IF;
  
  current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/New_York');
  current_dow := EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/New_York');
  
  -- High frequency on game days (Sunday 12-24, Thursday 19-24, Monday 19-24)
  IF current_dow = 0 AND current_hour >= 12 THEN RETURN TRUE; END IF; -- Sunday
  IF current_dow = 4 AND current_hour >= 19 THEN RETURN TRUE; END IF; -- Thursday
  IF current_dow = 1 AND current_hour >= 19 THEN RETURN TRUE; END IF; -- Monday
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;
```

---

## Indexes & Performance

### Essential Indexes (Already defined above)

| Table | Index | Purpose |
|-------|-------|---------|
| `players` | `idx_players_team` | Filter by NFL team |
| `players` | `idx_players_position` | Filter by position |
| `rosters` | `idx_rosters_players` (GIN) | Array contains queries |
| `matchups` | `idx_matchups_league_week` | Get weekly matchups |
| `transactions` | `idx_transactions_created` | Recent transactions |

### Composite Indexes for Common Queries

```sql
-- Dashboard: Get user's teams across leagues
CREATE INDEX idx_rosters_owner_league 
ON rosters(owner_id, league_id);

-- Trade history: Find all trades involving a player
CREATE INDEX idx_transactions_adds 
ON transactions USING GIN(adds);

CREATE INDEX idx_transactions_drops 
ON transactions USING GIN(drops);

-- Matchup lookup with points
CREATE INDEX idx_matchups_points 
ON matchups(league_id, week, points DESC);
```

### Materialized Views (for Dashboard Performance)

```sql
-- League standings (refresh after each sync)
CREATE MATERIALIZED VIEW league_standings AS
SELECT 
  r.league_id,
  r.roster_id,
  u.display_name,
  lu.team_name,
  r.wins,
  r.losses,
  r.ties,
  r.fpts + (r.fpts_decimal::DECIMAL / 100) as total_points,
  r.fpts_against + (r.fpts_against_decimal::DECIMAL / 100) as points_against,
  RANK() OVER (
    PARTITION BY r.league_id 
    ORDER BY r.wins DESC, r.fpts DESC
  ) as standing
FROM rosters r
JOIN users u ON r.owner_id = u.user_id
LEFT JOIN league_users lu ON r.league_id = lu.league_id AND r.owner_id = lu.user_id
ORDER BY r.league_id, standing;

CREATE UNIQUE INDEX idx_standings_league_roster 
ON league_standings(league_id, roster_id);

-- Refresh command (call after roster sync)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY league_standings;
```

---

## Migration Plan

### Phase 1: Core Schema (Week 1)
1. Enable required extensions (`uuid-ossp`)
2. Create core tables: `users`, `leagues`, `league_users`, `players`
3. Create initial sync functions for users and leagues
4. Test with your league_id

### Phase 2: Game Data (Week 2)
1. Create `rosters`, `matchups`, `transactions` tables
2. Set up cron jobs for regular syncing
3. Implement Edge Functions for data sync
4. Add RLS policies if needed

### Phase 3: Draft & Picks (Week 3)
1. Create `drafts`, `draft_picks`, `traded_picks` tables
2. Implement draft sync logic
3. Add playoff bracket support

### Phase 4: Analytics (Week 4)
1. Create materialized views for performance
2. Implement trade analysis features
3. Add player projections if needed
4. Optimize indexes based on query patterns

### Initial Data Load Script

```sql
-- Run this after creating schema to load your league
-- Replace YOUR_LEAGUE_ID with your actual Sleeper league ID

-- This would typically be done via Edge Function, but for initial setup:
-- 1. Call sync-league function with your league_id
-- 2. Call sync-players function (daily player database)
-- 3. Call sync-rosters, sync-matchups, sync-transactions
```

---

## Environment Variables

Required for Edge Functions:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
SLEEPER_LEAGUE_ID=your-primary-league-id
```

---

## Monitoring & Maintenance

### Sync Health Check

```sql
-- Check last sync times
SELECT 
  'nfl_state' as table_name,
  MAX(updated_at) as last_sync
FROM nfl_state
UNION ALL
SELECT 'rosters', MAX(updated_at) FROM rosters
UNION ALL
SELECT 'matchups', MAX(updated_at) FROM matchups
UNION ALL
SELECT 'transactions', MAX(created_at) FROM transactions;
```

### Storage Estimation

| Table | Est. Rows/Season | Est. Size |
|-------|------------------|-----------|
| `players` | ~10,000 | ~5 MB |
| `leagues` | 1-10 | < 1 MB |
| `rosters` | 12 per league | < 1 MB |
| `matchups` | ~200 per league | < 1 MB |
| `transactions` | ~500 per league | < 2 MB |
| `draft_picks` | ~200 per league | < 1 MB |

**Total estimated storage per league per season: ~10-15 MB**

---

## Next Steps

1. **Set up Supabase project** (if not already done)
2. **Run migrations** to create the schema
3. **Deploy Edge Functions** for data syncing
4. **Configure cron jobs** in pg_cron
5. **Initial data load** with your league ID
6. **Build dashboard frontend** (Next.js, React, etc.)

---

*Document Version: 1.0*
*Last Updated: December 2024*
