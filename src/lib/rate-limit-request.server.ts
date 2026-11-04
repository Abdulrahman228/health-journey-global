/**
 * Rate limiting for plain API routes that receive the Request directly (e.g.
 * /api/public/auth/signup used by the mobile apps). Shares the in-memory
 * buckets with the server-function middlewares in `_rate-limit.ts` (same
 * globalThis map, same `${scope}:${ip}` keys), so a client cannot double its
 * quota by switching between the web form and the API.
 *
 * Server-only on purpose: `_rate-limit.ts` is also loaded by browser code and
 * must keep only its static middleware exports (see the note in that file).
 */
type Bucket = { count: number; resetAt: number };

function buckets(): Map<string, Bucket> {
  const g = globalThis as unknown as { __iaskRateBuckets?: Map<string, Bucket> };
  g.__iaskRateBuckets ??= new Map<string, Bucket>();
  return g.__iaskRateBuckets;
}

function clientIp(request: Request): string {
  const h = request.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** Throws `Too many requests` once `limit` hits per `windowMs` are exceeded for this IP. */
export function enforceRequestLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
): void {
  const map = buckets();
  const key = `${scope}:${clientIp(request)}`;
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || entry.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > limit) {
    const retryIn = Math.ceil((entry.resetAt - now) / 1000);
    throw new Error(`Too many requests. Try again in ${retryIn}s.`);
  }
}
