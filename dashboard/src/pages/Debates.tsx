import { useMemo, useState } from 'react';
import { useDebateList } from '../hooks/useDebates';
import { CATEGORIES } from '../lib/debates/catalog';
import { hostFeedIntro } from '../lib/debates/host';
import { DebateCard } from '../components/debates/DebateCard';
import { HostBubble } from '../components/debates/HostBubble';
import { Segmented } from '../components/ui';
import type { Debate } from '../lib/debates/types';

// ── Debates — the home of the product ────────────────────────────────────────
// The pivot's front door: a sports-media-style feed of live arguments. The host
// opens the room, a featured hero leads, then a category-filterable grid of
// every debate. Fantasy is no longer here — it's a tool you open from the nav
// ("League Mode"). This page needs no league, no account: anyone can browse and
// vote instantly, which is exactly the cold-start advantage of the pivot.

export default function Debates() {
  const debates = useDebateList();
  const [category, setCategory] = useState<'ALL' | Debate['category']>('ALL');

  const featured = useMemo(() => debates.find((d) => d.featured) ?? debates[0], [debates]);
  const rest = useMemo(
    () =>
      debates
        .filter((d) => d.id !== featured?.id)
        .filter((d) => category === 'ALL' || d.category === category),
    [debates, featured, category]
  );

  return (
    <div className="min-h-dvh">
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        {/* Masthead */}
        <div>
          <p className="yap-eyebrow">The Room</p>
          <h1 className="font-display font-bold text-white text-[28px] sm:text-[34px] leading-tight mt-1">
            Every argument in sports. Settled by the crowd.
          </h1>
          <p className="text-ink-soft text-[14px] mt-2 max-w-2xl leading-relaxed">
            Vote your takes. Watch the room's ranking move in real time. See exactly where
            you break from the crowd — no account needed to start.
          </p>
        </div>

        <HostBubble>{hostFeedIntro(debates.length)}</HostBubble>

        {/* Featured hero */}
        {featured && <DebateCard debate={featured} featured />}

        {/* Category filter + grid */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="yap-eyebrow">On the table</p>
          <Segmented<'ALL' | Debate['category']>
            options={CATEGORIES}
            value={category}
            onChange={setCategory}
          />
        </div>

        {rest.length === 0 ? (
          <p className="text-center text-faint py-16 text-[14px]">No debates in this category yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rest.map((d) => (
              <DebateCard key={d.id} debate={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
