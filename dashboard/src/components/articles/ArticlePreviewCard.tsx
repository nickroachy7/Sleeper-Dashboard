import { useNavigate } from 'react-router-dom';
import { 
  Newspaper, 
  TrendingUp, 
  Trophy, 
  ArrowRightLeft, 
  Users, 
  Calendar,
  Sparkles,
  ChevronRight,
  Tv
} from 'lucide-react';

interface Article {
  id: string;
  title: string;
  subtitle: string | null;
  content: string;
  article_type: string;
  embedded_data: {
    trades?: string[];
    image_url?: string | null;
    source?: string;
  };
  generated_at: string;
}

interface ArticlePreviewCardProps {
  article: Article;
}

const articleTypeConfig: Record<string, { icon: typeof Newspaper; color: string; bgColor: string; label: string }> = {
  trade: { 
    icon: ArrowRightLeft, 
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-500/20',
    label: 'Trade Analysis'
  },
  trade_analysis: { 
    icon: ArrowRightLeft, 
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-500/20',
    label: 'Trade Analysis'
  },
  trade_recap: { 
    icon: ArrowRightLeft, 
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-500/20',
    label: 'Trade Recap'
  },
  standings: { 
    icon: Trophy, 
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-500/20',
    label: 'Standings'
  },
  power_rankings: { 
    icon: TrendingUp, 
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-500/20',
    label: 'Power Rankings'
  },
  roster: { 
    icon: Users, 
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-500/20',
    label: 'Roster Analysis'
  },
  rivalry: { 
    icon: Users, 
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-500/20',
    label: 'Rivalry'
  },
  rebuild: { 
    icon: TrendingUp, 
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-500/20',
    label: 'Rebuild Watch'
  },
  contender: { 
    icon: Trophy, 
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-500/20',
    label: 'Contender Watch'
  },
  underdog: { 
    icon: TrendingUp, 
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'bg-cyan-100 dark:bg-cyan-500/20',
    label: 'Underdog Story'
  },
  overrated: { 
    icon: TrendingUp, 
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-100 dark:bg-rose-500/20',
    label: 'Overrated'
  },
  unlucky: { 
    icon: Calendar, 
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-500/20',
    label: 'Unlucky'
  },
  dynasty_value: { 
    icon: TrendingUp, 
    color: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-100 dark:bg-teal-500/20',
    label: 'Dynasty Value'
  },
  hot_take: { 
    icon: Sparkles, 
    color: 'text-pink-600 dark:text-pink-400',
    bgColor: 'bg-pink-100 dark:bg-pink-500/20',
    label: 'Hot Take'
  },
  recap: { 
    icon: Calendar, 
    color: 'text-slate-600 dark:text-slate-400',
    bgColor: 'bg-slate-100 dark:bg-slate-500/20',
    label: 'Weekly Recap'
  },
  nfl_news: { 
    icon: Tv, 
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-100 dark:bg-sky-500/20',
    label: 'NFL News'
  },
};

export function ArticlePreviewCard({ article }: ArticlePreviewCardProps) {
  const navigate = useNavigate();
  const typeConfig = articleTypeConfig[article.article_type] || articleTypeConfig.recap;
  const TypeIcon = typeConfig.icon;
  const imageUrl = article.embedded_data?.image_url;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    });
  };

  const handleClick = () => {
    navigate('/article', { state: { article } });
  };

  return (
    <button
      onClick={handleClick}
      className="w-full text-left px-3 sm:px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-all group"
    >
      <div className="flex items-start gap-3">
        {/* Thumbnail Image or Icon */}
        {imageUrl ? (
          <div className="flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-slate-100 dark:bg-zinc-800">
            <img 
              src={imageUrl} 
              alt="" 
              className="w-full h-full object-cover"
              onError={(e) => {
                // Hide broken images
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        ) : (
          <div className={`flex-shrink-0 p-1.5 rounded-lg ${typeConfig.bgColor} mt-0.5`}>
            <TypeIcon className={`h-4 w-4 ${typeConfig.color}`} />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title - allow wrapping */}
          <h3 className="text-sm font-medium text-slate-900 dark:text-white leading-snug group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">
            {article.title}
          </h3>
          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 dark:text-slate-500">
            <span className={`font-medium ${typeConfig.color}`}>
              {typeConfig.label}
            </span>
            <span className="text-slate-300 dark:text-zinc-700">•</span>
            <span>{formatDate(article.generated_at)}</span>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex-shrink-0 mt-1">
          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-zinc-600 group-hover:text-accent-500 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </button>
  );
}
