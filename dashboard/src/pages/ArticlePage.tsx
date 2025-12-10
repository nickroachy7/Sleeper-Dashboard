import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { ArticleRenderer } from '../components/articles/ArticleRenderer';
import { StandingsEmbed } from '../components/articles/StandingsEmbed';
import { RosterEmbed } from '../components/articles/RosterEmbed';
import { TradeEmbed } from '../components/articles/TradeEmbed';
import { 
  Newspaper, 
  TrendingUp, 
  Trophy, 
  ArrowRightLeft, 
  Users, 
  Calendar,
  Sparkles,
  ArrowLeft,
  Loader2,
  Tv,
  Share2,
  Check
} from 'lucide-react';
import { useState } from 'react';

interface Player {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
}

interface EmbeddedStandingsTeam {
  rank: number;
  teamName: string;
  wins: number;
  losses: number;
  points: number;
  playerValue: number;
  pickValue: number;
  totalValue: number;
}

interface EmbeddedRosterTeam {
  teamName: string;
  wins: number;
  losses: number;
  playerValue: number;
  pickValue: number;
  totalValue: number;
  topPlayers?: { name: string; position: string; value: number }[];
}

interface Article {
  id: string;
  title: string;
  subtitle: string | null;
  content: string;
  article_type: string;
  embedded_data: {
    trades?: string[];
    standings?: {
      title: string;
      teams: EmbeddedStandingsTeam[];
    };
    rosters?: {
      title: string;
      teams: EmbeddedRosterTeam[];
    };
    image_url?: string | null;
    source?: string;
  };
  generated_at: string;
}

