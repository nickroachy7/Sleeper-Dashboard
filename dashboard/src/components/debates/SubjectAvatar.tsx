import { useState } from 'react';
import type { Subject } from '../../lib/debates/types';

// ── SubjectAvatar ────────────────────────────────────────────────────────────
// A subject rarely has a headshot in our data, so the default is a deterministic
// initials disc — a stable hue derived from the subject id so the same person is
// always the same color across the app. If an imageUrl is provided it's used,
// falling back to the initials disc on load failure (mirrors AssetAvatar).

/** Deterministic hue (0–360) from a string — stable per subject. */
function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function SubjectAvatar({
  subject,
  size = 96,
  className = '',
}: {
  subject: Subject;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const px = { width: size, height: size };
  const hue = hueFor(subject.id);

  if (!failed && subject.imageUrl) {
    return (
      <img
        src={subject.imageUrl}
        alt={subject.name}
        loading="lazy"
        onError={() => setFailed(true)}
        style={px}
        className={`rounded-full object-cover object-top bg-[#101015] shrink-0 ${className}`}
      />
    );
  }

  return (
    <span
      style={{
        ...px,
        background: `linear-gradient(150deg, hsl(${hue} 55% 24%), hsl(${(hue + 40) % 360} 45% 16%))`,
        fontSize: size * 0.36,
      }}
      className={`inline-flex items-center justify-center rounded-full font-display font-bold text-white/90 border border-white/10 shrink-0 select-none ${className}`}
    >
      {initials(subject.name)}
    </span>
  );
}
