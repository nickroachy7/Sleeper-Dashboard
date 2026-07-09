/**
 * Backfill full VALUE HISTORY for sub-500 KTC players.
 *
 * Companion to backfill-missing-ktc-values.ts. That script wrote the *current*
 * value for players ranked below KTC's top-500 (e.g. Odell Beckham), but only a
 * single history point dated today. With one point, the "Value Since The Trade"
 * chart on a trade detail page has nothing to draw — it collapses to a lone dot.
 *
 * KTC's individual player pages embed the player's ENTIRE value history inline
 * as `[{"d":"YYMMDD","v":N},…]` arrays (multiple series: superflex/oneQB base
 * and TEP, plus rank histories). This script fetches each recovered player's
 * page, picks the SUPERFLEX BASE value series (identified by matching its final
 * point to superflexValues.value — the same base-superflex basis the daily sync
 * uses for history), and upserts every point into player_value_history.
 *
 * Run with:
 *   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-missing-ktc-history.ts
 *
 * Idempotent: upserts on (player_id, date, source); re-runs are safe.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const CONCURRENCY = 5;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\bjr\b\.?/gi, '')
    .replace(/\bsr\b\.?/gi, '')
    .replace(/\bii\b/gi, '')
    .replace(/\biii\b/gi, '')
    .replace(/\biv\b/gi, '')
    .trim();
}

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const pageSize = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
  }
  return all;
}

async function fetchSitemapSlugs(): Promise<string[]> {
  const resp = await fetch('https://keeptradecut.com/sitemap-dynasty.xml', { headers: { 'User-Agent': UA } });
  const xml = await resp.text();
  return [...new Set([...xml.matchAll(/\/dynasty-rankings\/players\/([a-z0-9-]+)/g)].map((m) => m[1]))];
}

interface PlayerHistory {
  playerName: string;
  position: string;
  points: { date: string; value: number }[];
}

/** "260708" → "2026-07-08" */
function decodeDate(d: string): string {
  return `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
}

/**
 * Fetch a KTC player page and extract the superflex-base value history.
 * The page embeds several `[{"d","v"}]` series (value + rank, superflex + 1QB,
 * base + TEP). We identify the superflex-base VALUE series by matching its final
 * point to the page's current superflexValues.value.
 */
async function fetchPlayerHistory(slug: string): Promise<PlayerHistory | null> {
  try {
    const resp = await fetch(`https://keeptradecut.com/dynasty-rankings/players/${slug}`, {
      headers: { 'User-Agent': UA },
    });
    if (!resp.ok) return null;
    const html = await resp.text();

    const pm = html.match(/var\s+player\s*=\s*(\{[\s\S]*?\});/);
    if (!pm) return null;
    const player = JSON.parse(pm[1]);
    const currentValue: number = player.superflexValues?.value ?? 0;
    if (currentValue <= 0) return null;

    // All embedded {d,v} series on the page.
    const seriesMatches = html.match(/\[(?:\{"d":"\d{6}","v":\d+\},?)+\]/g) ?? [];
    const parsed = seriesMatches
      .map((s) => JSON.parse(s) as { d: string; v: number }[])
      .filter((a) => a.length > 1);

    // The value series ends at the current value; rank series don't. Prefer the
    // longest series whose last point equals the known current superflex value.
    const valueSeries = parsed
      .filter((a) => a[a.length - 1].v === currentValue)
      .sort((a, b) => b.length - a.length)[0];
    if (!valueSeries) return null;

    return {
      playerName: player.playerName,
      position: player.position,
      points: valueSeries.map((p) => ({ date: decodeDate(p.d), value: p.v })),
    };
  } catch {
    return null;
  }
}

async function main() {
  console.log('Loading players + which ones already have MULTI-point history…');
  const players = await fetchAll<{ player_id: string; full_name: string; position: string }>(
    'players',
    'player_id, full_name, position'
  );
  const valued = new Set(
    (await fetchAll<{ player_id: string }>('player_values', 'player_id')).map((r) => r.player_id)
  );

  // Count history points per player so we only backfill the sparse ones.
  const histCount = new Map<string, number>();
  for (const r of await fetchAll<{ player_id: string }>('player_value_history', 'player_id')) {
    histCount.set(r.player_id, (histCount.get(r.player_id) ?? 0) + 1);
  }

  // Target: valued players with <= 1 history point (the ones the value-backfill added).
  const byName = new Map<string, { player_id: string; position: string }[]>();
  let targetCount = 0;
  for (const p of players) {
    if (!p.full_name || !valued.has(p.player_id)) continue;
    if ((histCount.get(p.player_id) ?? 0) > 1) continue; // already has a real series
    const key = normalizeName(p.full_name);
    const arr = byName.get(key) ?? [];
    arr.push({ player_id: p.player_id, position: p.position });
    byName.set(key, arr);
    targetCount++;
  }
  console.log(`  ${targetCount} valued players missing a real history series`);

  const slugs = await fetchSitemapSlugs();
  const deslug = (s: string) => normalizeName(s.replace(/-\d+$/, '').replace(/-/g, ' '));
  const candidates = slugs.filter((s) => byName.has(deslug(s)));
  console.log(`  ${candidates.length} sitemap slugs map to a target — fetching history…`);

  const rows: { player_id: string; value: number; date: string; source: string }[] = [];
  let recovered = 0;

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((slug) => fetchPlayerHistory(slug).then((h) => ({ slug, h }))));
    for (const { slug, h } of results) {
      if (!h) continue;
      const cands = byName.get(deslug(slug)) ?? [];
      const match = cands.find((p) => p.position === h.position) ?? (cands.length === 1 ? cands[0] : null);
      if (!match) continue;
      recovered++;
      for (const pt of h.points) {
        rows.push({ player_id: match.player_id, value: pt.value, date: pt.date, source: 'keeptradecut' });
      }
    }
    process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, candidates.length)}/${candidates.length} pages`);
  }
  console.log(`\n  ${recovered} players → ${rows.length} history points`);

  if (!rows.length) { console.log('Nothing to write.'); return; }

  // Upsert in chunks (idempotent on player_id,date,source).
  const CHUNK = 1000;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('player_value_history')
      .upsert(chunk, { onConflict: 'player_id,date,source', ignoreDuplicates: true });
    if (error) { console.error(`chunk ${i} failed:`, error.message); continue; }
    written += chunk.length;
    process.stdout.write(`\r  wrote ${written}/${rows.length}`);
  }
  console.log(`\n✅ Backfilled history for ${recovered} players (${written} points).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
