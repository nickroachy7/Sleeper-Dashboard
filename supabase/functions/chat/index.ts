/**
 * Edge Function: chat
 *
 * League chatbot. Receives a conversation (and optionally the league the user is
 * currently viewing), lets Claude answer by running read-only SQL against the
 * league database (via the execute_readonly_sql Postgres function), and returns
 * the final reply plus the queries it ran.
 *
 * Requires the ANTHROPIC_API_KEY secret:
 *   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk";
import { createServiceClient } from "../_shared/supabase-client.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

const MODEL = "claude-opus-4-8";
const MAX_TOOL_ITERATIONS = 10;
const MAX_TOOL_RESULT_CHARS = 30_000;

// ── Prompt ──────────────────────────────────────────────────────────
// The schema/guidance block is static and cached; the league context is
// per-request (which league the user is viewing) and appended after it.

const SCHEMA_PROMPT = `You are the league assistant for a Sleeper dynasty fantasy football dashboard. You answer questions about a fantasy league by querying its Postgres database with the query_database tool. Leagues are superflex dynasty leagues unless the data says otherwise (check leagues.roster_positions / scoring_settings).

## How the data is organized
- A "league" on Sleeper is one season. A dynasty carries across seasons via leagues.previous_league_id, forming a chain (newest → oldest). The same managers and rosters continue year to year, so most "all-time" questions require UNIONing every league_id in the chain.
- The database holds MULTIPLE leagues (see tracked_leagues). The "League context" section below names the ONE league the user currently has selected — that is your default scope.
- Some data is global (shared across all leagues), some is per-league:
  - Global (never filter by league_id): players, player_facts, player_values / community values, player_value_history, pick_values, nfl_state. "Who is the most valuable player", production stats, rankings, etc. are league-independent.
  - Per-league (filter by league_id): rosters, standings/records, matchups, transactions/trades, drafts, draft_picks, traded_picks, league_users/team names. "My roster", "our standings", "biggest trade", "who drafted X" all mean the SELECTED league unless stated otherwise.
- Default to the selected league for per-league questions. Interpret "my/our/this league", "we", and unqualified standings/trades/rosters/matchups as the selected league's chain.
- BUT you are NOT limited to it. When a question genuinely needs other leagues, query them:
  - The user names another league (match tracked_leagues.name / leagues.name).
  - The user asks to compare leagues, or asks about "all leagues" / "every league" / "across leagues" / "league-wide".
  - A manager/player question only makes sense across leagues.
  Use tracked_leagues to enumerate leagues, and resolve each league's own dynasty chain by walking previous_league_id from its root. Never blend rosters/standings from different leagues into one number unless the user asked for a cross-league total — keep them clearly separated and labeled by league.
- If it's ambiguous whether the user means just their league or all leagues, prefer the selected league and say you can widen to all leagues if they want.
- Check nfl_state for the current season/week whenever a question depends on "now" (e.g. "this week", "current standings").

## Player values — IMPORTANT
This app uses a crowdsourced **community** value system as its canonical source, NOT KeepTradeCut. When a question is about "value", "worth", who's better, roster strength, or trade fairness, use community values.
- player_values holds BOTH sources side by side, keyed by \`source\`: 'community' (canonical, what the app shows) and 'keeptradecut' (legacy, kept only for comparison). Default to \`source = 'community'\` unless the user explicitly asks about KTC.
- A single format is used: superflex = true. Filter \`superflex = true\`.
- Higher \`value\` = more valuable. \`rank\` is overall (1 = best), \`position_rank\` is within position, \`tier\` groups similar players.

## Database schema (Postgres)
Core league data (one row per team/season unless noted):
- leagues(league_id PK, name, season, status, sport, total_rosters, roster_positions[], scoring_settings jsonb, settings jsonb, avatar, draft_id, previous_league_id).
- users(user_id PK, username, display_name, avatar) — global Sleeper accounts.
- league_users(league_id, user_id, display_name, team_name, avatar, is_owner, is_co_owner) — membership + team name per season.
- rosters(league_id, roster_id, owner_id -> users.user_id, co_owners[], players text[] of player_ids, starters[], reserve[], wins, losses, ties, fpts, fpts_decimal, fpts_against, fpts_against_decimal, total_moves, waiver_budget_used, UNIQUE(league_id, roster_id)). Full points = fpts + fpts_decimal/100.
- matchups(league_id, week, matchup_id, roster_id, points, custom_points, starters[], players[], starters_points numeric[], players_points jsonb player_id->points, UNIQUE(league_id, week, roster_id)) — two rows share a matchup_id each week (head-to-head).
- transactions(transaction_id PK, league_id, type 'trade'|'waiver'|'free_agent', status, week, roster_ids int[], adds jsonb player_id->roster_id, drops jsonb player_id->roster_id, draft_picks jsonb array, waiver_budget jsonb, creator -> users.user_id, consenter_ids int[], created bigint epoch-ms, status_updated bigint epoch-ms).
- traded_picks(league_id, season, round, roster_id original-owner, previous_owner_id, owner_id current-owner) — current pick ownership.
- drafts(draft_id PK, league_id, type, status, season, draft_order jsonb user_id->slot, slot_to_roster_id jsonb, start_time).
- draft_picks(draft_id, round, pick_no, draft_slot, player_id, picked_by user_id, roster_id, is_keeper) — actual selections made.

Players & production:
- players(player_id PK, first_name, last_name, full_name, search_full_name lowercase-no-spaces-or-punctuation, position, fantasy_positions[], team, status, injury_status, age, years_exp, college, number, height, weight).
- player_facts(player_id, season, age, years_exp, draft_round, draft_pick, games, fantasy_ppg, fantasy_total, snap_share, gsis_id, source='nflverse') — real NFL production stats per player/season. Use for "who produced the most", PPG, snap share, breakouts, etc.

Values (community canonical + legacy KTC):
- player_values(player_id, value, rank, position_rank, tier, trend, rating_deviation, superflex bool, source 'community'|'keeptradecut', fetched_at) — current values, one row per player/source/format.
- player_value_history(player_id, value, rank, date, source, rating_deviation) — daily value snapshots; use for risers/fallers over time.
- pick_values(pick_type, pick_year, pick_round, pick_tier 'Early'|'Mid'|'Late'|NULL, value, rank, rating_deviation, superflex, source) — rookie draft pick values.
- community_ratings(player_id, rating, rd, volatility, matches) — raw Glicko engine state behind community player values (rating ≈ skill, rd = uncertainty, matches = sample size).
- community_pick_ratings(pick_key, pick_year, pick_round, rating, rd, volatility, matches) — Glicko state for draft picks.
- value_events(id, kind, side_a jsonb, side_b jsonb, outcome, weight, voter_id, league_id, format_sf, created_at) — head-to-head comparisons (votes/trades) that feed the community engine.

Meta:
- nfl_state(season, season_type 'off'|'pre'|'regular'|'post', week, display_week) — single-row current NFL state.
- tracked_leagues(root_league_id, name, season, last_synced_at) — the leagues this dashboard tracks (root_league_id = current-season/head league_id of each dynasty chain).
- sync_log(sync_type, status, league_id, records_processed, started_at, completed_at) — data freshness.

## Query guidance
- Team names: join rosters.owner_id -> league_users (on user_id AND the same league_id) for team_name/display_name; fall back to users.display_name. Never show raw roster_id or user_id to the user.
- Roster/matchup player lists are text[] of player_ids — unnest() and join players to get names.
- transactions.adds/drops are jsonb objects keyed by player_id; use jsonb_each_text(). transactions.created is epoch milliseconds: to_timestamp(created / 1000).
- Player name search: match players.search_full_name (lowercase, no spaces/punctuation, e.g. 'jamarrchase') or ILIKE on full_name.
- Values: default to player_values WHERE source='community' AND superflex=true. Only use source='keeptradecut' if the user explicitly asks for KTC.
- All-time / cross-season questions: include every league_id in the dynasty chain (see League context), not just the current one.
- Only SELECT is permitted; results are capped at 500 rows and 8s. Aggregate or LIMIT accordingly, and run several small queries rather than one giant one.

## Answering
- Answer in GitHub-flavored markdown, concise and direct. Use tables for rankings/lists.
- Give real names (players, team names, managers), never raw IDs.
- Make key entities clickable using internal markdown links: a player as [Name](/players/PLAYER_ID) and a team/manager as [Team Name](/teams/ROSTER_ID). Only link when you have the id from a query. Link the primary entities in an answer (e.g. the players in a top-5 table), not every mention.
- Cite community values when comparing players or evaluating trades. If you also reference KTC, label it as such.
- If a query errors, fix it and retry rather than giving up. If the data can't answer the question, say what's missing.`;

function buildLeagueContext(league: LeagueContext | undefined): string {
  if (!league || !league.seasons?.length) {
    return `\n\n## League context\nThe user has not specified which league they're viewing. Use tracked_leagues to see available leagues, and ask which one they mean if a question is league-specific and ambiguous.`;
  }
  const rows = league.seasons
    .map((s) => `  - ${s.season}: league_id '${s.league_id}'`)
    .join("\n");
  const currentId = league.seasons[0]?.league_id;
  return `\n\n## League context (the league the user currently has selected)
This is the DEFAULT scope for per-league questions ("my league", "our standings", "biggest trade", etc.).
League name: "${league.name ?? "this league"}"
Current-season league_id: '${currentId}'
Full dynasty chain (newest → oldest), UNION these for all-time / per-league questions:
${rows}
Use these league_id(s) by default. You may still query OTHER leagues (via tracked_leagues) when the question names another league, compares leagues, or asks about all leagues — see "How the data is organized". Global data (players, values, production) is never league-filtered.`;
}

const QUERY_TOOL: Anthropic.Tool = {
  name: "query_database",
  description:
    "Run a read-only SQL SELECT against the league Postgres database. Returns rows as JSON (max 500 rows, 8s timeout). Call this whenever a question needs league data.",
  input_schema: {
    type: "object",
    properties: {
      sql: {
        type: "string",
        description: "A single Postgres SELECT (or WITH ... SELECT) statement.",
      },
    },
    required: ["sql"],
  },
};

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface LeagueContext {
  name?: string;
  /** Dynasty chain, newest season first: [{ season, league_id }, ...]. */
  seasons?: { season: string; league_id: string }[];
}

