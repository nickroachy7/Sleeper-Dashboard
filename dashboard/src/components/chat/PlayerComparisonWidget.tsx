import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Check, TrendingUp, TrendingDown } from 'lucide-react';
import { PositionBadge } from '../PositionBadge';
import { useWidgetPlayers, type WidgetPlayer } from '../../hooks/chat-widgets';
import { recordPairwiseVote } from '../../lib/community-events';
import { getPlayerImageUrl } from '../../lib/trade-shared';

export interface PlayerComparisonProps {
  player_ids?: string[];
  invite_vote?: boolean;
  note?: string;
}

function fmt(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString();
}

function PlayerCard({
  p,
  selectable,
  chosen,
  dimmed,
  onChoose,
}: {
  p: WidgetPlayer;
  selectable: boolean;
  chosen: boolean;
  dimmed: boolean;
  onChoose: () => void;
}) {
  const trend = p.trend ?? 0;
  const card = (
    <div
      className={`relative flex flex-col items-center text-center rounded-xl border px-3 py-3 transition-colors ${
        chosen
          ? 'border-accent-500/60 bg-accent-500/10'
          : dimmed
          ? 'border-[#1b1b22] bg-[#101014] opacity-55'
          : 'border-[#2a2a34] bg-[#141419]'
      }`}
    >
      {chosen && (
        <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent-500 text-black flex items-center justify-center">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
      <img
        src={getPlayerImageUrl(p.player_id)}
        alt={p.full_name}
        loading="lazy"
        className="w-14 h-14 rounded-full object-cover object-top bg-[#1b1b22] mb-2"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
        }}
      />
      <Link
        to={`/players/${p.player_id}`}
        className="text-[13px] font-semibold text-white leading-tight hover:text-accent-500 transition-colors"
        onClick={(e) => selectable && e.preventDefault()}
      >
        {p.full_name}
      </Link>
      <div className="flex items-center gap-1.5 mt-1 mb-2">
        {p.position && <PositionBadge position={p.position} />}
        <span className="text-[11px] text-[#75757f]">
          {p.team ?? 'FA'}
          {p.age ? ` · ${p.age}y` : ''}
        </span>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="font-display text-xl font-bold text-white tabular-nums">{fmt(p.value)}</span>
        {trend !== 0 && (
          <span
            className={`flex items-center text-[10px] font-semibold ${
              trend > 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend).toLocaleString()}
          </span>
        )}
      </div>
      <span className="text-[10px] text-[#60606a] uppercase tracking-wide">community value</span>

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2 w-full text-[11px]">
        <span className="text-[#60606a] text-right">Overall</span>
        <span className="text-[#d6d6de] text-left">{p.rank ? `#${p.rank}` : '—'}</span>
        <span className="text-[#60606a] text-right">Pos</span>
        <span className="text-[#d6d6de] text-left">
          {p.position && p.position_rank ? `${p.position}${p.position_rank}` : '—'}
        </span>
        <span className="text-[#60606a] text-right">PPG{p.ppg_season ? ` '${String(p.ppg_season).slice(2)}` : ''}</span>
        <span className="text-[#d6d6de] text-left">{p.ppg != null ? p.ppg.toFixed(1) : '—'}</span>
      </div>
    </div>
  );

  if (!selectable) return card;
  return (
    <button type="button" onClick={onChoose} className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50 rounded-xl">
      {card}
    </button>
  );
}

export default function PlayerComparisonWidget({ player_ids, invite_vote, note }: PlayerComparisonProps) {
  const ids = (player_ids ?? []).slice(0, 4);
  const { data, isLoading } = useWidgetPlayers(ids);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ids.length) return null;

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-[#75757f] px-1 py-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading players…
      </div>
    );
  }

  const players = ids.map((id) => data.get(id)).filter((p): p is WidgetPlayer => !!p);
  if (!players.length) return null;

  const canVote = !!invite_vote && players.length >= 2;

  const choose = async (winner: WidgetPlayer) => {
    if (saving || chosenId) return;
    setChosenId(winner.player_id);
    setSaving(true);
    setError(null);
    try {
      // Winner preferred over each other shown player → one pairwise event each.
      for (const loser of players) {
        if (loser.player_id === winner.player_id) continue;
        await recordPairwiseVote({ winnerId: winner.player_id, loserId: loser.player_id });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your vote.');
      setChosenId(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#1b1b22] bg-[#0f0f13] p-3 my-1">
      {note && <p className="text-[12px] text-[#9c9ca7] mb-2.5 px-0.5">{note}</p>}

      <div className={`grid gap-2 ${players.length >= 3 ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2'}`}>
        {players.map((p) => (
          <PlayerCard
            key={p.player_id}
            p={p}
            selectable={canVote && !chosenId}
            chosen={chosenId === p.player_id}
            dimmed={!!chosenId && chosenId !== p.player_id}
            onChoose={() => choose(p)}
          />
        ))}
      </div>

      {canVote && (
        <div className="mt-2.5 pt-2.5 border-t border-[#1b1b22] text-center">
          {chosenId ? (
            <p className="flex items-center justify-center gap-1.5 text-[12px] text-accent-500">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {saving ? 'Saving…' : 'Thanks — your pick fed the community values.'}
            </p>
          ) : (
            <p className="text-[12px] text-[#75757f]">
              Who'd you rather keep? <span className="text-[#9c9ca7]">Tap one to vote.</span>
            </p>
          )}
          {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
        </div>
      )}
    </div>
  );
}
