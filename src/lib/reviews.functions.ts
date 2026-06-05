/**
 * Reviews moderation server functions (admin-only).
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
