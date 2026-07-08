import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Scale, Target } from 'lucide-react';
import { TradeEvaluator } from './TradeEvaluator';
import { TradeFinder } from './TradeFinder';
import { PageHeader } from '../components/PageHeader';
import type { TradeAsset } from '../lib/trade-shared';

const tabDefs = [
  { id: 'evaluate' as const, label: 'Evaluate', icon: Scale, subtitle: 'Build a trade and see who wins' },
  { id: 'find' as const, label: 'Find', icon: Target, subtitle: 'Discover fair trades across the league' },
];

type TabId = typeof tabDefs[number]['id'];

interface InitialTradeState {
  sides: { rosterId: number; assets: TradeAsset[] }[];
}

export default function TradeTools() {
  const location = useLocation();

  // Router state handoff: Trade Finder's "Open in Evaluator" button navigates
  // to /trade with { initialTrade: { sides: [...] } } in location.state. We
  // sync the handoff via React's "derived state" pattern: track the last
  // processed trade in state, and when a new one arrives, bump a counter that
  // drives the Evaluator's `key` prop to force a remount with fresh seed.
  const incomingTrade = (location.state as { initialTrade?: InitialTradeState } | null)?.initialTrade;
  const [lastProcessedTrade, setLastProcessedTrade] = useState<InitialTradeState | null>(null);
  const [evaluatorKey, setEvaluatorKey] = useState(0);
  const [initialSides, setInitialSides] = useState<InitialTradeState['sides'] | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<TabId>('evaluate');

  if (incomingTrade && incomingTrade !== lastProcessedTrade) {
    setLastProcessedTrade(incomingTrade);
    setEvaluatorKey((k) => k + 1);
    setInitialSides(incomingTrade.sides);
    setActiveTab('evaluate');
  }

  return (
    <div className="min-h-dvh">
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <PageHeader
          sectionLabel="Tools"
          title="Trade Tools"
          subtitle={tabDefs.find(t => t.id === activeTab)?.subtitle}
          tabs={tabDefs}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as TabId)}
        />

        {activeTab === 'evaluate' ? (
          <TradeEvaluator key={evaluatorKey} initialSides={initialSides} />
        ) : (
          <TradeFinder />
        )}
      </div>
    </div>
  );
}
