import { Layers } from 'lucide-react';
import { getPlayerImageUrl } from '../lib/trade-shared';
import { isPickAsset } from '../lib/vote-assets';

/**
 * Round avatar for a vote asset. Players get their Sleeper headshot; draft
 * picks (no headshot) get a layered-pick glyph on a tinted disc. One place so
 * the vote cards and compare panel render picks consistently.
 */
export function AssetAvatar({ id, alt, size = 96, className = '' }: { id: string; alt?: string; size?: number; className?: string }) {
  const px = { width: size, height: size };
  if (isPickAsset(id)) {
    return (
      <span
        style={px}
        className={`inline-flex items-center justify-center rounded-full bg-cyan-500/15 border border-cyan-500/30 shrink-0 ${className}`}
      >
        <Layers className="text-cyan-300" style={{ width: size * 0.4, height: size * 0.4 }} />
      </span>
    );
  }
  return (
    <img
      src={getPlayerImageUrl(id)}
      alt={alt ?? ''}
      loading="lazy"
      style={px}
      className={`rounded-full object-cover object-top bg-[#101015] shrink-0 ${className}`}
    />
  );
}
