export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      articles: {
        Row: {
          article_type: string
          content: string
          created_at: string | null
          embedded_data: Json | null
          generated_at: string | null
          id: string
          league_id: string | null
          published: boolean | null
          subtitle: string | null
          title: string
        }
        Insert: {
          article_type: string
          content: string
          created_at?: string | null
          embedded_data?: Json | null
          generated_at?: string | null
          id?: string
          league_id?: string | null
          published?: boolean | null
          subtitle?: string | null
          title: string
        }
        Update: {
          article_type?: string
          content?: string
          created_at?: string | null
          embedded_data?: Json | null
          generated_at?: string | null
          id?: string
          league_id?: string | null
          published?: boolean | null
          subtitle?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
        ]
      }
      draft_picks: {
        Row: {
          created_at: string | null
          draft_id: string
          draft_slot: number | null
          id: string
          is_keeper: boolean | null
          metadata: Json | null
          pick_no: number
          picked_by: string | null
          player_id: string | null
          roster_id: number | null
          round: number
        }
        Insert: {
          created_at?: string | null
          draft_id: string
          draft_slot?: number | null
          id?: string
          is_keeper?: boolean | null
          metadata?: Json | null
          pick_no: number
          picked_by?: string | null
          player_id?: string | null
          roster_id?: number | null
          round: number
        }
        Update: {
          created_at?: string | null
          draft_id?: string
          draft_slot?: number | null
          id?: string
          is_keeper?: boolean | null
          metadata?: Json | null
          pick_no?: number
          picked_by?: string | null
          player_id?: string | null
          roster_id?: number | null
          round?: number
        }
        Relationships: [
          {
            foreignKeyName: "draft_picks_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["draft_id"]
          },
        ]
      }
      drafts: {
        Row: {
          created_at: string | null
          draft_id: string
          draft_order: Json | null
          last_picked: number | null
          league_id: string
          metadata: Json | null
          season: string
          settings: Json | null
          slot_to_roster_id: Json | null
          start_time: number | null
          status: string
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          draft_id: string
          draft_order?: Json | null
          last_picked?: number | null
          league_id: string
          metadata?: Json | null
          season: string
          settings?: Json | null
          slot_to_roster_id?: Json | null
          start_time?: number | null
          status: string
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          draft_id?: string
          draft_order?: Json | null
          last_picked?: number | null
          league_id?: string
          metadata?: Json | null
          season?: string
          settings?: Json | null
          slot_to_roster_id?: Json | null
          start_time?: number | null
          status?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drafts_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
        ]
      }
      league_users: {
        Row: {
          avatar: string | null
          created_at: string | null
          display_name: string | null
          id: string
          is_co_owner: boolean | null
          is_owner: boolean | null
          league_id: string
          team_name: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_co_owner?: boolean | null
          is_owner?: boolean | null
          league_id: string
          team_name?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_co_owner?: boolean | null
          is_owner?: boolean | null
          league_id?: string
          team_name?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_users_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "league_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      leagues: {
        Row: {
          avatar: string | null
          created_at: string | null
          draft_id: string | null
          league_id: string
          name: string
          previous_league_id: string | null
          roster_positions: string[] | null
          scoring_settings: Json | null
          season: string
          settings: Json | null
          sport: string | null
          status: string
          total_rosters: number
          updated_at: string | null
        }
        Insert: {
          avatar?: string | null
          created_at?: string | null
          draft_id?: string | null
          league_id: string
          name: string
          previous_league_id?: string | null
          roster_positions?: string[] | null
          scoring_settings?: Json | null
          season: string
          settings?: Json | null
          sport?: string | null
          status: string
          total_rosters: number
          updated_at?: string | null
        }
        Update: {
          avatar?: string | null
          created_at?: string | null
          draft_id?: string | null
          league_id?: string
          name?: string
          previous_league_id?: string | null
          roster_positions?: string[] | null
          scoring_settings?: Json | null
          season?: string
          settings?: Json | null
          sport?: string | null
          status?: string
          total_rosters?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      matchups: {
        Row: {
          created_at: string | null
          custom_points: number | null
          id: string
          league_id: string
          matchup_id: number
          players: string[] | null
          players_points: Json | null
          points: number | null
          roster_id: number
          starters: string[] | null
          starters_points: number[] | null
          updated_at: string | null
          week: number
        }
        Insert: {
          created_at?: string | null
          custom_points?: number | null
          id?: string
          league_id: string
          matchup_id: number
          players?: string[] | null
          players_points?: Json | null
          points?: number | null
          roster_id: number
          starters?: string[] | null
          starters_points?: number[] | null
          updated_at?: string | null
          week: number
        }
        Update: {
          created_at?: string | null
          custom_points?: number | null
          id?: string
          league_id?: string
          matchup_id?: number
          players?: string[] | null
          players_points?: Json | null
          points?: number | null
          roster_id?: number
          starters?: string[] | null
          starters_points?: number[] | null
          updated_at?: string | null
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "matchups_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
        ]
      }
      nfl_state: {
        Row: {
          display_week: number
          id: string
          leg: number
          season: string
          season_start_date: string | null
          season_type: string
          updated_at: string | null
          week: number
        }
        Insert: {
          display_week: number
          id?: string
          leg: number
          season: string
          season_start_date?: string | null
          season_type: string
          updated_at?: string | null
          week: number
        }
        Update: {
          display_week?: number
          id?: string
          leg?: number
          season?: string
          season_start_date?: string | null
          season_type?: string
          updated_at?: string | null
          week?: number
        }
        Relationships: []
      }
      pick_values: {
        Row: {
          created_at: string | null
          fetched_at: string | null
          id: string
          pick_round: number
          pick_tier: string | null
          pick_type: string
          pick_year: string
          rank: number | null
          superflex: boolean | null
          updated_at: string | null
          value: number
        }
        Insert: {
          created_at?: string | null
          fetched_at?: string | null
          id?: string
          pick_round: number
          pick_tier?: string | null
          pick_type: string
          pick_year: string
          rank?: number | null
          superflex?: boolean | null
          updated_at?: string | null
          value?: number
        }
        Update: {
          created_at?: string | null
          fetched_at?: string | null
          id?: string
          pick_round?: number
          pick_tier?: string | null
          pick_type?: string
          pick_year?: string
          rank?: number | null
          superflex?: boolean | null
          updated_at?: string | null
          value?: number
        }
        Relationships: []
      }
      player_projections: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          player_id: string
          projected_points: number | null
          season: string
          source: string | null
          week: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          player_id: string
          projected_points?: number | null
          season: string
          source?: string | null
          week: number
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          player_id?: string
          projected_points?: number | null
          season?: string
          source?: string | null
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_projections_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["player_id"]
          },
        ]
      }
      player_values: {
        Row: {
          created_at: string | null
          fetched_at: string | null
          id: string
          player_id: string
          position_rank: number | null
          rank: number | null
          source: string
          superflex: boolean | null
          tier: number | null
          trend: number | null
          updated_at: string | null
          value: number
        }
        Insert: {
          created_at?: string | null
          fetched_at?: string | null
          id?: string
          player_id: string
          position_rank?: number | null
          rank?: number | null
          source?: string
          superflex?: boolean | null
          tier?: number | null
          trend?: number | null
          updated_at?: string | null
          value: number
        }
        Update: {
          created_at?: string | null
          fetched_at?: string | null
          id?: string
          player_id?: string
          position_rank?: number | null
          rank?: number | null
          source?: string
          superflex?: boolean | null
          tier?: number | null
          trend?: number | null
          updated_at?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_values_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["player_id"]
          },
        ]
      }
      players: {
        Row: {
          age: number | null
          college: string | null
          created_at: string | null
          fantasy_positions: string[] | null
          first_name: string | null
          full_name: string | null
          height: string | null
          injury_status: string | null
          last_name: string | null
          metadata: Json | null
          number: number | null
          player_id: string
          position: string | null
          search_full_name: string | null
          status: string | null
          team: string | null
          updated_at: string | null
          weight: string | null
          years_exp: number | null
        }
        Insert: {
          age?: number | null
          college?: string | null
          created_at?: string | null
          fantasy_positions?: string[] | null
          first_name?: string | null
          full_name?: string | null
          height?: string | null
          injury_status?: string | null
          last_name?: string | null
          metadata?: Json | null
          number?: number | null
          player_id: string
          position?: string | null
          search_full_name?: string | null
          status?: string | null
          team?: string | null
          updated_at?: string | null
          weight?: string | null
          years_exp?: number | null
        }
        Update: {
          age?: number | null
          college?: string | null
          created_at?: string | null
          fantasy_positions?: string[] | null
          first_name?: string | null
          full_name?: string | null
          height?: string | null
          injury_status?: string | null
          last_name?: string | null
          metadata?: Json | null
          number?: number | null
          player_id?: string
          position?: string | null
          search_full_name?: string | null
          status?: string | null
          team?: string | null
          updated_at?: string | null
          weight?: string | null
          years_exp?: number | null
        }
        Relationships: []
      }
      playoff_brackets: {
        Row: {
          bracket_type: string
          created_at: string | null
          id: string
          league_id: string
          loser_roster_id: number | null
          match_id: number
          placement: number | null
          round: number
          team1_from: Json | null
          team1_roster_id: number | null
          team2_from: Json | null
          team2_roster_id: number | null
          updated_at: string | null
          winner_roster_id: number | null
        }
        Insert: {
          bracket_type: string
          created_at?: string | null
          id?: string
          league_id: string
          loser_roster_id?: number | null
          match_id: number
          placement?: number | null
          round: number
          team1_from?: Json | null
          team1_roster_id?: number | null
          team2_from?: Json | null
          team2_roster_id?: number | null
          updated_at?: string | null
          winner_roster_id?: number | null
        }
        Update: {
          bracket_type?: string
          created_at?: string | null
          id?: string
          league_id?: string
          loser_roster_id?: number | null
          match_id?: number
          placement?: number | null
          round?: number
          team1_from?: Json | null
          team1_roster_id?: number | null
          team2_from?: Json | null
          team2_roster_id?: number | null
          updated_at?: string | null
          winner_roster_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "playoff_brackets_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
        ]
      }
      rosters: {
        Row: {
          co_owners: string[] | null
          created_at: string | null
          fpts: number | null
          fpts_against: number | null
          fpts_against_decimal: number | null
          fpts_decimal: number | null
          id: string
          league_id: string
          losses: number | null
          owner_id: string | null
          players: string[] | null
          reserve: string[] | null
          roster_id: number
          settings: Json | null
          starters: string[] | null
          ties: number | null
          total_moves: number | null
          updated_at: string | null
          waiver_budget_used: number | null
          waiver_position: number | null
          wins: number | null
        }
        Insert: {
          co_owners?: string[] | null
          created_at?: string | null
          fpts?: number | null
          fpts_against?: number | null
          fpts_against_decimal?: number | null
          fpts_decimal?: number | null
          id?: string
          league_id: string
          losses?: number | null
          owner_id?: string | null
          players?: string[] | null
          reserve?: string[] | null
          roster_id: number
          settings?: Json | null
          starters?: string[] | null
          ties?: number | null
          total_moves?: number | null
          updated_at?: string | null
          waiver_budget_used?: number | null
          waiver_position?: number | null
          wins?: number | null
        }
        Update: {
          co_owners?: string[] | null
          created_at?: string | null
          fpts?: number | null
          fpts_against?: number | null
          fpts_against_decimal?: number | null
          fpts_decimal?: number | null
          id?: string
          league_id?: string
          losses?: number | null
          owner_id?: string | null
          players?: string[] | null
          reserve?: string[] | null
          roster_id?: number
          settings?: Json | null
          starters?: string[] | null
          ties?: number | null
          total_moves?: number | null
          updated_at?: string | null
          waiver_budget_used?: number | null
          waiver_position?: number | null
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rosters_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "rosters_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      sync_log: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          league_id: string | null
          records_processed: number | null
          started_at: string | null
          status: string
          sync_type: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          league_id?: string | null
          records_processed?: number | null
          started_at?: string | null
          status: string
          sync_type: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          league_id?: string | null
          records_processed?: number | null
          started_at?: string | null
          status?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_log_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
        ]
      }
      trade_analyses: {
        Row: {
          analysis_data: Json | null
          created_at: string | null
          created_by: string | null
          fairness_score: number | null
          id: string
          league_id: string
          transaction_id: string | null
          winning_side: number | null
        }
        Insert: {
          analysis_data?: Json | null
          created_at?: string | null
          created_by?: string | null
          fairness_score?: number | null
          id?: string
          league_id: string
          transaction_id?: string | null
          winning_side?: number | null
        }
        Update: {
          analysis_data?: Json | null
          created_at?: string | null
          created_by?: string | null
          fairness_score?: number | null
          id?: string
          league_id?: string
          transaction_id?: string | null
          winning_side?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_analyses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "trade_analyses_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "trade_analyses_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      traded_picks: {
        Row: {
          created_at: string | null
          id: string
          league_id: string
          owner_id: number
          previous_owner_id: number
          roster_id: number
          round: number
          season: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          league_id: string
          owner_id: number
          previous_owner_id: number
          roster_id: number
          round: number
          season: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          league_id?: string
          owner_id?: number
          previous_owner_id?: number
          roster_id?: number
          round?: number
          season?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traded_picks_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
        ]
      }
      transactions: {
        Row: {
          adds: Json | null
          consenter_ids: number[] | null
          created: number | null
          created_at: string | null
          creator: string | null
          draft_picks: Json | null
          drops: Json | null
          league_id: string
          metadata: Json | null
          roster_ids: number[] | null
          settings: Json | null
          status: string
          status_updated: number | null
          transaction_id: string
          type: string
          waiver_budget: Json | null
          week: number | null
        }
        Insert: {
          adds?: Json | null
          consenter_ids?: number[] | null
          created?: number | null
          created_at?: string | null
          creator?: string | null
          draft_picks?: Json | null
          drops?: Json | null
          league_id: string
          metadata?: Json | null
          roster_ids?: number[] | null
          settings?: Json | null
          status: string
          status_updated?: number | null
          transaction_id: string
          type: string
          waiver_budget?: Json | null
          week?: number | null
        }
        Update: {
          adds?: Json | null
          consenter_ids?: number[] | null
          created?: number | null
          created_at?: string | null
          creator?: string | null
          draft_picks?: Json | null
          drops?: Json | null
          league_id?: string
          metadata?: Json | null
          roster_ids?: number[] | null
          settings?: Json | null
          status?: string
          status_updated?: number | null
          transaction_id?: string
          type?: string
          waiver_budget?: Json | null
          week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_creator_fkey"
            columns: ["creator"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
        ]
      }
      users: {
        Row: {
          avatar: string | null
          created_at: string | null
          display_name: string | null
          metadata: Json | null
          updated_at: string | null
          user_id: string
          username: string | null
        }
        Insert: {
          avatar?: string | null
          created_at?: string | null
          display_name?: string | null
          metadata?: Json | null
          updated_at?: string | null
          user_id: string
          username?: string | null
        }
        Update: {
          avatar?: string | null
          created_at?: string | null
          display_name?: string | null
          metadata?: Json | null
          updated_at?: string | null
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      yf_games: {
        Row: {
          date: string
          fetched_at: string
          home_team_id: number
          home_team_score: number | null
          id: number
          period: number | null
          postseason: boolean | null
          season: number
          status: string
          time: string | null
          updated_at: string
          visitor_team_id: number
          visitor_team_score: number | null
        }
        Insert: {
          date: string
          fetched_at?: string
          home_team_id: number
          home_team_score?: number | null
          id: number
          period?: number | null
          postseason?: boolean | null
          season: number
          status: string
          time?: string | null
          updated_at?: string
          visitor_team_id: number
          visitor_team_score?: number | null
        }
        Update: {
          date?: string
          fetched_at?: string
          home_team_id?: number
          home_team_score?: number | null
          id?: number
          period?: number | null
          postseason?: boolean | null
          season?: number
          status?: string
          time?: string | null
          updated_at?: string
          visitor_team_id?: number
          visitor_team_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "yf_games_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "yf_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yf_games_visitor_team_id_fkey"
            columns: ["visitor_team_id"]
            isOneToOne: false
            referencedRelation: "yf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      yf_players: {
        Row: {
          college: string | null
          country: string | null
          draft_number: number | null
          draft_round: number | null
          draft_year: number | null
          fetched_at: string
          first_name: string
          full_name: string | null
          height: string | null
          id: number
          jersey_number: string | null
          last_name: string
          position: string | null
          team_id: number | null
          updated_at: string
          weight: string | null
        }
        Insert: {
          college?: string | null
          country?: string | null
          draft_number?: number | null
          draft_round?: number | null
          draft_year?: number | null
          fetched_at?: string
          first_name: string
          full_name?: string | null
          height?: string | null
          id: number
          jersey_number?: string | null
          last_name: string
          position?: string | null
          team_id?: number | null
          updated_at?: string
          weight?: string | null
        }
        Update: {
          college?: string | null
          country?: string | null
          draft_number?: number | null
          draft_round?: number | null
          draft_year?: number | null
          fetched_at?: string
          first_name?: string
          full_name?: string | null
          height?: string | null
          id?: number
          jersey_number?: string | null
          last_name?: string
          position?: string | null
          team_id?: number | null
          updated_at?: string
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yf_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "yf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      yf_season_averages: {
        Row: {
          ast: number | null
          blk: number | null
          dreb: number | null
          fetched_at: string
          fg_pct: number | null
          fg3_pct: number | null
          fg3a: number | null
          fg3m: number | null
          fga: number | null
          fgm: number | null
          ft_pct: number | null
          fta: number | null
          ftm: number | null
          games_played: number | null
          id: string
          min: number | null
          oreb: number | null
          pf: number | null
          player_id: number
          pts: number | null
          reb: number | null
          season: number
          stl: number | null
          turnover: number | null
        }
        Insert: {
          ast?: number | null
          blk?: number | null
          dreb?: number | null
          fetched_at?: string
          fg_pct?: number | null
          fg3_pct?: number | null
          fg3a?: number | null
          fg3m?: number | null
          fga?: number | null
          fgm?: number | null
          ft_pct?: number | null
          fta?: number | null
          ftm?: number | null
          games_played?: number | null
          id?: string
          min?: number | null
          oreb?: number | null
          pf?: number | null
          player_id: number
          pts?: number | null
          reb?: number | null
          season: number
          stl?: number | null
          turnover?: number | null
        }
        Update: {
          ast?: number | null
          blk?: number | null
          dreb?: number | null
          fetched_at?: string
          fg_pct?: number | null
          fg3_pct?: number | null
          fg3a?: number | null
          fg3m?: number | null
          fga?: number | null
          fgm?: number | null
          ft_pct?: number | null
          fta?: number | null
          ftm?: number | null
          games_played?: number | null
          id?: string
          min?: number | null
          oreb?: number | null
          pf?: number | null
          player_id?: number
          pts?: number | null
          reb?: number | null
          season?: number
          stl?: number | null
          turnover?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "yf_season_averages_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "yf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      yf_teams: {
        Row: {
          abbreviation: string
          city: string | null
          conference: string | null
          division: string | null
          fetched_at: string
          full_name: string
          id: number
          name: string
        }
        Insert: {
          abbreviation: string
          city?: string | null
          conference?: string | null
          division?: string | null
          fetched_at?: string
          full_name: string
          id: number
          name: string
        }
        Update: {
          abbreviation?: string
          city?: string | null
          conference?: string | null
          division?: string | null
          fetched_at?: string
          full_name?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_league_standings: {
        Args: { p_league_id: string }
        Returns: {
          losses: number
          owner_name: string
          points_against: number
          rank: number
          roster_id: number
          team_name: string
          ties: number
          total_points: number
          wins: number
        }[]
      }
      get_roster_with_players: {
        Args: { p_league_id: string; p_roster_id: number }
        Returns: {
          fpts: number
          losses: number
          owner_id: string
          owner_name: string
          players: Json
          roster_id: number
          team_name: string
          ties: number
          wins: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const


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
