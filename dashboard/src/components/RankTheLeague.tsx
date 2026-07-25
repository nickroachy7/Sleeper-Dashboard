import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ListOrdered, RotateCcw, Share2, Check, ChevronUp, ChevronDown, Users } from 'lucide-react';
import { leaguePowerRanks, useLeaguePowerRanks } from '../lib/league-power-ranks';

// ── Rank the League ──────────────────────────────────────────────────────────
// "Who's actually the best team?" A manager drags their league's rosters into
// their own power order; the value-based consensus is the field, and each team
// carries a ▲/▼ delta vs where the crowd's math has them. The order saves per
// league (localStorage) and is shareable — the group-chat argument starter, and
// the commissioner-wedge feature (makes YAP league canon).

export interface LeagueTeam {
  rosterId: number;
  name: string;
  avatar: string | null;
  /** Consensus power rank (1 = strongest by value). */
  consensusRank: number;
}

function DraggableRow({ id, children }: { id: number; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-stretch ${isDragging ? 'relative z-10 bg-elevated shadow-lg shadow-black/40' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="touch-none shrink-0 px-1.5 flex items-center text-[#4c4c56] hover:text-white cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export function RankTheLeague({ leagueId, teams }: { leagueId: string; teams: LeagueTeam[] }) {
  const saved = useLeaguePowerRanks(leagueId);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Consensus order (by rank) is the baseline + fallback.
  const consensus = useMemo(() => [...teams].sort((a, b) => a.consensusRank - b.consensusRank), [teams]);
  const byId = useMemo(() => new Map(teams.map((t) => [t.rosterId, t])), [teams]);

  // A shared ranking (?rank=9.3.10…) takes precedence for a first-time viewer —
  // they see the sender's order. Once they edit, their saved order wins.
  const sharedOrder = useMemo(() => {
    if (saved) return null; // the user has their own order — don't override it
    const raw = new URLSearchParams(window.location.search).get('rank');
    if (!raw) return null;
    const present = new Set(teams.map((t) => t.rosterId));
    const parsed = raw.split('.').map(Number).filter((n) => Number.isFinite(n) && present.has(n));
    return parsed.length > 1 ? parsed : null;
  }, [saved, teams]);

  // The displayed order: the user's saved order → a shared-link order → else
  // consensus. Always filtered to present teams, with any missing appended.
  const order = useMemo(() => {
    const base = saved ?? sharedOrder;
    if (!base) return consensus.map((t) => t.rosterId);
    const present = new Set(teams.map((t) => t.rosterId));
    const kept = base.filter((id) => present.has(id));
    const missing = consensus.map((t) => t.rosterId).filter((id) => !kept.includes(id));
    return [...kept, ...missing];
  }, [saved, sharedOrder, consensus, teams]);

  const rows = useMemo(
    () => order.map((id, i) => {
      const t = byId.get(id)!;
      const yourRank = i + 1;
      const delta = t.consensusRank - yourRank; // + = you're higher on them than the crowd
      return { ...t, yourRank, delta };
    }).filter((r) => r.name != null),
    [order, byId]
  );

  const persist = (next: number[]) => leaguePowerRanks.set(leagueId, next);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    persist(next);
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = order.indexOf(Number(active.id));
    const to = order.indexOf(Number(over.id));
    if (from >= 0 && to >= 0) move(from, to);
  };

  const share = async () => {
    // Encode the user's order as roster ids so a leaguemate opening the link
    // sees the same ranking (?rank=1,4,2,…). League is resolved from the page.
    const url = `${window.location.origin}/league?tab=standings&rank=${order.join('.')}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'My league power ranking — YAP', url }); return; }
    } catch { /* fall through */ }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  const hasCustom = !!saved;

  return (
    <section className="yap-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line-subtle">
        <div className="flex items-center gap-1.5 min-w-0">
          <ListOrdered className="h-3.5 w-3.5 text-accent-500 shrink-0" />
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent-400">Rank the League</p>
          <span className="text-[11px] text-faint truncate hidden sm:inline">— your take vs the field</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasCustom && (
            <button onClick={share} title="Share your ranking" className="flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-medium text-faint hover:text-white hover:bg-elevated transition-colors">
              {copied ? <Check className="h-3.5 w-3.5 text-accent-400" /> : <Share2 className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Share'}
            </button>
          )}
          {hasCustom && (
            <button onClick={() => leaguePowerRanks.clear(leagueId)} title="Reset to consensus" className="flex items-center h-7 px-2 rounded-lg text-[11px] font-medium text-faint hover:text-white hover:bg-elevated transition-colors">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setEditing((e) => !e)}
            className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-colors ${editing ? 'bg-accent-500 text-[#06110a]' : 'border border-line-strong text-muted hover:text-white'}`}
          >
            {editing ? 'Done' : 'Rank'}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center">
          <Users className="h-7 w-7 text-[#3a3a44] mx-auto mb-2" />
          <p className="text-[13px] text-faint">Team strength loads once the current-season rosters are synced.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <div className="divide-y divide-line-subtle">
              {rows.map((r, i) => {
                const inner = (
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <span className="w-5 text-center text-[13px] font-bold text-ink-soft tabular-nums shrink-0">{r.yourRank}</span>
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-overlay shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center">
                      {r.avatar ? <img src={r.avatar} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} /> : <Users className="h-3.5 w-3.5 text-ghost" />}
                    </div>
                    <span className="flex-1 min-w-0 text-[13px] font-semibold text-white truncate">{r.name}</span>
                    {r.delta !== 0 && (
                      <span className={`text-[11px] font-semibold shrink-0 ${r.delta > 0 ? 'text-accent-400' : 'text-red-400'}`} title={`Consensus has them #${r.consensusRank}`}>
                        {r.delta > 0 ? `▲${r.delta}` : `▼${Math.abs(r.delta)}`} vs field
                      </span>
                    )}
                    {editing && (
                      <span className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => move(i, i - 1)} disabled={i === 0} className="p-1 rounded-md border border-line-strong text-muted hover:text-white disabled:opacity-30 transition-colors" aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
                        <button onClick={() => move(i, i + 1)} disabled={i === rows.length - 1} className="p-1 rounded-md border border-line-strong text-muted hover:text-white disabled:opacity-30 transition-colors" aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
                      </span>
                    )}
                  </div>
                );
                return editing
                  ? <DraggableRow key={r.rosterId} id={r.rosterId}>{inner}</DraggableRow>
                  : <div key={r.rosterId}>{inner}</div>;
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
