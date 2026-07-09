import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { playerMoves, txDraftPicks } from '../lib/trade-shared';
import type { TransactionRow, PickResolution } from '../types/domain';

// ── Detail-page data hooks (player / team deep dives) ──────────────
// Kept separate from queries.ts so detail pages stay self-contained.

export interface HistoryPoint {
  date: string;
  value: number;
}

/** Page through PostgREST's 1000-row cap. */
async function fetchAllRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const pageSize = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data } = await fetchPage(from, from + pageSize - 1);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

function fetchAllTransactions(): Promise<TransactionRow[]> {
  return fetchAllRows<TransactionRow>((from, to) =>
    supabase.from('transactions').select('*').order('created', { ascending: false }).range(from, to)
  );
}

/** League directory: every season, roster, and team name in one cached blob. */
export function useLeagueDirectory() {
  return useQuery({
    queryKey: ['league-directory'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [{ data: leagues }, { data: rosters }, { data: users }, { data: leagueUsers }] =
        await Promise.all([
          supabase.from('leagues').select('league_id, season, name').order('season', { ascending: false }),
          supabase.from('rosters').select('league_id, roster_id, owner_id, players, wins, losses, ties, fpts, fpts_against'),
          supabase.from('users').select('user_id, display_name, username, avatar'),
          supabase.from('league_users').select('league_id, user_id, team_name, display_name, avatar'),
        ]);

      const seasonByLeague = new Map<string, string>();
      (leagues || []).forEach((l) => seasonByLeague.set(l.league_id, l.season));
      const currentLeagueId = leagues?.[0]?.league_id ?? null;

      // Sleeper stores a manager's CUSTOM team logo in metadata.avatar (a full
      // uploads URL), separate from their personal user avatar. We don't sync
      // that column, so fetch the current league's users live and map
      // owner_id → team-logo URL. Falls back to the user avatar when absent.
      const teamLogoByOwner = new Map<string, string>();
      if (currentLeagueId) {
        try {
          const res = await fetch(`https://api.sleeper.app/v1/league/${currentLeagueId}/users`);
          const sleeperUsers: { user_id?: string; metadata?: { avatar?: string } }[] = await res.json();
          if (Array.isArray(sleeperUsers)) {
            for (const u of sleeperUsers) {
              if (u.user_id && u.metadata?.avatar) teamLogoByOwner.set(u.user_id, u.metadata.avatar);
            }
          }
        } catch { /* fall back to user avatars below */ }
      }

      const ownerOf = (rosterId: number, leagueId?: string | null): string | null => {
        const lid = leagueId || currentLeagueId;
        const roster = (rosters || []).find((r) => r.roster_id === rosterId && r.league_id === lid)
          || (rosters || []).find((r) => r.roster_id === rosterId && r.league_id === currentLeagueId);
        return roster?.owner_id ?? null;
      };

      const teamName = (rosterId: number, leagueId?: string | null): string => {
        const ownerId = ownerOf(rosterId, leagueId);
        if (!ownerId) return `Team ${rosterId}`;
        const lu = (leagueUsers || []).find((u) => u.user_id === ownerId && u.league_id === currentLeagueId)
          || (leagueUsers || []).find((u) => u.user_id === ownerId);
        const user = (users || []).find((u) => u.user_id === ownerId);
        return lu?.team_name || lu?.display_name || user?.display_name || user?.username || `Team ${rosterId}`;
      };

      // Team logo (custom upload) for a roster, preferred over the user avatar.
      const teamAvatar = (rosterId: number, leagueId?: string | null): string | null => {
        const ownerId = ownerOf(rosterId, leagueId);
        if (!ownerId) return null;
        const logo = teamLogoByOwner.get(ownerId);
        if (logo) return logo.startsWith('http') ? logo : `https://sleepercdn.com/uploads/${logo}`;
        const lu = (leagueUsers || []).find((u) => u.user_id === ownerId && u.league_id === currentLeagueId)
          || (leagueUsers || []).find((u) => u.user_id === ownerId);
        const raw = (lu as { avatar?: string | null } | undefined)?.avatar
          || (users || []).find((u) => u.user_id === ownerId)?.avatar;
        if (!raw) return null;
        return raw.startsWith('http') ? raw : `https://sleepercdn.com/avatars/thumbs/${raw}`;
      };

      return {
        leagues: leagues || [],
        rosters: rosters || [],
        users: users || [],
        leagueUsers: leagueUsers || [],
        currentLeagueId,
        seasonByLeague,
        teamName,
        teamAvatar,
      };
    },
  });
}

