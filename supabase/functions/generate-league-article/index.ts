/**
 * Edge Function: generate-league-article
 * 
 * Analyzes league data and generates AI-powered news articles
 * about trades, standings, roster moves, and more.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StandingsTeam {
  rosterId: number;
  teamName: string;
  ownerName: string;
  wins: number;
  losses: number;
  totalPoints: number;
  pointsAgainst: number;
  rosterValue: number;
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
  topValueChanges: { teamName: string; change: number }[];
  mostActiveTraders: { teamName: string; tradeCount: number }[];
}

interface ArticleResponse {
  title: string;
  subtitle: string;
  content: string;
  articleType: string;
  embeddedTrades: string[];
}

// Story idea interface for AI-generated story angles
interface StoryIdea {
  headline: string;
  angle: string;
  focusTeams: string[];
  focusTrades: string[];
  storyType: string;
  intrigue: number; // 1-10 rating of how interesting this story is
}

// Exclusion options to prevent duplicate stories
interface ExclusionOptions {
  excludeTradeIds?: string[];
  excludeStoryTypes?: string[];
  excludeTeams?: string[];
  forcedStoryType?: string; // Force a specific story type
}

async function fetchLeagueContext(supabase: any, leagueId: string): Promise<LeagueContext> {
  // Fetch all required data in parallel
  const [
    leagueRes,
    rostersRes,
    transactionsRes,
    usersRes,
    leagueUsersRes,
    playersRes,
    playerValuesRes,
  ] = await Promise.all([
    supabase.from("leagues").select("*").eq("league_id", leagueId).single(),
    supabase.from("rosters").select("*").eq("league_id", leagueId),
    supabase.from("transactions").select("*").eq("league_id", leagueId).order("created", { ascending: false }),
    supabase.from("users").select("*"),
    supabase.from("league_users").select("*").eq("league_id", leagueId),
    supabase.from("players").select("player_id, full_name, position, team"),
    supabase.from("player_values").select("player_id, value"),
  ]);

  const league = leagueRes.data;
  const rosters = rostersRes.data || [];
  const transactions = transactionsRes.data || [];
  const users = usersRes.data || [];
  const leagueUsers = leagueUsersRes.data || [];
  const players = playersRes.data || [];
  const playerValues = playerValuesRes.data || [];

  // Build lookup maps
  const playerMap = new Map(players.map((p: any) => [p.player_id, p]));
  const valueMap = new Map(playerValues.map((pv: any) => [pv.player_id, pv.value]));
  const rosterToOwner = new Map(rosters.map((r: any) => [r.roster_id, r.owner_id]));

  // Helper to get team name
  const getTeamName = (rosterId: number): string => {
    const ownerId = rosterToOwner.get(rosterId);
    const leagueUser = leagueUsers.find((lu: any) => lu.user_id === ownerId);
    const user = users.find((u: any) => u.user_id === ownerId);
    return leagueUser?.team_name || leagueUser?.display_name || user?.display_name || user?.username || `Team ${rosterId}`;
  };

  // Calculate standings with roster values
  const standings: StandingsTeam[] = rosters
    .map((roster: any) => {
      const rosterPlayers = roster.players || [];
      const rosterValue = rosterPlayers.reduce((sum: number, pid: string) => sum + (valueMap.get(pid) || 0), 0);
      const ownerId = roster.owner_id;
      const user = users.find((u: any) => u.user_id === ownerId);
      const leagueUser = leagueUsers.find((lu: any) => lu.user_id === ownerId);

      return {
        rosterId: roster.roster_id,
        teamName: leagueUser?.team_name || leagueUser?.display_name || user?.display_name || user?.username || `Team ${roster.roster_id}`,
        ownerName: user?.display_name || user?.username || "Unknown",
        wins: roster.wins || 0,
        losses: roster.losses || 0,
        totalPoints: (roster.fpts || 0) + (roster.fpts_decimal || 0) / 100,
        pointsAgainst: (roster.fpts_against || 0) + (roster.fpts_against_decimal || 0) / 100,
        rosterValue,
      };
    })
    .sort((a: StandingsTeam, b: StandingsTeam) => b.wins - a.wins || b.totalPoints - a.totalPoints);

  // Filter recent trades (last 14 days)
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const recentTrades: TradeData[] = transactions
    .filter((tx: any) => tx.type === "trade" && tx.status === "complete" && (tx.created || 0) > fourteenDaysAgo)
    .map((tx: any) => {
      const teams = (tx.roster_ids || []).map((rid: number) => ({
        rosterId: rid,
        teamName: getTeamName(rid),
      }));

      const assets: Record<number, any> = {};
      teams.forEach((t: any) => {
        assets[t.rosterId] = { players: [], picks: [], totalValue: 0 };
      });

      // Process player adds
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

      // Process draft picks
      if (tx.draft_picks && Array.isArray(tx.draft_picks)) {
        tx.draft_picks.forEach((pick: any) => {
          if (pick.owner_id && assets[pick.owner_id]) {
            assets[pick.owner_id].picks.push({
              season: pick.season,
              round: pick.round,
            });
            // Estimate pick value
            const pickValue = pick.round === 1 ? 5000 : pick.round === 2 ? 2000 : pick.round === 3 ? 800 : 400;
            assets[pick.owner_id].totalValue += pickValue;
          }
        });
      }

      const teamIds = Object.keys(assets).map(Number);
      const valueDiff = teamIds.length >= 2
        ? assets[teamIds[0]].totalValue - assets[teamIds[1]].totalValue
        : 0;

      return {
        transactionId: tx.transaction_id,
        date: new Date(tx.created || tx.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        teams,
        assets,
        valueDiff,
      };
    });

  // Calculate most active traders
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
    topValueChanges: [], // Could be calculated if we track historical values
    mostActiveTraders,
  };
}

function selectStoryType(context: LeagueContext): string {
  // Simple fallback for when AI isn't available
  if (context.recentTrades.length > 0) {
    return "trade";
  }
  const types = ["power_rankings", "standings", "roster", "rivalry", "rebuild", "contender"];
  return types[Math.floor(Math.random() * types.length)];
}

// Build the comprehensive data context string for AI analysis
function buildDataContext(context: LeagueContext): string {
  return `
LEAGUE: ${context.leagueName}

CURRENT STANDINGS:
${context.standings.map((t, i) => `${i + 1}. ${t.teamName} (${t.wins}-${t.losses}) - ${t.totalPoints.toFixed(1)} pts scored, ${t.pointsAgainst.toFixed(1)} pts against, Roster Value: ${t.rosterValue.toLocaleString()}`).join("\n")}

RECENT TRADES (Last 14 days):
${context.recentTrades.length === 0 ? "No recent trades" : context.recentTrades.map(t => {
  const team1 = t.teams[0];
  const team2 = t.teams[1];
  const assets1 = t.assets[team1?.rosterId];
  const assets2 = t.assets[team2?.rosterId];
  return `
Trade ID: ${t.transactionId} (${t.date})
${team1?.teamName} receives: ${assets1?.players.map(p => `${p.name} (${p.position}, ${p.value})`).join(", ") || "Nothing"}${assets1?.picks.length ? ` + ${assets1.picks.map(p => `${p.season} Rd${p.round}`).join(", ")}` : ""}
Total Value: ${assets1?.totalValue.toLocaleString()}

${team2?.teamName} receives: ${assets2?.players.map(p => `${p.name} (${p.position}, ${p.value})`).join(", ") || "Nothing"}${assets2?.picks.length ? ` + ${assets2.picks.map(p => `${p.season} Rd${p.round}`).join(", ")}` : ""}
Total Value: ${assets2?.totalValue.toLocaleString()}

Value Difference: ${Math.abs(t.valueDiff).toLocaleString()} in favor of ${t.valueDiff > 0 ? team1?.teamName : team2?.teamName}
`;
}).join("\n---\n")}

MOST ACTIVE TRADERS:
${context.mostActiveTraders.map(t => `${t.teamName}: ${t.tradeCount} trades`).join("\n")}

TOP ROSTER VALUES:
${context.standings.sort((a, b) => b.rosterValue - a.rosterValue).slice(0, 5).map((t, i) => `${i + 1}. ${t.teamName}: ${t.rosterValue.toLocaleString()}`).join("\n")}

BOTTOM ROSTER VALUES:
${context.standings.sort((a, b) => a.rosterValue - b.rosterValue).slice(0, 3).map((t, i) => `${i + 1}. ${t.teamName}: ${t.rosterValue.toLocaleString()}`).join("\n")}

BIGGEST POINTS DIFFERENTIAL (scoring vs opponent):
${context.standings.map(t => ({ ...t, diff: t.totalPoints - t.pointsAgainst })).sort((a, b) => b.diff - a.diff).slice(0, 3).map(t => `${t.teamName}: +${t.diff.toFixed(1)} differential`).join("\n")}

UNLUCKIEST TEAMS (high points but losses):
${context.standings.filter(t => t.losses > t.wins && t.totalPoints > context.standings.reduce((sum, s) => sum + s.totalPoints, 0) / context.standings.length).map(t => `${t.teamName}: ${t.wins}-${t.losses} despite ${t.totalPoints.toFixed(1)} pts`).join("\n") || "None identified"}`;
}

// Phase 1: AI discovers interesting story angles from the data
async function discoverStoryIdeas(context: LeagueContext, openaiKey: string, exclusions?: ExclusionOptions): Promise<StoryIdea[]> {
  const dataContext = buildDataContext(context);
  
  // Build exclusion instructions
  let exclusionText = "";
  if (exclusions?.excludeTradeIds?.length) {
    exclusionText += `\n\nDO NOT write about these trade IDs (already covered): ${exclusions.excludeTradeIds.join(", ")}`;
  }
  if (exclusions?.excludeStoryTypes?.length) {
    exclusionText += `\n\nDO NOT use these story types (already used today): ${exclusions.excludeStoryTypes.join(", ")}`;
  }
  if (exclusions?.excludeTeams?.length) {
    exclusionText += `\n\nDO NOT focus on these teams as the primary subject (already featured): ${exclusions.excludeTeams.join(", ")}`;
  }
  if (exclusions?.forcedStoryType) {
    exclusionText += `\n\nYOU MUST use this story type: "${exclusions.forcedStoryType}"`;
  }
  
  const systemPrompt = `You are a sharp fantasy football journalist discovering story angles for a dynasty league newsletter.

Your job is to analyze the league data and find the MOST INTERESTING, UNIQUE, and COMPELLING story angles. 
Think like a journalist - what would make readers click? What's the drama? What's the narrative?

Story types to consider:
- "trade_analysis" - Deep dive on a specific trade (who won? why?)
- "trade_recap" - Overview of multiple trades and what they signal
- "power_rankings" - Who's actually good vs who got lucky?
- "rivalry" - Emerging rivalries between teams based on trades or standings
- "rebuild" - Team clearly in rebuild mode - is it working?
- "contender" - Team going all-in - will it pay off?
- "underdog" - Team exceeding expectations
- "overrated" - Team that looks good on paper but isn't
- "unlucky" - Team getting screwed by schedule/matchups
- "dynasty_value" - Teams hoarding value vs competing
- "hot_take" - Bold, controversial opinion based on the data
- "weekly_preview" - Preview of upcoming matchups
- "standings_analysis" - Deep dive into standings and playoff picture
- "roster_breakdown" - Analysis of a specific team's roster composition

Be creative! Look for narratives that aren't obvious. Find the drama.${exclusionText}`;

  const userPrompt = `Analyze this league data and generate 5 unique, compelling story ideas. Each should be DIFFERENT and interesting.
${exclusionText ? "\nREMEMBER THE EXCLUSIONS ABOVE - find FRESH angles!" : ""}

${dataContext}

Return as valid JSON:
{
  "ideas": [
    {
      "headline": "Catchy headline that would make someone click",
      "angle": "2-3 sentence description of the story angle and key points to cover",
      "focusTeams": ["team1", "team2"],
      "focusTrades": ["transaction_id_1"],
      "storyType": "one of the types listed above",
      "intrigue": 8
    }
  ]
}

IMPORTANT: Make each story idea UNIQUE. Don't repeat similar angles. Rate intrigue 1-10 based on how interesting the story would be.`;

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
        temperature: 0.9, // Higher creativity for brainstorming
        max_tokens: 1000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.error("OpenAI API error in story discovery:", await response.text());
      return [];
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) return [];

    const parsed = JSON.parse(content);
    return parsed.ideas || [];
  } catch (error) {
    console.error("Error discovering story ideas:", error);
    return [];
  }
}

// Phase 2: Write the article based on the selected story idea
async function writeArticle(context: LeagueContext, storyIdea: StoryIdea, openaiKey: string): Promise<ArticleResponse> {
  const dataContext = buildDataContext(context);
  
  const systemPrompt = `You are an entertaining fantasy football analyst writing for a dynasty league newsletter called "${context.leagueName}".

Your writing style:
- Witty and engaging, like a sports columnist at The Ringer or ESPN
- Analytical - always back up opinions with specific data (points, values, records)
- Fun but not cheesy - avoid tired clichés like "fantasy gold" or "league-winning move"
- Slightly provocative - call out questionable decisions, celebrate smart moves
- Use team names frequently to make it personal
- Keep paragraphs short and punchy
- Create drama and narrative tension

Important formatting rules:
- Use [[TRADE:transaction_id]] to embed trade cards in the article (use the actual transaction IDs provided)
- Use **bold** for emphasis on team names and key stats
- Keep the article between 250-450 words
- Make it feel like insider analysis, not a generic recap`;

  const userPrompt = `Write an article based on this story idea:

HEADLINE: ${storyIdea.headline}
ANGLE: ${storyIdea.angle}
STORY TYPE: ${storyIdea.storyType}
FOCUS TEAMS: ${storyIdea.focusTeams.join(", ")}
TRADES TO EMBED: ${storyIdea.focusTrades.join(", ")}

LEAGUE DATA:
${dataContext}

Write the full article. If there are trades to discuss, embed them using [[TRADE:transaction_id]] format.

Return as valid JSON:
{
  "title": "${storyIdea.headline}",
  "subtitle": "Brief subtitle or tagline",
  "content": "Full article content with [[TRADE:id]] embeds where appropriate...",
  "articleType": "${storyIdea.storyType}",
  "embeddedTrades": ["transaction_id_1", "transaction_id_2"]
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
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.error("OpenAI API error in article writing:", await response.text());
      throw new Error("Failed to write article");
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) throw new Error("No content returned");

    return JSON.parse(content) as ArticleResponse;
  } catch (error) {
    console.error("Error writing article:", error);
    throw error;
  }
}

async function generateArticle(context: LeagueContext, storyType: string, exclusions?: ExclusionOptions): Promise<ArticleResponse & { usedTradeIds: string[]; usedStoryType: string; usedTeams: string[] }> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  
  if (!openaiKey) {
    // Fallback: generate a simple article without AI
    const fallback = generateFallbackArticle(context, storyType);
    return { ...fallback, usedTradeIds: fallback.embeddedTrades, usedStoryType: fallback.articleType, usedTeams: [] };
  }

  try {
    // Phase 1: Discover story ideas (with exclusions)
    console.log("Phase 1: Discovering story ideas...", exclusions ? `Excluding: ${JSON.stringify(exclusions)}` : "");
    const storyIdeas = await discoverStoryIdeas(context, openaiKey, exclusions);
    
    if (storyIdeas.length === 0) {
      console.log("No story ideas generated, falling back");
      const fallback = generateFallbackArticle(context, storyType);
      return { ...fallback, usedTradeIds: fallback.embeddedTrades, usedStoryType: fallback.articleType, usedTeams: [] };
    }

    // Pick the most intriguing story (with some randomness for variety)
    // Sort by intrigue but add randomness to avoid always picking the same one
    const sortedIdeas = storyIdeas
      .map(idea => ({ ...idea, score: idea.intrigue + Math.random() * 3 }))
      .sort((a, b) => b.score - a.score);
    
    const selectedStory = sortedIdeas[0];
    console.log(`Phase 2: Writing article - "${selectedStory.headline}"`);
    
    // Phase 2: Write the article
    const article = await writeArticle(context, selectedStory, openaiKey);
    return {
      ...article,
      usedTradeIds: selectedStory.focusTrades || article.embeddedTrades || [],
      usedStoryType: selectedStory.storyType || article.articleType,
      usedTeams: selectedStory.focusTeams || [],
    };
  } catch (error) {
    console.error("Error in two-phase generation:", error);
    const fallback = generateFallbackArticle(context, storyType);
    return { ...fallback, usedTradeIds: fallback.embeddedTrades, usedStoryType: fallback.articleType, usedTeams: [] };
  }
}

function generateFallbackArticle(context: LeagueContext, storyType: string): ArticleResponse {
  // Generate a simple article without AI
  if (storyType === "trade" && context.recentTrades.length > 0) {
    const trade = context.recentTrades[0];
    const team1 = trade.teams[0];
    const team2 = trade.teams[1];
    const winner = trade.valueDiff > 0 ? team1 : team2;
    const assets1 = trade.assets[team1?.rosterId];
    const assets2 = trade.assets[team2?.rosterId];

    return {
      title: `Trade Alert: ${team1?.teamName} and ${team2?.teamName} Make Moves`,
      subtitle: `A ${Math.abs(trade.valueDiff).toLocaleString()} point value swing`,
      content: `**${team1?.teamName}** and **${team2?.teamName}** completed a trade on ${trade.date}.

[[TRADE:${trade.transactionId}]]

**${team1?.teamName}** receives:
${assets1?.players.map(p => `- ${p.name} (${p.position}) - ${p.value.toLocaleString()} value`).join("\n") || "No players"}
${assets1?.picks.map(p => `- ${p.season} Round ${p.round} pick`).join("\n") || ""}

**${team2?.teamName}** receives:
${assets2?.players.map(p => `- ${p.name} (${p.position}) - ${p.value.toLocaleString()} value`).join("\n") || "No players"}
${assets2?.picks.map(p => `- ${p.season} Round ${p.round} pick`).join("\n") || ""}

Based on current dynasty values, **${winner?.teamName}** comes out ahead by approximately ${Math.abs(trade.valueDiff).toLocaleString()} points.`,
      articleType: "trade",
      embeddedTrades: [trade.transactionId],
    };
  }

  // Power rankings fallback
  const topTeams = context.standings.slice(0, 5);
  return {
    title: `Power Rankings: Week ${new Date().getMonth() + 1} Update`,
    subtitle: `${topTeams[0]?.teamName} leads the pack`,
    content: `Here's how the league stacks up heading into the next week:

${topTeams.map((team, i) => `**${i + 1}. ${team.teamName}** (${team.wins}-${team.losses})
Record speaks for itself with ${team.totalPoints.toFixed(1)} points scored. Roster value sits at ${team.rosterValue.toLocaleString()}.`).join("\n\n")}

${context.standings.length > 5 ? `\nThe rest of the league has work to do. **${context.standings[context.standings.length - 1]?.teamName}** sits at the bottom with a ${context.standings[context.standings.length - 1]?.wins}-${context.standings[context.standings.length - 1]?.losses} record.` : ""}`,
    articleType: "power_rankings",
    embeddedTrades: [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get league ID from database
    const { data: leagues, error: leagueError } = await supabase
      .from("leagues")
      .select("league_id")
      .limit(1)
      .single();

    if (leagueError || !leagues) {
      throw new Error("No league found in database");
    }

    const leagueId = leagues.league_id;

    // Check request body for options
    let forceType: string | null = null;
    let skipSave = false;
    let exclusions: ExclusionOptions | undefined;
    try {
      const body = await req.json();
      forceType = body?.articleType || null;
      skipSave = body?.skipSave === true;
      if (body?.excludeTradeIds || body?.excludeStoryTypes || body?.excludeTeams || body?.forcedStoryType) {
        exclusions = {
          excludeTradeIds: body?.excludeTradeIds,
          excludeStoryTypes: body?.excludeStoryTypes,
          excludeTeams: body?.excludeTeams,
          forcedStoryType: body?.forcedStoryType,
        };
      }
    } catch {
      // No body or invalid JSON, that's fine
    }

    // Fetch league context
    const context = await fetchLeagueContext(supabase, leagueId);

    // Select story type
    const storyType = forceType || selectStoryType(context);

    // Generate article with exclusions
    const article = await generateArticle(context, storyType, exclusions);

    // If skipSave is true, return the article without saving to database
    if (skipSave) {
      const tempArticle = {
        id: crypto.randomUUID(),
        league_id: leagueId,
        title: article.title,
        subtitle: article.subtitle,
        content: article.content,
        article_type: article.articleType,
        embedded_data: {
          trades: article.embeddedTrades || [],
        },
        generated_at: new Date().toISOString(),
        published: true,
        created_at: new Date().toISOString(),
      };

      return new Response(
        JSON.stringify({
          success: true,
          article: tempArticle,
          usedTradeIds: article.usedTradeIds,
          usedStoryType: article.usedStoryType,
          usedTeams: article.usedTeams,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Save to database
    const { data: savedArticle, error: saveError } = await supabase
      .from("articles")
      .insert({
        league_id: leagueId,
        title: article.title,
        subtitle: article.subtitle,
        content: article.content,
        article_type: article.articleType,
        embedded_data: {
          trades: article.embeddedTrades || [],
        },
        published: true,
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving article:", saveError);
      throw saveError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        article: savedArticle,
        usedTradeIds: article.usedTradeIds,
        usedStoryType: article.usedStoryType,
        usedTeams: article.usedTeams,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error generating article:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
