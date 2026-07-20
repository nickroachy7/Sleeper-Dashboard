import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, ChevronRight, Flame, Snowflake, BarChart3, Activity, ListChecks, ArrowRightLeft } from 'lucide-react';
import { ValueChart } from '../components/charts/ValueChart';
import { ProductionChart } from '../components/charts/ProductionChart';
import { PositionBadge } from '../components/PositionBadge';
import { SectionCard } from '../components/SectionCard';
import { StatTile } from '../components/StatTile';
import { Stat, StatStrip } from '../components/StatStrip';
import { TabBar } from '../components/TabBar';
import { Segmented } from '../components/ui';
import { PlayerRow } from '../components/PlayerRow';
import { usePlayerDetail, useLeagueDirectory, usePlayerFacts, usePlayerLeagueWeeks } from '../hooks/detail';
import { usePlayers, usePlayerValuesList, useTrending } from '../hooks/queries';
import { useUrlState } from '../hooks/useUrlState';
import { useActiveLeague } from '../lib/active-league';
import { getPlayerImageUrl, playerMoves, txDraftPicks, ordinalRound } from '../lib/trade-shared';
import type { TransactionRow, TradeAsset as EvalAsset } from '../types/domain';

/** "Ladd McConkey" → "L. McConkey" to match the compact transaction style. */
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length < 2 ? full : `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

interface TradeAsset { text: string; isPick: boolean; isSubject: boolean; }

interface TimelineEvent {
  key: string;
  timestamp: number;
  season: string | null;
  kind: 'draft' | 'trade' | 'waiver' | 'free_agent' | 'commissioner';
  headline: string;
  detail?: string;
  /** For trades: what the acquiring side received (+) vs gave up (−). */
  received?: TradeAsset[];
  sent?: TradeAsset[];
  teamRosterId?: number;
  transactionId?: string;
}

function txKind(type: string): TimelineEvent['kind'] {
  if (type === 'trade') return 'trade';
  if (type === 'waiver') return 'waiver';
  if (type === 'commissioner') return 'commissioner';
  return 'free_agent';
}

// All transaction types share one neutral badge — the label carries the meaning.
const BADGE_CLS = 'bg-overlay text-muted border border-[#2e2e38]';
const KIND_BADGE: Record<TimelineEvent['kind'], { label: string; cls: string }> = {
  draft: { label: 'DRAFTED', cls: BADGE_CLS },
  trade: { label: 'TRADE', cls: BADGE_CLS },
  waiver: { label: 'WAIVER', cls: BADGE_CLS },
  free_agent: { label: 'FREE AGENT', cls: BADGE_CLS },
  commissioner: { label: 'COMMISH', cls: BADGE_CLS },
};

// ── Outlook: a plain-English read of the player's value picture ────
// A transparent, rules-based paragraph built from the 30-day value trend, the
// player's market rank, his dynasty age window, and (when known) how recent
// on-field production compares to career norm. Heuristic read, not advice —
// the UI labels it as such.

function agingThresholdFor(position: string): number {
  if (position === 'RB') return 27;
  if (position === 'QB') return 34;
  if (position === 'TE') return 30;
  return 29; // WR / default
}

const POSITION_PLURAL: Record<string, string> = {
  QB: 'quarterbacks',
  RB: 'running backs',
  WR: 'receivers',
  TE: 'tight ends',
};

function computeOutlook(opts: {
  trend: number;
  position: string;
  age: number | null;
  rank?: number | null;
  positionRank?: number | null;
  lastPpg?: number | null;
  careerPpg?: number | null;
}): string {
  const { trend, position, age, rank, positionRank } = opts;
  const strongUp = trend >= 250, up = trend > 0;
  const strongDown = trend <= -250, down = trend < 0;
  const young = age != null && age <= 24;
  const aging = age != null && age >= agingThresholdFor(position);
  const posPlural = POSITION_PLURAL[position] ?? 'players at his position';

  const parts: string[] = [];

  const move = Math.abs(trend).toLocaleString();
  parts.push(
    strongUp ? `Value has jumped ${move} points over the last 30 days — one of the sharper climbs on the board.`
    : up ? `Value has ticked up ${move} points over the last 30 days.`
    : strongDown ? `Value has dropped ${move} points over the last 30 days — a slide worth watching.`
    : down ? `Value has slipped ${move} points over the last 30 days.`
    : 'Value has held steady over the last 30 days.',
  );

  if (rank && positionRank && position) {
    parts.push(`The market currently has him as the ${position}${positionRank}, #${rank} overall.`);
  }

  if (age != null) {
    const threshold = agingThresholdFor(position);
    parts.push(
      young ? `At ${age} he's on the right side of the age curve — ${posPlural} tend to hold dynasty value well into their ${threshold >= 30 ? 'early thirties' : 'late twenties'}, so his best years are likely still ahead.`
      : aging ? `At ${age} he's late in the dynasty window; ${posPlural} typically start shedding value around ${threshold}, so the age curve now works against him.`
      : `At ${age} he's squarely in his prime — past the early-career uncertainty, but still comfortably ahead of the age cliff for ${posPlural} (around ${threshold}).`,
    );
  }

  if (opts.lastPpg != null && opts.careerPpg && opts.careerPpg > 0) {
    const ratio = opts.lastPpg / opts.careerPpg;
    if (ratio >= 1.15) {
      parts.push(`On the field, his most recent season (${opts.lastPpg.toFixed(1)} PPG) outproduced his career norm of ${opts.careerPpg.toFixed(1)}, so recent production supports the price.`);
    } else if (ratio <= 0.85) {
      parts.push(`On the field, his most recent season (${opts.lastPpg.toFixed(1)} PPG) came in below his career norm of ${opts.careerPpg.toFixed(1)}, so the market is pricing more reputation than recent production.`);
    } else {
      parts.push(`His most recent season (${opts.lastPpg.toFixed(1)} PPG) landed right in line with his career norm.`);
    }
  }

  parts.push(
    aging && up ? 'Taken together: a veteran whose price is rising even as the age curve turns — a combination that historically does not stay elevated for long.'
    : aging && down ? 'Taken together: age and momentum are pointing the same direction here, and this profile rarely rebounds on its own.'
    : young && down ? 'Taken together: a young player in a value dip, with an age curve that gives him plenty of runway to recover.'
    : up ? 'Taken together: youth-adjusted momentum is on his side — the kind of profile the market tends to keep rewarding.'
    : down ? 'Taken together: the trend is soft, but nothing in the profile points to a structural decline yet.'
    : 'Taken together: a stable profile — nothing here suggests the market is about to reprice him in either direction.',
  );

  return parts.join(' ');
}

