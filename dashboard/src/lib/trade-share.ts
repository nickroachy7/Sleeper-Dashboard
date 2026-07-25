import type { TradeAsset } from './trade-shared';

// ── Shareable trades ─────────────────────────────────────────────────────────
// Encode a two-sided trade into URL params so a manager can send "here's the
// deal + the grade" to a leaguemate. No schema, no backend — the whole trade
// lives in the link. Asset ids are already URL-safe (`player-<id>`,
// `pick-<year>-<round>-<tier>`), so a side is just a comma-joined id list.
//
// Shared links open the Evaluator in GLOBAL mode (they cross leagues), so decode
// resolves ids against the global player/pick pools the caller passes in.

export const SHARE_PARAM_A = 'a';
export const SHARE_PARAM_B = 'b';

/** Build the ?a=…&b=… query for a trade's two sides (empty string if nothing
 *  to share). */
export function encodeTradeParams(sideA: TradeAsset[], sideB: TradeAsset[]): URLSearchParams {
  const p = new URLSearchParams();
  if (sideA.length) p.set(SHARE_PARAM_A, sideA.map((x) => x.id).join(','));
  if (sideB.length) p.set(SHARE_PARAM_B, sideB.map((x) => x.id).join(','));
  return p;
}

/** Full absolute share URL for the current origin's evaluator. */
export function buildShareUrl(sideA: TradeAsset[], sideB: TradeAsset[]): string {
  const params = encodeTradeParams(sideA, sideB);
  params.set('tab', 'evaluate');
  return `${window.location.origin}/trade?${params.toString()}`;
}

/** Resolve a comma-joined id list back into assets from the global pools. */
export function decodeSide(raw: string | null, pool: Map<string, TradeAsset>): TradeAsset[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((id) => pool.get(id))
    .filter((a): a is TradeAsset => !!a);
}

/** Whether the current URL carries a shared trade. */
export function hasSharedTrade(search: string): boolean {
  const p = new URLSearchParams(search);
  return p.has(SHARE_PARAM_A) || p.has(SHARE_PARAM_B);
}
