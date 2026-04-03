import { useState } from 'react';
import { Scale, Target } from 'lucide-react';
import { TradeEvaluator } from './TradeEvaluator';
import { TradeFinder } from './TradeFinder';
import { PageHeader } from '../components/PageHeader';

const tabs = [
  { id: 'evaluate' as const, label: 'Evaluate', icon: Scale, subtitle: 'Build a trade and see who wins' },
  { id: 'find' as const, label: 'Find', icon: Target, subtitle: 'Discover fair trades across the league' },
];

type TabId = typeof tabs[number]['id'];

export default function TradeTools() {
  const [activeTab, setActiveTab] = useState<TabId>('evaluate');

  return (
    <div className="min-h-screen">
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <PageHeader
          sectionLabel="Tools"
          title="Trade Tools"
          subtitle={tabs.find(t => t.id === activeTab)?.subtitle}
        />

        {/* Segmented Control */}
        <div className="segmented-control mb-6">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 ${activeTab === id ? 'active' : ''}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'evaluate' ? <TradeEvaluator /> : <TradeFinder />}
      </div>
    </div>
  );
}
