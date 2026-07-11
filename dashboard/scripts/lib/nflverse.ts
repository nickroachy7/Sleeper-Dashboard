/**
 * nflverse data access — open, permissively-licensed NFL facts.
 *
 * Everything here is FACTUAL public data (production, age, draft capital),
 * nothing proprietary. This is the KTC replacement for the "objective prior".
 *
 * nflverse publishes flat CSVs as GitHub release assets. The `players` asset is
 * the load-bearing one: it carries a `sleeper_id` column, which is how we join
 * NFL stats (keyed by gsis_id) back to the Sleeper player_ids the app uses.
 *
 * Docs: https://github.com/nflverse/nflverse-data/releases
 * If nflverse ever moves an asset, only the URLs in NFLVERSE_URLS change.
 */

const BASE = 'https://github.com/nflverse/nflverse-data/releases/download';

export const NFLVERSE_URLS = {
  players: `${BASE}/players/players.csv`,
  // nflverse renamed the weekly stats asset. Current path is
  // stats_player/stats_player_week_{season}.csv (covers 2025+); the old
  // player_stats/player_stats_{season}.csv path is the fallback for older years.
  weeklyStats: (season: number) => `${BASE}/stats_player/stats_player_week_${season}.csv`,
  weeklyStatsLegacy: (season: number) => `${BASE}/player_stats/player_stats_${season}.csv`,
  rosters: (season: number) => `${BASE}/rosters/roster_${season}.csv`,
};

const UA = 'sleeper-dashboard-community-values/1.0';

/** Minimal, dependency-free CSV parser that respects quoted fields + newlines. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); field = ''; row = [];
    } else if (c === '\r') {
      // swallow; \n handles the line break
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1)
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''))
    .map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((h, idx) => { obj[h] = r[idx] ?? ''; });
      return obj;
    });
}

export async function fetchCsv(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`nflverse fetch ${res.status} for ${url}`);
  return parseCsv(await res.text());
}

/** Tolerant numeric read — returns null for '', 'NA', non-numeric. */
export function num(v: string | undefined): number | null {
  if (v == null || v === '' || v === 'NA') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Age (in years, one decimal) at the Sept 1 kickoff of `season`. */
export function ageAtSeason(birthDate: string | undefined, season: number): number | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;
  const kickoff = new Date(Date.UTC(season, 8, 1)); // month 8 = September
  const years = (kickoff.getTime() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
  return years > 0 && years < 60 ? Math.round(years * 10) / 10 : null;
}

export interface NflversePlayer {
  gsis_id: string;
  full_name: string;
  position: string;
  birth_date: string | null;
  draft_pick: number | null;     // overall pick, null = undrafted
  draft_round: number | null;
  rookie_season: number | null;  // first NFL season → derive per-season exp
}

/**
 * Load the players master table, indexed by gsis_id.
 *
 * NOTE: nflverse's players.csv carries NO sleeper_id, and our Sleeper players
 * table stored no cross-reference ids either — so callers join to Sleeper by
 * normalized name + position (see `normalizeName` + ingest script), the same
 * strategy the KTC sync uses. Real column names (verified against the live
 * asset): display_name, position, birth_date, draft_pick, draft_round,
 * rookie_season, years_of_experience.
 */
export async function loadPlayers(): Promise<Map<string, NflversePlayer>> {
  const raw = await fetchCsv(NFLVERSE_URLS.players);
  const byGsis = new Map<string, NflversePlayer>();
  for (const r of raw) {
    const gsis = r.gsis_id || r.player_id;
    if (!gsis) continue;
    const pick = num(r.draft_pick) ?? num(r.draft_number);
    byGsis.set(gsis, {
      gsis_id: gsis,
      full_name: r.display_name || r.full_name || '',
      position: r.position || r.position_group || '',
      birth_date: r.birth_date || null,
      draft_pick: pick,
      draft_round: num(r.draft_round) ?? (pick != null ? Math.min(7, Math.ceil(pick / 32)) : null),
      rookie_season: num(r.rookie_season) ?? num(r.draft_year),
    });
  }
  return byGsis;
}

/** Name normalizer shared with the ingest join — mirrors the KTC sync's rules
 *  so name matches stay consistent across sources. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\bjr\b\.?/gi, '')
    .replace(/\bsr\b\.?/gi, '')
    .replace(/\biii\b/gi, '')
    .replace(/\biv\b/gi, '')
    .replace(/\bii\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SeasonProduction {
  gsis_id: string;
  season: number;
  games: number;
  fantasy_total: number;
  fantasy_ppg: number;
}

/**
 * Aggregate weekly PPR fantasy points into per-season production.
 * `player_stats_{season}.csv` is weekly; we sum points and count games played.
 */
export async function loadSeasonProduction(season: number): Promise<Map<string, SeasonProduction>> {
  let raw: Record<string, string>[] | null = null;
  for (const url of [NFLVERSE_URLS.weeklyStats(season), NFLVERSE_URLS.weeklyStatsLegacy(season)]) {
    try { raw = await fetchCsv(url); break; } catch { /* try next */ }
  }
  if (!raw) {
    console.warn(`  no weekly stats for ${season} (asset not published); skipping production`);
    return new Map();
  }
  const agg = new Map<string, SeasonProduction>();
  for (const r of raw) {
    // Regular season only — including playoffs inflates games and skews per-game.
    const type = (r.season_type || r.game_type || 'REG').toUpperCase();
    if (type && type !== 'REG') continue;
    const gsis = r.player_id || r.gsis_id;
    if (!gsis) continue;
    const pts = num(r.fantasy_points_ppr) ?? num(r.fantasy_points) ?? 0;
    const cur = agg.get(gsis) ?? { gsis_id: gsis, season, games: 0, fantasy_total: 0, fantasy_ppg: 0 };
    cur.games += 1;
    cur.fantasy_total += pts;
    agg.set(gsis, cur);
  }
  for (const p of agg.values()) {
    p.fantasy_ppg = p.games ? Math.round((p.fantasy_total / p.games) * 100) / 100 : 0;
    p.fantasy_total = Math.round(p.fantasy_total * 10) / 10;
  }
  return agg;
}

/**
 * Per-week PPR points for a season, keyed by gsis_id. Lets a caller compute
 * production-to-date at any point in the season (for dense value history that
 * moves as the season unfolds, instead of one annual snapshot).
 */
export async function loadWeeklyPoints(season: number): Promise<Map<string, { week: number; pts: number }[]>> {
  let raw: Record<string, string>[] | null = null;
  for (const url of [NFLVERSE_URLS.weeklyStats(season), NFLVERSE_URLS.weeklyStatsLegacy(season)]) {
    try { raw = await fetchCsv(url); break; } catch { /* try next */ }
  }
  if (!raw) return new Map();
  const out = new Map<string, { week: number; pts: number }[]>();
  for (const r of raw) {
    const type = (r.season_type || r.game_type || 'REG').toUpperCase();
    if (type && type !== 'REG') continue;
    const gsis = r.player_id || r.gsis_id;
    const week = num(r.week);
    if (!gsis || week == null) continue;
    const pts = num(r.fantasy_points_ppr) ?? num(r.fantasy_points) ?? 0;
    const arr = out.get(gsis) ?? [];
    arr.push({ week, pts });
    out.set(gsis, arr);
  }
  return out;
}
