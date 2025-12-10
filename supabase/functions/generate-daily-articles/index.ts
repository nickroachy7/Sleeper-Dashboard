/**
 * Edge Function: generate-daily-articles
 * 
 * Generates 15 AI-powered league news articles.
 * Runs once daily at 7am via cron job.
 * Deletes previous day's articles and creates fresh ones.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ARTICLES_TO_GENERATE = 15;

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

// Story prompts mapped to valid article types (for variety in generation)
const STORY_PROMPTS: { type: string; prompt: string }[] = [
  { type: "power_rankings", prompt: "power rankings analysis" },
  { type: "trade", prompt: "trade analysis and evaluation" },
  { type: "hot_streak", prompt: "hot streak / contender spotlight" },
  { type: "cold_streak", prompt: "cold streak / team struggling" },
  { type: "standings", prompt: "standings breakdown and analysis" },
  { type: "recap", prompt: "weekly or recent activity recap" },
  { type: "rivalry", prompt: "rivalry or matchup drama" },
  { type: "unlucky_team", prompt: "unlucky team that deserves better" },
  { type: "dynasty_outlook", prompt: "dynasty value and future outlook" },
  { type: "roster", prompt: "roster construction analysis" },
  { type: "playoff_race", prompt: "playoff race and positioning" },
  { type: "lucky_team", prompt: "lucky team overperforming" },
  { type: "bust_alert", prompt: "bust alert or overrated team" },
  { type: "sleeper_pick", prompt: "sleeper pick or underrated player/team" },
  { type: "matchup_preview", prompt: "upcoming matchup preview" },
];

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

  const getTeamName = (rosterId: number): string => {
    const ownerId = rosterToOwner.get(rosterId);
    const leagueUser = leagueUsers.find((lu: any) => lu.user_id === ownerId);
    const user = users.find((u: any) => u.user_id === ownerId);
    return leagueUser?.team_name || leagueUser?.display_name || user?.display_name || user?.username || `Team ${rosterId}`;
  };

  // Build standings
  const standings: StandingsTeam[] = rosters
    .map((roster: any) => {
      const rosterPlayers = roster.players || [];
      const rosterValue = rosterPlayers.reduce((sum: number, pid: string) => sum + (valueMap.get(pid) || 0), 0);
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
        rosterValue,
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

// Build context string for AI
function buildDataContext(context: LeagueContext): string {
  return `
LEAGUE: ${context.leagueName}

STANDINGS:
${context.standings.map((t, i) => `${i + 1}. ${t.teamName} (${t.wins}-${t.losses}) - ${t.totalPoints.toFixed(1)} pts, Value: ${t.rosterValue.toLocaleString()}`).join("\n")}

RECENT TRADES:
${context.recentTrades.length === 0 ? "No recent trades" : context.recentTrades.map(t => {
  const team1 = t.teams[0];
  const team2 = t.teams[1];
  const assets1 = t.assets[team1?.rosterId];
  const assets2 = t.assets[team2?.rosterId];
  return `${team1?.teamName} receives: ${assets1?.players.map(p => p.name).join(", ") || "picks"} | ${team2?.teamName} receives: ${assets2?.players.map(p => p.name).join(", ") || "picks"} | Value diff: ${Math.abs(t.valueDiff).toLocaleString()}`;
}).join("\n")}

TOP TRADERS: ${context.mostActiveTraders.map(t => `${t.teamName} (${t.tradeCount})`).join(", ")}`;
}

// Generate a single article using OpenAI
async function generateArticle(
  context: LeagueContext,
  storyPrompt: { type: string; prompt: string },
  articleIndex: number,
  openaiKey: string
): Promise<{ title: string; subtitle: string; content: string; articleType: string } | null> {
  const dataContext = buildDataContext(context);
  
  const systemPrompt = `You are a witty fantasy football columnist writing for "${context.leagueName}" dynasty league newsletter.

Your style:
- Engaging and fun, like The Ringer or ESPN columnists
- Use specific data (records, points, values) to back up points
- Reference team names frequently
- Short, punchy paragraphs
- Create drama and narrative
- 200-350 words per article

Today you're writing a "${storyPrompt.prompt}" article.`;

  const userPrompt = `Write article #${articleIndex + 1} for today's newsletter.

Story focus: ${storyPrompt.prompt}

League data:
${dataContext}

Return valid JSON:
{
  "title": "Catchy headline",
  "subtitle": "Brief tagline",
  "content": "Full article with **bold** for emphasis"
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
        temperature: 0.8,
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
        // Save to database
        const { data: saved, error } = await supabase
          .from("articles")
          .insert({
            league_id: leagueId,
            title: article.title,
            subtitle: article.subtitle,
            content: article.content,
            article_type: article.articleType,
            embedded_data: {},
            published: true,
          })
          .select()
          .single();

        if (saved) {
          generatedArticles.push(saved);
          console.log(`Article ${i + 1} saved: "${article.title}"`);
        } else {
          console.error(`Failed to save article ${i + 1}:`, error);
        }
      }

      // Delay between articles to avoid rate limits
      if (i < ARTICLES_TO_GENERATE - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
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
