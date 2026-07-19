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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      community_pick_ratings: {
        Row: {
          matches: number
          pick_key: string
          pick_round: number
          pick_year: number
          rating: number
          rd: number
          updated_at: string | null
          volatility: number
        }
        Insert: {
          matches?: number
          pick_key: string
          pick_round: number
          pick_year: number
          rating?: number
          rd?: number
          updated_at?: string | null
          volatility?: number
        }
        Update: {
          matches?: number
          pick_key?: string
          pick_round?: number
          pick_year?: number
          rating?: number
          rd?: number
          updated_at?: string | null
          volatility?: number
        }
        Relationships: []
      }
      community_ratings: {
        Row: {
          matches: number
          player_id: string
          rating: number
          rd: number
          updated_at: string | null
          volatility: number
        }
        Insert: {
          matches?: number
          player_id: string
          rating?: number
          rd?: number
          updated_at?: string | null
          volatility?: number
        }
        Update: {
          matches?: number
          player_id?: string
          rating?: number
          rd?: number
          updated_at?: string | null
          volatility?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_ratings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["player_id"]
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
      feedback: {
        Row: {
          attachments: Json
          created_at: string | null
          email: string | null
          id: string
          kind: string
          message: string
          page_url: string | null
          status: string
          submitter_id: string | null
          user_agent: string | null
        }
        Insert: {
          attachments?: Json
          created_at?: string | null
          email?: string | null
          id?: string
          kind?: string
          message: string
          page_url?: string | null
          status?: string
          submitter_id?: string | null
          user_agent?: string | null
        }
        Update: {
          attachments?: Json
          created_at?: string | null
          email?: string | null
          id?: string
          kind?: string
          message?: string
          page_url?: string | null
          status?: string
          submitter_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
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
          rating_deviation: number | null
          source: string
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
          rating_deviation?: number | null
          source?: string
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
          rating_deviation?: number | null
          source?: string
          superflex?: boolean | null
          updated_at?: string | null
          value?: number
        }
        Relationships: []
      }
      player_facts: {
        Row: {
          age: number | null
          draft_pick: number | null
          draft_round: number | null
          fantasy_ppg: number | null
          fantasy_total: number | null
          games: number | null
          gsis_id: string | null
          id: string
          player_id: string
          season: number
          snap_share: number | null
          source: string
          updated_at: string | null
          years_exp: number | null
        }
        Insert: {
          age?: number | null
          draft_pick?: number | null
          draft_round?: number | null
          fantasy_ppg?: number | null
          fantasy_total?: number | null
          games?: number | null
          gsis_id?: string | null
          id?: string
          player_id: string
          season: number
          snap_share?: number | null
          source?: string
          updated_at?: string | null
          years_exp?: number | null
        }
        Update: {
          age?: number | null
          draft_pick?: number | null
          draft_round?: number | null
          fantasy_ppg?: number | null
          fantasy_total?: number | null
          games?: number | null
          gsis_id?: string | null
          id?: string
          player_id?: string
          season?: number
          snap_share?: number | null
          source?: string
          updated_at?: string | null
          years_exp?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_facts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["player_id"]
          },
        ]
      }
      player_value_history: {
        Row: {
          date: string
          id: string
          player_id: string
          rank: number | null
          rating_deviation: number | null
          source: string
          value: number
        }
        Insert: {
          date?: string
          id?: string
          player_id: string
          rank?: number | null
          rating_deviation?: number | null
          source?: string
          value: number
        }
        Update: {
          date?: string
          id?: string
          player_id?: string
          rank?: number | null
          rating_deviation?: number | null
          source?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_value_history_player_id_fkey"
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
          rating_deviation: number | null
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
          rating_deviation?: number | null
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
          rating_deviation?: number | null
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
      rate_limits: {
        Row: {
          bucket: string
          created_at: string
          id: number
          key: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: never
          key: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: never
          key?: string
        }
        Relationships: []
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
      tracked_leagues: {
        Row: {
          added_at: string
          last_sync_status: string | null
          last_synced_at: string | null
          last_viewed_at: string | null
          name: string
          root_league_id: string
          season: string
          sync_error: string | null
        }
        Insert: {
          added_at?: string
          last_sync_status?: string | null
          last_synced_at?: string | null
          last_viewed_at?: string | null
          name: string
          root_league_id: string
          season: string
          sync_error?: string | null
        }
        Update: {
          added_at?: string
          last_sync_status?: string | null
          last_synced_at?: string | null
          last_viewed_at?: string | null
          name?: string
          root_league_id?: string
          season?: string
          sync_error?: string | null
        }
        Relationships: []
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          user_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      user_leagues: {
        Row: {
          added_at: string
          my_roster_id: number | null
          name: string
          root_league_id: string
          season: string
          user_id: string
        }
        Insert: {
          added_at?: string
          my_roster_id?: number | null
          name: string
          root_league_id: string
          season: string
          user_id: string
        }
        Update: {
          added_at?: string
          my_roster_id?: number | null
          name?: string
          root_league_id?: string
          season?: string
          user_id?: string
        }
        Relationships: []
      }
      user_player_ratings: {
        Row: {
          losses: number
          player_id: string
          rating: number
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          losses?: number
          player_id: string
          rating?: number
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          losses?: number
          player_id?: string
          rating?: number
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: []
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
      value_events: {
        Row: {
          created_at: string | null
          format_sf: boolean
          id: string
          kind: string
          league_id: string | null
          outcome: number
          processed_at: string | null
          side_a: Json
          side_b: Json
          source_ref: string | null
          user_id: string | null
          voter_id: string | null
          weight: number
        }
        Insert: {
          created_at?: string | null
          format_sf?: boolean
          id?: string
          kind: string
          league_id?: string | null
          outcome?: number
          processed_at?: string | null
          side_a: Json
          side_b: Json
          source_ref?: string | null
          user_id?: string | null
          voter_id?: string | null
          weight?: number
        }
        Update: {
          created_at?: string | null
          format_sf?: boolean
          id?: string
          kind?: string
          league_id?: string | null
          outcome?: number
          processed_at?: string | null
          side_a?: Json
          side_b?: Json
          source_ref?: string | null
          user_id?: string | null
          voter_id?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "value_events_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      execute_readonly_sql: { Args: { query: string }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      touch_tracked_league: { Args: { p_root: string }; Returns: undefined }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
