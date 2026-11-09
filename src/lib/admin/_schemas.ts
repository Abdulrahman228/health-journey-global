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
  planCode: z
    .enum(["doctor_gold_monthly", "doctor_gold_yearly", "doctor_gold_lifetime"])
    .default("doctor_gold_monthly"),
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

// ---------------------------------------------------------------------------
// Phase 2 (2026-11-09): user / doctor / appointment actions for the admin panel.
// ---------------------------------------------------------------------------

export const APP_ROLES = ["patient", "doctor", "admin", "super_admin", "lab", "pharmacy"] as const;

/** Replace a user's role set (super_admin only). */
export const AdminSetUserRolesSchema = z.object({
  targetUserId: z.string().uuid(),
  roles: z.array(z.enum(APP_ROLES)).min(1).max(6),
  reason: z.string().trim().min(3).max(300),
});

/** Generate a password-reset link for a user and e-mail it (link also returned). */
export const AdminPasswordResetSchema = z.object({
  targetUserId: z.string().uuid(),
});

/** What would be affected by deleting this user. */
export const AdminUserImpactSchema = z.object({
  targetUserId: z.string().uuid(),
});

/** Soft delete (ban + anonymise, keeps clinical records) or hard delete (super_admin). */
export const AdminDeleteUserSchema = z.object({
  targetUserId: z.string().uuid(),
  mode: z.enum(["soft", "hard"]),
  reason: z.string().trim().min(3).max(500),
});

export const APPOINTMENT_STATUSES = ["pending", "confirmed", "waiting", "in_progress", "completed", "cancelled", "no_show"] as const;
export const PAYMENT_STATUSES = ["unpaid", "paid", "failed", "refunded", "pending_review"] as const;

/** Admin edit of an appointment; every field optional, at least one required. */
export const AdminUpdateAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
  patch: z
    .object({
      status: z.enum(APPOINTMENT_STATUSES).optional(),
      payment_status: z.enum(PAYMENT_STATUSES).optional(),
      scheduled_at: z.string().datetime({ offset: true }).optional(),
      appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      clinic_id: z.string().uuid().nullable().optional(),
      doctor_id: z.string().uuid().optional(),
      fee: z.number().min(0).max(100000).optional(),
      queue_number: z.number().int().min(1).max(999).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
    })
    .refine((p) => Object.keys(p).length > 0, "nothing to update"),
  reason: z.string().trim().min(3).max(300),
});

/** Doctor switches the admin may flip directly. */
export const AdminSetDoctorFlagsSchema = z.object({
  doctorDetailsId: z.string().uuid(),
  telemedicine_enabled: z.boolean().optional(),
  is_verified: z.boolean().optional(),
  /** Per-doctor online commission override (%); null clears it (plan default applies). */
  commission_pct: z.number().min(0).max(100).nullable().optional(),
  reason: z.string().trim().min(3).max(300),
});
