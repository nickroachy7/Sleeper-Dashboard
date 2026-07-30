import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Whistle } from './Whistle';

// ── HostBubble ───────────────────────────────────────────────────────────────
// The AI host's voice ("The Ref"). A compact editorial callout: whistle glyph,
// the host's name, and a markdown line grounded in live crowd data. Used on the
// feed intro, above each matchup, and as the post-vote reaction. Inline (`bare`)
// variant drops the card chrome for tucking under a header.

export function HostBubble({
  children,
  bare = false,
  tone = 'default',
}: {
  children: string;
  bare?: boolean;
  tone?: 'default' | 'hot';
}) {
  const body = (
    <div className="flex gap-2.5 min-w-0">
      <span
        className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-px ${
          tone === 'hot' ? 'bg-orange-500/15' : 'bg-accent-500/12'
        }`}
      >
        <Whistle className={`h-4 w-4 ${tone === 'hot' ? 'text-orange-400' : 'text-accent-500'}`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-faint mb-0.5">
          The Ref
        </p>
        <div className="host-md text-[13px] leading-relaxed text-ink-soft">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: (props) => <p className="[&:not(:first-child)]:mt-1.5" {...props} />,
              strong: (props) => <strong className="text-white font-semibold" {...props} />,
              em: (props) => <em className="text-accent-400 not-italic font-medium" {...props} />,
            }}
          >
            {children}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );

  if (bare) return body;
  return (
    <div className="yap-card yap-accent-wash px-3.5 py-3 rounded-xl">{body}</div>
  );
}
