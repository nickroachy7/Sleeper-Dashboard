import { Swords } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Matchups() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-slate-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mb-4">
          <Swords className="h-8 w-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Matchups Disabled</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">
          Weekly matchup tracking is not enabled for this dashboard. Focus on dynasty value and trades instead.
        </p>
        <Link
          to="/rosters"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors"
        >
          View Rosters
        </Link>
      </div>
    </div>
  );
}
