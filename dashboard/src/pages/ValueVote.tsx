import { useCallback, useEffect, useMemo, useState } from 'react';
import { PlayersTabs } from '../components/PlayersTabs';
import { PositionBadge } from '../components/PositionBadge';
import { usePlayers, usePlayerValuesList } from '../hooks/queries';
import { getPlayerImageUrl } from '../lib/trade-shared';
import { recordPairwiseVote } from '../lib/community-events';
import type { Player } from '../types/domain';

const VOTABLE = new Set(['QB', 'RB', 'WR', 'TE']);

/**
 * Pairwise value voting — "who'd you rather keep?". Each tap records one
 * value_event; the community engine turns a stream of these into live values.
 *
 * Matchups are drawn from players of nearby value so the comparison is
 * meaningful (a genuine coin-flip teaches the model more than a blowout).
 */
export default function ValueVote() {
  const { data: players } = usePlayers();
  const { data: valueMap } = usePlayerValuesList();
  const [pair, setPair] = useState<[Player, Player] | null>(null);
  const [votes, setVotes] = useState(0);
  const [pending, setPending] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // Value-ranked pool of skill players we actually have a value for.
  const pool = useMemo(() => {
    if (!players || !valueMap) return [];
    return players
      .filter((p) => VOTABLE.has(p.position) && valueMap.has(p.player_id))
      .sort((a, b) => (valueMap.get(b.player_id) ?? 0) - (valueMap.get(a.player_id) ?? 0));
  }, [players, valueMap]);

  // Pick a player, then an opponent within a nearby value window.
  const nextPair = useCallback(() => {
    if (pool.length < 2) return;
    const i = Math.floor(Math.random() * pool.length);
    const window = 12;
    const lo = Math.max(0, i - window);
    const hi = Math.min(pool.length - 1, i + window);
    let j = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (j === i) j = j === hi ? Math.max(lo, i - 1) : j + 1;
    setPair([pool[i], pool[j]]);
  }, [pool]);

  useEffect(() => { if (pool.length && !pair) nextPair(); }, [pool, pair, nextPair]);

  const vote = async (winner: Player, loser: Player) => {
    if (pending) return;
    setPending(true);
    setFlash(winner.full_name);
    try {
      await recordPairwiseVote({ winnerId: winner.player_id, loserId: loser.player_id });
      setVotes((v) => v + 1);
    } catch (e) {
      // Surface the server's rate-limit message ("slow down…") when present.
      setFlash(e instanceof Error && e.message ? e.message : 'Could not save — try again');
    } finally {
      setTimeout(() => { setFlash(null); setPending(false); nextPair(); }, 260);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PlayersTabs />

      <p className="text-[13px] text-muted mb-4">Who'd you rather keep? Every pick trains the community values.</p>

      <div className="flex items-center justify-between text-[13px] text-muted mb-4">
        <span>{votes} {votes === 1 ? 'vote' : 'votes'} this session</span>
        <button
          onClick={nextPair}
          disabled={pending}
          className="text-accent-500 hover:text-accent-400 disabled:opacity-40"
        >
          Skip →
        </button>
      </div>

      {!pair ? (
        <div className="text-center text-muted py-20 text-[14px]">Loading matchup…</div>
      ) : (
        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3 sm:gap-5">
          <VoteCard player={pair[0]} highlighted={flash === pair[0].full_name} disabled={pending}
            onPick={() => vote(pair[0], pair[1])} />
          <div className="flex items-center justify-center text-muted text-[12px] font-medium tracking-widest uppercase">
            or
          </div>
          <VoteCard player={pair[1]} highlighted={flash === pair[1].full_name} disabled={pending}
            onPick={() => vote(pair[1], pair[0])} />
        </div>
      )}

      <p className="mt-8 text-center text-[12px] text-muted leading-relaxed max-w-md mx-auto">
        Values come from the community — real trades, trade-calculator checks, and
        votes like these — not from any outside site.
      </p>
    </div>
  );
}

function VoteCard({
  player, highlighted, disabled, onPick,
}: {
  player: Player; highlighted: boolean; disabled: boolean; onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      className={`group flex flex-col items-center rounded-[12px] border p-5 sm:p-7 transition-all
        ${highlighted
          ? 'border-accent-500 bg-accent-500/10 scale-[0.98]'
          : 'border-[#22222b] bg-[#141419] hover:border-accent-500 hover:bg-[#1b1b22]'}
        disabled:cursor-default`}
    >
      <img
        src={getPlayerImageUrl(player.player_id)}
        alt={player.full_name}
        loading="lazy"
        className="h-24 w-24 sm:h-28 sm:w-28 rounded-full object-cover object-top bg-[#101015] mb-3"
      />
      <span className="text-[15px] font-medium text-center leading-tight mb-2">
        {player.full_name}
      </span>
      <span className="flex items-center gap-1.5 text-muted">
        <PositionBadge position={player.position} />
        {player.team && <span className="text-[12px]">{player.team}</span>}
      </span>
    </button>
  );
}