function OutlookCard({ blurb }: { blurb: string }) {
  return (
    <SectionCard label="Outlook" sub="Auto-generated read from value trend, age & production — not trade advice">
      <p className="text-[13px] text-ink-soft leading-relaxed">{blurb}</p>
    </SectionCard>
  );
}

type PlayerTab = 'overview' | 'production' | 'league';
const PLAYER_TABS: { id: PlayerTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'production', label: 'Production', icon: Activity },
  { id: 'league', label: 'League', icon: ListChecks },
];

export default function PlayerDetail() {
  const { playerId } = useParams<{ playerId: string }>();
  const { hasLeague } = useActiveLeague();
  const { data, isLoading } = usePlayerDetail(playerId);
  const { data: directory } = useLeagueDirectory();
  const { data: facts } = usePlayerFacts(playerId);
  const { data: leagueSeasons } = usePlayerLeagueWeeks(playerId);
  const { data: trending } = useTrending();
  const buzz = playerId && trending ? trending.lookup(playerId) : null;
  const { data: allPlayers } = usePlayers();
  const { data: playerValues } = usePlayerValuesList();

  // Only in-league seasons that have actually kicked off — a season whose league
  // has no games on record (offseason/future) is dropped so the pills don't
  // offer an empty year. Data-driven, so it appears once games are synced.
  const leagueSeasonsPlayed = useMemo(() => {
    if (!leagueSeasons?.length) return leagueSeasons;
    const started = new Set(
      (directory?.rosters ?? [])
        .filter((r) => (r.wins || 0) + (r.losses || 0) + (r.ties || 0) > 0)
        .map((r) => r.league_id),
    );
    // If we can't tell yet (no roster records loaded), don't hide anything.
    if (started.size === 0) return leagueSeasons;
    return leagueSeasons.filter((s) => started.has(s.leagueId));
  }, [leagueSeasons, directory]);

  // Default to the most recent played season; let the user pick any explicitly.
  const [pickedSeason, setPickedSeason] = useState<string | null>(null);
  const activeSeason = useMemo(() => {
    if (!leagueSeasonsPlayed?.length) return null;
    if (pickedSeason) return leagueSeasonsPlayed.find((s) => s.season === pickedSeason) ?? null;
    return leagueSeasonsPlayed.find((s) => s.weeks.some((w) => w.points > 0)) ?? leagueSeasonsPlayed[0];
  }, [leagueSeasonsPlayed, pickedSeason]);

  // Tabs: Overview + Production always; League only once a league is added.
  const { get, set } = useUrlState();
  const navigate = useNavigate();

  // "Trade" → open the Evaluator with this player pre-loaded on one side.
  const openTrade = () => {
    if (!data?.player) return;
    const asset: EvalAsset = {
      id: `player-${data.player.player_id}`,
      type: 'player',
      name: data.player.full_name ?? data.player.player_id,
      value: data.value?.value ?? 0,
      position: data.player.position ?? undefined,
      team: data.player.team ?? null,
    };
    const sides = [
      { rosterId: hasLeague ? currentOwner?.rosterId ?? 0 : 1, assets: [asset] },
      { rosterId: hasLeague ? 0 : 2, assets: [] },
    ];
    const league = get('league');
    navigate({ pathname: '/trade', search: league ? `?league=${league}` : '' }, { state: { initialTrade: { sides } } });
  };
  const tabs = useMemo(() => PLAYER_TABS.filter((t) => t.id !== 'league' || hasLeague), [hasLeague]);
  const requested = get('tab');
  const activeTab = (tabs.some((t) => t.id === requested) ? requested : 'overview') as PlayerTab;

  // Career production summary derived from the nflverse season facts.
  const career = useMemo(() => {
    if (!facts?.length) return null;
    const totalPts = facts.reduce((s, f) => s + (f.fantasy_total ?? 0), 0);
    const totalGames = facts.reduce((s, f) => s + (f.games ?? 0), 0);
    const best = facts.reduce((b, f) => ((f.fantasy_ppg ?? 0) > (b?.fantasy_ppg ?? -1) ? f : b), facts[0]);
    const draft = facts.find((f) => f.draft_round != null);
    return {
      ppg: totalGames ? totalPts / totalGames : 0,
      seasons: facts.length,
      totalGames,
      best,
      draftRound: draft?.draft_round ?? null,
      draftPick: draft?.draft_pick ?? null,
    };
  }, [facts]);
  const nameOf = useMemo(
    () => new Map((allPlayers ?? []).map((p) => [p.player_id, p.full_name])),
    [allPlayers],
  );

  // Auto-generated prose read from the value trend + dynasty age window.
  const outlook = useMemo((): string | null => {
    if (!data?.player || !data.value) return null;
    return computeOutlook({
      trend: data.value.trend ?? 0,
      position: data.player.position ?? '',
      age: data.player.age ?? null,
      rank: data.value.rank ?? null,
      positionRank: data.value.position_rank ?? null,
      lastPpg: facts?.length ? facts[facts.length - 1].fantasy_ppg : null,
      careerPpg: career?.ppg ?? null,
    });
  }, [data, facts, career]);

  // Comparable assets: the nearest-value players at the same position, for
  // trade context ("who trades straight-up for him").
  const comparables = useMemo(() => {
    const p = data?.player;
    const myVal = data?.value?.value ?? 0;
    if (!p || !allPlayers || !playerValues || !p.position || !myVal) return [];
    return allPlayers
      .filter((x) => x.player_id !== p.player_id && x.position === p.position)
      .map((x) => ({ player: x, value: playerValues.get(x.player_id) ?? 0 }))
      .filter((x) => x.value > 0)
      .sort((a, b) => Math.abs(a.value - myVal) - Math.abs(b.value - myVal))
      .slice(0, 5);
  }, [data, allPlayers, playerValues]);

  const currentOwner = useMemo(() => {
    if (!data || !directory) return null;
    const roster = data.owningRosters.find((r) => r.league_id === directory.currentLeagueId);
    return roster ? { rosterId: roster.roster_id, name: directory.teamName(roster.roster_id) } : null;
  }, [data, directory]);

  const timeline = useMemo((): TimelineEvent[] => {
    if (!data || !directory || !playerId) return [];
    const events: TimelineEvent[] = [];

    data.draftPicks.forEach((pick) => {
      const draft = pick.drafts as { season: string; league_id: string; type: string } | null;
      if (!pick.roster_id) return;
      // Round.slot from the pick's actual draft_slot (league size varies);
      // fall back to the overall pick number when the slot isn't recorded.
      const pickLabel = pick.draft_slot != null
        ? `${pick.round}.${String(pick.draft_slot).padStart(2, '0')}`
        : `#${pick.pick_no} overall`;
      events.push({
        key: `draft-${pick.id}`,
        // No exact draft timestamp on the pick; anchor to the season for ordering
        timestamp: draft ? new Date(`${draft.season}-05-01`).getTime() : 0,
        season: draft?.season ?? null,
        kind: 'draft',
        headline: `Drafted ${pickLabel} by ${directory.teamName(pick.roster_id, draft?.league_id)}`,
        detail: draft ? `${draft.season} ${draft.type === 'snake' ? 'startup' : 'rookie'} draft` : undefined,
        teamRosterId: pick.roster_id,
      });
    });

    data.transactions.forEach((tx: TransactionRow) => {
      const adds = playerMoves(tx.adds);
      const drops = playerMoves(tx.drops);
      const toRoster = adds[playerId];
      const fromRoster = drops[playerId];
      const kind = txKind(tx.type);

      // Always the manager's current team name, not the historical season's.
      let headline: string;
      if (toRoster !== undefined && fromRoster !== undefined) {
        headline = `Traded from ${directory.teamName(fromRoster)} to ${directory.teamName(toRoster)}`;
      } else if (toRoster !== undefined) {
        headline = kind === 'trade'
          ? `Acquired by ${directory.teamName(toRoster)} via trade`
          : `Added by ${directory.teamName(toRoster)}`;
      } else {
        headline = `Dropped by ${directory.teamName(fromRoster)}`;
      }

      let detail: string | undefined;
      let received: TradeAsset[] | undefined;
      let sent: TradeAsset[] | undefined;
      if (kind === 'trade' && toRoster !== undefined) {
        const picks = txDraftPicks(tx.draft_picks);
        // The acquiring team's package (+) vs the other side's package (−).
        // "Other side" = where this player came from (2-team) or everyone else.
        const isOther = (rid: number) => (fromRoster !== undefined ? rid === fromRoster : rid !== toRoster);
        const playerAssets = (side: 'to' | 'other'): TradeAsset[] =>
          Object.entries(adds)
            .filter(([, rid]) => (side === 'to' ? rid === toRoster : isOther(rid)))
            .map(([pid]) => ({ text: shortName(nameOf.get(pid) ?? pid), isPick: false, isSubject: pid === playerId }));
        const pickAssets = (side: 'to' | 'other'): TradeAsset[] =>
          picks
            .filter((p) => (side === 'to' ? p.owner_id === toRoster : isOther(p.owner_id)))
            .map((p) => ({ text: `${p.season} ${ordinalRound(p.round)}`, isPick: true, isSubject: false }));
        received = [...playerAssets('to'), ...pickAssets('to')];
        sent = [...playerAssets('other'), ...pickAssets('other')];
        if (!received.length && !sent.length) received = undefined;
      } else {
        // Add / drop / commish: show which player moved (this one), + or −.
        const self: TradeAsset = { text: shortName(nameOf.get(playerId) ?? playerId), isPick: false, isSubject: true };
        if (toRoster !== undefined) received = [self];
        else if (fromRoster !== undefined) sent = [self];
        if (kind === 'waiver') {
          const bid = (tx.settings as { waiver_bid?: number } | null)?.waiver_bid;
          if (bid !== undefined) detail = `$${bid} FAAB`;
        }
      }

      events.push({
        key: `tx-${tx.transaction_id}`,
        timestamp: tx.created || 0,
        season: directory.seasonByLeague.get(tx.league_id) ?? null,
        kind,
        headline,
        detail,
        received,
        sent,
        teamRosterId: toRoster ?? fromRoster,
        transactionId: kind === 'trade' ? tx.transaction_id : undefined,
      });
    });

    return events.sort((a, b) => b.timestamp - a.timestamp);
  }, [data, directory, playerId, nameOf]);

  // ── Journey map: the player's path through the league's teams ──
  // Fold the same draft/transaction history (oldest → newest) into stints:
  // each node is a team the player landed on, tagged with how and when.
  const journey = useMemo(() => {
    if (!data || !directory || !playerId) return [];
    type Hop = { rosterId: number | null; how: string; season: string | null; timestamp: number };
    const hops: Hop[] = [];

    data.draftPicks.forEach((pick) => {
      const draft = pick.drafts as { season: string; league_id: string } | null;
      if (!pick.roster_id) return;
      hops.push({
        rosterId: pick.roster_id,
        how: 'Drafted',
        season: draft?.season ?? null,
        timestamp: draft ? new Date(`${draft.season}-05-01`).getTime() : 0,
      });
    });

    const HOW: Record<TimelineEvent['kind'], string> = {
      draft: 'Drafted', trade: 'Trade', waiver: 'Waivers', free_agent: 'Free agent', commissioner: 'Commish',
    };
    data.transactions.forEach((tx: TransactionRow) => {
      const toRoster = playerMoves(tx.adds)[playerId];
      const fromRoster = playerMoves(tx.drops)[playerId];
      if (toRoster !== undefined) {
        hops.push({
          rosterId: toRoster,
          how: HOW[txKind(tx.type)],
          season: directory.seasonByLeague.get(tx.league_id) ?? null,
          timestamp: tx.created || 0,
        });
      } else if (fromRoster !== undefined) {
        // Dropped with no new team — a free-agency gap in the journey.
        hops.push({
          rosterId: null,
          how: 'Dropped',
          season: directory.seasonByLeague.get(tx.league_id) ?? null,
          timestamp: tx.created || 0,
        });
      }
    });

    hops.sort((a, b) => a.timestamp - b.timestamp);
    // Collapse repeats: consecutive hops on the same roster (e.g. commish
    // fix-ups) or back-to-back free-agency gaps read as one stop.
    return hops.filter((h, i) => i === 0 || h.rosterId !== hops[i - 1].rosterId);
  }, [data, directory, playerId]);

  if (isLoading || !data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-4">
        <div className="skeleton h-32 w-full rounded-2xl" />
        <div className="skeleton h-64 w-full rounded-2xl" />
        <div className="skeleton h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!data.player) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto text-center py-16">
        <p className="text-sm text-muted">Player not found.</p>
        <Link to="/" className="text-xs text-accent-400 mt-2 inline-block">Back to Home</Link>
      </div>
    );
  }

  const { player, value, history } = data;
  const trend = value?.trend || 0;

  const dateStr = (ts: number) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-4">
      {/* ── Header ── */}
      <section className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-[#16161c] via-[#141419] to-[#111116]">
        <div className="pointer-events-none absolute -top-20 -right-12 h-48 w-48 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="relative p-4 sm:p-6">
          {/* Floated so the text column below can use the full card width. */}
          <button
            onClick={openTrade}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 inline-flex items-center gap-1.5 rounded-lg bg-accent-500 hover:bg-accent-400 active:bg-accent-600 text-white text-[12px] font-semibold px-3 h-9 shadow-[0_0_10px_rgba(34,197,94,0.2)] transition-colors"
          >
            <ArrowRightLeft className="h-4 w-4" /> Trade
          </button>
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-overlay shrink-0 ring-1 ring-inset ring-white/10">
              <img
                src={getPlayerImageUrl(player.player_id)}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap pr-24">
                <h1 className="font-display text-xl sm:text-3xl font-bold text-white tracking-tight truncate">
                  {player.full_name}
                </h1>
                <PositionBadge position={player.position || '?'} size="sm" />
              </div>
              <p className="text-[12px] text-muted mt-1">
                {player.team || 'Free Agent'}
                {player.age ? ` · ${player.age} yrs` : ''}
                {player.years_exp != null ? ` · ${player.years_exp === 0 ? 'Rookie' : `${player.years_exp} yr exp`}` : ''}
              </p>
              {/* Ownership is league-specific — only shown once a league is added. */}
              {hasLeague && (
                <p className="text-[12px] text-faint mt-0.5 truncate">
                  {currentOwner ? (
                    <>
                      Owned by{' '}
                      <Link to={`/teams/${currentOwner.rosterId}`} className="text-accent-400 hover:text-accent-300 font-semibold">
                        {currentOwner.name}
                      </Link>
                    </>
                  ) : 'Unowned in league'}
                </p>
              )}
              {/* Community buzz — Sleeper-wide add/drop trend (universal signal) */}
              {buzz && (buzz.addCount > 0 || buzz.dropCount > 0) && (
                buzz.addCount >= buzz.dropCount ? (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-orange-500/12 border border-orange-500/25 px-2 py-0.5 text-[11px] font-semibold text-orange-300">
                    <Flame className="h-3 w-3" />
                    Trending add · {buzz.addCount.toLocaleString()} in 24h
                  </span>
                ) : (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-sky-500/12 border border-sky-500/25 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
                    <Snowflake className="h-3 w-3" />
                    Trending drop · {buzz.dropCount.toLocaleString()} in 24h
                  </span>
                )
              )}
            </div>
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-3 gap-2.5 mt-3">
            <StatTile label="YAP Value">
              {value ? value.value.toLocaleString() : '—'}
            </StatTile>
            <StatTile label="Rank" sub={value?.rank && value.position_rank ? `${player.position}${value.position_rank}` : undefined}>
              {value?.rank ? `#${value.rank}` : '—'}
            </StatTile>
            <StatTile
              label="30-day trend"
              valueClassName={trend > 0 ? 'text-accent-500' : trend < 0 ? 'text-red-400' : 'text-faint'}
            >
              {trend === 0 ? 'Flat' : (
                <span className="flex items-center gap-1">
                  {trend > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {trend > 0 ? '+' : ''}{trend.toLocaleString()}
                </span>
              )}
            </StatTile>
          </div>
        </div>
      </section>

      {/* ── Tab bar ── */}
      <TabBar tabs={tabs} active={activeTab} onChange={(id) => set('tab', id === 'overview' ? null : id)} />

      {/* ═══ OVERVIEW: outlook, market value trajectory, comparables ═══ */}
      {activeTab === 'overview' && (<>
        {outlook && <OutlookCard blurb={outlook} />}
        <SectionCard label="Value History" sub="YAP Value · seeded from prior seasons, updated by trades & votes">
          <ValueChart data={history} height={240} />
        </SectionCard>
        {comparables.length > 0 && (
          <SectionCard
            label="Comparable Value"
            sub={`Players closest to ${player.full_name}'s value at ${player.position} — straight-up trade targets`}
            flush
          >
            <div>
              {comparables.map((c) => (
                <PlayerRow
                  key={c.player.player_id}
                  playerId={c.player.player_id}
                  name={c.player.full_name}
                  position={c.player.position}
                  team={c.player.team}
                  value={c.value}
                  divided
                />
              ))}
            </div>
          </SectionCard>
        )}
      </>)}

      {/* ═══ PRODUCTION: career arc chart + weekly in-league rows ═══ */}
      {activeTab === 'production' && (<>
      {facts && facts.length > 0 && career ? (
        <SectionCard
          label="Career Arc"
          sub={`${career.ppg.toFixed(1)} career PPG · ${career.totalGames} games · ${
            career.draftRound != null ? `drafted Rd ${career.draftRound}, #${career.draftPick} overall` : 'undrafted'
          } · PPR`}
        >
          <ProductionChart data={facts} height={150} />
        </SectionCard>
      ) : (
        <SectionCard label="Career Arc">
          <p className="text-[12px] text-faint py-6 text-center">No NFL production on record yet.</p>
        </SectionCard>
      )}

      {/* Weekly Scoring is league-scoped. Show a clear empty state rather than
          silently dropping it, so the Production tab never looks half-empty. */}
      {(!hasLeague || !activeSeason || activeSeason.games === 0) && (
        <SectionCard label="Weekly Scoring">
          <p className="text-[12px] text-faint py-6 text-center">
            {hasLeague
              ? 'No weekly scoring yet — this season hasn’t been played in your league.'
              : 'Add your league to see week-by-week scoring and start/sit history.'}
          </p>
        </SectionCard>
      )}

      {hasLeague && activeSeason && activeSeason.games > 0 && (
        <SectionCard
          label="Weekly Scoring"
          sub={`In this league's scoring · ${activeSeason.season} season`}
          right={leagueSeasonsPlayed && leagueSeasonsPlayed.length > 1 ? (
            <Segmented
              size="sm"
              layout="inline"
              value={activeSeason?.season ?? ''}
              onChange={(season) => setPickedSeason(season)}
              options={[...leagueSeasonsPlayed].reverse().map((s) => ({ value: s.season, label: s.season }))}
            />
          ) : undefined}
        >
          <StatStrip>
            <Stat label="Avg / week">{activeSeason.avg.toFixed(1)}</Stat>
            <Stat label="Best" sub={activeSeason.best ? `Wk ${activeSeason.best.week}` : undefined}>
              {activeSeason.best ? activeSeason.best.points.toFixed(1) : '—'}
            </Stat>
            <Stat label="Worst" sub={activeSeason.worst ? `Wk ${activeSeason.worst.week}` : undefined}>
              {activeSeason.worst ? activeSeason.worst.points.toFixed(1) : '—'}
            </Stat>
            <Stat
              label="Consistency"
              hint="Week-to-week scoring spread (standard deviation). Steady = reliable weekly floor; boom/bust = big swings."
            >
              <span className="text-[15px]">{activeSeason.stdev <= activeSeason.avg * 0.45 ? 'Steady' : 'Boom/bust'}</span>
            </Stat>
            <Stat label="Start rate" hint="Share of rostered weeks the owning team put this player in their starting lineup.">
              {Math.round(activeSeason.startRate * 100)}%
            </Stat>
          </StatStrip>
          {/* One row per week: points bar scaled to the season's best week;
              green = started, gray = scored on the bench. */}
          <div className="mt-4 border-t border-line-subtle">
            {activeSeason.weeks.map((w) => {
              const max = Math.max(activeSeason.best?.points ?? 0, 1);
              const pct = Math.max((Math.max(w.points, 0) / max) * 100, 2);
              return (
                <div key={w.week} className="flex items-center gap-3 py-1.5 border-b border-line-subtle last:border-b-0">
                  <span className="w-10 shrink-0 text-[11px] text-faint font-semibold tabular-nums">Wk {w.week}</span>
                  <div className="flex-1 h-4 rounded-sm bg-[#101015]/60 overflow-hidden">
                    <div
                      className={`h-full rounded-sm ${w.started ? 'bg-accent-500/80' : 'bg-[#3f3f46]'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right font-display text-[13px] font-bold text-white tabular-nums">
                    {w.points.toFixed(1)}
                  </span>
                  <span className={`w-14 shrink-0 text-right text-[10px] font-semibold ${w.started ? 'text-accent-400' : 'text-ghost'}`}>
                    {w.started ? 'Started' : 'Benched'}
                  </span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}
      </>)}

      {/* ═══ LEAGUE: journey map + transaction history ═══ */}
      {activeTab === 'league' && hasLeague && (<>
      {/* ── Journey map: every team stop, oldest → newest ── */}
      {journey.length > 0 && (
        <SectionCard label="Journey" sub="The player's path through this league">
          {/* Vertical stepper: dot + connecting rail per stop, so any journey
              length fits the card width with no horizontal scrolling. */}
          <div>
            {journey.map((stop, i) => {
              const isLast = i === journey.length - 1;
              const isTeam = stop.rosterId != null;
              const row = (
                <>
                  <span className="relative flex flex-col items-center self-stretch w-3 shrink-0">
                    <span className={`w-px flex-1 ${i === 0 ? 'bg-transparent' : 'bg-[#2e2e38]'}`} />
                    <span className={`h-2 w-2 rounded-full shrink-0 ${
                      isLast ? 'bg-accent-500' : isTeam ? 'bg-[#4c4c56]' : 'border border-dashed border-[#4c4c56]'
                    }`} />
                    <span className={`w-px flex-1 ${isLast ? 'bg-transparent' : 'bg-[#2e2e38]'}`} />
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-[13px] font-semibold transition-colors ${
                    isLast && isTeam ? 'text-accent-400' : isTeam ? 'text-ink-soft group-hover:text-white' : 'text-faint'
                  }`}>
                    {isTeam ? directory!.teamName(stop.rosterId!) : 'Free agency'}
                  </span>
                  <span className="shrink-0 text-[9px] text-faint uppercase tracking-[0.08em] font-bold tabular-nums">
                    {isTeam ? stop.how : 'Dropped'}{stop.season ? ` · ${stop.season}` : ''}
                  </span>
                </>
              );
              const rowCls = 'flex items-center gap-2.5 py-0.5 min-h-[30px]';
              return isTeam ? (
                <Link
                  key={`${stop.timestamp}-${stop.rosterId}`}
                  to={`/teams/${stop.rosterId}`}
                  className={`${rowCls} group`}
                >
                  {row}
                </Link>
              ) : (
                <div key={`${stop.timestamp}-fa`} className={rowCls}>{row}</div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* ── League history timeline ── */}
      <section className="bg-surface rounded-2xl border border-line overflow-hidden">
        <div className="px-4 sm:px-5 pt-4 pb-2">
          <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">League History</p>
        </div>
        {timeline.length === 0 ? (
          <p className="text-[12px] text-faint px-4 sm:px-5 pb-5">
            No league events for this player — never drafted, traded, or moved on waivers.
          </p>
        ) : (
          <div>
            {timeline.map((ev, idx) => {
              const inner = (
                <>
                  <span className={`px-2 py-0.5 text-[9px] font-extrabold tracking-[1px] rounded shrink-0 mt-0.5 ${KIND_BADGE[ev.kind].cls}`}>
                    {KIND_BADGE[ev.kind].label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-white font-medium leading-snug">{ev.headline}</p>
                    {ev.detail && <p className="text-[11px] text-faint mt-0.5">{ev.detail}</p>}
                    {(ev.received?.length || ev.sent?.length) ? (
                      // Two columns when a trade has both sides; a single left
                      // column for a one-sided add/drop.
                      <div className={ev.received?.length && ev.sent?.length ? 'mt-2 grid grid-cols-2 gap-x-3 gap-y-1' : 'mt-1.5'}>
                        <div className="space-y-1">
                          {ev.received?.map((a, i) => (
                            <div key={`r${i}`} className="flex items-baseline gap-1.5 text-[12px] leading-tight">
                              <span className="text-emerald-400 font-bold shrink-0">+</span>
                              <span className={`truncate ${a.isSubject ? 'text-white font-medium' : a.isPick ? 'text-muted' : 'text-ink-soft'}`}>{a.text}</span>
                            </div>
                          ))}
                        </div>
                        {ev.sent?.length ? (
                          <div className="space-y-1">
                            {ev.sent.map((a, i) => (
                              <div key={`s${i}`} className="flex items-baseline gap-1.5 text-[12px] leading-tight">
                                <span className="text-red-400 font-bold shrink-0">−</span>
                                <span className={`truncate ${a.isSubject ? 'text-white font-medium' : a.isPick ? 'text-faint' : 'text-muted'}`}>{a.text}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <span className="text-[10px] text-ghost shrink-0 tabular-nums mt-0.5">
                    {ev.kind === 'draft' ? ev.season : ev.timestamp ? dateStr(ev.timestamp) : ev.season}
                  </span>
                  {ev.transactionId && <ChevronRight className="h-4 w-4 text-[#4c4c56] group-hover:text-accent-400 shrink-0 mt-0.5 transition-colors" />}
                </>
              );
              const stripe = idx % 2 === 1 ? 'bg-[#17171d]' : '';
              const rowCls = `group flex items-start gap-3 px-4 sm:px-5 py-3 border-t border-line-subtle transition-colors ${stripe}`;
              return ev.transactionId ? (
                <Link key={ev.key} to={`/trades/${ev.transactionId}`} className={`${rowCls} hover:bg-elevated active:bg-overlay`}>
                  {inner}
                </Link>
              ) : ev.teamRosterId !== undefined ? (
                <Link key={ev.key} to={`/teams/${ev.teamRosterId}`} className={`${rowCls} hover:bg-elevated active:bg-overlay`}>
                  {inner}
                </Link>
              ) : (
                <div key={ev.key} className={rowCls}>{inner}</div>
              );
            })}
          </div>
        )}
      </section>
      </>)}
    </div>
  );
}
