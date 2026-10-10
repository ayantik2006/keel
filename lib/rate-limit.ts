import "server-only";
import { ApiError } from "./api";

/**
 * Fixed-window rate limiter held in process memory.
 *
 * Limitations: counters are per server instance and reset on restart, so with
 * several instances the effective limit is multiplied. Use a shared store
 * (for example Redis) before relying on this in a multi-instance deployment.
 */
const g = globalThis as unknown as {
  rateBuckets?: Map<string, { count: number; resetAt: number }>;
};

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
) {
  const buckets = (g.rateBuckets ??= new Map());
  const now = Date.now();

  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count++;
  if (bucket.count > limit) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000);
    throw new ApiError(429, `Too many requests. Try again in ${seconds}s.`);
  }
}

/**
 * Best-effort client address. x-forwarded-for is only trustworthy behind a
 * proxy you control, so treat this as a rate-limit key, not an identity.
 */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