/** All data for the player detail page. */
export function usePlayerDetail(playerId: string | undefined) {
  return useQuery({
    queryKey: ['player-detail', playerId],
    enabled: !!playerId,
    queryFn: async () => {
      const pid = playerId!;
      const [
        { data: player },
        { data: value },
        { data: history },
        { data: draftPicks },
        allTx,
        { data: owningRosters },
      ] = await Promise.all([
        supabase.from('players').select('*').eq('player_id', pid).maybeSingle(),
        supabase.from('player_values').select('*').eq('player_id', pid).maybeSingle(),
        supabase.from('player_value_history').select('date, value').eq('player_id', pid).order('date', { ascending: true }),
        supabase.from('draft_picks').select('*, drafts(season, league_id, type)').eq('player_id', pid),
        fetchAllTransactions(),
        supabase.from('rosters').select('league_id, roster_id, owner_id').contains('players', [pid]),
      ]);

      // PostgREST can't filter JSON keys that look like array indexes
      // (player ids are numeric strings), so filter client-side.
      const transactions = allTx
        .filter((t) => pid in playerMoves(t.adds) || pid in playerMoves(t.drops))
        .sort((a, b) => (b.created || 0) - (a.created || 0));

      return {
        player,
        value,
        history: (history || []) as HistoryPoint[],
        draftPicks: draftPicks || [],
        transactions,
        owningRosters: owningRosters || [],
      };
    },
  });
}

/** Sum of value history across a set of players (team value over time). */
export function useRosterValueHistory(playerIds: string[] | undefined) {
  const key = (playerIds || []).slice().sort().join(',');
  return useQuery({
    queryKey: ['roster-value-history', key],
    enabled: !!playerIds?.length,
    queryFn: async () => {
      const rows = await fetchAllRows<{ player_id: string; date: string; value: number }>((from, to) =>
        supabase
          .from('player_value_history')
          .select('player_id, date, value')
          .in('player_id', playerIds!)
          .order('date', { ascending: true })
          .range(from, to)
      );

      // Sum values per date across whichever players have data that day
      const byDate = new Map<string, number>();
      rows.forEach((row) => {
        byDate.set(row.date, (byDate.get(row.date) || 0) + row.value);
      });
      return [...byDate.entries()]
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => a.date.localeCompare(b.date)) as HistoryPoint[];
    },
  });
}

export interface SeasonValuePoint {
  season: string;
  /** The team's actual roster that season, valued at that season's KTC. */
  value: number;
  /** League-average roster value that season. */
  leagueAvg: number;
  /** value − leagueAvg. */
  vsLeague: number;
  rosterCount: number;
}

/**
 * Per-season roster value for one team, the honest "did this manager build or
 * bleed value" series. For each season we take the roster the manager ACTUALLY
 * held that year (the season's roster snapshot) and value it at THAT season's
 * KTC (from player_value_history near season's end), plus the league average
 * that season. This avoids the back-projection artifact of valuing today's
 * roster in the past (which made every team look awful-then-great).
 *
 * `ownerId` ties the team across seasons (roster_id can differ); we resolve the
 * owner's roster within each season's league.
 */
