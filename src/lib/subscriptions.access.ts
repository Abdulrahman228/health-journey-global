// -----------------------------------------------------------------------------
// Trust-but-Verify access helpers (PURE — no server imports, client-safe).
//
// The TypeScript twin of the access window baked into doctor_active_tier() in
// 20260712010000_manual_subscription_access.sql. Keep the two in sync.
// -----------------------------------------------------------------------------

/** Grace window a manual (pending) receipt buys before it must be verified. */
export const MANUAL_ACCESS_GRACE_HOURS = 24;

/** Gold plan codes eligible for the manual receipt flow. */
export const MANUAL_GOLD_PLAN_CODES = ["doctor_gold_monthly", "doctor_gold_yearly"] as const;
export type ManualGoldPlanCode = (typeof MANUAL_GOLD_PLAN_CODES)[number];

export interface AccessBearing {
  access_status: string | null;
  access_granted_at: string | null;
}

/**
 * True if a subscription currently confers access:
 *   - verified                              -> always
 *   - pending AND granted < 24h ago         -> yes (immediate-access grace)
 *   - pending AND granted >= 24h ago        -> no (must be verified by now)
 *   - rejected / anything else              -> no
 */
export function hasValidAccess(sub: AccessBearing | null | undefined, now: Date = new Date()): boolean {
  if (!sub) return false;
  if (sub.access_status === "verified") return true;
  if (sub.access_status === "pending" && sub.access_granted_at) {
    const grantedMs = new Date(sub.access_granted_at).getTime();
    if (!Number.isFinite(grantedMs)) return false;
    return now.getTime() - grantedMs < MANUAL_ACCESS_GRACE_HOURS * 3_600_000;
  }
  return false;
}

/** Instant a pending grant lapses (null if not a live pending grant). */
export function manualAccessExpiresAt(sub: AccessBearing | null | undefined): Date | null {
  if (!sub || sub.access_status !== "pending" || !sub.access_granted_at) return null;
  const grantedMs = new Date(sub.access_granted_at).getTime();
  if (!Number.isFinite(grantedMs)) return null;
  return new Date(grantedMs + MANUAL_ACCESS_GRACE_HOURS * 3_600_000);
}
