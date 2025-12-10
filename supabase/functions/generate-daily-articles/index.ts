/**
 * Edge Function: generate-daily-articles
 * 
 * Generates 8 AI-powered league news articles.
 * Runs once daily at 7am via cron job.
 * Deletes previous day's articles and creates fresh ones.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ARTICLES_TO_GENERATE = 8;

// Valid article types that match the database constraint
const VALID_ARTICLE_TYPES = [
  "trade",
  "standings",
  "roster",
  "value",
  "recap",
  "power_rankings",
  "matchup_preview",
  "hot_streak",
  "cold_streak",
  "waiver_wire",
  "rivalry",
  "playoff_race",
  "dynasty_outlook",
  "unlucky_team",
  "lucky_team",
  "sleeper_pick",
  "bust_alert",
  "weekly_recap",
  "general",
] as const;

// Story prompts with team focus indices to ensure variety
// teamFocus: 0=first place, 1=second, 2=third, etc. -1=last, -2=second last, etc.
// "middle" means pick from ranks 4-9
const STORY_PROMPTS: { type: string; prompt: string; teamFocus: string }[] = [
  { type: "power_rankings", prompt: "power rankings overview focusing on the top 3 teams", teamFocus: "top3" },
  { type: "trade", prompt: "recent trade analysis", teamFocus: "traders" },
  { type: "roster", prompt: "team spotlight on a middle-of-the-pack team (ranks 4-8)", teamFocus: "middle" },
  { type: "dynasty_outlook", prompt: "dynasty outlook for a rebuilding team with high pick value", teamFocus: "rebuilder" },
  { type: "standings", prompt: "playoff bubble teams fighting for position (ranks 5-8)", teamFocus: "bubble" },
  { type: "hot_streak", prompt: "spotlight on the 2nd or 3rd place team", teamFocus: "contender" },
  { type: "cold_streak", prompt: "analysis of a struggling team in the bottom half", teamFocus: "bottom" },
  { type: "playoff_race", prompt: "playoff race analysis for teams ranked 3-6", teamFocus: "race" },
];

// Build embedded data based on article type for visual embeds in the UI
function buildEmbeddedData(
  context: LeagueContext,
  storyPrompt: { type: string; prompt: string; teamFocus: string }
): Record<string, any> {
  const { type, teamFocus } = storyPrompt;
  const embeddedData: Record<string, any> = {};

  // For trade articles, include trade transaction IDs
  if (type === "trade" && context.recentTrades.length > 0) {
    embeddedData.trades = context.recentTrades.slice(0, 3).map(t => t.transactionId);
  }

  // For standings/power rankings articles, include standings data
  if (type === "standings" || type === "power_rankings" || type === "playoff_race") {
    let teamsToShow: StandingsTeam[] = [];
    let title = "Current Standings";

    if (type === "power_rankings" || teamFocus === "top3") {
      teamsToShow = context.standings.slice(0, 6); // Top 6
      title = "Power Rankings";
    } else if (teamFocus === "bubble" || type === "playoff_race") {
      teamsToShow = context.standings.slice(3, 9); // Ranks 4-9
      title = "Playoff Bubble";
    } else {
      teamsToShow = context.standings; // All teams
    }

    embeddedData.standings = {
      title,
      teams: teamsToShow.map((t, idx) => ({
        rank: context.standings.indexOf(t) + 1,
        teamName: t.teamName,
        wins: t.wins,
        losses: t.losses,
        points: t.totalPoints,
        playerValue: t.playerValue,
        pickValue: t.pickValue,
        totalValue: t.totalValue,
      })),
    };
  }

  // For roster/dynasty articles, include team data
  if (type === "roster" || type === "dynasty_outlook" || type === "hot_streak" || type === "cold_streak") {
    let teamsToShow: StandingsTeam[] = [];
    let title = "Team Breakdown";

    if (teamFocus === "middle") {
      teamsToShow = context.standings.slice(3, 8); // Ranks 4-8
      title = "Middle of the Pack";
    } else if (teamFocus === "rebuilder") {
      // Get team with highest pick value
      const byPickValue = [...context.standings].sort((a, b) => b.pickValue - a.pickValue);
      teamsToShow = byPickValue.slice(0, 2);
      title = "Rebuilding Teams";
    } else if (teamFocus === "contender") {
      teamsToShow = context.standings.slice(1, 4); // Ranks 2-4
      title = "Contenders";
    } else if (teamFocus === "bottom") {
      teamsToShow = context.standings.slice(-4); // Bottom 4
      title = "Struggling Teams";
    }

    embeddedData.rosters = {
      title,
      teams: teamsToShow.map(t => ({
        teamName: t.teamName,
        wins: t.wins,
        losses: t.losses,
        playerValue: t.playerValue,
        pickValue: t.pickValue,
        totalValue: t.totalValue,
      })),
    };
  }

  return embeddedData;
}

interface StandingsTeam {
  rosterId: number;
  teamName: string;
  ownerName: string;
  wins: number;
  losses: number;
  totalPoints: number;
  pointsAgainst: number;
  playerValue: number;  // Value of players only
  pickValue: number;    // Value of draft picks owned
  totalValue: number;   // Combined player + pick value
}

interface TradeData {
  transactionId: string;
  date: string;
  teams: { rosterId: number; teamName: string }[];
  assets: Record<number, {
    players: { playerId: string; name: string; position: string; value: number }[];
    picks: { season: string; round: number }[];
    totalValue: number;
  }>;
  valueDiff: number;
}

interface LeagueContext {
  leagueName: string;
  standings: StandingsTeam[];
  recentTrades: TradeData[];
  mostActiveTraders: { teamName: string; tradeCount: number }[];
}

// Fetch all league data for article generation
async function fetchLeagueContext(supabase: any, leagueId: string): Promise<LeagueContext> {
  const [
    leagueRes,
    rostersRes,
    transactionsRes,
    usersRes,
    leagueUsersRes,
    playersRes,
    playerValuesRes,
    pickValuesRes,
    tradedPicksRes,
  ] = await Promise.all([
    supabase.from("leagues").select("*").eq("league_id", leagueId).single(),
    supabase.from("rosters").select("*").eq("league_id", leagueId),
    supabase.from("transactions").select("*").eq("league_id", leagueId).order("created", { ascending: false }),
    supabase.from("users").select("*"),
    supabase.from("league_users").select("*").eq("league_id", leagueId),
    supabase.from("players").select("player_id, full_name, position, team"),
    supabase.from("player_values").select("player_id, value"),
    supabase.from("pick_values").select("pick_year, pick_round, pick_tier, value"),
    supabase.from("traded_picks").select("*").eq("league_id", leagueId),
  ]);

  const league = leagueRes.data;
  const rosters = rostersRes.data || [];
  const transactions = transactionsRes.data || [];
  const users = usersRes.data || [];
  const leagueUsers = leagueUsersRes.data || [];
  const players = playersRes.data || [];
  const playerValues = playerValuesRes.data || [];
  const pickValues = pickValuesRes.data || [];
  const tradedPicks = tradedPicksRes.data || [];

  // Build lookup maps
  const playerMap = new Map(players.map((p: any) => [p.player_id, p]));
  const valueMap = new Map(playerValues.map((pv: any) => [pv.player_id, pv.value]));
  const rosterToOwner = new Map(rosters.map((r: any) => [r.roster_id, r.owner_id]));

  const getTeamName = (rosterId: number): string => {
    const ownerId = rosterToOwner.get(rosterId);
    const leagueUser = leagueUsers.find((lu: any) => lu.user_id === ownerId);
    const user = users.find((u: any) => u.user_id === ownerId);
    return leagueUser?.team_name || leagueUser?.display_name || user?.display_name || user?.username || `Team ${rosterId}`;
  };

  // Helper to get pick tier based on team's standing (matches Rosters.tsx logic)
  const getPickTier = (rosterId: number): string => {
    const roster = rosters.find((r: any) => r.roster_id === rosterId);
    if (!roster) return "Mid";
    const totalRosters = rosters.length;
    // Sort rosters by wins, then by fpts as tiebreaker (same as Rosters page)
    const sortedRosters = [...rosters].sort((a: any, b: any) => {
      const winsA = a.wins || 0;
      const winsB = b.wins || 0;
      if (winsA !== winsB) return winsB - winsA;
      const fptsA = Number(a.fpts) || 0;
      const fptsB = Number(b.fpts) || 0;
      return fptsB - fptsA;
    });
    const standing = sortedRosters.findIndex((r: any) => r.roster_id === rosterId) + 1;
    // Early = bottom 4, Mid = middle 4, Late = top 4 (for 12-team league)
    if (standing > totalRosters * 2/3) return "Early"; // Bottom third
    if (standing > totalRosters * 1/3) return "Mid";   // Middle third
    return "Late"; // Top third
  };

  // Calculate pick value for a roster
  const calculatePickValue = (rosterId: number): number => {
    let pickValue = 0;
    const years = ["2025", "2026", "2027", "2028"];
    const rounds = [1, 2, 3, 4];

    for (const year of years) {
      for (const round of rounds) {
        // Check if pick was traded away
        const tradedPick = tradedPicks.find(
          (tp: any) => tp.season === year && tp.round === round && tp.roster_id === rosterId
        );
        
        const currentOwnerId = tradedPick ? tradedPick.owner_id : rosterId;
        
        if (currentOwnerId === rosterId) {
          const originalRosterId = tradedPick ? tradedPick.roster_id : rosterId;
          const tier = getPickTier(originalRosterId);
          
          const pv = pickValues.find(
            (p: any) => p.pick_year === year && p.pick_round === round && p.pick_tier === tier
          );
          
          if (pv) {
            pickValue += pv.value;
          }
        }
      }
    }

    // Also check for picks traded TO this roster from other rosters
    const picksOwnedFromOthers = tradedPicks.filter(
      (tp: any) => tp.owner_id === rosterId && tp.roster_id !== rosterId
    );
    
    for (const pick of picksOwnedFromOthers) {
      const tier = getPickTier(pick.roster_id);
      const pv = pickValues.find(
        (p: any) => p.pick_year === pick.season && p.pick_round === pick.round && p.pick_tier === tier
      );
      if (pv) {
        pickValue += pv.value;
      }
    }

    return pickValue;
  };

  // Build standings
  const standings: StandingsTeam[] = rosters
    .map((roster: any) => {
      const rosterPlayers = roster.players || [];
      const playerValue = rosterPlayers.reduce((sum: number, pid: string) => sum + (valueMap.get(pid) || 0), 0);
      const pickValue = calculatePickValue(roster.roster_id);
      const ownerId = roster.owner_id;
      const user = users.find((u: any) => u.user_id === ownerId);
      const leagueUser = leagueUsers.find((lu: any) => lu.user_id === ownerId);

      return {
        rosterId: roster.roster_id,
        teamName: leagueUser?.team_name || leagueUser?.display_name || user?.display_name || `Team ${roster.roster_id}`,
        ownerName: user?.display_name || user?.username || "Unknown",
        wins: roster.wins || 0,
        losses: roster.losses || 0,
        totalPoints: (roster.fpts || 0) + (roster.fpts_decimal || 0) / 100,
        pointsAgainst: (roster.fpts_against || 0) + (roster.fpts_against_decimal || 0) / 100,
        playerValue,
        pickValue,
        totalValue: playerValue + pickValue,
      };
    })
    .sort((a: StandingsTeam, b: StandingsTeam) => b.wins - a.wins || b.totalPoints - a.totalPoints);

  // Get recent trades (last 14 days)
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const recentTrades: TradeData[] = transactions
    .filter((tx: any) => tx.type === "trade" && tx.status === "complete" && (tx.created || 0) > fourteenDaysAgo)
    .slice(0, 10)
    .map((tx: any) => {
      const teams = (tx.roster_ids || []).map((rid: number) => ({
        rosterId: rid,
        teamName: getTeamName(rid),
      }));

      const assets: Record<number, any> = {};
      teams.forEach((t: any) => {
        assets[t.rosterId] = { players: [], picks: [], totalValue: 0 };
      });

      if (tx.adds) {
        Object.entries(tx.adds).forEach(([playerId, rosterId]) => {
          const player = playerMap.get(playerId);
          const value = valueMap.get(playerId) || 0;
          if (assets[rosterId as unknown as number]) {
            assets[rosterId as unknown as number].players.push({
              playerId,
              name: player?.full_name || playerId,
              position: player?.position || "?",
              value,
            });
            assets[rosterId as unknown as number].totalValue += value;
          }
        });
      }

      if (tx.draft_picks && Array.isArray(tx.draft_picks)) {
        tx.draft_picks.forEach((pick: any) => {
          if (pick.owner_id && assets[pick.owner_id]) {
            assets[pick.owner_id].picks.push({ season: pick.season, round: pick.round });
            const pickValue = pick.round === 1 ? 5000 : pick.round === 2 ? 2000 : pick.round === 3 ? 800 : 400;
            assets[pick.owner_id].totalValue += pickValue;
          }
        });
      }

      const teamIds = Object.keys(assets).map(Number);
      const valueDiff = teamIds.length >= 2 ? assets[teamIds[0]].totalValue - assets[teamIds[1]].totalValue : 0;

      return {
        transactionId: tx.transaction_id,
        date: new Date(tx.created || tx.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        teams,
        assets,
        valueDiff,
      };
    });

  // Most active traders
  const traderCounts = new Map<string, number>();
  transactions
    .filter((tx: any) => tx.type === "trade" && tx.status === "complete")
    .forEach((tx: any) => {
      (tx.roster_ids || []).forEach((rid: number) => {
        const teamName = getTeamName(rid);
        traderCounts.set(teamName, (traderCounts.get(teamName) || 0) + 1);
      });
    });

  const mostActiveTraders = Array.from(traderCounts.entries())
    .map(([teamName, tradeCount]) => ({ teamName, tradeCount }))
    .sort((a, b) => b.tradeCount - a.tradeCount)
    .slice(0, 5);

  return {
    leagueName: league?.name || "Dynasty League",
    standings,
    recentTrades,
    mostActiveTraders,
  };
}

// Build context string for AI - structured and explicit
function buildDataContext(context: LeagueContext, focusTeams?: string[]): string {
  const leader = context.standings[0];
  const lastPlace = context.standings[context.standings.length - 1];
  
  // Find teams with most pick value (rebuilders)
  const byPickValue = [...context.standings].sort((a, b) => b.pickValue - a.pickValue);
  const topPickValue = byPickValue[0];
  
  // Find teams with most player value (contenders)
  const byPlayerValue = [...context.standings].sort((a, b) => b.playerValue - a.playerValue);
  const topPlayerValue = byPlayerValue[0];
  
  return `
=== OFFICIAL LEAGUE DATA (USE ONLY THESE EXACT VALUES) ===

LEAGUE NAME: ${context.leagueName}
CURRENT SEASON: 2024 (in progress, no champion crowned yet)
NOTE: There is NO "reigning champion" or "defending champion" - do not reference past champions.

IMPORTANT VALUE DISTINCTIONS:
- "Player Value" = value of players on roster
- "Pick Value" = value of draft picks owned
- "Total Value" = Player Value + Pick Value combined

=== CURRENT STANDINGS (EXACT DATA - DO NOT MODIFY) ===
Rank | Team Name | Record | Points | Player Value | Pick Value | Total Value
${context.standings.map((t, i) => `${i + 1}. ${t.teamName} | ${t.wins}-${t.losses} | ${t.totalPoints.toFixed(1)} pts | Players: ${t.playerValue.toLocaleString()} | Picks: ${t.pickValue.toLocaleString()} | Total: ${t.totalValue.toLocaleString()}`).join("\n")}

=== TEAM SPOTLIGHTS ===
FIRST PLACE: ${leader?.teamName} (${leader?.wins}-${leader?.losses}, ${leader?.totalPoints.toFixed(1)} pts, player value: ${leader?.playerValue.toLocaleString()}, pick value: ${leader?.pickValue.toLocaleString()})
LAST PLACE: ${lastPlace?.teamName} (${lastPlace?.wins}-${lastPlace?.losses}, ${lastPlace?.totalPoints.toFixed(1)} pts, player value: ${lastPlace?.playerValue.toLocaleString()}, pick value: ${lastPlace?.pickValue.toLocaleString()})
HIGHEST PLAYER VALUE: ${topPlayerValue?.teamName} with ${topPlayerValue?.playerValue.toLocaleString()} in player value
MOST PICK CAPITAL: ${topPickValue?.teamName} with ${topPickValue?.pickValue.toLocaleString()} in pick value (likely rebuilding)

=== MIDDLE OF THE PACK (Ranks 4-9) ===
${context.standings.slice(3, 9).map((t, i) => `${i + 4}. ${t.teamName} (${t.wins}-${t.losses}) - Players: ${t.playerValue.toLocaleString()}, Picks: ${t.pickValue.toLocaleString()}`).join("\n")}

=== RECENT TRADES ===
${context.recentTrades.length === 0 ? "No recent trades in the last 14 days." : context.recentTrades.map(t => {
  const team1 = t.teams[0];
  const team2 = t.teams[1];
  const assets1 = t.assets[team1?.rosterId];
  const assets2 = t.assets[team2?.rosterId];
  const players1 = assets1?.players.map(p => `${p.name} (${p.position}, value: ${p.value.toLocaleString()})`).join(", ") || "draft picks only";
  const players2 = assets2?.players.map(p => `${p.name} (${p.position}, value: ${p.value.toLocaleString()})`).join(", ") || "draft picks only";
  return `Trade on ${t.date}:\n  - ${team1?.teamName} received: ${players1}\n  - ${team2?.teamName} received: ${players2}\n  - Value difference: ${Math.abs(t.valueDiff).toLocaleString()}`;
}).join("\n\n")}

=== MOST ACTIVE TRADERS ===
${context.mostActiveTraders.map(t => `${t.teamName}: ${t.tradeCount} trades`).join("\n")}

=== END OF DATA ===`;
}

// Generate a single article using OpenAI
async function generateArticle(
  context: LeagueContext,
  storyPrompt: { type: string; prompt: string; teamFocus: string },
  articleIndex: number,
  openaiKey: string
): Promise<{ title: string; subtitle: string; content: string; articleType: string } | null> {
  const dataContext = buildDataContext(context);
  
  const systemPrompt = `You are a fantasy football columnist writing for "${context.leagueName}" dynasty league newsletter.

CRITICAL DATA RULES (MUST FOLLOW):
1. ONLY use data that appears in the "OFFICIAL LEAGUE DATA" section below
2. When mentioning values, records, or points - use the EXACT numbers provided
3. ALWAYS distinguish between "player value" (value of players) and "pick value" (value of draft picks)
4. DO NOT just say "roster value" - specify if you mean players, picks, or total
5. DO NOT invent or guess any statistics, records, or historical facts
6. DO NOT reference "reigning champions", "defending champions", or past season results
7. DO NOT make up values - only use what's explicitly listed
8. Focus on the SPECIFIC TEAMS mentioned in the story prompt, not just first/last place

Your style:
- Engaging and fun, like The Ringer or ESPN columnists
- Reference team names and their EXACT stats from the data
- When discussing value, be specific: "player value of X" or "pick value of Y" or "total value of Z"
- Short, punchy paragraphs
- Create drama and narrative based on the actual standings and trades
- 200-350 words per article

Today you're writing a "${storyPrompt.prompt}" article.`;

  const userPrompt = `Write article #${articleIndex + 1} for today's newsletter.

Story focus: ${storyPrompt.prompt}

IMPORTANT RULES:
1. Only use facts from the data below
2. Do not invent statistics or historical claims
3. When mentioning value, ALWAYS specify: "player value", "pick value", or "total value" - never just "value" or "roster value"
4. Focus on the teams specified in the story prompt (e.g., if it says "middle of pack", focus on ranks 4-8, NOT first or last place)

${dataContext}

Return valid JSON:
{
  "title": "Catchy headline (based on actual data)",
  "subtitle": "Brief tagline",
  "content": "Full article with **bold** for emphasis. Use EXACT values and specify player vs pick value."
}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.error(`OpenAI error for article ${articleIndex + 1}:`, await response.text());
      return null;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    // Force the article type to be the valid database type (not what AI returns)
    return {
      title: parsed.title,
      subtitle: parsed.subtitle,
      content: parsed.content,
      articleType: storyPrompt.type, // Use our known valid type
    };
  } catch (error) {
    console.error(`Error generating article ${articleIndex + 1}:`, error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Get league
    const { data: leagues } = await supabase.from("leagues").select("league_id").limit(1).single();
    if (!leagues) throw new Error("No league found");
    
    const leagueId = leagues.league_id;

    // Delete all existing articles
    console.log("Deleting previous articles...");
    await supabase.from("articles").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // Fetch league context
    console.log("Fetching league data...");
    const context = await fetchLeagueContext(supabase, leagueId);

    // Generate articles sequentially (to avoid rate limits)
    console.log(`Generating ${ARTICLES_TO_GENERATE} articles...`);
    const generatedArticles = [];

    for (let i = 0; i < ARTICLES_TO_GENERATE; i++) {
      const storyPrompt = STORY_PROMPTS[i % STORY_PROMPTS.length];
      console.log(`Generating article ${i + 1}/${ARTICLES_TO_GENERATE}: ${storyPrompt.prompt}`);
      
      const article = await generateArticle(context, storyPrompt, i, openaiKey);
      
      if (article) {
        // Build embedded data for visual components
        const embeddedData = buildEmbeddedData(context, storyPrompt);
        
        // Save to database
        const { data: saved, error } = await supabase
          .from("articles")
          .insert({
            league_id: leagueId,
            title: article.title,
            subtitle: article.subtitle,
            content: article.content,
            article_type: article.articleType,
            embedded_data: embeddedData,
            published: true,
          })
          .select()
          .single();

        if (saved) {
          generatedArticles.push(saved);
          console.log(`Article ${i + 1} saved: "${article.title}"`);
          console.log(`  Embedded data: ${Object.keys(embeddedData).join(', ') || 'none'}`);        } else {
          console.error(`Failed to save article ${i + 1}:`, error);
        }
      }

      // Small delay between articles to avoid rate limits
      if (i < ARTICLES_TO_GENERATE - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`Generation complete: ${generatedArticles.length}/${ARTICLES_TO_GENERATE} articles`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Generated ${generatedArticles.length} articles`,
        count: generatedArticles.length,
        articles: generatedArticles,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
