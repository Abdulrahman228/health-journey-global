/**
 * In-memory rate limiter for TanStack Start server functions on Cloudflare Workers.
 *
 * Notes / caveats:
 * - Per-isolate state. Cloudflare may run many isolates so the effective limit
 *   per IP across the fleet is N_isolates * limit. This stops naive abuse
 *   (curl/script bots) but is NOT a DDoS defense — for that use Cloudflare's
 *   built-in Rate Limiting rules or a Durable Object.
 * - Keys on CF-Connecting-IP (set by Cloudflare). Falls back to x-forwarded-for
 *   then a constant bucket so the limit still applies when called without IP.
 * - Fixed window. Each entry stores {count, resetAt}; resets when expired.
 */

import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

type Bucket = { count: number; resetAt: number };

const buckets: Map<string, Bucket> = (globalThis as unknown as {
  __iaskRateBuckets?: Map<string, Bucket>;
}).__iaskRateBuckets ?? new Map<string, Bucket>();

(globalThis as unknown as { __iaskRateBuckets?: Map<string, Bucket> }).__iaskRateBuckets =
  buckets;

function getClientIp(): string {
  try {
    const req = getRequest();
    if (!req?.headers) return "unknown";
    return (
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-real-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown"
    );
  } catch {
    return "unknown";
  }
}

/**
 * Throw "Too many requests" if the caller has exceeded `limit` calls
 * within the given window (milliseconds), keyed on (scope + client IP).
 */
export function rateLimit(scope: string, limit: number, windowMs: number) {
  const ip = getClientIp();
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  entry.count += 1;
  if (entry.count > limit) {
    const retryIn = Math.ceil((entry.resetAt - now) / 1000);
    throw new Error(`Too many requests. Try again in ${retryIn}s.`);
  }
}

/**
 * Middleware factory: enforces a rate limit before the handler runs.
 * Usage:
 *   .middleware([rateLimitMiddleware("signup", 5, 60 * 60 * 1000)])
 */
export function rateLimitMiddleware(scope: string, limit: number, windowMs: number) {
  return createMiddleware({ type: "function" }).server(async ({ next }) => {
    rateLimit(scope, limit, windowMs);
    return next();
  });
}
