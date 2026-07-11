/**
 * Lightweight sliding-window rate limiting backed by the `rate_limits` table.
 *
 * Each allowed call inserts one row; a request is allowed only if the count of
 * rows in (bucket, key) within the window is below `limit`. Rows are pruned by
 * the `cleanup-rate-limits` job (see Phase 4) so the table stays small.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** Best-effort client IP from proxy headers. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || "unknown";
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

/**
 * Check + record a rate-limited action. Returns whether it's allowed and how
 * many attempts remain in the window. On a DB error we fail OPEN (allow) so a
 * transient rate-limit outage never blocks core functionality.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  bucket: string,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  try {
    const { count, error } = await supabase
      .from("rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("bucket", bucket)
      .eq("key", key)
      .gte("created_at", since);

    if (error) {
      console.error("rate-limit check error (failing open):", error.message);
      return { allowed: true, remaining: limit, limit };
    }

    const used = count ?? 0;
    if (used >= limit) return { allowed: false, remaining: 0, limit };

    await supabase.from("rate_limits").insert({ bucket, key });
    return { allowed: true, remaining: Math.max(0, limit - used - 1), limit };
  } catch (e) {
    console.error("rate-limit check threw (failing open):", e);
    return { allowed: true, remaining: limit, limit };
  }
}
