import { 
  Newspaper, 
  TrendingUp, 
  Trophy, 
  ArrowRightLeft, 
  Users, 
  Calendar,
  Sparkles
} from 'lucide-react';
import { ArticleRenderer } from './ArticleRenderer';

interface Player {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
}

interface Article {
  id: string;
  title: string;
  subtitle: string | null;
  content: string;
  article_type: string;
  embedded_data: {
    trades?: string[];
  };
  generated_at: string;
}

interface ArticleCardProps {
  article: Article;
  transactions: Map<string, any>;
  teams: Map<string, { rosterId: number; teamName: string }[]>;
  players: Map<string, Player>;
  playerValues: Map<string, number>;
  rosterToDraftSlot?: Map<number, number>;
  draftPickResults?: Map<string, string>;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

const articleTypeConfig: Record<string, { icon: typeof Newspaper; color: string; label: string }> = {
  trade: { 
    icon: ArrowRightLeft, 
    color: 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400',
    label: 'Trade Analysis'
  },
  standings: { 
    icon: Trophy, 
    color: 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400',
    label: 'Standings'
  },
  power_rankings: { 
    icon: TrendingUp, 
    color: 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400',
    label: 'Power Rankings'
  },
  roster: { 
    icon: Users, 
    color: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    label: 'Roster Analysis'
  },
  value: { 
    icon: TrendingUp, 
    color: 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400',
    label: 'Value Watch'
  },
  recap: { 
    icon: Calendar, 
    color: 'bg-slate-100 dark:bg-slate-500/20 text-slate-600 dark:text-slate-400',
    label: 'Weekly Recap'
  },
};

export function ArticleCard({
  article,
  transactions,
  teams,
  players,
  playerValues,
  rosterToDraftSlot,
  draftPickResults,
  expanded = true,
  onToggleExpand,
}: ArticleCardProps) {
  const typeConfig = articleTypeConfig[article.article_type] || articleTypeConfig.recap;
  const TypeIcon = typeConfig.icon;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <article className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm dark:shadow-none overflow-hidden">
      {/* Article Header */}
      <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-zinc-800">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            {/* Type Badge */}
            <div className="flex items-center gap-2 mb-3">
              <div className={`p-1.5 rounded-lg ${typeConfig.color}`}>
                <TypeIcon className="h-4 w-4" />
              </div>
              <span className={`text-xs font-semibold uppercase tracking-wide ${typeConfig.color.split(' ').slice(2).join(' ')}`}>
                {typeConfig.label}
              </span>
              <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 ml-auto">
                <Sparkles className="h-3 w-3" />
                AI Generated
              </div>
            </div>

            {/* Title */}
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-tight mb-2">
              {article.title}
            </h2>

            {/* Subtitle */}
            {article.subtitle && (
              <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base">
                {article.subtitle}
              </p>
            )}

            {/* Meta */}
            <div className="flex items-center gap-3 mt-3 text-xs text-slate-500 dark:text-slate-500">
              <span>{formatDate(article.generated_at)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Article Content */}
      {expanded && (
        <div className="p-4 sm:p-6">
          <ArticleRenderer
            content={article.content}
            embeddedTrades={article.embedded_data?.trades || []}
            transactions={transactions}
            teams={teams}
            players={players}
            playerValues={playerValues}
            rosterToDraftSlot={rosterToDraftSlot}
            draftPickResults={draftPickResults}
          />
        </div>
      )}

      {/* Expand/Collapse */}
      {onToggleExpand && (
        <div className="px-4 sm:px-6 py-3 border-t border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50">
          <button
            onClick={onToggleExpand}
            className="text-sm font-medium text-accent-600 dark:text-accent-400 hover:text-accent-700 dark:hover:text-accent-300 transition-colors"
          >
            {expanded ? 'Show Less' : 'Read More'}
          </button>
        </div>
      )}
    </article>
  );
}
