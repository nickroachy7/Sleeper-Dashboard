import { useMemo, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Users, Sparkles, Swords, Check, Trophy } from 'lucide-react';
import { usePlayerMap } from '../hooks/useLeagueData';
import { usePlayerValuesList, usePickValues } from '../hooks/queries';
import { useMultiLeagueFeed, type MultiLeagueFeedData } from '../hooks/useMultiLeagueFeed';
import { useVoteMatchups } from '../hooks/useVoteMatchups';
import { recordPairwiseVote } from '../lib/community-events';
import { TradeCard as SharedTradeCard, type TradeSide } from './TradeCard';
import { PlayerRow } from './PlayerRow';
import { PositionBadge } from './PositionBadge';
import { analyzeTrade } from '../lib/trade-value-adjustment';
import {
  lookupPickValue,
  formatResolvedPick,
  playerMoves,
  txDraftPicks,
  getPlayerImageUrl,
  type TxDraftPick,
} from '../lib/trade-shared';
import type { Player, Fairness, TradeAsset } from '../types/domain';

// ── Feed item model ───────────────────────────────────────────────
// The feed is a reverse-chron stream of typed items. It's league-NEUTRAL:
// activity is aggregated across ALL of the user's leagues, so every activity
// item carries its own `leagueId`/`leagueName` for a per-item league badge.
// The union stays deliberately open so future item kinds — trending trades,
// discussions — slot in as new `kind`s the renderer switches on. `sortKey`
// (ms) orders everything.

interface TradeTeam { rosterId: number; teamName: string; ownerName: string; }

export interface FeedTradeItem {
  kind: 'trade';
  id: string;
  sortKey: number;
  date: string;
  leagueId: string;
  leagueName: string;
  sides: TradeSide[];
  fairness?: Fairness;
}
export interface FeedMoveItem {
  kind: 'move';
  id: string;
  sortKey: number;
  date: string;
  leagueId: string;
  leagueName: string;
  moveType: string; // 'waiver' | 'free_agent' | 'commissioner' | …
  team: TradeTeam | null;
  adds: string[];
  drops: string[];
}
export interface FeedVoteItem {
  kind: 'vote';
  id: string;
  a: Player;
  b: Player;
}
export type FeedItem = FeedTradeItem | FeedMoveItem | FeedVoteItem;

const FEED_LIMIT = 50;
// A vote CTA every ~N activity items — the "core rhythm" — and if activity is
// sparse (e.g. offseason) we top up with extra CTAs so the feed never feels
// dead. Both are tunable knobs for the future live-signal-driven version.
const CTA_EVERY = 4;
const MIN_CTAS = 3;
// Only badge a trade/move with its league when the user follows more than one —
// in a single-league feed the league name is just noise.
function showLeagueBadges(items: (FeedTradeItem | FeedMoveItem)[]): boolean {
  const distinct = new Set(items.map((i) => i.leagueName));
  return distinct.size > 1;
}

/**
 * The activity feed for the Feed page — a social-style reverse-chron stream of
 * trades and roster moves across ALL the user's leagues. This is the "what's
 * happening in my leagues right now" surface; League → Transactions remains the
 * per-league filterable archive.
 */
