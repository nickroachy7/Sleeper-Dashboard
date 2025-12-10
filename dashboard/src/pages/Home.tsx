import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { 
  Loader2,
  Zap,
  Newspaper,
  Tv
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ArticlePreviewCard, FeaturedArticleCarousel } from '../components/articles';

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

export default function Home() {

  // Fetch articles for home page
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['home-articles'],
    queryFn: async () => {
      const [
        leaguesRes,
        articlesRes,
        nflNewsRes,
      ] = await Promise.all([
        supabase.from('leagues').select('*').order('created_at', { ascending: false }).limit(1),
        supabase.from('articles').select('*').eq('published', true).neq('article_type', 'nfl_news').order('generated_at', { ascending: false }).limit(15),
        supabase.from('articles').select('*').eq('published', true).eq('article_type', 'nfl_news').order('generated_at', { ascending: false }).limit(10),
      ]);

      return {
        league: leaguesRes.data?.[0] || null,
        articles: (articlesRes.data as Article[]) || [],
        nflNews: (nflNewsRes.data as Article[]) || [],
      };
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 animate-spin text-accent-500 mx-auto" />
            <p className="mt-4 text-slate-500 dark:text-slate-400 text-xs sm:text-sm">Loading home...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!dashboardData?.league) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 bg-accent-100 dark:bg-accent-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Zap className="h-8 w-8 text-accent-600 dark:text-accent-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Welcome to Sleeper Dashboard</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              Connect your Sleeper fantasy league to get started
            </p>
            <Link
              to="/setup"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent-500 text-white text-sm font-medium rounded-lg hover:bg-accent-600 transition-colors"
            >
              <Zap className="h-4 w-4" />
              Connect Your League
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { 
    articles,
    nflNews,
  } = dashboardData;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Featured Stories Carousel */}
      {nflNews.length > 0 && (
        <FeaturedArticleCarousel 
          articles={nflNews} 
          maxArticles={5} 
        />
      )}

      {/* League News Section */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-sm sm:text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Newspaper className="h-4 w-4 sm:h-5 sm:w-5 text-accent-500" />
            League News
            {articles.length > 0 && (
              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                ({articles.length} articles)
              </span>
            )}
          </h2>
        </div>

        {articles.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-8 sm:p-12 text-center">
            <div className="w-16 h-16 bg-accent-100 dark:bg-accent-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Newspaper className="h-8 w-8 text-accent-600 dark:text-accent-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No Articles Yet</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mx-auto">
              AI-powered league news articles are generated daily at 7am UTC with insights on trades, standings, and more.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 divide-y divide-slate-100 dark:divide-zinc-800 overflow-hidden">
            {articles.map((article) => (
              <ArticlePreviewCard
                key={article.id}
                article={article}
              />
            ))}
          </div>
        )}
      </div>

      {/* NFL Fantasy News Section */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-sm sm:text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Tv className="h-4 w-4 sm:h-5 sm:w-5 text-sky-500" />
            NFL Fantasy News
            {nflNews.length > 0 && (
              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                ({nflNews.length} articles)
              </span>
            )}
          </h2>
        </div>

        {nflNews.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-8 sm:p-12 text-center">
            <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Tv className="h-8 w-8 text-sky-600 dark:text-sky-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No NFL News Yet</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mx-auto">
              AI-powered NFL fantasy news articles are generated daily at 7am UTC with the latest player updates and fantasy insights.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 divide-y divide-slate-100 dark:divide-zinc-800 overflow-hidden">
            {nflNews.map((article) => (
              <ArticlePreviewCard
                key={article.id}
                article={article}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