const articleTypeConfig: Record<string, { icon: typeof Newspaper; color: string; label: string }> = {
  trade: { 
    icon: ArrowRightLeft, 
    color: 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400',
    label: 'Trade Analysis'
  },
  trade_analysis: { 
    icon: ArrowRightLeft, 
    color: 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400',
    label: 'Trade Analysis'
  },
  trade_recap: { 
    icon: ArrowRightLeft, 
    color: 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400',
    label: 'Trade Recap'
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
  rivalry: { 
    icon: Users, 
    color: 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400',
    label: 'Rivalry'
  },
  rebuild: { 
    icon: TrendingUp, 
    color: 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400',
    label: 'Rebuild Watch'
  },
  contender: { 
    icon: Trophy, 
    color: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    label: 'Contender Watch'
  },
  underdog: { 
    icon: TrendingUp, 
    color: 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400',
    label: 'Underdog Story'
  },
  hot_take: { 
    icon: Sparkles, 
    color: 'bg-pink-100 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400',
    label: 'Hot Take'
  },
  recap: { 
    icon: Calendar, 
    color: 'bg-slate-100 dark:bg-slate-500/20 text-slate-600 dark:text-slate-400',
    label: 'Weekly Recap'
  },
  nfl_news: { 
    icon: Tv, 
    color: 'bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400',
    label: 'NFL News'
  },
};

export default function ArticlePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const article = location.state?.article as Article | undefined;
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (!article) return;
    
    // Share the direct article URL
    const shareUrl = `https://sleeper-league-dashboard-production.up.railway.app/article/${article.id}`;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Fetch supporting data for article rendering
  const { data: supportData, isLoading } = useQuery({
    queryKey: ['article-support-data'],
    queryFn: async () => {
      const [
        transactionsRes,
        rostersRes,
        usersRes,
        leagueUsersRes,
        playersRes,
        playerValuesRes,
        draftPicksRes,
      ] = await Promise.all([
        supabase.from('transactions').select('*'),
        supabase.from('rosters').select('*'),
        supabase.from('users').select('*'),
        supabase.from('league_users').select('user_id, team_name, display_name'),
        supabase.from('players').select('player_id, full_name, position, team'),
        supabase.from('player_values').select('player_id, value'),
        supabase.from('draft_picks').select(`draft_slot, round, player_id, roster_id, draft_id, drafts!inner(season)`).not('player_id', 'is', null),
      ]);

      // Build player map
      const playerMap = new Map<string, Player>();
      (playersRes.data as Player[] || []).forEach(p => playerMap.set(p.player_id, p));

      // Build player values map
      const playerValuesMap = new Map<string, number>();
      (playerValuesRes.data || []).forEach((pv: any) => playerValuesMap.set(pv.player_id, pv.value));

      // Build roster to owner map
      const rosterToOwner = new Map<number, string>();
      (rostersRes.data || []).forEach((r: any) => rosterToOwner.set(r.roster_id, r.owner_id));

      // Build roster to draft slot map
      const rosterToDraftSlotMap = new Map<number, number>();
      (rostersRes.data || []).forEach((r: any) => {
        if (r.roster_id && r.roster_id <= 12) {
          rosterToDraftSlotMap.set(r.roster_id, r.roster_id);
        }
      });

      // Build draft pick results map
      const draftPickResultsMap = new Map<string, string>();
      (draftPicksRes.data || []).forEach((dp: any) => {
        const season = (dp.drafts as any)?.season;
        if (season && dp.round && dp.draft_slot && dp.player_id) {
          const key = `${season}-${dp.round}-${dp.draft_slot}`;
          draftPickResultsMap.set(key, dp.player_id);
        }
      });

      // Build transactions map
      const transactionsMap = new Map<string, any>();
      (transactionsRes.data || []).forEach((tx: any) => {
        transactionsMap.set(tx.transaction_id, tx);
      });

      // Build teams map for each transaction
      const transactionTeamsMap = new Map<string, { rosterId: number; teamName: string }[]>();
      const users = usersRes.data || [];
      const leagueUsers = leagueUsersRes.data || [];

      (transactionsRes.data || []).forEach((tx: any) => {
        const rosterIds = tx.roster_ids || [];
        const teams = rosterIds.map((rid: number) => {
          const ownerId = rosterToOwner.get(rid);
          const leagueUser = leagueUsers.find((lu: any) => lu.user_id === ownerId);
          const user = users.find((u: any) => u.user_id === ownerId);
          const teamName = leagueUser?.team_name || leagueUser?.display_name || user?.display_name || (user as any)?.username || `Team ${rid}`;
          return { rosterId: rid, teamName };
        });
        transactionTeamsMap.set(tx.transaction_id, teams);
      });

      return {
        players: playerMap,
        playerValues: playerValuesMap,
        rosterToDraftSlot: rosterToDraftSlotMap,
        draftPickResults: draftPickResultsMap,
        transactionsMap,
        transactionTeamsMap,
      };
    },
    enabled: !!article,
  });

  if (!article) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 bg-slate-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Newspaper className="h-8 w-8 text-slate-400 dark:text-slate-500" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Article Not Found</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
            This article may have expired or been removed.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent-500 text-white text-sm font-medium rounded-lg hover:bg-accent-600 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const typeConfig = articleTypeConfig[article.article_type] || articleTypeConfig.recap;
  const TypeIcon = typeConfig.icon;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric', 
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-accent-500 mx-auto" />
            <p className="mt-4 text-slate-500 dark:text-slate-400 text-sm">Loading article...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Article */}
      <article className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm dark:shadow-none overflow-hidden">
        {/* Hero Image for NFL News */}
        {article.embedded_data?.image_url && (
          <div className="w-full h-48 sm:h-64 lg:h-80 overflow-hidden bg-slate-100 dark:bg-zinc-800">
            <img 
              src={article.embedded_data.image_url} 
              alt="" 
              className="w-full h-full object-cover"
              onError={(e) => {
                // Hide broken images
                (e.target as HTMLImageElement).parentElement!.style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Header */}
        <div className="p-6 sm:p-8 border-b border-slate-100 dark:border-zinc-800">
          {/* Type Badge */}
          <div className="flex items-center gap-2 mb-4">
            <div className={`p-2 rounded-xl ${typeConfig.color}`}>
              <TypeIcon className="h-5 w-5" />
            </div>
            <span className={`text-sm font-semibold uppercase tracking-wide ${typeConfig.color.split(' ').slice(2).join(' ')}`}>
              {typeConfig.label}
            </span>
            <div className="flex items-center gap-3 ml-auto">
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Share2 className="h-3.5 w-3.5" />
                    Share
                  </>
                )}
              </button>
              <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                <Sparkles className="h-3.5 w-3.5" />
                AI Generated
              </div>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white leading-tight mb-3">
            {article.title}
          </h1>

          {/* Subtitle */}
          {article.subtitle && (
            <p className="text-lg text-slate-600 dark:text-slate-400">
              {article.subtitle}
            </p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 mt-4 text-sm text-slate-500 dark:text-slate-500">
            <span>{formatDate(article.generated_at)}</span>
            {article.embedded_data?.source && (
              <>
                <span className="text-slate-300 dark:text-zinc-700">•</span>
                <span>Source: {article.embedded_data.source}</span>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8">
          {supportData && (
            <ArticleRenderer
              content={article.content}
              embeddedTrades={article.embedded_data?.trades || []}
              transactions={supportData.transactionsMap}
              teams={supportData.transactionTeamsMap}
              players={supportData.players}
              playerValues={supportData.playerValues}
              rosterToDraftSlot={supportData.rosterToDraftSlot}
              draftPickResults={supportData.draftPickResults}
            />
          )}

          {/* Embedded Standings */}
          {article.embedded_data?.standings && (
            <StandingsEmbed 
              standings={article.embedded_data.standings.teams}
              title={article.embedded_data.standings.title}
            />
          )}

          {/* Embedded Roster/Team Data */}
          {article.embedded_data?.rosters && (
            <RosterEmbed 
              teams={article.embedded_data.rosters.teams}
              title={article.embedded_data.rosters.title}
            />
          )}

          {/* Embedded Trades */}
          {article.embedded_data?.trades && article.embedded_data.trades.length > 0 && supportData && (
            <div className="my-6">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-purple-500" />
                Referenced Trades
              </h4>
              <div className="space-y-4">
                {article.embedded_data.trades.map((txId) => {
                  const transaction = supportData.transactionsMap.get(txId);
                  const txTeams = supportData.transactionTeamsMap.get(txId);
                  if (!transaction || !txTeams) return null;
                  return (
                    <TradeEmbed
                      key={txId}
                      transaction={transaction}
                      teams={txTeams}
                      players={supportData.players}
                      playerValues={supportData.playerValues}
                      rosterToDraftSlot={supportData.rosterToDraftSlot}
                      draftPickResults={supportData.draftPickResults}
                      compact={false}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
