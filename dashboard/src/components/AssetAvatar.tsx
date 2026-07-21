import { useState } from 'react';
import { Layers, UserRound } from 'lucide-react';
import { getPlayerImageUrl } from '../lib/trade-shared';
import { isPickAsset } from '../lib/vote-assets';

/**
 * Round avatar for a vote asset. Players get their Sleeper headshot; draft
 * picks (no headshot) get a layered-pick glyph on a tinted disc. One place so
 * the vote cards and compare panel render picks consistently.
 *
 * If a player's headshot fails to load (Sleeper has gaps), fall back to a
 * silhouette glyph on the disc — never the raw alt text, which would overflow
 * the circle.
 */
export function AssetAvatar({ id, alt, size = 96, className = '' }: { id: string; alt?: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
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

  if (failed) {
    return (
      <span
        style={px}
        className={`inline-flex items-center justify-center rounded-full bg-[#101015] border border-line shrink-0 ${className}`}
      >
        <UserRound className="text-ghost" style={{ width: size * 0.42, height: size * 0.42 }} />
      </span>
    );
  }

  return (
    <img
      src={getPlayerImageUrl(id)}
      alt={alt ?? ''}
      loading="lazy"
      onError={() => setFailed(true)}
      style={px}
      className={`rounded-full object-cover object-top bg-[#101015] shrink-0 ${className}`}
    />
  );
}
