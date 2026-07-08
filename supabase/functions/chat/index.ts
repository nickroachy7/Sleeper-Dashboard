/**
 * Edge Function: chat
 *
 * League chatbot. Receives a conversation, lets Claude answer by running
 * read-only SQL against the league database (via the execute_readonly_sql
 * Postgres function), and returns the final reply plus the queries it ran.
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

const SYSTEM_PROMPT = `You are the league assistant for "Dynasty Reloaded", a 12-team superflex dynasty fantasy football league on Sleeper. You answer questions by querying the league's Postgres database with the query_database tool.

## League context
- Seasons and league_ids: 2026='1312080194361638912' (current), 2025='1180365427496943616', 2024='1048274277511962624', 2023='990713355411271680'.
- Superflex dynasty league; player trade values come from KeepTradeCut (use superflex=true values).
- Check nfl_state for the current season/week when a question depends on "now".

## Database schema (Postgres)
- users(user_id PK, username, display_name, avatar) — Sleeper accounts.
- leagues(league_id PK, name, season, status, total_rosters, roster_positions[], scoring_settings jsonb, previous_league_id, draft_id).
- league_users(league_id, user_id, display_name, team_name, is_owner) — membership per season.
- rosters(league_id, roster_id, owner_id -> users.user_id, co_owners[], players text[] of player_ids, starters[], reserve[], wins, losses, ties, fpts, fpts_against, waiver_budget_used, UNIQUE(league_id, roster_id)) — one row per team per season. fpts is total points for.
- matchups(league_id, week, matchup_id, roster_id, points, starters[], players[], players_points jsonb, UNIQUE(league_id, week, roster_id)) — two rows share a matchup_id per week (head-to-head). players_points maps player_id -> points scored.
- transactions(transaction_id PK, league_id, type 'trade'|'waiver'|'free_agent', status, week, roster_ids int[], adds jsonb player_id->roster_id, drops jsonb player_id->roster_id, draft_picks jsonb array, waiver_budget jsonb, created bigint epoch-ms).
- traded_picks(league_id, season, round, roster_id original-owner, previous_owner_id, owner_id current-owner) — current pick ownership.
- drafts(draft_id PK, league_id, type, status, season, draft_order jsonb user_id->slot, slot_to_roster_id jsonb).
- draft_picks(draft_id, round, pick_no, draft_slot, player_id, picked_by user_id, roster_id) — actual draft selections.
- players(player_id PK, full_name, search_full_name lowercase-no-spaces, position, fantasy_positions[], team, status, injury_status, age, years_exp, college).
- player_values(player_id, value, rank, position_rank, trend, superflex bool, source='keeptradecut', fetched_at) — current KTC values, one row per player/format.
- player_value_history(player_id, value, rank, date, source) — daily KTC snapshots.
- pick_values(pick_type, pick_year, pick_round, pick_tier 'Early'|'Mid'|'Late'|NULL, value, superflex) — KTC rookie pick values.
- nfl_state(season, season_type, week, display_week) — single-row current NFL state.
- sync_log(sync_type, status, records_processed, started_at, completed_at) — data freshness.

## Query guidance
- Team names: join rosters.owner_id -> league_users (on user_id AND league_id) for team_name/display_name; fall back to users.display_name.
- Roster/matchup player lists are text[] of player_ids — unnest() and join players.
- transactions.adds/drops are jsonb objects keyed by player_id; use jsonb_each_text(). transactions.created is epoch milliseconds: to_timestamp(created / 1000).
- Player name search: players.search_full_name is lowercase with no spaces/punctuation (e.g. 'jamarrchase'), or ILIKE on full_name.
- Only SELECT is permitted; results are capped at 500 rows — aggregate or LIMIT accordingly. Run several small queries rather than one giant one.

## Answering
- Answer in GitHub-flavored markdown, concise and direct. Use tables for rankings/lists.
- Give real names (players, team names, managers), never raw IDs.
- If a query errors, fix it and retry rather than giving up.
- If data can't answer the question, say what's missing.
- Trade values: cite KTC values when comparing players or evaluating trades.`;

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

    const { messages: turns } = (await req.json()) as { messages: ChatTurn[] };
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
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
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
