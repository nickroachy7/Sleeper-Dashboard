import type {
  SleeperUser,
  SleeperLeague,
  SleeperRoster,
  SleeperMatchup,
  SleeperTransaction,
} from '../types/sleeper';

const SLEEPER_API_BASE = 'https://api.sleeper.app/v1';

export const sleeperApi = {
  async getUser(username: string): Promise<SleeperUser> {
    const res = await fetch(`${SLEEPER_API_BASE}/user/${username}`);
    if (!res.ok) throw new Error('User not found');
    return res.json();
  },

  async getLeagues(userId: string, season: string): Promise<SleeperLeague[]> {
    const res = await fetch(`${SLEEPER_API_BASE}/user/${userId}/leagues/nfl/${season}`);
    if (!res.ok) throw new Error('Failed to fetch leagues');
    return res.json();
  },

  async getLeague(leagueId: string): Promise<SleeperLeague> {
    const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}`);
    if (!res.ok) throw new Error('Failed to fetch league');
    return res.json();
  },

  async getRosters(leagueId: string): Promise<SleeperRoster[]> {
    const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/rosters`);
    if (!res.ok) throw new Error('Failed to fetch rosters');
    return res.json();
  },

  async getLeagueUsers(leagueId: string): Promise<SleeperUser[]> {
    const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/users`);
    if (!res.ok) throw new Error('Failed to fetch league users');
    return res.json();
  },

  async getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
    const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/matchups/${week}`);
    if (!res.ok) throw new Error('Failed to fetch matchups');
    return res.json();
  },

  async getTransactions(leagueId: string, week: number): Promise<SleeperTransaction[]> {
    const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/transactions/${week}`);
    if (!res.ok) throw new Error('Failed to fetch transactions');
    return res.json();
  },

  async getTradedPicks(leagueId: string): Promise<unknown[]> {
    const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/traded_picks`);
    if (!res.ok) throw new Error('Failed to fetch traded picks');
    return res.json();
  },

  async getDrafts(leagueId: string): Promise<unknown[]> {
    const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/drafts`);
    if (!res.ok) throw new Error('Failed to fetch drafts');
    return res.json();
  },

  async getDraftPicks(draftId: string): Promise<unknown[]> {
    const res = await fetch(`${SLEEPER_API_BASE}/draft/${draftId}/picks`);
    if (!res.ok) throw new Error('Failed to fetch draft picks');
    return res.json();
  },

  async getPlayers(): Promise<Record<string, unknown>> {
    const res = await fetch(`${SLEEPER_API_BASE}/players/nfl`);
    if (!res.ok) throw new Error('Failed to fetch players');
    return res.json();
  },

  async getNflState(): Promise<{ season: string; week: number; season_type: string; display_week: number; leg: number }> {
    const res = await fetch(`${SLEEPER_API_BASE}/state/nfl`);
    if (!res.ok) throw new Error('Failed to fetch NFL state');
    return res.json();
  },

  /**
   * Community-wide "buzz" — how many Sleeper leagues added (or dropped) each
   * player in the lookback window. A universal signal (not league-specific), so
   * it works logged-out too.
   */
  async getTrending(type: 'add' | 'drop', lookbackHours = 24, limit = 250): Promise<{ player_id: string; count: number }[]> {
    const res = await fetch(`${SLEEPER_API_BASE}/players/nfl/trending/${type}?lookback_hours=${lookbackHours}&limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch trending players');
    return res.json();
  },
};
