// Sleeper API types
export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  sport: string;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: Record<string, unknown>;
  draft_id: string;
  previous_league_id: string | null;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string;
  league_id: string;
  players: string[];
  starters: string[];
  reserve: string[];
  taxi: string[];
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal: number;
    fpts_against: number;
    fpts_against_decimal: number;
  };
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number;
  points: number;
  custom_points: number | null;
  starters: string[];
  players: string[];
  starters_points: number[];
  players_points: Record<string, number>;
}

export interface SleeperTransaction {
  transaction_id: string;
  type: string;
  status: string;
  roster_ids: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  draft_picks: unknown[];
  waiver_budget: unknown[];
  settings: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  creator: string;
  consenter_ids: number[];
  status_updated: number;
  created: number;
}
