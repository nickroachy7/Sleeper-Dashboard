export interface Database {
  public: {
    Tables: {
      nfl_state: {
        Row: {
          id: string;
          season: number;
          week: number;
          season_type: string;
          display_week: number;
          leg: number;
          season_start_date: string | null;
          previous_season: number | null;
          created_at: string;
          updated_at: string;
        };
      };
      players: {
        Row: {
          player_id: string;
          first_name: string | null;
          last_name: string | null;
          full_name: string | null;
          position: string | null;
          team: string | null;
          age: number | null;
          years_exp: number | null;
          college: string | null;
          status: string | null;
          injury_status: string | null;
          injury_body_part: string | null;
          injury_notes: string | null;
          depth_chart_position: string | null;
          depth_chart_order: number | null;
          fantasy_positions: string[] | null;
          search_rank: number | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
      };
      users: {
        Row: {
          user_id: string;
          username: string | null;
          display_name: string | null;
          avatar: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
      };
      leagues: {
        Row: {
          league_id: string;
          name: string | null;
          season: string | null;
          status: string | null;
          sport: string | null;
          total_rosters: number | null;
          roster_positions: string[] | null;
          scoring_settings: Record<string, unknown> | null;
          settings: Record<string, unknown> | null;
          draft_id: string | null;
          previous_league_id: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      league_users: {
        Row: {
          id: string;
          league_id: string;
          user_id: string;
          display_name: string | null;
          team_name: string | null;
          avatar: string | null;
          is_owner: boolean | null;
          is_co_owner: boolean | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
      };
      rosters: {
        Row: {
          id: string;
          roster_id: number;
          league_id: string;
          owner_id: string | null;
          co_owners: string[] | null;
          players: string[] | null;
          starters: string[] | null;
          reserve: string[] | null;
          wins: number | null;
          losses: number | null;
          ties: number | null;
          fpts: number | null;
          fpts_decimal: number | null;
          fpts_against: number | null;
          fpts_against_decimal: number | null;
          waiver_position: number | null;
          waiver_budget_used: number | null;
          total_moves: number | null;
          settings: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
      };
      matchups: {
        Row: {
          id: string;
          league_id: string;
          week: number;
          matchup_id: number | null;
          roster_id: number | null;
          points: number | null;
          custom_points: number | null;
          starters: string[] | null;
          players: string[] | null;
          starters_points: number[] | null;
          players_points: Record<string, number> | null;
          created_at: string;
          updated_at: string;
        };
      };
      transactions: {
        Row: {
          transaction_id: string;
          league_id: string;
          type: string | null;
          status: string | null;
          week: number | null;
          roster_ids: number[] | null;
          adds: Record<string, number> | null;
          drops: Record<string, number> | null;
          draft_picks: unknown[] | null;
          waiver_budget: unknown[] | null;
          settings: Record<string, unknown> | null;
          metadata: Record<string, unknown> | null;
          creator: string | null;
          consenter_ids: number[] | null;
          status_updated: number | null;
          created: number | null;
          created_at: string;
        };
      };
      drafts: {
        Row: {
          draft_id: string;
          league_id: string;
          type: string | null;
          status: string | null;
          season: string | null;
          settings: Record<string, unknown> | null;
          draft_order: Record<string, string> | null;
          slot_to_roster_id: Record<string, number> | null;
          start_time: number | null;
          last_picked: number | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
      };
      draft_picks: {
        Row: {
          id: string;
          draft_id: string;
          round: number;
          pick_no: number;
          draft_slot: number | null;
          player_id: string | null;
          picked_by: string | null;
          roster_id: number | null;
          is_keeper: boolean | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
      };
      traded_picks: {
        Row: {
          id: string;
          league_id: string;
          season: string | null;
          round: number | null;
          roster_id: number | null;
          previous_owner_id: number | null;
          owner_id: number | null;
          created_at: string;
          updated_at: string;
        };
      };
      player_projections: {
        Row: {
          id: string;
          player_id: string;
          season: string | null;
          week: number | null;
          projected_points: number | null;
          source: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
      };
      sync_log: {
        Row: {
          id: string;
          sync_type: string;
          status: string | null;
          records_synced: number | null;
          error_message: string | null;
          started_at: string;
          completed_at: string | null;
        };
      };
    };

  };
}

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
