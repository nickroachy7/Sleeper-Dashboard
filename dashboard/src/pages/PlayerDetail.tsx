import { useParams, Link } from 'react-router-dom';
import { useMemo } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ValueChart } from '../components/charts/ValueChart';
import { PositionBadge } from '../components/PositionBadge';
import { usePlayerDetail, useLeagueDirectory } from '../hooks/detail';
import { getPlayerImageUrl, playerMoves, txDraftPicks } from '../lib/trade-shared';
import type { TransactionRow } from '../types/domain';

interface TimelineEvent {
  key: string;
  timestamp: number;
  season: string | null;
  kind: 'draft' | 'trade' | 'waiver' | 'free_agent' | 'commissioner';
  headline: string;
  detail?: string;
  teamRosterId?: number;
}

function txKind(type: string): TimelineEvent['kind'] {
  if (type === 'trade') return 'trade';
  if (type === 'waiver') return 'waiver';
  if (type === 'commissioner') return 'commissioner';
  return 'free_agent';
}

const KIND_BADGE: Record<TimelineEvent['kind'], { label: string; cls: string }> = {
  draft: { label: 'DRAFTED', cls: 'bg-amber-500/15 text-amber-400' },
  trade: { label: 'TRADE', cls: 'bg-white text-black' },
  waiver: { label: 'WAIVER', cls: 'bg-amber-500 text-black' },
  free_agent: { label: 'FREE AGENT', cls: 'bg-emerald-500 text-black' },
  commissioner: { label: 'COMMISH', cls: 'bg-[#555555] text-black' },
};