export function LeagueFeed() {
  const { data: players } = usePlayerMap();
  const { data: playerValues } = usePlayerValuesList();
  const { data: pickValuesData } = usePickValues();
  const { data: feedData, isLoading } = useMultiLeagueFeed();

  const getPlayer = useCallback(
    (pid: string) => (players instanceof Map ? players.get(pid) : undefined),
    [players]
  );
  const getPlayerValue = useCallback(
    (pid: string): number => (playerValues instanceof Map ? playerValues.get(pid) : 0) || 0,
    [playerValues]
  );

  const resolvePickDisplay = useCallback((pick: TxDraftPick, leagueId: string) => {
    const resolution = feedData?.resolvePick(pick, leagueId);
    return formatResolvedPick(pick, resolution, {
      pickValues: pickValuesData || [],
      origTeamName: feedData?.teamName(pick.roster_id, leagueId),
      playerValue: (pid) => getPlayerValue(pid) || undefined,
      playerName: (pid) => (players instanceof Map ? players.get(pid)?.full_name : undefined),
    });
  }, [feedData, pickValuesData, getPlayerValue, players]);

  const activity = useMemo<(FeedTradeItem | FeedMoveItem)[]>(() => {
    if (!feedData) return [];
    const { transactions, teamName, leagueName } = feedData;
    const items: (FeedTradeItem | FeedMoveItem)[] = [];

    for (const tx of transactions) {
      const lid = tx.league_id;
      const ts = tx.created || tx.status_updated || (tx.created_at ? new Date(tx.created_at).getTime() : 0);
      const date = new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const rosterIds = tx.roster_ids ?? [];

      if (tx.type === 'trade') {
        const teams: TradeTeam[] = rosterIds.map((rid) => ({ rosterId: rid, teamName: teamName(rid, lid), ownerName: '' }));
        if (teams.length < 2) continue;

        // Group each side's received players + picks (same shape the archive uses).
        const byRoster: Record<number, { players: string[]; picks: TxDraftPick[] }> = {};
        teams.forEach((t) => { byRoster[t.rosterId] = { players: [], picks: [] }; });
        Object.entries(playerMoves(tx.adds)).forEach(([pid, rid]) => { if (byRoster[rid]) byRoster[rid].players.push(pid); });
        txDraftPicks(tx.draft_picks).forEach((pk) => { if (pk.owner_id && byRoster[pk.owner_id]) byRoster[pk.owner_id].picks.push(pk); });

        const assetsFor = (rid: number): TradeAsset[] => {
          const a = byRoster[rid] ?? { players: [], picks: [] };
          return [
            ...a.players.map((pid) => {
              const p = getPlayer(pid);
              return { id: `player-${pid}`, type: 'player' as const, name: p?.full_name || pid, value: getPlayerValue(pid), position: p?.position || '?', team: p?.team || null };
            }),
            ...a.picks.map((pk) => {
              const r = resolvePickDisplay(pk, lid);
              return { id: `pick-${pk.season}-${pk.round}-${pk.roster_id}`, type: 'pick' as const, name: r.name, value: r.value };
            }),
          ];
        };

        const sideAssets = teams.map((t) => assetsFor(t.rosterId));
        const analysis = sideAssets.length >= 2 ? analyzeTrade(sideAssets[0], sideAssets[1]) : null;

        const sides: TradeSide[] = teams.map((t, idx) => {
          const a = byRoster[t.rosterId] ?? { players: [], picks: [] };
          const sideResult = analysis ? (idx === 0 ? analysis.side1 : analysis.side2) : null;
          return {
            rosterId: t.rosterId,
            teamName: t.teamName,
            players: a.players.map((pid) => {
              const p = getPlayer(pid);
              return { id: pid, name: p?.full_name || pid, position: p?.position || '?', team: p?.team || null, value: getPlayerValue(pid) };
            }),
            picks: a.picks.map((pk) => {
              const r = resolvePickDisplay(pk, lid);
              return { season: pk.season, round: pk.round, name: r.name, subtitle: r.subtitle, playerId: r.playerId, value: r.value ?? lookupPickValue(pickValuesData || [], pk.season, pk.round) };
            }),
            totalValue: sideAssets[idx].reduce((s, x) => s + x.value, 0),
            adjustedValue: sideResult?.adjustedTotal,
          };
        });

        items.push({ kind: 'trade', id: tx.transaction_id, sortKey: ts, date, leagueId: lid, leagueName: leagueName(lid), sides, fairness: analysis?.fairness });
      } else {
        const adds = Object.keys(playerMoves(tx.adds));
        const drops = Object.keys(playerMoves(tx.drops));
        if (!adds.length && !drops.length) continue;
        const rid = rosterIds[0];
        items.push({
          kind: 'move', id: tx.transaction_id, sortKey: ts, date, leagueId: lid, leagueName: leagueName(lid),
          moveType: tx.type,
          team: rid != null ? { rosterId: rid, teamName: teamName(rid, lid), ownerName: '' } : null,
          adds, drops,
        });
      }
    }

    return items.sort((a, b) => b.sortKey - a.sortKey).slice(0, FEED_LIMIT);
  }, [feedData, getPlayer, getPlayerValue, resolvePickDisplay, pickValuesData]);

  // How many vote CTAs to weave in: one per CTA_EVERY activity items, but at
  // least MIN_CTAS so a quiet/offseason feed still has something live. Seed the
  // matchups off the activity count so they're stable within a render but vary
  // as the feed changes.
  const ctaCount = Math.max(MIN_CTAS, Math.floor(activity.length / CTA_EVERY));
  const matchups = useVoteMatchups(ctaCount, activity.length);
  const badges = showLeagueBadges(activity);

  // Interleave: after every CTA_EVERY activity items, drop in the next CTA. Any
  // leftover CTAs (when activity is sparse) are appended so none are lost.
  const feed = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    let m = 0;
    activity.forEach((item, i) => {
      out.push(item);
      if ((i + 1) % CTA_EVERY === 0 && m < matchups.length) {
        out.push({ kind: 'vote', id: matchups[m].id, a: matchups[m].a, b: matchups[m].b });
        m++;
      }
    });
    while (m < matchups.length) {
      out.push({ kind: 'vote', id: matchups[m].id, a: matchups[m].a, b: matchups[m].b });
      m++;
    }
    return out;
  }, [activity, matchups]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-28 w-full rounded-2xl" />)}
      </div>
    );
  }

  if (feed.length === 0) {
    return (
      <div className="rounded-2xl border border-[#22222b] bg-[#141419] p-8 text-center">
        <div className="w-11 h-11 rounded-2xl bg-accent-500/10 flex items-center justify-center mx-auto mb-3">
          <Sparkles className="h-5 w-5 text-accent-500" />
        </div>
        <p className="text-[14px] font-semibold text-white">No activity yet</p>
        <p className="text-[12px] text-[#75757f] mt-1">Trades and roster moves in your leagues will show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {feed.map((item) => <FeedItemView key={`${item.kind}-${item.id}`} item={item} showBadge={badges} getPlayer={getPlayer} getPlayerValue={getPlayerValue} teamAvatar={feedData?.teamAvatar} />)}
    </div>
  );
}

