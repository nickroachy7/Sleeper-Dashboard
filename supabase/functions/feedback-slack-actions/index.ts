/**
 * Edge Function: feedback-slack-actions
 *
 * Slack interactivity endpoint. When someone clicks a triage button on a
 * feedback message (Pursue / Done / Dismiss), Slack POSTs the interaction here.
 * We verify the request came from Slack (signing-secret HMAC), update the
 * feedback row's status, and replace the original message with an updated one
 * that records who set which status.
 *
 * Slack app config (Interactivity & Shortcuts → Request URL):
 *   https://<project>.supabase.co/functions/v1/feedback-slack-actions
 *
 * Secret (required to verify requests):
 *   supabase secrets set SLACK_SIGNING_SECRET=... --project-ref yxtnocecnqutcvltptya
 *   (Slack app → Basic Information → Signing Secret.)
 *
 * Deploy WITHOUT JWT verification (Slack signs its own requests):
 *   supabase functions deploy feedback-slack-actions --no-verify-jwt --project-ref yxtnocecnqutcvltptya
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase-client.ts";

const STATUS_META: Record<string, { label: string; emoji: string }> = {
  pursuing: { label: "Pursuing", emoji: "🔎" },
  done: { label: "Done", emoji: "✅" },
  dismissed: { label: "Dismissed", emoji: "🗑️" },
  open: { label: "Open", emoji: "🆕" },
};

const enc = new TextEncoder();

/** Constant-time-ish comparison to avoid leaking timing on the signature. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify Slack's request signature (v0 HMAC-SHA256 over `v0:ts:body`). */
async function verifySlackSignature(
  signingSecret: string,
  timestamp: string | null,
  signature: string | null,
  rawBody: string,
): Promise<boolean> {
  if (!timestamp || !signature) return false;
  // Reject stale requests (>5 min) to blunt replay attacks.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 60 * 5) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const macBytes = await crypto.subtle.sign("HMAC", key, enc.encode(`v0:${timestamp}:${rawBody}`));
  const expected =
    "v0=" +
    [...new Uint8Array(macBytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return safeEqual(expected, signature);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signingSecret = Deno.env.get("SLACK_SIGNING_SECRET");
  if (!signingSecret) {
    // Can't verify without it — refuse rather than trust an unsigned caller.
    return new Response("SLACK_SIGNING_SECRET not configured", { status: 401 });
  }

  // Signature is computed over the exact raw body — read it before parsing.
  const rawBody = await req.text();
  const ok = await verifySlackSignature(
    signingSecret,
    req.headers.get("x-slack-request-timestamp"),
    req.headers.get("x-slack-signature"),
    rawBody,
  );
  if (!ok) return new Response("Invalid signature", { status: 401 });

  // Slack sends `payload=<url-encoded json>` as form data.
  let payload: {
    type?: string;
    user?: { id?: string; username?: string };
    actions?: { action_id?: string; value?: string }[];
    message?: { text?: string; blocks?: { type?: string; block_id?: string }[] };
  };
  try {
    const payloadStr = new URLSearchParams(rawBody).get("payload");
    payload = JSON.parse(payloadStr ?? "{}");
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  if (payload.type !== "block_actions" || !payload.actions?.length) {
    return new Response("", { status: 200 });
  }

  const action = payload.actions[0];
  const [prefix, status] = (action.action_id ?? "").split(":");
  const feedbackId = action.value;
  if (prefix !== "fb_status" || !status || !STATUS_META[status] || !feedbackId) {
    return new Response("", { status: 200 });
  }

  // Update the feedback row's status.
  try {
    const supabase = createServiceClient();
    await supabase.from("feedback").update({ status }).eq("id", feedbackId);
  } catch (e) {
    console.error("feedback-slack-actions update error:", e);
    // Fall through — still update the message so the click isn't a dead end.
  }

  // Rebuild the message: keep its blocks, drop any prior status line, and add a
  // fresh one. Buttons stay so the status can be changed again.
  const meta = STATUS_META[status];
  const userRef = payload.user?.id ? `<@${payload.user.id}>` : "someone";
  const blocks = (payload.message?.blocks ?? []).filter((b) => b.block_id !== "fb_status_ctx");
  blocks.push({
    type: "context",
    block_id: "fb_status_ctx",
    // deno-lint-ignore no-explicit-any
    elements: [{ type: "mrkdwn", text: `${meta.emoji} *${meta.label}* — set by ${userRef}` }],
  } as any);

  return new Response(
    JSON.stringify({
      replace_original: true,
      text: payload.message?.text ?? "Feedback",
      blocks,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
