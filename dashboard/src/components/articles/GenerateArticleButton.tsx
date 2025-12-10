import { useState } from 'react';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

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

interface GenerateArticleButtonProps {
  onArticleGenerated?: (article: Article) => void;
  variant?: 'primary' | 'secondary' | 'icon';
}

export function GenerateArticleButton({ 
  onArticleGenerated,
  variant = 'primary' 
}: GenerateArticleButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-league-article', {
        body: { skipSave: true },
      });

      if (fnError) {
        throw fnError;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to generate article');
      }

      // Pass the generated article back to the parent
      if (data.article) {
        onArticleGenerated?.(data.article);
      }
    } catch (err) {
      console.error('Error generating article:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate article');
    } finally {
      setIsGenerating(false);
    }
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="p-2 rounded-lg bg-accent-100 dark:bg-accent-500/20 text-accent-600 dark:text-accent-400 hover:bg-accent-200 dark:hover:bg-accent-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Generate new article"
      >
        {isGenerating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
      </button>
    );
  }

  if (variant === 'secondary') {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-accent-600 dark:text-accent-400 bg-accent-50 dark:bg-accent-500/10 hover:bg-accent-100 dark:hover:bg-accent-500/20 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              New Article
            </>
          )}
        </button>
        {error && (
          <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-accent-500 to-purple-500 text-white text-sm font-medium rounded-xl hover:from-accent-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-accent-500/25"
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating Article...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Generate League News
          </>
        )}
      </button>
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}
