import { ChevronRight, Layers } from 'lucide-react';
import { SubPageHeader } from './ui';
import { RecordsPanel } from './RecordsPanel';
import { DraftsPanel } from '../pages/Drafts';
import { useUrlState } from '../hooks/useUrlState';

// ── History (League tab) ─────────────────────────────────────────────────────
// The league's backward-looking hub. Records content (record book, season
// leaders, all-time managers) shows immediately so it's zero-tap. Drafts —
// bulkier and less-frequently browsed — is a sub-page one tap away via an entry
// card at the top; `?view=drafts` opens it with a back header. This keeps the
// League tab row to three fully-labeled tabs while grouping the history views.

export function HistoryPanel({ initialView }: { initialView?: 'drafts' }) {
  const { get, set } = useUrlState();
  // `view` param drives the sub-page; `initialView` lets a legacy ?tab=drafts
  // link open straight into Drafts without the param.
  const view = get('view') ?? initialView; // undefined = records hub

  if (view === 'drafts') {
    return (
      <div>
        <SubPageHeader
          backLabel="History"
          onBack={() => set('view', null)}
          title="Drafts"
          icon={Layers}
          subtitle="Every rookie & startup draft in this dynasty's history."
        />
        <DraftsPanel />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Entry card into the Drafts sub-page — one obvious tap, kept at the top
          so pick history isn't buried under the record book. */}
      <button
        onClick={() => set('view', 'drafts')}
        className="w-full flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left hover:border-line-strong transition-colors group"
      >
        <span className="w-9 h-9 rounded-lg bg-elevated flex items-center justify-center shrink-0">
          <Layers className="h-4 w-4 text-accent-400" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold text-white">Drafts</span>
          <span className="block text-[12px] text-faint">Every rookie & startup draft, pick by pick</span>
        </span>
        <ChevronRight className="h-4 w-4 text-faint group-hover:text-white transition-colors shrink-0" />
      </button>

      {/* Record book, season leaders, all-time managers — shown inline. */}
      <RecordsPanel />
    </div>
  );
}
