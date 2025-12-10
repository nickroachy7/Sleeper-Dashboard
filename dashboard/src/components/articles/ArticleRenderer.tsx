import { useMemo } from 'react';
import { TradeEmbed } from './TradeEmbed';
import ReactMarkdown from 'react-markdown';

interface Player {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
}

interface ArticleRendererProps {
  content: string;
  embeddedTrades: string[];
  transactions: Map<string, any>;
  teams: Map<string, { rosterId: number; teamName: string }[]>;
  players: Map<string, Player>;
  playerValues: Map<string, number>;
  rosterToDraftSlot?: Map<number, number>;
  draftPickResults?: Map<string, string>;
}

export function ArticleRenderer({
  content,
  embeddedTrades: _embeddedTrades,
  transactions,
  teams,
  players,
  playerValues,
  rosterToDraftSlot,
  draftPickResults,
}: ArticleRendererProps) {
  // Parse content and replace [[TRADE:id]] placeholders with actual components
  // Note: embeddedTrades is available for future use (e.g., prefetching)
  void _embeddedTrades;
  
  const parts = useMemo(() => {
    const regex = /\[\[TRADE:([^\]]+)\]\]/g;
    const result: { type: 'text' | 'trade'; content: string }[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        result.push({
          type: 'text',
          content: content.slice(lastIndex, match.index),
        });
      }

      // Add the trade embed
      result.push({
        type: 'trade',
        content: match[1], // transaction_id
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      result.push({
        type: 'text',
        content: content.slice(lastIndex),
      });
    }

    return result;
  }, [content]);

  return (
    <div className="article-content prose prose-slate dark:prose-invert max-w-none">
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return (
            <ReactMarkdown
              key={index}
              components={{
                // Custom renderers for markdown elements
                h1: ({ children }) => (
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-6 mb-4">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-5 mb-3">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white mt-4 mb-2">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-4">
                    {children}
                  </p>
                ),
                strong: ({ children }) => (
                  <strong className="font-bold text-slate-900 dark:text-white">
                    {children}
                  </strong>
                ),
                em: ({ children }) => (
                  <em className="italic text-slate-600 dark:text-slate-400">
                    {children}
                  </em>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-inside space-y-1 mb-4 text-slate-700 dark:text-slate-300">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside space-y-1 mb-4 text-slate-700 dark:text-slate-300">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="text-slate-700 dark:text-slate-300">
                    {children}
                  </li>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-accent-500 pl-4 italic text-slate-600 dark:text-slate-400 my-4">
                    {children}
                  </blockquote>
                ),
                hr: () => (
                  <hr className="border-slate-200 dark:border-zinc-700 my-6" />
                ),
              }}
            >
              {part.content}
            </ReactMarkdown>
          );
        }

        // Render trade embed
        const txId = part.content;
        const transaction = transactions.get(txId);
        const txTeams = teams.get(txId);

        if (!transaction || !txTeams) {
          return (
            <div key={index} className="bg-slate-100 dark:bg-zinc-800 rounded-lg p-4 my-4 text-center text-slate-500 dark:text-slate-400">
              Trade data not available
            </div>
          );
        }

        return (
          <TradeEmbed
            key={index}
            transaction={transaction}
            teams={txTeams}
            players={players}
            playerValues={playerValues}
            rosterToDraftSlot={rosterToDraftSlot}
            draftPickResults={draftPickResults}
            compact={false}
          />
        );
      })}
    </div>
  );
}
