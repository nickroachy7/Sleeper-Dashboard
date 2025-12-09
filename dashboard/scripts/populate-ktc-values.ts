/**
 * Script to fetch KTC dynasty values and match them to Sleeper players in the database
 * 
 * Run with: npx tsx scripts/populate-ktc-values.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ieviegvkitwwtttgrcso.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlldmllZ3ZraXR3d3R0dGdyY3NvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMDk1ODEsImV4cCI6MjA4MDc4NTU4MX0.8rESwDRKJIDqu5uhr5HV36wqTmJ0cTIZO8NkfLQiI3c';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface KTCPlayer {
  playerID: number;
  playerName: string;
  slug: string;
  position: string;
  team: string;
  age: number;
  superflexValues: {
    value: number;
    rank: number;
    positionalRank?: number;
    overallTier: number;
    positionalTier?: number;
    overallTrend?: number;
  };
  oneQBValues: {
    value: number;
    rank: number;
    positionalRank?: number;
    overallTier: number;
    positionalTier?: number;
    overallTrend?: number;
  };
}

interface SleeperPlayer {
  player_id: string;
  full_name: string;
  position: string;
  team: string;
}

// Normalize name for matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''']/g, '')  // Remove apostrophes
    .replace(/[.-]/g, ' ')   // Replace dots and hyphens with spaces
    .replace(/\s+/g, ' ')    // Collapse multiple spaces
    .replace(/\bjr\b\.?/gi, '')  // Remove Jr
    .replace(/\bsr\b\.?/gi, '')  // Remove Sr
    .replace(/\bii\b/gi, '')     // Remove II
    .replace(/\biii\b/gi, '')    // Remove III
    .replace(/\biv\b/gi, '')     // Remove IV
    .trim();
}

// Try to match KTC player to Sleeper player
function findMatch(ktcPlayer: KTCPlayer, sleeperPlayers: SleeperPlayer[]): SleeperPlayer | null {
  const ktcNormalized = normalizeName(ktcPlayer.playerName);
  
  // First try exact name match
  for (const sp of sleeperPlayers) {
    if (normalizeName(sp.full_name) === ktcNormalized) {
      return sp;
    }
  }
  
  // Try matching with same position and team
  for (const sp of sleeperPlayers) {
    const spNormalized = normalizeName(sp.full_name);
    // Check if names are similar (one contains the other or share significant parts)
    if (sp.position === ktcPlayer.position && sp.team === ktcPlayer.team) {
      // Check if last names match and first name starts with same letter
      const ktcParts = ktcNormalized.split(' ');
      const spParts = spNormalized.split(' ');
      if (ktcParts.length >= 2 && spParts.length >= 2) {
        const ktcLast = ktcParts[ktcParts.length - 1];
        const spLast = spParts[spParts.length - 1];
        const ktcFirst = ktcParts[0];
        const spFirst = spParts[0];
        
        if (ktcLast === spLast && ktcFirst[0] === spFirst[0]) {
          return sp;
        }
      }
    }
  }
  
  return null;
}

async function fetchKTCData(): Promise<KTCPlayer[]> {
  console.log('Fetching KTC dynasty rankings...');
  
  const response = await fetch('https://keeptradecut.com/dynasty-rankings');
  const html = await response.text();
  
  // Extract playersArray from the HTML
  const match = html.match(/var\s+playersArray\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    throw new Error('Could not find playersArray in KTC page');
  }
  
  const playersArray = JSON.parse(match[1]) as KTCPlayer[];
  console.log(`Found ${playersArray.length} players from KTC`);
  
  return playersArray;
}

async function fetchSleeperPlayers(): Promise<SleeperPlayer[]> {
  console.log('Fetching Sleeper players from database...');
  
  const { data, error } = await supabase
    .from('players')
    .select('player_id, full_name, position, team');
  
  if (error) {
    throw new Error(`Failed to fetch players: ${error.message}`);
  }
  
  console.log(`Found ${data.length} players in database`);
  return data;
}

async function populatePlayerValues() {
  try {
    // Fetch data from both sources
    const [ktcPlayers, sleeperPlayers] = await Promise.all([
      fetchKTCData(),
      fetchSleeperPlayers()
    ]);
    
    // Clear existing player values
    console.log('Clearing existing player values...');
    const { error: deleteError } = await supabase
      .from('player_values')
      .delete()
      .neq('player_id', '');  // Delete all rows
    
    if (deleteError) {
      console.warn('Warning deleting existing values:', deleteError.message);
    }
    
    // Match and prepare values
    const playerValues: any[] = [];
    const unmatchedPlayers: string[] = [];
    
    for (const ktcPlayer of ktcPlayers) {
      // Skip draft picks
      if (ktcPlayer.position === 'PICK' || ktcPlayer.position === 'RDP') {
        continue;
      }
      
      const match = findMatch(ktcPlayer, sleeperPlayers);
      
      if (match) {
        playerValues.push({
          player_id: match.player_id,
          value: ktcPlayer.superflexValues?.value || 0,
          rank: ktcPlayer.superflexValues?.rank || null,
          position_rank: ktcPlayer.superflexValues?.positionalRank || null,
          tier: ktcPlayer.superflexValues?.overallTier || null,
          trend: ktcPlayer.superflexValues?.overallTrend || 0,
          superflex: true,
          source: 'keeptradecut',
          fetched_at: new Date().toISOString()
        });
      } else {
        unmatchedPlayers.push(`${ktcPlayer.playerName} (${ktcPlayer.position}, ${ktcPlayer.team})`);
      }
    }
    
    console.log(`\nMatched ${playerValues.length} players`);
    console.log(`Unmatched: ${unmatchedPlayers.length} players`);
    
    // Insert in batches
    if (playerValues.length > 0) {
      console.log('\nInserting player values...');
      const batchSize = 100;
      let inserted = 0;
      
      for (let i = 0; i < playerValues.length; i += batchSize) {
        const batch = playerValues.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from('player_values')
          .insert(batch);
        
        if (insertError) {
          console.error(`Error inserting batch ${i / batchSize + 1}:`, insertError.message);
        } else {
          inserted += batch.length;
          console.log(`Inserted ${inserted}/${playerValues.length} values...`);
        }
      }
      
      console.log(`\n✅ Successfully inserted ${inserted} player values!`);
    }
    
    // Show sample of unmatched players
    if (unmatchedPlayers.length > 0) {
      console.log('\nSample unmatched players (first 20):');
      unmatchedPlayers.slice(0, 20).forEach(p => console.log(`  - ${p}`));
    }
    
    // Verify the data
    const { data: verification, error: verifyError } = await supabase
      .from('player_values')
      .select('ktc_player_name, value, rank')
      .order('rank', { ascending: true })
      .limit(10);
    
    if (!verifyError && verification) {
      console.log('\n📊 Top 10 Dynasty Players:');
      verification.forEach((p, i) => {
        console.log(`  ${i + 1}. Value: ${p.value} (Rank #${p.rank})`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
populatePlayerValues();
