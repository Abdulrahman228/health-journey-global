import { z } from "zod";

// -----------------------------------------------------------------------------
// Admin action input schemas. These are the single source of truth for the
// admin API surface and double as the DTO contract the mobile AdminRepositories
// (Android/iOS) mirror in Phase 3.
//
// RULE: input carries only the TARGET of the action. The actor's identity and
// role are NEVER accepted from the client — they come from the verified JWT
// (see requireAdmin in _kit.ts).
// -----------------------------------------------------------------------------

/** Ban / unban a user. `unban: true` lifts an existing ban. */
export const AdminBanUserSchema = z.object({
  targetUserId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  /** Finite ban window in hours. Omitted/absent => effectively permanent. */
  durationHours: z.number().int().positive().max(876_000).optional(),
  unban: z.boolean().default(false),
});
export type AdminBanUserInput = z.infer<typeof AdminBanUserSchema>;

/** Approve or reject a doctor's verification request. */
export const AdminVerifyDoctorSchema = z.object({
  doctorDetailsId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});
export type AdminVerifyDoctorInput = z.infer<typeof AdminVerifyDoctorSchema>;

/** Refund a payment via Stripe (super_admin only). */
export const AdminProcessRefundSchema = z.object({
  paymentId: z.string().uuid(),
  /** Optional partial amount in the smallest currency unit (e.g. piastres). Omitted => full refund. */
  amountMinor: z.number().int().positive().optional(),
  reason: z
    .enum(["requested_by_customer", "duplicate", "fraudulent", "other"])
    .default("requested_by_customer"),
  note: z.string().trim().max(500).optional(),
});
export type AdminProcessRefundInput = z.infer<typeof AdminProcessRefundSchema>;

/** Approve or reject a manual (receipt-based) subscription request. */
export const AdminReviewManualSubscriptionSchema = z.object({
  subscriptionId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});
export type AdminReviewManualSubscriptionInput = z.infer<
  typeof AdminReviewManualSubscriptionSchema
>;

/**
 * Admin comp/gift subscription grant. `months = null` → lifetime (no expiry).
 * Anchored to a doctor's PROFILE id; the server resolves their auth user_id.
 */
export const AdminGrantSubscriptionSchema = z.object({
  profileId: z.string().uuid(),
  planCode: z.enum(["doctor_gold_monthly", "doctor_gold_yearly"]).default("doctor_gold_monthly"),
  months: z.number().int().min(1).max(120).nullable(),
});
export type AdminGrantSubscriptionInput = z.infer<typeof AdminGrantSubscriptionSchema>;

/** Delete community content (moderation). */
export const AdminDeleteContentSchema = z.object({
  contentType: z.enum(["post", "reply", "review"]),
  contentId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});
export type AdminDeleteContentInput = z.infer<typeof AdminDeleteContentSchema>;