export function useSeasonRosterValues(ownerId: string | null | undefined) {
  return useQuery({
    queryKey: ['season-roster-values', ownerId],
    enabled: !!ownerId,
    queryFn: async (): Promise<SeasonValuePoint[]> => {
      const { data: leagues } = await supabase
        .from('leagues').select('league_id, season').order('season', { ascending: true });
      if (!leagues?.length) return [];

      const { data: rosters } = await supabase
        .from('rosters').select('league_id, roster_id, owner_id, players');

      const points: SeasonValuePoint[] = [];
      for (const lg of leagues) {
        const leagueRosters = (rosters || []).filter((r) => r.league_id === lg.league_id);
        if (!leagueRosters.length) continue;

        // Value date: a point inside the season (Dec 15), or today for the
        // current/most-recent season if that date is still in the future.
        const todayIso = new Date().toISOString().slice(0, 10);
        let asOf = `${lg.season}-12-15`;
        if (asOf > todayIso) asOf = todayIso;

        const allPlayerIds = [...new Set(leagueRosters.flatMap((r) => (r.players as string[]) || []))];
        if (!allPlayerIds.length) continue;

        // Latest value at-or-before asOf for each player. We only need each
        // player's most-recent snapshot on/before the date, so pull a NARROW
        // window (values are snapshotted ~daily) instead of many months of
        // history — the old wide window fetched ~100k rows and took ~10s.
        const windowLo = new Date(asOf);
        windowLo.setDate(windowLo.getDate() - 14);
        const loIso = windowLo.toISOString().slice(0, 10);

        const rows = await fetchAllRows<{ player_id: string; value: number; date: string }>((from, to) =>
          supabase
            .from('player_value_history')
            .select('player_id, value, date')
            .in('player_id', allPlayerIds)
            .lte('date', asOf)
            .gte('date', loIso)
            .order('date', { ascending: false })
            .range(from, to)
        );
        const valOf = new Map<string, number>();
        for (const r of rows) if (!valOf.has(r.player_id)) valOf.set(r.player_id, r.value);

        const totals = leagueRosters.map((r) =>
          ((r.players as string[]) || []).reduce((s, pid) => s + (valOf.get(pid) || 0), 0)
        );
        const leagueAvg = Math.round(totals.reduce((s, t) => s + t, 0) / totals.length);
        const mine = leagueRosters.find((r) => r.owner_id === ownerId);
        if (!mine) continue;
        const value = ((mine.players as string[]) || []).reduce((s, pid) => s + (valOf.get(pid) || 0), 0);

        points.push({
          season: lg.season,
          value,
          leagueAvg,
          vsLeague: value - leagueAvg,
          rosterCount: leagueRosters.length,
        });
      }
      return points;
    },
  });
}

/**
 * Value history for MULTIPLE sides of a trade in one query, so the timeline
 * chart works for 2-, 3-, or 4-team trades (React hooks can't be called in a
 * variable-length loop, so a fixed pair of useRosterValueHistory calls can't
 * scale). Each side contributes a set of player ids; `baseline[i]` is a flat
 * value added to every point of side i — used to fold in future draft picks,
 * which have no per-day history of their own but still count toward the side's
 * total. Returns one HistoryPoint[] per side, index-aligned with `sides`.
 */
export function useMultiRosterValueHistory(
  sides: { playerIds: string[]; baseline?: number }[] | undefined
) {
  const key = (sides || [])
    .map((s) => `${[...s.playerIds].sort().join('.')}|${s.baseline ?? 0}`)
    .join(';');
  const allIds = [...new Set((sides || []).flatMap((s) => s.playerIds))];
  return useQuery({
    queryKey: ['multi-roster-value-history', key],
    enabled: !!allIds.length,
    queryFn: async () => {
      const rows = await fetchAllRows<{ player_id: string; date: string; value: number }>((from, to) =>
        supabase
          .from('player_value_history')
          .select('player_id, date, value')
          .in('player_id', allIds)
          .order('date', { ascending: true })
          .range(from, to)
      );

      // value[player_id][date] for quick per-side summing.
      const byPlayer = new Map<string, Map<string, number>>();
      for (const r of rows) {
        let m = byPlayer.get(r.player_id);
        if (!m) { m = new Map(); byPlayer.set(r.player_id, m); }
        m.set(r.date, r.value);
      }

      return (sides || []).map((side) => {
        const baseline = side.baseline ?? 0;
        const byDate = new Map<string, number>();
        for (const pid of side.playerIds) {
          const m = byPlayer.get(pid);
          if (!m) continue;
          for (const [date, value] of m) byDate.set(date, (byDate.get(date) || 0) + value);
        }
        // Fold the flat pick baseline into every dated point.
        const points = [...byDate.entries()]
          .map(([date, value]) => ({ date, value: value + baseline }))
          .sort((a, b) => a.date.localeCompare(b.date)) as HistoryPoint[];
        return points;
      });
    },
  });
}

