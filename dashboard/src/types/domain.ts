import type { Database } from './database';

// ── Database Row Types ────────────────────────────────────────────
// Convenient aliases for Supabase table row types

type Tables = Database['public']['Tables'];

export type LeagueRow = Tables['leagues']['Row'];
export type RosterRow = Tables['rosters']['Row'];
export type PlayerRow = Tables['players']['Row'];
export type PlayerValueRow = Tables['player_values']['Row'];
export type PickValueRow = Tables['pick_values']['Row'];
export type TransactionRow = Tables['transactions']['Row'];
export type MatchupRow = Tables['matchups']['Row'];
export type DraftRow = Tables['drafts']['Row'];
export type DraftPickRow = Tables['draft_picks']['Row'];
export type TradedPickRow = Tables['traded_picks']['Row'];
export type LeagueUserRow = Tables['league_users']['Row'];
export type UserRow = Tables['users']['Row'];
export type NflStateRow = Tables['nfl_state']['Row'];
export type SyncLogRow = Tables['sync_log']['Row'];

// ── App-Level Domain Types ────────────────────────────────────────
// Enriched types used in the frontend (not direct DB rows)

export interface Player {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
}

export interface Roster {
  roster_id: number;
  owner_id: string;
  players: string[];
  wins: number;
  losses: number;
  fpts: number;
  ownerName: string;
  teamName: string | null;
}

export interface PlayerValue {
  player_id: string;
  value: number;
  player: {
    full_name: string;
    position: string;
    team: string | null;
  };
}

export interface PickValue {
  pick_year: string;
  pick_round: number;
  pick_tier: string | null;
  value: number;
}

export interface TradedPick {
  season: string;
  round: number;
  roster_id: number;
  owner_id: number;
}

export interface TradeAsset {
  id: string;
  type: 'player' | 'pick';
  name: string;
  value: number;
  position?: string;
  team?: string | null;
  pickYear?: string;
  pickRound?: number;
  pickTier?: string;
}

export type Fairness = 'fair' | 'slight' | 'unfair' | 'lopsided';
