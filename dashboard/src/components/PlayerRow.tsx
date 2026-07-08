import { PositionBadge } from './PositionBadge';

interface PlayerRowProps {
  playerId?: string;
  name: string;
  position?: string;
  team?: string | null;
  value?: number;
  variant?: 'compact' | 'standard' | 'featured';
  showAvatar?: boolean;
  injuryStatus?: string | null;
  rightContent?: React.ReactNode;
  accentColor?: string;
}

function getPlayerImageUrl(playerId: string) {
  return `https://sleepercdn.com/content/nfl/players/${playerId}.jpg`;
}

export function PlayerRow({
  playerId,
  name,
  position,
  team,
  value,
  variant = 'standard',
  showAvatar = true,
  injuryStatus,
  rightContent,
  accentColor,
}: PlayerRowProps) {
  const isCompact = variant === 'compact';
  const isFeatured = variant === 'featured';

  const avatarSize = isCompact ? 'w-5 h-5' : isFeatured ? 'w-9 h-9' : 'w-7 h-7';
  const nameSize = isCompact ? 'text-[13px]' : isFeatured ? 'text-sm font-bold' : 'text-[13px] sm:text-sm font-medium';
  const rowPadding = isCompact ? 'py-1' : isFeatured ? 'py-2.5' : 'py-2';

  return (
    <div
      className={`flex items-center gap-2 ${rowPadding} group animate-smooth ${isFeatured ? 'hover:bg-[#1b1b22] rounded-lg px-2 -mx-2' : ''}`}
      style={accentColor ? { borderLeft: `3px solid ${accentColor}`, paddingLeft: '8px' } : undefined}
    >
      {showAvatar && (
        playerId ? (
          <img
            src={getPlayerImageUrl(playerId)}
            alt=""
            className={`${avatarSize} rounded-full object-cover bg-[#1b1b22] flex-shrink-0`}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className={`${avatarSize} rounded-full bg-[#1b1b22] flex items-center justify-center flex-shrink-0`}>
            <span className="text-[8px] font-bold text-[#75757f]">PK</span>
          </div>
        )
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`${nameSize} text-[#d6d6de] truncate`}>{name}</span>
          {injuryStatus && (
            <span className="px-1 py-0.5 text-[9px] bg-red-500/20 text-red-400 rounded font-bold leading-none">
              {injuryStatus}
            </span>
          )}
        </div>
        {(position || team) && !isCompact && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {position && <PositionBadge position={position} size="xs" />}
            {team && <span className="text-[11px] text-[#60606a]">{team}</span>}
          </div>
        )}
        {isCompact && (position || team) && (
          <span className="text-[11px] text-[#60606a]">
            {position}{team ? ` · ${team}` : ''}
          </span>
        )}
      </div>

      {rightContent}

      {value !== undefined && (
        <span className={`tabular-nums shrink-0 ${isFeatured ? 'text-sm font-bold text-white' : 'text-[11px] text-[#75757f]'}`}>
          {value > 0 ? value.toLocaleString() : '—'}
        </span>
      )}
    </div>
  );
}
