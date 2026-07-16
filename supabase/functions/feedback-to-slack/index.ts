/**
 * Edge Function: feedback-to-slack
 *
 * Posts a Slack Block Kit message to a channel whenever a `feedback` row is
 * inserted. Called by a Postgres AFTER INSERT trigger via pg_net (see migration
 * 20260715_feedback_slack_webhook.sql) — NOT by end users. The DB insert is the
 * source of truth; Slack delivery is best-effort and must never block or fail
 * the user's submission, so this function fails soft (always returns 200 unless
 * the caller is unauthorized) and pg_net delivers it asynchronously.
 *
 * Secrets (set with `supabase secrets set ... --project-ref yxtnocecnqutcvltptya`):
 *   SLACK_FEEDBACK_WEBHOOK_URL  — Slack Incoming Webhook URL (required to post).
 *                                 If unset, this returns 200 "not configured".
 *   FEEDBACK_WEBHOOK_SECRET     — optional shared secret. When set, callers must
 *                                 send a matching `x-webhook-secret` header. When
 *                                 unset, all callers are allowed (easy setup).
 *
 * Deploy WITHOUT JWT verification (it's an internal webhook target):
 *   supabase functions deploy feedback-to-slack --no-verify-jwt --project-ref yxtnocecnqutcvltptya
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

// Slack limits a single text object to 3000 chars; leave headroom for mrkdwn.
const MAX_MESSAGE_CHARS = 2800;
// Slack renders image blocks from public URLs — cap how many we attach.
const MAX_IMAGES = 3;

interface FeedbackRow {
  id?: string;
  kind?: string;
  message?: string;
  email?: string | null;
  attachments?: unknown;
  page_url?: string | null;
  user_agent?: string | null;
  submitter_id?: string | null;
  status?: string;
  created_at?: string | null;
}

/** Header title + emoji per feedback kind. */
function kindHeading(kind: string | undefined): string {
  switch (kind) {
    case "bug":
      return "🐛 New bug report";
    case "idea":
      return "💡 New idea";
    default:
      return "💬 New feedback";
  }
}

/** Escape the mrkdwn control characters so user text can't break formatting. */
function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

/** Coerce the attachments column (jsonb array of URLs) to a string[] of https URLs. */
function imageUrls(attachments: unknown): string[] {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
    .slice(0, MAX_IMAGES);
}

/** Build the Slack Block Kit payload for one feedback row. */
function buildBlocks(row: FeedbackRow): Record<string, unknown> {
  const blocks: Record<string, unknown>[] = [];

  // Header — plain_text only, no emoji shortcodes needed (unicode works).
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: truncate(kindHeading(row.kind), 150), emoji: true },
  });

  // Message body.
  const message = (row.message ?? "").trim() || "(no message)";
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: truncate(escapeMrkdwn(message), MAX_MESSAGE_CHARS) },
  });

  // Context — page link, submitter, email, created-at, short UA.
  const ctx: string[] = [];
  if (row.page_url) {
    // <url|label> mrkdwn link; strip protocol for a cleaner label.
    const label = escapeMrkdwn(row.page_url.replace(/^https?:\/\//, ""));
    ctx.push(`📄 <${row.page_url}|${truncate(label, 80)}>`);
  }
  if (row.email) ctx.push(`✉️ ${escapeMrkdwn(row.email)}`);
  if (row.submitter_id) ctx.push(`🙋 \`${escapeMrkdwn(String(row.submitter_id))}\``);
  if (row.created_at) {
    const ms = Date.parse(row.created_at);
    // Slack <!date> renders in the viewer's local timezone; fall back to raw.
    ctx.push(
      Number.isFinite(ms)
        ? `🕒 <!date^${Math.floor(ms / 1000)}^{date_short_pretty} {time}|${escapeMrkdwn(row.created_at)}>`
        : `🕒 ${escapeMrkdwn(row.created_at)}`,
    );
  }
  if (row.user_agent) {
    ctx.push(`🖥️ ${truncate(escapeMrkdwn(row.user_agent), 120)}`);
  }
  if (ctx.length) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: ctx.join("  •  ") }],
    });
  }

  // Screenshot attachments.
  for (const url of imageUrls(row.attachments)) {
    blocks.push({ type: "image", image_url: url, alt_text: "feedback attachment" });
  }

  blocks.push({ type: "divider" });

  // `text` is the notification/fallback string shown in Slack push/preview.
  return { text: kindHeading(row.kind), blocks };
}

/**
 * Accept the Supabase Database Webhook shape `{ type, table, record }`, a plain
 * `{ record }`, or a direct feedback row — so it's easy to test with curl.
 */
function extractRow(body: unknown): FeedbackRow | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  if (obj.record && typeof obj.record === "object") return obj.record as FeedbackRow;
  // A direct row must at least look like feedback (has a message/kind/id).
  if ("message" in obj || "kind" in obj || "id" in obj) return obj as FeedbackRow;
  return null;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  // Shared-secret gate. When FEEDBACK_WEBHOOK_SECRET is set, require a matching
  // header; when unset, allow all callers so setup is one step. This is the only
  // case where we return a non-200 — an unauthorized caller should be rejected.
  const expectedSecret = Deno.env.get("FEEDBACK_WEBHOOK_SECRET");
  if (expectedSecret) {
    const provided = req.headers.get("x-webhook-secret");
    if (provided !== expectedSecret) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }
  }

  try {
    const body = await req.json().catch(() => null);
    const row = extractRow(body);
    if (!row) {
      // Malformed payload — don't 500 (that would make pg_net/DB webhooks retry).
      return jsonResponse({ success: true, delivered: false, note: "No feedback record in payload." });
    }

    const webhookUrl = Deno.env.get("SLACK_FEEDBACK_WEBHOOK_URL");
    if (!webhookUrl) {
      // Not configured yet — succeed quietly so the DB webhook doesn't retry-storm.
      return jsonResponse({
        success: true,
        delivered: false,
        note:
          "SLACK_FEEDBACK_WEBHOOK_URL is not configured. Set it with: supabase secrets set SLACK_FEEDBACK_WEBHOOK_URL=... --project-ref yxtnocecnqutcvltptya",
      });
    }

    const payload = buildBlocks(row);
    const slackRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!slackRes.ok) {
      const detail = await slackRes.text().catch(() => "");
      // Log for observability, but still 200 — Slack failures must not cascade.
      console.error(`Slack webhook failed: ${slackRes.status} ${detail}`);
      return jsonResponse({
        success: true,
        delivered: false,
        note: `Slack responded ${slackRes.status}: ${detail.slice(0, 200)}`,
      });
    }

    return jsonResponse({ success: true, delivered: true });
  } catch (error) {
    // Never surface a 500 to the webhook caller — log and acknowledge.
    console.error("feedback-to-slack error:", error);
    return jsonResponse({
      success: true,
      delivered: false,
      note: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
