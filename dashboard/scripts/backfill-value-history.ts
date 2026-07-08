/**
 * One-off backfill of historical KTC superflex values into player_value_history.
 *
 * KTC player pages embed `var playerSuperflex = {...}` whose `overallValue`
 * array holds daily {d: 'YYMMDD', v: value} points back to ~2021. This script:
 *   1. Loads our players table (service role — RLS blocks anon writes)
 *   2. Parses the KTC rankings page for player slugs
 *   3. Fetches each matched player's page and extracts the history
 *   4. Downsamples (weekly > 90 days old, daily within 90 days) and upserts
 *
 * History is BASE superflex (KTC doesn't expose TEP history); the daily
 * sync's TEP snapshots differ slightly for TEs only.
 *
 * Run with:
 *   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-value-history.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
const DELAY_MS = 400;

interface KTCListPlayer {
  playerName: string;
  slug: string;
  position: string;
  team: string;
}

interface SleeperPlayer {
  player_id: string;
  full_name: string | null;
  position: string | null;
  team: string | null;
}

// ── Name matching (same rules as the sync-ktc-values edge function) ──

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''']/g, '')
    .replace(/[.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\bjr\b\.?/gi, '')
    .replace(/\bsr\b\.?/gi, '')
    .replace(/\bii\b/gi, '')
    .replace(/\biii\b/gi, '')
    .replace(/\biv\b/gi, '')
    .trim();
}

function findMatch(ktc: KTCListPlayer, players: SleeperPlayer[]): SleeperPlayer | null {
  const ktcNorm = normalizeName(ktc.playerName);
  for (const sp of players) {
    if (sp.full_name && normalizeName(sp.full_name) === ktcNorm) return sp;
  }
  for (const sp of players) {
    if (!sp.full_name || sp.position !== ktc.position || sp.team !== ktc.team) continue;
    const a = ktcNorm.split(' ');
    const b = normalizeName(sp.full_name).split(' ');
    if (a.length >= 2 && b.length >= 2 && a[a.length - 1] === b[b.length - 1] && a[0][0] === b[0][0]) {
      return sp;
    }
  }
  return null;
}

// ── KTC parsing ──

function parseVar(html: string, name: string): unknown {
  const m = html.match(new RegExp(`var ${name} = (\\[.*?\\]|\\{.*?\\});\\n`, 's'));
  if (!m) return null;
  return JSON.parse(m[1]);
}

/** 'YYMMDD' -> 'YYYY-MM-DD' */
function ktcDate(d: string): string {
  return `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
}

function downsample(history: { d: string; v: number }[]): { d: string; v: number }[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  return history.filter((pt) => {
    const date = new Date(ktcDate(pt.d));
    if (date >= cutoff) return true;       // daily for the last 90 days
    return date.getUTCDay() === 1;         // Mondays only for older data
  });
}

async function fetchWithRetry(url: string): Promise<string> {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw new Error('unreachable');
}

async function main() {
  const { data: players, error } = await supabase
    .from('players')
    .select('player_id, full_name, position, team');
  if (error || !players) throw error;
  console.log(`${players.length} players in DB`);

  const rankingsHtml = await fetchWithRetry('https://keeptradecut.com/dynasty-rankings');
  const ktcPlayers = (parseVar(rankingsHtml, 'playersArray') as (KTCListPlayer & { position: string })[])
    .filter((p) => p.position !== 'PICK' && p.position !== 'RDP');
  console.log(`${ktcPlayers.length} KTC players`);

  let matched = 0, unmatched = 0, totalRows = 0, failed = 0;
  let batch: { player_id: string; value: number; date: string; source: string }[] = [];

  const flush = async () => {
    if (!batch.length) return;
    const { error: upErr } = await supabase.from('player_value_history').upsert(batch, {
      onConflict: 'player_id,date,source',
      ignoreDuplicates: true,
    });
    if (upErr) console.error('Upsert error:', upErr.message);
    else totalRows += batch.length;
    batch = [];
  };

  for (const [i, ktc] of ktcPlayers.entries()) {
    const match = findMatch(ktc, players);
    if (!match) { unmatched++; continue; }
    matched++;

    try {
      const html = await fetchWithRetry(`https://keeptradecut.com/dynasty-rankings/players/${ktc.slug}`);
      const sf = parseVar(html, 'playerSuperflex') as { overallValue?: { d: string; v: number }[] } | null;
      const history = sf?.overallValue || [];
      for (const pt of downsample(history)) {
        batch.push({ player_id: match.player_id, value: pt.v, date: ktcDate(pt.d), source: 'keeptradecut' });
      }
      if (batch.length >= 2000) await flush();
    } catch (e) {
      failed++;
      console.error(`Failed ${ktc.slug}:`, (e as Error).message);
    }

    if ((i + 1) % 25 === 0) console.log(`${i + 1}/${ktcPlayers.length} processed (${totalRows + batch.length} rows queued)`);
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  await flush();

  console.log(`Done. matched=${matched} unmatched=${unmatched} pageFailures=${failed} rowsInserted=${totalRows}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