/** Latest value per player within a date window (most recent wins). */
function latestPerPlayer(rows: { player_id: string; date: string; value: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) if (!map.has(r.player_id)) map.set(r.player_id, r.value);
  return map;
}

/**
 * Current and ~`daysAgo`-old KTC values for every player, both read from
 * player_value_history so the two endpoints share one basis (base superflex).
 * This is what "biggest movers" compares — using the TEP player_values for the
 * current end would make every TE look like a riser vs. the base history.
 * Fetches two narrow date windows to stay well under the row cap.
 */
export function useValueMovers(daysAgo: number) {
  return useQuery({
    queryKey: ['value-movers', daysAgo],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const now = new Date();
      const recentLo = new Date(now); recentLo.setDate(recentLo.getDate() - 4);
      const past = new Date(now); past.setDate(past.getDate() - daysAgo);
      const pastLo = new Date(past); pastLo.setDate(pastLo.getDate() - 4);
      const pastHi = new Date(past); pastHi.setDate(pastHi.getDate() + 3);

      const win = (loStr: string, hiStr: string) =>
        fetchAllRows<{ player_id: string; date: string; value: number }>((from, to) =>
          supabase
            .from('player_value_history')
            .select('player_id, date, value')
            .gte('date', loStr)
            .lte('date', hiStr)
            .order('date', { ascending: false })
            .range(from, to)
        );

      const [recentRows, pastRows] = await Promise.all([
        win(fmt(recentLo), fmt(now)),
        win(fmt(pastLo), fmt(pastHi)),
      ]);

      return { current: latestPerPlayer(recentRows), past: latestPerPlayer(pastRows) };
    },
  });
}

// PickResolution now lives in types/domain.ts so pure helpers (trade-shared) can
// consume it without importing this hook module.
export type { PickResolution } from '../types/domain';

/**
 * Resolve EVERY traded draft pick in the league in one cached blob, keyed
 * `${season}-${round}-${originalRosterId}`. This is the single source of truth
 * for "what did this pick become" — the trade detail page and the transactions
 * list both read from it so a used pick shows the same drafted player + value on
 * every surface.
 *
 * Past picks resolve to the drafted player via Sleeper's authoritative
 * draft_order / slot_to_roster_id → board mapping; future picks get a projected
 * Early/Mid/Late tier from the original owner's current roster-value rank.
 */
export function useLeaguePickResolutions() {
  return useQuery({
    queryKey: ['league-pick-resolutions'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const map = await resolveAllPicks();
      // Return a stable closure so callers read like `resolve(season, round, rosterId)`.
      return {
        map,
        resolve: (season: string | number, round: number, rosterId: number): PickResolution | undefined =>
          map.get(`${season}-${round}-${rosterId}`),
      };
    },
  });
}

/**
 * The pick-resolution engine, shared by {@link useLeaguePickResolutions} and
 * {@link useTradeDetail}. `pickFilter` lets a caller resolve only the picks of a
 * single trade (detail page) instead of the whole league.
 */
