import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles, AlertCircle, Database, ChevronRight } from 'lucide-react';
import { ChatWidgets } from './ChatWidgets';
import type { ChatMessage, QueryStep } from '../../lib/league-chat';

function QuerySteps({ steps }: { steps: QueryStep[] }) {
  if (!steps.length) return null;
  return (
    <details className="group mt-2">
      <summary className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[#75757f] hover:text-[#9c9ca7] select-none list-none">
        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
        <Database className="h-3 w-3" />
        {steps.length} {steps.length === 1 ? 'query' : 'queries'} run
      </summary>
      <div className="mt-2 space-y-1.5">
        {steps.map((s, i) => (
          <div key={i} className="rounded-lg bg-[#101014] border border-[#1b1b22] px-3 py-2">
            <pre className="text-[11px] text-[#9c9ca7] whitespace-pre-wrap break-words font-mono">
              {s.sql}
            </pre>
            <p className={`text-[10px] mt-1 ${s.error ? 'text-red-400' : 'text-[#60606a]'}`}>
              {s.error ? `Error: ${s.error}` : `${s.rows} row${s.rows === 1 ? '' : 's'}`}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="chat-markdown text-[13.5px] leading-relaxed text-[#d6d6de]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: (props) => (
            <div className="overflow-x-auto my-2 rounded-lg border border-[#2a2a34]">
              <table className="w-full text-[12.5px]" {...props} />
            </div>
          ),
          thead: (props) => <thead className="bg-[#17171d]" {...props} />,
          th: (props) => (
            <th
              className="px-3 py-1.5 text-left font-semibold text-[#9c9ca7] border-b border-[#2a2a34] whitespace-nowrap"
              {...props}
            />
          ),
          td: (props) => (
            <td className="px-3 py-1.5 border-b border-[#1b1b22] whitespace-nowrap" {...props} />
          ),
          code: (props) => (
            <code className="bg-[#17171d] px-1 py-0.5 rounded text-[12px] text-accent-600" {...props} />
          ),
          a: ({ href, children, ...props }) => {
            if (href?.startsWith('/')) {
              return (
                <Link to={href} className="text-accent-500 hover:underline">
                  {children}
                </Link>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-accent-500 hover:underline"
                {...props}
              >
                {children}
              </a>
            );
          },
          ul: (props) => <ul className="list-disc pl-5 my-1.5 space-y-0.5" {...props} />,
          ol: (props) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5" {...props} />,
          p: (props) => <p className="my-1.5" {...props} />,
          h1: (props) => <h3 className="font-semibold text-white mt-3 mb-1" {...props} />,
          h2: (props) => <h3 className="font-semibold text-white mt-3 mb-1" {...props} />,
          h3: (props) => <h4 className="font-semibold text-white mt-2 mb-1" {...props} />,
          strong: (props) => <strong className="text-white font-semibold" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Render one chat message — a user bubble, or an assistant reply with
 *  markdown, interactive widgets, and the collapsible queries panel. */
export function ChatMessageView({ message: m }: { message: ChatMessage }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] rounded-[18px] rounded-br-md bg-accent-500 px-3.5 py-2 text-[13.5px] leading-relaxed text-[#06110a] font-medium whitespace-pre-wrap shadow-sm">
          {m.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div
        className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${
          m.error ? 'bg-red-500/10' : 'bg-accent-500/10'
        }`}
      >
        {m.error ? (
          <AlertCircle className="h-4 w-4 text-red-400" />
        ) : (
          <Sparkles className="h-4 w-4 text-accent-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {m.error ? (
          <p className="text-[13px] text-red-400 pt-1">{m.content}</p>
        ) : (
          m.content && <AssistantMarkdown content={m.content} />
        )}
        {!m.error && <ChatWidgets widgets={m.widgets} />}
        {m.steps && <QuerySteps steps={m.steps} />}
      </div>
    </div>
  );
}
