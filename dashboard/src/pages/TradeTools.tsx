import { useState } from 'react';
import { Scale, Target } from 'lucide-react';
import { TradeEvaluator } from './TradeEvaluator';
import { TradeFinder } from './TradeFinder';
import { PageHeader } from '../components/PageHeader';

const tabDefs = [
  { id: 'evaluate' as const, label: 'Evaluate', icon: Scale, subtitle: 'Build a trade and see who wins' },
  { id: 'find' as const, label: 'Find', icon: Target, subtitle: 'Discover fair trades across the league' },
];

type TabId = typeof tabDefs[number]['id'];

export default function TradeTools() {
  const [activeTab, setActiveTab] = useState<TabId>('evaluate');

  return (
    <div className="min-h-screen">
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <PageHeader
          sectionLabel="Tools"
          title="Trade Tools"
          subtitle={tabDefs.find(t => t.id === activeTab)?.subtitle}
          tabs={tabDefs}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as TabId)}
        />

        {activeTab === 'evaluate' ? <TradeEvaluator /> : <TradeFinder />}
      </div>
    </div>
  );
}