export default function PlayerDetail() {
  const { playerId } = useParams<{ playerId: string }>();
  const { data, isLoading } = usePlayerDetail(playerId);
  const { data: directory } = useLeagueDirectory();

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
      events.push({
        key: `draft-${pick.id}`,
        // No exact draft timestamp on the pick; anchor to the season for ordering
        timestamp: draft ? new Date(`${draft.season}-05-01`).getTime() : 0,
        season: draft?.season ?? null,
        kind: 'draft',
        headline: `Drafted ${pick.round}.${String(pick.pick_no - (pick.round - 1) * 12).padStart(2, '0')} by ${directory.teamName(pick.roster_id, draft?.league_id)}`,
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

      let headline: string;
      if (toRoster !== undefined && fromRoster !== undefined) {
        headline = `Traded from ${directory.teamName(fromRoster, tx.league_id)} to ${directory.teamName(toRoster, tx.league_id)}`;
      } else if (toRoster !== undefined) {
        headline = kind === 'trade'
          ? `Acquired by ${directory.teamName(toRoster, tx.league_id)} via trade`
          : `Added by ${directory.teamName(toRoster, tx.league_id)}`;
      } else {
        headline = `Dropped by ${directory.teamName(fromRoster, tx.league_id)}`;
      }

      let detail: string | undefined;
      if (kind === 'trade') {
        const others = Object.keys(adds).filter((p) => p !== playerId).length + txDraftPicks(tx.draft_picks).length;
        if (others > 0) detail = `Part of a ${others + 1}-asset trade`;
      } else if (kind === 'waiver') {
        const bid = (tx.settings as { waiver_bid?: number } | null)?.waiver_bid;
        if (bid !== undefined) detail = `$${bid} FAAB`;
      }

      events.push({
        key: `tx-${tx.transaction_id}`,
        timestamp: tx.created || 0,
        season: directory.seasonByLeague.get(tx.league_id) ?? null,
        kind,
        headline,
        detail,
        teamRosterId: toRoster ?? fromRoster,
      });
    });

    return events.sort((a, b) => b.timestamp - a.timestamp);
  }, [data, directory, playerId]);

  if (isLoading || !data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-4 mt-8">
        <div className="skeleton h-24 w-full rounded-xl" />
        <div className="skeleton h-64 w-full rounded-xl" />
        <div className="skeleton h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!data.player) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto text-center py-16">
        <p className="text-sm text-[#666666]">Player not found.</p>
        <Link to="/" className="text-xs text-accent-400 mt-2 inline-block">Back to Home</Link>
      </div>
    );
  }

  const { player, value, history } = data;
  const trend = value?.trend || 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <Link to="/ktc-values" className="inline-flex items-center gap-1.5 text-[11px] text-[#555555] hover:text-white transition-colors mb-4">
        <ArrowLeft className="h-3 w-3" /> Values
      </Link>

      {/* ── Header ── */}
      <div className="bg-[#0a0a0a] rounded-xl p-4 sm:p-5 mb-4">
        <div className="flex items-center gap-4">
          <img
            src={getPlayerImageUrl(player.player_id)}
            alt=""
            className="w-16 h-16 rounded-full bg-[#161616] object-cover shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight truncate">
                {player.full_name}
              </h1>
              <PositionBadge position={player.position || '?'} />
            </div>
            <p className="text-[11px] text-[#666666] mt-1">
              {player.team || 'Free Agent'}
              {player.age ? ` · ${player.age} yrs` : ''}
              {player.years_exp != null ? ` · ${player.years_exp === 0 ? 'Rookie' : `${player.years_exp} yr exp`}` : ''}
              {currentOwner && (
                <>
                  {' · owned by '}
                  <Link to={`/teams/${currentOwner.rosterId}`} className="text-accent-400 hover:text-accent-300 font-medium">
                    {currentOwner.name}
                  </Link>
                </>
              )}
              {!currentOwner && ' · unowned in league'}
            </p>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-[#111111] rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-[#555555] uppercase tracking-wider">KTC value</p>
            <p className="text-lg font-semibold text-white">{value ? value.value.toLocaleString() : '—'}</p>
          </div>
          <div className="bg-[#111111] rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-[#555555] uppercase tracking-wider">Rank</p>
            <p className="text-lg font-semibold text-white">
              {value?.rank ? `#${value.rank}` : '—'}
              {value?.position_rank && <span className="text-[11px] text-[#666666] ml-1.5">{player.position}{value.position_rank}</span>}
            </p>
          </div>
          <div className="bg-[#111111] rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-[#555555] uppercase tracking-wider">Trend</p>
            <p className={`text-lg font-semibold flex items-center gap-1 ${trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-red-400' : 'text-[#888888]'}`}>
              {trend > 0 ? <TrendingUp className="h-4 w-4" /> : trend < 0 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              {trend > 0 ? '+' : ''}{trend.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* ── Value history ── */}
      <div className="bg-[#0a0a0a] rounded-xl p-4 sm:p-5 mb-4">
        <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Value history</h2>
        <p className="text-[10px] text-[#555555] mb-3">KTC superflex value · weekly before the last 90 days, daily after</p>
        <ValueChart data={history} height={240} />
      </div>

      {/* ── Ownership timeline ── */}
      <div className="bg-[#0a0a0a] rounded-xl p-4 sm:p-5">
        <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3">League history</h2>
        {timeline.length === 0 ? (
          <p className="text-[11px] text-[#555555] py-4">
            No league events for this player — never drafted, traded, or moved on waivers.
          </p>
        ) : (
          <div className="space-y-0">
            {timeline.map((ev, i) => (
              <div key={ev.key} className={`flex items-start gap-3 py-3 ${i > 0 ? 'border-t border-[#111111]' : ''}`}>
                <span className={`px-2 py-0.5 text-[9px] font-extrabold tracking-[1px] rounded-sm shrink-0 mt-0.5 ${KIND_BADGE[ev.kind].cls}`}>
                  {KIND_BADGE[ev.kind].label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-white font-medium">
                    {ev.teamRosterId !== undefined ? (
                      <Link to={`/teams/${ev.teamRosterId}`} className="hover:text-accent-400 transition-colors">
                        {ev.headline}
                      </Link>
                    ) : ev.headline}
                  </p>
                  {ev.detail && <p className="text-[11px] text-[#666666] mt-0.5">{ev.detail}</p>}
                </div>
                <span className="text-[10px] text-[#555555] shrink-0 tabular-nums">
                  {ev.kind === 'draft'
                    ? ev.season
                    : ev.timestamp
                      ? new Date(ev.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : ev.season}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