// ── Item renderer ─────────────────────────────────────────────────
// One switch over the feed-item union — the extension point for future kinds.

function LeagueBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent-500/10 text-accent-400 text-[9px] font-bold tracking-[0.5px] uppercase max-w-[45vw] truncate">
      <Trophy className="h-2.5 w-2.5 shrink-0" /> {name}
    </span>
  );
}

function FeedItemView({ item, showBadge, getPlayer, getPlayerValue, teamAvatar }: {
  item: FeedItem;
  showBadge: boolean;
  getPlayer: (pid: string) => { full_name: string; position: string; team: string | null } | undefined;
  getPlayerValue: (pid: string) => number;
  teamAvatar: MultiLeagueFeedData['teamAvatar'] | undefined;
}) {
  if (item.kind === 'trade') {
    return (
      <div>
        {showBadge && <div className="px-1.5 pb-1.5"><LeagueBadge name={item.leagueName} /></div>}
        <Link to={`/trades/${item.id}`} className="block">
          <SharedTradeCard sides={item.sides} date={item.date} fairness={item.fairness} />
        </Link>
      </div>
    );
  }

  if (item.kind === 'vote') {
    return <VoteFeedCard a={item.a} b={item.b} />;
  }

  const label = item.moveType === 'free_agent' ? 'FREE AGENT' : item.moveType === 'waiver' ? 'WAIVER' : item.moveType.toUpperCase();
  const avatar = item.team && teamAvatar ? teamAvatar(item.team.rosterId, item.leagueId) : null;
  const total = item.adds.length + item.drops.length;

  return (
    <div>
      <div className="flex items-center gap-2 px-1.5 pb-2 text-[11px] text-[#75757f]">
        <span className="px-1.5 py-0.5 bg-[#1b1b22] text-[#9c9ca7] text-[9px] font-bold tracking-[1px] rounded">{label}</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{item.date}</span>
        {showBadge && <span className="ml-auto"><LeagueBadge name={item.leagueName} /></span>}
      </div>
      <div className="bg-[#141419] rounded-2xl overflow-hidden border border-[#22222b] card-hover">
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#1b1b22]">
          {avatar ? (
            <img src={avatar} alt="" className="w-7 h-7 rounded-full bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
          ) : (
            <div className="w-7 h-7 rounded-full bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center"><Users className="h-3.5 w-3.5 text-[#60606a]" /></div>
          )}
          <span className="font-display text-sm font-bold text-white truncate">{item.team?.teamName || 'Unknown'}</span>
          <span className="text-[10px] text-[#60606a]">{total} move{total !== 1 ? 's' : ''}</span>
        </div>
        <div className="py-1">
          {item.adds.map((pid) => {
            const p = getPlayer(pid);
            return <PlayerRow key={`a-${pid}`} playerId={pid} name={p?.full_name || pid} position={p?.position} team={p?.team} value={getPlayerValue(pid)} prefix={<span className="text-accent-400 font-bold text-[13px]">+</span>} dim />;
          })}
          {item.drops.map((pid) => {
            const p = getPlayer(pid);
            return <PlayerRow key={`d-${pid}`} playerId={pid} name={p?.full_name || pid} position={p?.position} team={p?.team} value={getPlayerValue(pid)} prefix={<span className="text-red-400 font-bold text-[13px]">−</span>} dim />;
          })}
        </div>
      </div>
    </div>
  );
}

