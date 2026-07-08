import { useState } from 'react';
import { PositionBadge } from './PositionBadge';

interface AssetRowProps {
  playerId?: string | null;
  name: string;
  position?: string;
  team?: string | null;
  value?: number;
  /** Optional prefix element (e.g. +/− indicator for adds/drops) */
  prefix?: React.ReactNode;
  /** Optional content after the value (e.g. remove button) */
  suffix?: React.ReactNode;
  /** Additional className for the row container */
  className?: string;
}

function getPlayerImageUrl(playerId: string) {
  return `https://sleepercdn.com/content/nfl/players/${playerId}.jpg`;
}

export function AssetRow({
  playerId,
  name,
  position,
  team,
  value,
  prefix,
  suffix,
  className = '',
}: AssetRowProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const isPick = !playerId;

  return (
    <div className={`flex items-center gap-2.5 py-2 ${className}`}>
      {/* Avatar */}
      {isPick ? (
        <div className="w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
          <span className="text-[9px] font-bold text-cyan-400/70">PK</span>
        </div>
      ) : imgFailed ? (
        <div className="w-8 h-8 rounded-full bg-[#1b1b22] shrink-0" />
      ) : (
        <img
          src={getPlayerImageUrl(playerId)}
          alt=""
          className="w-8 h-8 rounded-full object-cover bg-[#1b1b22] shrink-0"
          onError={() => setImgFailed(true)}
        />
      )}

      {/* Name + Position/Team */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {prefix}
          <p className="text-[13px] font-semibold text-white truncate">{name}</p>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {position && <PositionBadge position={position} size="xs" />}
          {team && <span className="text-[11px] text-[#80808c]">{team}</span>}
        </div>
      </div>

      {/* Value */}
      {value !== undefined && (
        <span className="font-display text-sm font-bold text-white tabular-nums shrink-0">
          {value > 0 ? value.toLocaleString() : '—'}
        </span>
      )}

      {suffix}
    </div>
  );
}