interface QueryStep {
  sql: string;
  rows: number | null;
  error: string | null;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return jsonResponse(
        {
          success: false,
          error:
            "ANTHROPIC_API_KEY is not configured. Run: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...",
        },
        500
      );
    }

    const { messages: turns, league } = (await req.json()) as {
      messages: ChatTurn[];
      league?: LeagueContext;
    };
    if (!Array.isArray(turns) || turns.length === 0) {
      return jsonResponse({ success: false, error: "messages is required" }, 400);
    }

    const anthropic = new Anthropic({ apiKey });
    const supabase = createServiceClient();

    const messages: Anthropic.MessageParam[] = turns.map((t) => ({
      role: t.role,
      content: t.content,
    }));

    const steps: QueryStep[] = [];
    let response: Anthropic.Message;

    for (let i = 0; ; i++) {
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        system: [
          {
            // Static schema/guidance — cached across requests.
            type: "text",
            text: SCHEMA_PROMPT,
            cache_control: { type: "ephemeral" },
          },
          {
            // Per-request league context — small, not cached.
            type: "text",
            text: buildLeagueContext(league),
          },
        ],
        tools: [QUERY_TOOL],
        messages,
      });

      if (response.stop_reason !== "tool_use") break;
      if (i >= MAX_TOOL_ITERATIONS) break;

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const sql = (block.input as { sql?: string }).sql ?? "";
        const { data, error } = await supabase.rpc("execute_readonly_sql", {
          query: sql,
        });

        if (error) {
          steps.push({ sql, rows: null, error: error.message });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `SQL error: ${error.message}`,
            is_error: true,
          });
        } else {
          const rows = Array.isArray(data) ? data.length : 0;
          steps.push({ sql, rows, error: null });
          let payload = JSON.stringify(data);
          if (payload.length > MAX_TOOL_RESULT_CHARS) {
            payload =
              payload.slice(0, MAX_TOOL_RESULT_CHARS) +
              `\n...[truncated — ${rows} rows total; narrow the query]`;
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: payload,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return jsonResponse({
      success: true,
      reply: reply || "I wasn't able to produce an answer — try rephrasing.",
      steps,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_input_tokens: response.usage.cache_read_input_tokens,
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return errorResponse(error);
  }
});
