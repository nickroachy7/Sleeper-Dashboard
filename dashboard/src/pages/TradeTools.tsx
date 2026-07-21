import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Scale, Target, Swords, ChevronRight, Gamepad2, Wrench } from 'lucide-react';
import type { ComponentType } from 'react';
import { TradeEvaluator } from './TradeEvaluator';
import { TradeFinder } from './TradeFinder';
import { RankEmPanel } from './RankEm';
import { NoLeagueState } from '../components/NoLeagueState';
import { SubPageHeader } from '../components/ui';
import { TabBar } from '../components/TabBar';
import { useActiveLeague } from '../lib/active-league';
import { useUrlState } from '../hooks/useUrlState';
import type { TradeAsset } from '../lib/trade-shared';

// ── Minis catalog ─────────────────────────────────────────────────
// The Minis page is a landing grid of small games + tools. Each entry opens
// its own view via ?tab=<id>; with no tab, the grid is shown. New games/tools
// slot in here as catalog entries — the grid and the router both read this
// list, so nothing else needs touching to add one.
type MiniKind = 'game' | 'tool';
interface Mini {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  blurb: string;   // one-line card description
  subtitle: string; // header hint shown inside the mini
  kind: MiniKind;
}

const MINIS: Mini[] = [
  { id: 'rank', label: "Rank 'Em", icon: Swords, kind: 'game',
    blurb: 'Who’d you rather keep? Quick taps that train the community values.',
    subtitle: 'Who’d you rather keep? Every pick trains the community values' },
  { id: 'evaluate', label: 'Evaluate', icon: Scale, kind: 'tool',
    blurb: 'Build a trade and see who wins.',
    subtitle: 'Build a trade and see who wins' },
  { id: 'find', label: 'Find', icon: Target, kind: 'tool',
    blurb: 'Discover fair trades across your league.',
    subtitle: 'Discover fair trades across the league' },
];

const SECTIONS: { kind: MiniKind; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { kind: 'game', label: 'Games', icon: Gamepad2 },
  { kind: 'tool', label: 'Tools', icon: Wrench },
];

interface InitialTradeState {
  sides: { rosterId: number; assets: TradeAsset[] }[];
}

export default function TradeTools() {
  const location = useLocation();
  const { get, setMany } = useUrlState();
  const { hasLeague } = useActiveLeague();
  // No tab → the landing grid. A tab id → that mini's own view.
  const activeId = get('tab');
  const active = MINIS.find((m) => m.id === activeId) ?? null;

  // Router state handoff: Trade Finder's "Open in Evaluator" button navigates
  // to /trade with { initialTrade: { sides: [...] } } in location.state. We
  // sync the handoff via React's "derived state" pattern: track the last
  // processed trade in state, and when a new one arrives, bump a counter that
  // drives the Evaluator's `key` prop to force a remount with fresh seed.
  const incomingTrade = (location.state as { initialTrade?: InitialTradeState } | null)?.initialTrade;
  const [lastProcessedTrade, setLastProcessedTrade] = useState<InitialTradeState | null>(null);
  const [evaluatorKey, setEvaluatorKey] = useState(0);
  const [initialSides, setInitialSides] = useState<InitialTradeState['sides'] | undefined>(undefined);

  if (incomingTrade && incomingTrade !== lastProcessedTrade) {
    setLastProcessedTrade(incomingTrade);
    setEvaluatorKey((k) => k + 1);
    setInitialSides(incomingTrade.sides);
    // A handoff always lands on the Evaluator — jump straight to that mini.
    if (activeId !== 'evaluate') setMany({ tab: 'evaluate' });
  }

  return (
    <div className="min-h-dvh">
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        {active ? (
          <>
            {/* Back to the Minis grid + the active mini's one-line hint. */}
            <SubPageHeader
              backLabel="Minis"
              onBack={() => setMany({ tab: null })}
              title={active.label}
              icon={active.icon}
              subtitle={active.subtitle}
            />

            {active.id === 'evaluate' ? (
              // The Evaluator works without a league (global value calculator).
              <TradeEvaluator key={evaluatorKey} initialSides={initialSides} />
            ) : active.id === 'rank' ? (
              // Rank 'Em is a community-value contribution game — no league needed.
              <RankEmPanel />
            ) : hasLeague ? (
              <TradeFinder />
            ) : (
              <NoLeagueState heading="Add your league to find trades"
                sub="Trade Finder scans your league's rosters for fair deals. The Evaluator works without a league." compact />
            )}
          </>
        ) : (
          <MinisGrid
            activeKind={get('cat') === 'tool' ? 'tool' : 'game'}
            onSelectKind={(kind) => setMany({ cat: kind === 'game' ? null : kind })}
            onOpen={(id) => setMany({ tab: id })}
          />
        )}
      </div>
    </div>
  );
}

// ── Landing grid ──────────────────────────────────────────────────
// Games and Tools split into tabs (shared TabBar), showing one category's
// cards at a time — consistent with the other tabbed sections in the app.
function MinisGrid({
  activeKind,
  onSelectKind,
  onOpen,
}: {
  activeKind: MiniKind;
  onSelectKind: (kind: MiniKind) => void;
  onOpen: (id: string) => void;
}) {
  const items = MINIS.filter((m) => m.kind === activeKind);
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold text-accent-500 tracking-[0.2em] uppercase mb-1">Minis</p>
        <h1 className="font-display text-xl font-bold text-white tracking-tight">Games &amp; tools</h1>
        <p className="text-[13px] text-faint mt-1">Quick games that sharpen the community values, and tools for working trades.</p>
      </div>

      <TabBar
        tabs={SECTIONS.map(({ kind, label, icon }) => ({ id: kind, label, icon }))}
        active={activeKind}
        onChange={onSelectKind}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((m) => (
          <button
            key={m.id}
            onClick={() => onOpen(m.id)}
            className="group flex items-center gap-3.5 text-left rounded-2xl border border-line bg-surface p-4 hover:border-accent-500/40 hover:bg-[#17171d] transition-colors"
          >
            <span className="w-11 h-11 rounded-xl bg-accent-500/10 flex items-center justify-center shrink-0 group-hover:bg-accent-500/15 transition-colors">
              <m.icon className="h-5 w-5 text-accent-400" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-white">{m.label}</span>
              <span className="block text-[12px] text-faint leading-snug mt-0.5">{m.blurb}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-[#4c4c56] group-hover:text-accent-400 shrink-0 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}
