/**
 * Backfill KTC values for players ranked BELOW KeepTradeCut's top-500 bulk list.
 *
 * The daily `sync-ktc-values` edge function scrapes the `playersArray` embedded
 * in https://keeptradecut.com/dynasty-rankings, which KTC hard-caps at 500
 * entries. Players ranked lower (e.g. Odell Beckham, rank ~679) never appear
 * there, so they get no value row and render as "—" in the app.
 *
 * KTC *does* publish those players on their individual pages, and every ranked
 * dynasty player is listed in https://keeptradecut.com/sitemap-dynasty.xml with
 * a slug of the form `{name}-{ktcID}`. This script:
 *   1. reads every Sleeper player + which ones already have a value,
 *   2. pulls the dynasty sitemap for the full set of ranked-player slugs,
 *   3. for each sitemap player that maps to an unvalued Sleeper player, fetches
 *      the individual page and extracts the real Superflex TEP value,
 *   4. verifies position (guards against name-collision false matches),
 *   5. upserts the recovered values into player_values (+ a history snapshot).
 *
 * Run with:
 *   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-missing-ktc-values.ts
 *
 * Non-destructive: only upserts rows for players currently missing a value.
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

interface SleeperPlayer {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
}

// Same normalization the sync uses, so matches stay consistent.
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

/** All dynasty player-page slugs KTC publishes (name-ktcID). */
async function fetchSitemapSlugs(): Promise<string[]> {
  const resp = await fetch('https://keeptradecut.com/sitemap-dynasty.xml', { headers: { 'User-Agent': UA } });
  const xml = await resp.text();
  const slugs = [...xml.matchAll(/\/dynasty-rankings\/players\/([a-z0-9-]+)/g)].map((m) => m[1]);
  return [...new Set(slugs)];
}

/** Fetch one player page and pull its Superflex TEP value + position/team. */
async function fetchPlayerValue(
  slug: string
): Promise<{ name: string; position: string; team: string; value: number } | null> {
  try {
    const resp = await fetch(`https://keeptradecut.com/dynasty-rankings/players/${slug}`, {
      headers: { 'User-Agent': UA },
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const m = html.match(/var\s+player\s*=\s*(\{[\s\S]*?\});/);
    if (!m) return null;
    const player = JSON.parse(m[1]);
    const sf = player.superflexValues ?? {};
    // Prefer TEP (what the app displays); fall back to base superflex.
    const value = sf.tep?.value ?? sf.value ?? 0;
    return { name: player.playerName, position: player.position, team: player.team, value };
  } catch {
    return null;
  }
}

async function main() {
  console.log('Loading Sleeper players + existing values…');
  const players = await fetchAll<SleeperPlayer>('players', 'player_id, full_name, position, team');
  const valued = new Set((await fetchAll<{ player_id: string }>('player_values', 'player_id')).map((r) => r.player_id));

  // Index unvalued Sleeper players by normalized name (dropping ambiguous dupes).
  const byName = new Map<string, SleeperPlayer[]>();
  for (const p of players) {
    if (!p.full_name || valued.has(p.player_id)) continue;
    const key = normalizeName(p.full_name);
    (byName.get(key) ?? byName.set(key, []).get(key)!).push(p);
  }
  console.log(`  ${players.length} players, ${valued.size} already valued, ${byName.size} unvalued names to try`);

  console.log('Fetching KTC dynasty sitemap…');
  const slugs = await fetchSitemapSlugs();
  console.log(`  ${slugs.length} ranked-player slugs`);

  // Candidate slugs: those whose de-slugged name matches an unvalued Sleeper player.
  const deslug = (s: string) => normalizeName(s.replace(/-\d+$/, '').replace(/-/g, ' '));
  const candidates = slugs.filter((s) => byName.has(deslug(s)));
  console.log(`  ${candidates.length} slugs map to an unvalued player — fetching pages…`);

  const recovered: { player_id: string; value: number; name: string }[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((slug) => fetchPlayerValue(slug).then((v) => ({ slug, v }))));
    for (const { slug, v } of results) {
      if (!v || v.value <= 0) { skipped.push(`${slug} (no value)`); continue; }
      const matches = byName.get(deslug(slug)) ?? [];
      // Verify position to avoid name-collision false matches (e.g. two J. Smiths).
      const match = matches.find((p) => p.position === v.position) ?? (matches.length === 1 ? matches[0] : null);
      if (!match) { skipped.push(`${slug} (pos ${v.position} no unique match)`); continue; }
      recovered.push({ player_id: match.player_id, value: v.value, name: v.name });
    }
    process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, candidates.length)}/${candidates.length}`);
  }
  console.log(`\n  recovered ${recovered.length} values, skipped ${skipped.length}`);
  recovered.sort((a, b) => b.value - a.value).forEach((r) => console.log(`    ${r.name}: ${r.value}`));

  if (!recovered.length) { console.log('Nothing to write.'); return; }

  const today = new Date().toISOString().split('T')[0];
  const valueRows = recovered.map((r) => ({
    player_id: r.player_id, value: r.value, superflex: true, source: 'keeptradecut', fetched_at: new Date().toISOString(),
  }));
  const historyRows = recovered.map((r) => ({
    player_id: r.player_id, value: r.value, date: today, source: 'keeptradecut',
  }));

  console.log('Upserting player_values…');
  const { error: vErr } = await supabase.from('player_values').upsert(valueRows, { onConflict: 'player_id,source,superflex' });
  if (vErr) { console.error('player_values upsert failed:', vErr.message); process.exit(1); }
  const { error: hErr } = await supabase.from('player_value_history').upsert(historyRows, { onConflict: 'player_id,date,source', ignoreDuplicates: true });
  if (hErr) console.warn('history upsert warning:', hErr.message);

  console.log(`✅ Wrote ${valueRows.length} recovered values.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
