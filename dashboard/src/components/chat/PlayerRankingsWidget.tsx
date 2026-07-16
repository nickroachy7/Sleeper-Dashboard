import { useEffect, useState } from 'react';
import { Loader2, Check, ChevronUp, ChevronDown, ListOrdered, X } from 'lucide-react';
import { PlayerRow } from '../PlayerRow';
import { useWidgetPlayers } from '../../hooks/chat-widgets';
import { recordPairwiseVote } from '../../lib/community-events';

export interface PlayerRankingsProps {
  player_ids?: string[];
  title?: string;
  allow_rerank?: boolean;
}

export default function PlayerRankingsWidget({ player_ids, title, allow_rerank }: PlayerRankingsProps) {
  const ids = (player_ids ?? []).slice(0, 15);
  const { data, isLoading } = useWidgetPlayers(ids);

  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<string[]>(ids);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the working order whenever the model's list changes.
  useEffect(() => {
    setOrder(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);

  if (!ids.length) return null;

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-[#75757f] px-1 py-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading rankings…
      </div>
    );
  }

  const get = (id: string) => data.get(id);
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...order];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setOrder(next);
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      // Adjacent pairwise votes encode the user's full ordering.
      for (let i = 0; i < order.length - 1; i++) {
        await recordPairwiseVote({ winnerId: order[i], loserId: order[i + 1] });
      }
      setSaved(true);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your ranking.');
    } finally {
      setSaving(false);
    }
  };

  const list = editing ? order : ids;

  return (
    <div className="rounded-2xl border border-[#1b1b22] bg-[#0f0f13] overflow-hidden my-1">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1b1b22]">
        <div className="flex items-center gap-1.5 min-w-0">
          <ListOrdered className="h-3.5 w-3.5 text-accent-500 shrink-0" />
          <span className="text-[12px] font-semibold text-white truncate">{title ?? 'Rankings'}</span>
        </div>
        {allow_rerank && !saved && (
          editing ? (
            <button
              onClick={() => { setEditing(false); setOrder(ids); }}
              className="flex items-center gap-1 text-[11px] text-[#75757f] hover:text-[#d6d6de]"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="text-[11px] text-accent-500 hover:text-accent-400 font-medium"
            >
              Rank them yourself
            </button>
          )
        )}
      </div>

      <div>
        {list.map((id, idx) => {
          const p = get(id);
          if (!p) return null;
          return (
            <PlayerRow
              key={id}
              playerId={p.player_id}
              name={p.full_name}
              position={p.position ?? undefined}
              team={p.team}
              value={p.value ?? undefined}
              rank={idx + 1}
              size="sm"
              divided
              to={editing ? null : undefined}
              suffix={
                editing ? (
                  <div className="flex flex-col -my-1">
                    <button
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="text-[#75757f] hover:text-white disabled:opacity-25"
                      aria-label="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => move(idx, 1)}
                      disabled={idx === list.length - 1}
                      className="text-[#75757f] hover:text-white disabled:opacity-25"
                      aria-label="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                ) : undefined
              }
            />
          );
        })}
      </div>

      {editing && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-[#1b1b22]">
          <span className="text-[11px] text-[#75757f]">Reorder, then submit — your ranking trains the values.</span>
          <button
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium bg-accent-500 hover:bg-accent-400 text-black disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Submit
          </button>
        </div>
      )}

      {saved && (
        <p className="flex items-center gap-1.5 text-[12px] text-accent-500 px-3 py-2 border-t border-[#1b1b22]">
          <Check className="h-3.5 w-3.5" /> Thanks — your ranking fed the community values.
        </p>
      )}
      {error && <p className="text-[11px] text-red-400 px-3 py-2">{error}</p>}
    </div>
  );
}
