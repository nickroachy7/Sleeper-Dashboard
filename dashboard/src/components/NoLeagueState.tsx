import { Link } from 'react-router-dom';
import { Plus, TrendingUp, ArrowLeftRight, Swords, PlayCircle } from 'lucide-react';
import { openAddLeague } from '../lib/add-league-modal';
import { SAMPLE_LEAGUE_ID } from '../lib/constants';

const FEATURES = [
  { icon: TrendingUp, label: 'Community player values', desc: 'Crowd-sourced dynasty values, updated live.' },
  { icon: ArrowLeftRight, label: 'Instant trade grades', desc: 'Every roster move and trade, analyzed.' },
  { icon: Swords, label: 'Power rankings & movers', desc: 'See who is rising and falling in your league.' },
];

/**
 * Full-page onboarding for a visitor with no league. Primary action adds their
 * Sleeper league; a low-emphasis link previews a sample league so the app isn't
 * a dead end. Reused as the Home hero and as the empty state on league pages.
 */
export function NoLeagueState({
  heading = 'See your dynasty league, decoded',
  sub = 'Add your Sleeper league to unlock community values, trade grades, power rankings, and every roster move — all in one place.',
  compact = false,
}: {
  heading?: string;
  sub?: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-16' : 'py-20'}`}>
      <div className="w-16 h-16 bg-accent-500/15 rounded-2xl flex items-center justify-center mb-5">
        <Plus className="h-8 w-8 text-accent-400" />
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold text-white max-w-lg">{heading}</h1>
      <p className="text-[#80808c] text-sm mt-3 max-w-md">{sub}</p>

      <div className="mt-7 flex flex-col sm:flex-row items-center gap-3">
        <button
          onClick={openAddLeague}
          className="inline-flex items-center gap-2 px-5 py-3 bg-accent-500 text-[#06110a] text-sm font-semibold rounded-xl hover:bg-accent-400 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add your league
        </button>
        <Link
          to={`/?league=${SAMPLE_LEAGUE_ID}`}
          className="inline-flex items-center gap-2 px-4 py-3 text-[#9c9ca7] text-sm font-medium rounded-xl hover:text-white hover:bg-[#1b1b22] transition-colors"
        >
          <PlayCircle className="h-4 w-4" /> Explore a sample league
        </Link>
      </div>

      {!compact && (
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl w-full">
          {FEATURES.map((f) => (
            <div key={f.label} className="rounded-xl bg-[#141419] border border-[#22222b] p-5 text-left">
              <f.icon className="h-5 w-5 text-accent-400 mb-3" />
              <p className="text-[13px] font-semibold text-white">{f.label}</p>
              <p className="text-[12px] text-[#75757f] mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
