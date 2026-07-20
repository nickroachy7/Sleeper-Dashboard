// ── Vote assets: players and draft picks in one id space ─────────────────────
// The personal board and vote events treat a draft pick as an asset alongside
// players. A pick is identified by year-round ('YYYY-R') — the granularity the
// community rates picks at (Early/Mid/Late are display multipliers on top).
//
// On the personal board (user_player_ratings.player_id) a pick is stored with a
// 'PICK:' sentinel prefix; in a value_events side it's { pick: 'YYYY-R' }. These
// helpers convert between the two and to a human label, so the pool, the vote
// helper, and the cards never hardcode the format.

const PICK_PREFIX = 'PICK:';

/** Board sentinel id for a pick, e.g. pickAssetId('2027', 1) → 'PICK:2027-1'. */
export function pickAssetId(year: string, round: number): string {
  return `${PICK_PREFIX}${year}-${round}`;
}

export function isPickAsset(id: string): boolean {
  return id.startsWith(PICK_PREFIX);
}

/** 'PICK:2027-1' → { year:'2027', round:1 }, or null for a player id. */
export function parsePickAsset(id: string): { year: string; round: number } | null {
  if (!isPickAsset(id)) return null;
  const [year, round] = id.slice(PICK_PREFIX.length).split('-');
  const r = Number(round);
  if (!year || !Number.isFinite(r)) return null;
  return { year, round: r };
}

/** The value_events side key for a pick id: 'PICK:2027-1' → '2027-1'. */
export function pickEventKey(id: string): string | null {
  const p = parsePickAsset(id);
  return p ? `${p.year}-${p.round}` : null;
}

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];

/** Human label for a pick id: 'PICK:2027-1' → '2027 1st'. */
export function pickLabel(id: string): string {
  const p = parsePickAsset(id);
  if (!p) return id;
  return `${p.year} ${ORDINAL[p.round] ?? `R${p.round}`}`;
}