async function resolveAllPicks(
  pickFilter?: { season: string; round: number; roster_id: number }[]
): Promise<Map<string, PickResolution>> {
  const pickResolution = new Map<string, PickResolution>();

  // Which picks to resolve: a caller-supplied subset, or every traded pick in
  // the league (from the transactions table).
  let picks = pickFilter;
  if (!picks) {
    const txs = await fetchAllTransactions();
    const seen = new Set<string>();
    picks = [];
    for (const tx of txs) {
      for (const p of txDraftPicks(tx.draft_picks)) {
        const key = `${p.season}-${p.round}-${p.roster_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        picks.push({ season: String(p.season), round: Number(p.round), roster_id: Number(p.roster_id) });
      }
    }
  }
  if (!picks.length) return pickResolution;

  const seasons = [...new Set(picks.map((p) => String(p.season)))];
  const [{ data: leagues }, { data: drafts }] = await Promise.all([
    supabase.from('leagues').select('league_id, season').order('season', { ascending: false }),
    supabase.from('drafts').select('draft_id, league_id, season, status, draft_order, slot_to_roster_id').in('season', seasons),
  ]);
  const currentLeagueId = leagues?.[0]?.league_id ?? null;

  // Seasons whose rookie draft has already happened (pick → real player).
  const completedSeasons = new Set<string>();
  (drafts || []).forEach((d) => { if (d.status === 'complete') completedSeasons.add(String(d.season)); });

  // One usable draft per completed season, with whatever slot maps we have.
  const draftBySeason = new Map<string, { draft_id: string; league_id: string; draft_order: Record<string, number> | null; slotToRoster: Record<string, number> | null }>();
  (drafts || []).forEach((d) => {
    if (d.status === 'complete' && !draftBySeason.has(String(d.season))) {
      draftBySeason.set(String(d.season), {
        draft_id: d.draft_id,
        league_id: d.league_id,
        draft_order: (d.draft_order as Record<string, number> | null) ?? null,
        slotToRoster: (d.slot_to_roster_id as Record<string, number> | null) ?? null,
      });
    }
  });

  // Board selections for those drafts, keyed (draft_id, round, slot).
  const boardIds = [...draftBySeason.values()].map((d) => d.draft_id);
  const board = new Map<string, string>();
  if (boardIds.length) {
    const rows = await fetchAllRows<{ draft_id: string; round: number; draft_slot: number | null; player_id: string | null }>((from, to) =>
      supabase.from('draft_picks').select('draft_id, round, draft_slot, player_id').in('draft_id', boardIds).range(from, to)
    );
    rows.forEach((r) => { if (r.player_id != null && r.draft_slot != null) board.set(`${r.draft_id}-${r.round}-${r.draft_slot}`, r.player_id); });
  }

  // Rosters for the draft leagues (roster→user) + current league (standings for future tiers).
  const leagueIds = [...new Set([...[...draftBySeason.values()].map((d) => d.league_id), currentLeagueId].filter(Boolean) as string[])];
  const rosterRows = leagueIds.length
    ? (await supabase.from('rosters').select('league_id, roster_id, owner_id, wins, losses, fpts, players').in('league_id', leagueIds)).data || []
    : [];
  const userByRoster = new Map<string, string>(); // `${league_id}-${roster_id}` → owner_id
  rosterRows.forEach((r) => { if (r.owner_id) userByRoster.set(`${r.league_id}-${r.roster_id}`, r.owner_id); });
  const currentRosters = rosterRows.filter((r) => r.league_id === currentLeagueId);

  // Project future-pick tier from the ORIGINAL owner's total roster value,
  // ranked against the league: weakest roster (lowest value) drafts earliest
  // → "Early"; strongest → "Late".
  const tierByRoster = new Map<number, string>();
  if (currentRosters.length) {
    const pvRows = await fetchAllRows<{ player_id: string; value: number }>((from, to) =>
      supabase.from('player_values').select('player_id, value').range(from, to)
    );
    const valMap = new Map(pvRows.map((v) => [v.player_id, v.value]));
    const totals = currentRosters.map((r) => ({
      rosterId: r.roster_id,
      total: (r.players || []).reduce((s: number, pid: string) => s + (valMap.get(pid) || 0), 0),
    }));
    totals.sort((a, b) => a.total - b.total); // lowest value first → earliest pick
    const n = totals.length;
    totals.forEach((t, i) => {
      tierByRoster.set(t.rosterId, i < n / 3 ? 'Early' : i < (2 * n) / 3 ? 'Mid' : 'Late');
    });
  }

  for (const p of picks) {
    const key = `${p.season}-${p.round}-${p.roster_id}`;
    const season = String(p.season);
    const draft = draftBySeason.get(season);
    if (draft) {
      // Prefer the authoritative slot→roster map; fall back to draft_order (user→slot).
      let slot: number | undefined;
      if (draft.slotToRoster) {
        const hit = Object.keys(draft.slotToRoster).find((s) => Number(draft.slotToRoster![s]) === Number(p.roster_id));
        if (hit) slot = Number(hit);
      }
      if (slot == null && draft.draft_order) {
        const user = userByRoster.get(`${draft.league_id}-${p.roster_id}`);
        const s = user ? draft.draft_order[user] : undefined;
        if (s != null) slot = s;
      }
      const playerId = slot != null ? board.get(`${draft.draft_id}-${p.round}-${slot}`) : undefined;
      if (playerId) { pickResolution.set(key, { playerId, slot, future: false }); continue; }
    }
    // A completed draft exists but we couldn't pin the slot → past, unresolved
    // (no projection; the draft already happened). Otherwise it's a future pick.
    if (completedSeasons.has(season)) {
      pickResolution.set(key, { future: false });
    } else {
      pickResolution.set(key, { tier: tierByRoster.get(Number(p.roster_id)) ?? 'Mid', future: true });
    }
  }

  return pickResolution;
}

/**
 * A single trade by transaction_id, plus:
 *  - `latestValue`: most-recent player_value_history value per involved player
 *    (fallback when a player is missing from the current TEP player_values table).
 *  - `pickResolution`: for each traded pick, either the player it was used on
 *    (past picks, resolved via draft_order) or its projected tier (future picks).
 */
export function useTradeDetail(transactionId: string | undefined) {
  return useQuery({
    queryKey: ['trade-detail', transactionId],
    enabled: !!transactionId,
    queryFn: async () => {
      const { data: transaction } = await supabase
        .from('transactions')
        .select('*')
        .eq('transaction_id', transactionId!)
        .maybeSingle();

      const latestValue = new Map<string, number>();
      const pickResolution = new Map<string, PickResolution>();
      if (!transaction) return { transaction: null, latestValue, pickResolution };

      const tx = transaction as TransactionRow;
      const picks = txDraftPicks(tx.draft_picks);

      // ── Resolve picks (shared engine, scoped to just this trade's picks) ──
      if (picks.length > 0) {
        const resolved = await resolveAllPicks(
          picks.map((p) => ({ season: String(p.season), round: Number(p.round), roster_id: Number(p.roster_id) }))
        );
        resolved.forEach((v, k) => pickResolution.set(k, v));
      }

      // ── Latest history value per involved player (players + resolved picks) ──
      const involved = new Set<string>(Object.keys(playerMoves(tx.adds)));
      pickResolution.forEach((r) => { if (r.playerId) involved.add(r.playerId); });
      if (involved.size > 0) {
        const rows = await fetchAllRows<{ player_id: string; value: number; date: string }>((from, to) =>
          supabase
            .from('player_value_history')
            .select('player_id, value, date')
            .in('player_id', [...involved])
            .order('date', { ascending: false })
            .range(from, to)
        );
        for (const r of rows) if (!latestValue.has(r.player_id)) latestValue.set(r.player_id, r.value);
      }

      return { transaction: tx, latestValue, pickResolution };
    },
  });
}

/** All trades involving a roster, across every season. */
export function useTeamTrades(rosterId: number | undefined) {
  return useQuery({
    queryKey: ['team-trades', rosterId],
    enabled: rosterId !== undefined,
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('type', 'trade')
        .eq('status', 'complete')
        .contains('roster_ids', [rosterId!])
        .order('created', { ascending: true });
      return (data || []) as TransactionRow[];
    },
  });
}
