import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDoctorForUser, getProfileIdForUser } from "@/lib/_identity";

/**
 * Phase 5 — Private encrypted feedback.
 * - Patients submit feedback that's stored ENCRYPTED at rest in Postgres
 *   via pgcrypto pgp_sym_encrypt with a per-doctor key derived from a server
 *   pepper. Only the doctor (via SECURITY DEFINER RPC) can decrypt.
 * - These server functions delegate to the SQL functions for that gating.
 */

/** SQL exception codes raised by the *_private_feedback_admin functions → Arabic. */
function feedbackError(message: string): Error {
  const map: Record<string, string> = {
    patient_required: "لم يتم العثور على ملفك الشخصي — أكمل بيانات حسابك أولاً",
    message_invalid: "الرسالة يجب أن تكون بين 5 و5000 حرف",
    rating_invalid: "التقييم يجب أن يكون من 1 إلى 5",
    feedback_not_found: "الملاحظة غير موجودة",
    cannot_reply_anonymous: "لا يمكن الرد على ملاحظة مجهولة",
    empty_reply: "اكتب نص الرد أولاً",
  };
  const key = Object.keys(map).find((k) => message.includes(k));
  return new Error(key ? map[key] : "تعذّر تنفيذ العملية: " + message);
}

export const submitPrivateFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      doctorDetailsId: z.string().uuid(),
      message: z.string().min(5).max(5000),
      rating: z.number().int().min(1).max(5).nullable().optional(),
      anonymous: z.boolean().default(false),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    // p_patient_id is a PROFILE id (FK doctor_private_feedback.patient_profile_id
    // → profiles.id) — never fall back to the auth uid.
    const patientProfileId = await getProfileIdForUser(context.userId);
    if (!patientProfileId) throw feedbackError("patient_required");
    const { data: id, error } = await supabaseAdmin.rpc("submit_private_feedback_admin", {
      p_doctor_details_id: data.doctorDetailsId,
      p_patient_id: patientProfileId,
      p_message: data.message,
      p_rating: data.rating ?? undefined,
      p_anonymous: data.anonymous,
    });
    if (error) throw feedbackError(error.message);
    return { id };
  });

export const readMyPrivateFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      limit: z.number().int().min(1).max(200).default(50),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    // The caller's own doctor_details; the service-role-only *_admin RPC then
    // decrypts just that doctor's notes (ownership is resolved here).
    const me = await getDoctorForUser(context.userId);
    if (!me) throw new Error("لم يتم العثور على ملف الطبيب لهذا الحساب");

    const { data: rows, error } = await supabaseAdmin.rpc("read_my_private_feedback_admin", {
      p_doctor_details_id: me.doctorDetailsId,
      p_limit: data.limit,
    });
    // (No silent placeholder fallback any more: the RPC is installed and a
    // failure here — e.g. a missing vault pepper — must surface to the doctor.)
    if (error) throw new Error("تعذّر فك تشفير الملاحظات: " + error.message);
    return rows ?? [];
  });

/**
 * Doctor writes ONE private reply to a patient's feedback note. Only works for
 * non-anonymous notes; the patient is notified in-app. Ownership is verified
 * here (caller must own the doctor record) and again in the SQL function.
 */
export const replyToPrivateFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      feedbackId: z.string().uuid(),
      reply: z.string().min(1).max(2000),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const me = await getDoctorForUser(context.userId);
    if (!me) throw new Error("لم يتم العثور على ملف الطبيب لهذا الحساب");

    const { error } = await supabaseAdmin.rpc("reply_private_feedback_admin", {
      p_feedback_id: data.feedbackId,
      p_doctor_details_id: me.doctorDetailsId,
      p_reply: data.reply,
    });
    if (error) throw feedbackError(error.message);
    return { ok: true as const };
  });