// ── Vote CTA card ─────────────────────────────────────────────────
// An inline "who'd you rather keep?" that records one pairwise value event —
// the same signal as the Rank 'Em page — so the feed feeds the community values
// (and keeps a quiet/offseason feed alive). Once voted, it shows a thank-you.

function VoteFeedCard({ a, b }: { a: Player; b: Player }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const vote = async (winner: Player, loser: Player) => {
    if (pending || picked) return;
    setPending(true);
    setPicked(winner.player_id);
    try {
      await recordPairwiseVote({ winnerId: winner.player_id, loserId: loser.player_id });
    } catch {
      setPicked(null); // let them try again on failure
    } finally {
      setPending(false);
    }
  };

  const side = (p: Player, other: Player) => {
    const chosen = picked === p.player_id;
    const dimmed = picked && !chosen;
    return (
      <button
        onClick={() => vote(p, other)}
        disabled={!!picked || pending}
        className={`group flex-1 min-w-0 flex flex-col items-center rounded-xl border p-3 transition-all disabled:cursor-default ${
          chosen ? 'border-accent-500 bg-accent-500/10'
          : dimmed ? 'border-[#1b1b22] bg-[#101015] opacity-50'
          : 'border-[#22222b] bg-[#141419] hover:border-accent-500/60 hover:bg-[#1b1b22]'
        }`}
      >
        <img
          src={getPlayerImageUrl(p.player_id)}
          alt={p.full_name}
          loading="lazy"
          className="h-14 w-14 rounded-full object-cover object-top bg-[#101015] mb-2"
        />
        <span className="text-[13px] font-semibold text-white text-center leading-tight truncate max-w-full">{p.full_name}</span>
        <span className="mt-1 flex items-center gap-1.5">
          <PositionBadge position={p.position} />
          {p.team && <span className="text-[11px] text-[#75757f]">{p.team}</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="rounded-2xl border border-accent-500/20 bg-accent-500/[0.04] p-3">
      <div className="flex items-center justify-between gap-2 mb-2.5 px-0.5">
        <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] uppercase text-accent-400">
          <Swords className="h-3.5 w-3.5" /> Who'd you rather keep?
        </span>
        {picked ? (
          <span className="flex items-center gap-1 text-[11px] text-[#75757f]"><Check className="h-3.5 w-3.5 text-accent-500" /> Thanks — that trains the values</span>
        ) : (
          <Link to="/trade?tab=rank" className="text-[11px] text-[#75757f] hover:text-accent-400 transition-colors">More →</Link>
        )}
      </div>
      <div className="flex items-stretch gap-2.5">
        {side(a, b)}
        <div className="flex items-center text-[11px] font-medium uppercase tracking-widest text-[#4c4c56]">or</div>
        {side(b, a)}
      </div>
    </div>
  );
}
