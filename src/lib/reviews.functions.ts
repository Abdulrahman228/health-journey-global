/**
 * Reviews server functions: patient submission + admin moderation.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("forbidden");
}

async function profileIdForUser(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const id = (data as { id?: string } | null)?.id;
  if (!id) throw new Error("profile_not_found");
  return id;
}

// ---------- Patient: list eligible appointments for a doctor ----------
const eligibleInput = z.object({
  userId: z.string().uuid(),
  doctorId: z.string().uuid(),
});

export type EligibleAppointment = {
  appointmentId: string;
  appointmentDate: string | null;
  alreadyReviewed: boolean;
};

export const listEligibleAppointments = createServerFn({ method: "GET" })
  .inputValidator((x: unknown) => eligibleInput.parse(x))
  .handler(async ({ data }): Promise<EligibleAppointment[]> => {
    const profileId = await profileIdForUser(data.userId);

    const { data: appts, error } = await supabaseAdmin
      .from("appointments")
      .select("id, appointment_date, payment_status, fee, status")
      .eq("patient_id", profileId)
      .eq("doctor_id", data.doctorId)
      .eq("status", "completed")
      .order("appointment_date", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    const eligible = (appts ?? []).filter((a) => {
      const fee = Number(a.fee ?? 0);
      const ps = a.payment_status as string | null;
      return (
        fee === 0 ||
        ps === "paid" ||
        ps === "refunded" ||
        ps === "partially_refunded"
      );
    });

    if (eligible.length === 0) return [];

    const ids = eligible.map((a) => a.id as string);
    const { data: reviewed } = await supabaseAdmin
      .from("reviews")
      .select("appointment_id")
      .in("appointment_id", ids);
    const reviewedSet = new Set(
      ((reviewed ?? []) as Array<{ appointment_id: string | null }>)
        .map((r) => r.appointment_id)
        .filter((x): x is string => Boolean(x)),
    );

    return eligible.map((a) => ({
      appointmentId: a.id as string,
      appointmentDate: (a.appointment_date as string | null) ?? null,
      alreadyReviewed: reviewedSet.has(a.id as string),
    }));
  });

// ---------- Patient: submit review ----------
const submitInput = z.object({
  userId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

export const submitReview = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) => submitInput.parse(x))
  .handler(async ({ data }) => {
    const profileId = await profileIdForUser(data.userId);

    const { data: appt, error: appErr } = await supabaseAdmin
      .from("appointments")
      .select("id, patient_id, doctor_id, status, payment_status, fee")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (appErr) return { ok: false as const, error: appErr.message };
    if (!appt) return { ok: false as const, error: "appointment_not_found" };
    if ((appt.patient_id as string) !== profileId) {
      return { ok: false as const, error: "forbidden" };
    }
    if ((appt.status as string) !== "completed") {
      return { ok: false as const, error: "appointment_not_completed" };
    }
    const fee = Number(appt.fee ?? 0);
    const ps = appt.payment_status as string | null;
    if (
      !(
        fee === 0 ||
        ps === "paid" ||
        ps === "refunded" ||
        ps === "partially_refunded"
      )
    ) {
      return { ok: false as const, error: "appointment_unpaid" };
    }

    // Insert — trigger validates again, partial UNIQUE blocks duplicates.
    const { data: ins, error } = await supabaseAdmin
      .from("reviews")
      .insert({
        appointment_id: appt.id as string,
        doctor_id: appt.doctor_id as string,
        patient_id: profileId,
        rating: data.rating,
        comment: (data.comment ?? "").trim() || null,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) {
      const msg = error.message ?? "insert_failed";
      // Postgres unique violation
      if (msg.includes("duplicate key") || msg.includes("reviews_appointment_id_unique")) {
        return { ok: false as const, error: "already_reviewed" };
      }
      return { ok: false as const, error: msg };
    }

    return { ok: true as const, reviewId: ins.id as string };
  });

const listInput = z.object({
  userId: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
  limit: z.number().int().min(1).max(200).default(50),
});

export const adminListReviews = createServerFn({ method: "GET" })
  .inputValidator((x: unknown) => listInput.parse(x))
  .handler(async ({ data }) => {
    await assertAdmin(data.userId);
    let q = supabaseAdmin
      .from("reviews")
      .select(
        `id, rating, comment, status, created_at, moderated_at, moderation_notes,
         patient_id, doctor_id,
         patient:profiles!reviews_patient_id_fkey ( id, full_name ),
         doctor:doctor_details!reviews_doctor_id_fkey (
           id, profile:profiles!doctor_details_profile_id_fkey ( id, full_name )
         )`
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      rating: r.rating as number,
      comment: r.comment as string | null,
      status: r.status as "pending" | "approved" | "rejected",
      createdAt: r.created_at as string,
      moderatedAt: r.moderated_at as string | null,
      notes: r.moderation_notes as string | null,
      patientName:
        (r.patient as { full_name?: string } | null)?.full_name ?? "—",
      doctorName:
        ((r.doctor as { profile?: { full_name?: string } } | null)?.profile
          ?.full_name) ?? "—",
    }));
  });

const moderateInput = z.object({
  userId: z.string().uuid(),
  reviewId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  notes: z.string().max(1000).optional(),
});

export const adminModerateReview = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) => moderateInput.parse(x))
  .handler(async ({ data }) => {
    await assertAdmin(data.userId);
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", data.userId)
      .maybeSingle();
    const moderatorProfileId = (prof as { id?: string } | null)?.id ?? null;

    const { error } = await supabaseAdmin
      .from("reviews")
      .update({
        status: data.decision,
        moderated_at: new Date().toISOString(),
        moderated_by: moderatorProfileId,
        moderation_notes: data.notes ?? null,
      })
      .eq("id", data.reviewId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
