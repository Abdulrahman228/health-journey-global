/**
 * In-memory rate limiters for TanStack Start server functions on Cloudflare.
 *
 * Caveats:
 * - Per-isolate state. CF runs many isolates so effective per-IP limit across
 *   the fleet is N_isolates * limit. Stops naive script abuse; not a DDoS
 *   defense — for that use CF's built-in Rate Limiting rules or a Durable
 *   Object.
 * - Keys on cf-connecting-ip / x-real-ip / x-forwarded-for, falling back to a
 *   shared "unknown" bucket so the limit still applies when no IP is present.
 *
 * IMPORTANT: export middlewares as STATIC CONSTANTS (not factory functions),
 * otherwise the TanStack Start client/server split can't trace them and the
 * server-only `getRequest` import leaks into the client bundle.
 */

import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

type Bucket = { count: number; resetAt: number };

const buckets: Map<string, Bucket> =
  (globalThis as unknown as { __iaskRateBuckets?: Map<string, Bucket> })
    .__iaskRateBuckets ?? new Map<string, Bucket>();

(globalThis as unknown as { __iaskRateBuckets?: Map<string, Bucket> })
  .__iaskRateBuckets = buckets;

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

function enforce(scope: string, limit: number, windowMs: number) {
  const key = `${scope}:${getClientIp()}`;
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

/** 5 sign-ups per hour per IP — anti-spam on account creation. */
export const signupRateLimit = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    enforce("signup", 5, 60 * 60 * 1000);
    return next();
  },
);
