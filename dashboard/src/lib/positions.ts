// ── Position sets ─────────────────────────────────────────────────
// One source of truth for which Sleeper position codes count as offense
// ("skill") vs individual defensive players (IDP). Before this module the
// skill set (`['QB','RB','WR','TE']`) was copy-pasted across the vote pools,
// the Ranking pills, and the Profile board — easy to expand in one place and
// miss another. Everything that filters players by position now routes here.
//
// IDP_POSITIONS mirrors the backend's canonical list (kept in sync with
// supabase/functions/compute-community-values IDP_POSITIONS and
// scripts/seed-idp-prior). Most dynasty leagues run offense-only, so IDP is
// hidden behind an opt-in preference (see idp-store.ts) — these sets are the
// vocabulary that preference filters against.

/** Offensive skill positions — always shown, always votable. */
export const SKILL_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

/** Individual defensive player positions (IDP). Hidden unless opted in. */
export const IDP_POSITIONS = new Set([
  'DL', 'DE', 'DT', 'NT', 'EDGE',
  'LB', 'ILB', 'OLB', 'MLB',
  'DB', 'CB', 'S', 'SS', 'FS',
]);

/** The IDP filter pills offered on ranking boards, grouped into the three
 *  slots Sleeper IDP leagues actually roster (DL / LB / DB). Each pill matches
 *  a family of raw position codes. */
export const IDP_FILTER_GROUPS: { value: string; label: string; codes: string[] }[] = [
  { value: 'DL', label: 'DL', codes: ['DL', 'DE', 'DT', 'NT', 'EDGE'] },
  { value: 'LB', label: 'LB', codes: ['LB', 'ILB', 'OLB', 'MLB'] },
  { value: 'DB', label: 'DB', codes: ['DB', 'CB', 'S', 'SS', 'FS'] },
];

const IDP_GROUP_BY_VALUE = new Map(IDP_FILTER_GROUPS.map((g) => [g.value, g.codes]));

/** True when a raw position code is an individual defensive player. */
export function isIdp(position: string | null | undefined): boolean {
  return !!position && IDP_POSITIONS.has(position);
}

// ── Position hues ─────────────────────────────────────────────────
// The single accent color a position carries across the rebuilt UI — the
// left rail on a player row, the position chip, and the value meter fill. This
// is the ONE place color enters the otherwise-monochrome design, so it lives in
// one map. Muted, desaturated tones (not neon) so a long board reads calm.
const POSITION_HUES: Record<string, string> = {
  QB: '#f26d6d',   // muted red
  RB: '#5b9df0',   // muted blue
  WR: '#e8b055',   // muted amber
  TE: '#3fbfae',   // muted teal
  K: '#d4b74a',
  DEF: '#9b87e0',
  PICK: '#4cc4d6', // cyan — draft picks
  // IDP families share one hue per slot group (matches the badge grouping).
  DL: '#e08a4c', DE: '#e08a4c', DT: '#e08a4c', NT: '#e08a4c', EDGE: '#e08a4c',
  LB: '#93c05a', ILB: '#93c05a', OLB: '#93c05a', MLB: '#93c05a',
  DB: '#5aa9d6', CB: '#5aa9d6', S: '#5aa9d6', SS: '#5aa9d6', FS: '#5aa9d6',
};

const NEUTRAL_HUE = '#8a8a95';

/** The accent hue for a position (rail / chip / meter). Neutral grey when the
 *  position is unknown or a plain pick placeholder. */
export function positionHue(position: string | null | undefined): string {
  if (!position) return NEUTRAL_HUE;
  return POSITION_HUES[position.toUpperCase()] ?? NEUTRAL_HUE;
}

/**
 * Whether a player is eligible to appear / be voted on, given the viewer's
 * IDP preference. Offense is always eligible; IDP only when opted in. This is
 * the single gate the Ranking board, the three vote pools, the feed movers,
 * and the profile boards all share.
 */
export function isVisiblePosition(position: string | null | undefined, showIdp: boolean): boolean {
  if (!position) return false;
  if (isIdp(position)) return showIdp;
  return true;
}

/**
 * Match a player's raw position against a ranking-board filter value. Skill
 * pills (QB/RB/WR/TE) are exact matches; IDP pills (DL/LB/DB) match their
 * whole family so e.g. "DL" catches DE/DT/NT/EDGE too.
 */
export function matchesPositionFilter(position: string | null | undefined, filter: string): boolean {
  if (filter === 'ALL') return true;
  if (!position) return false;
  const group = IDP_GROUP_BY_VALUE.get(filter);
  if (group) return group.includes(position);
  return position === filter;
}
