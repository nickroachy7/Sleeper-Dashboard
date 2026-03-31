import { useState } from 'react';
import { Scale, Target } from 'lucide-react';
import { TradeEvaluator } from './TradeEvaluator';
import { TradeFinder } from './TradeFinder';
import { PageHeader } from '../components/PageHeader';

const tabs = [
  { id: 'evaluate' as const, label: 'Evaluate', icon: Scale },
  { id: 'find' as const, label: 'Find', icon: Target },
];

type TabId = typeof tabs[number]['id'];

export default function TradeTools() {
  const [activeTab, setActiveTab] = useState<TabId>('evaluate');

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <PageHeader title="Trade Evaluator" backTo="/" />
          <p className="text-xs sm:text-sm text-[#888888] -mt-3">
            {activeTab === 'evaluate'
              ? 'Build and evaluate trades using KTC dynasty values'
              : 'Find fair trade scenarios across your league'}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#0a0a0a] border border-[#151515] rounded-lg p-1 mb-6">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
                activeTab === id
                  ? 'bg-accent-500/15 text-accent-400'
                  : 'text-[#888888] hover:text-white hover:bg-[#111111]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'evaluate' ? <TradeEvaluator /> : <TradeFinder />}
      </div>
    </div>
  );
}
