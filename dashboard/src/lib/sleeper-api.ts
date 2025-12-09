const SLEEPER_API_BASE = 'https://api.sleeper.app/v1';

export const sleeperApi = {
  // Get user by username
  async getUser(username: string) {
    const res = await fetch(`${SLEEPER_API_BASE}/user/${username}`);
    if (!res.ok) throw new Error('User not found');
    return res.json();
  },

  // Get all leagues for a user
  async getLeagues(userId: string, season: string) {
    const res = await fetch(`${SLEEPER_API_BASE}/user/${userId}/leagues/nfl/${season}`);
    if (!res.ok) throw new Error('Failed to fetch leagues');
    return res.json();
  },

  // Get league details
  async getLeague(leagueId: string) {
    const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}`);
    if (!res.ok) throw new Error('Failed to fetch league');
    return res.json();
  },

  // Get rosters for a league
  async getRosters(leagueId: string) {
    const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/rosters`);
    if (!res.ok) throw new Error('Failed to fetch rosters');
    return res.json();
  },

  // Get users in a league
  async getLeagueUsers(leagueId: string) {
    const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/users`);
    if (!res.ok) throw new Error('Failed to fetch league users');
    return res.json();
  },

  // Get matchups for a week
  async getMatchups(leagueId: string, week: number) {
    const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/matchups/${week}`);
    if (!res.ok) throw new Error('Failed to fetch matchups');
    return res.json();
  },

  // Get transactions for a week
  async getTransactions(leagueId: string, week: number) {
    const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/transactions/${week}`);
    if (!res.ok) throw new Error('Failed to fetch transactions');
    return res.json();
  },

  // Get traded picks
  async getTradedPicks(leagueId: string) {
    const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/traded_picks`);
    if (!res.ok) throw new Error('Failed to fetch traded picks');
    return res.json();
  },

  // Get drafts for a league
  async getDrafts(leagueId: string) {
    const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/drafts`);
    if (!res.ok) throw new Error('Failed to fetch drafts');
    return res.json();
  },

  // Get draft picks
  async getDraftPicks(draftId: string) {
    const res = await fetch(`${SLEEPER_API_BASE}/draft/${draftId}/picks`);
    if (!res.ok) throw new Error('Failed to fetch draft picks');
    return res.json();
  },

  // Get all NFL players (cached - only call once)
  async getPlayers() {
    const res = await fetch(`${SLEEPER_API_BASE}/players/nfl`);
    if (!res.ok) throw new Error('Failed to fetch players');
    return res.json();
  },

  // Get NFL state
  async getNflState() {
    const res = await fetch(`${SLEEPER_API_BASE}/state/nfl`);
    if (!res.ok) throw new Error('Failed to fetch NFL state');
    return res.json();
  },
};
