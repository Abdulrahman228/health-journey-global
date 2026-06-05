/**
 * Phase 7 — Online consultation request workflow.
 *
 * Patient submits → doctor proposes (slot + fee) → patient accepts (paid via Stripe)
 * or rejects (no charge).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { type StripeEnv, createStripeClient } from "@/lib/stripe.server";
import { getStripeEnvironment } from "@/lib/stripe";

type ConsultationStatus =
  | "pending_doctor"
  | "proposed"
  | "accepted"
  | "paid"
  | "rejected_by_patient"
  | "rejected_by_doctor"
  | "expired"
  | "cancelled";

const PROPOSAL_TTL_HOURS = 48;

// ---------------------------------------------------------------------------
// Patient: submit a new consultation request
// ---------------------------------------------------------------------------
export const submitConsultationRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      doctorDetailsId: z.string().uuid(),
      reason: z.string().min(5).max(2000),
      preferredDates: z.array(z.string()).optional(),
      consultationType: z.enum(["video", "voice", "chat"]).default("video"),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    // Block duplicates: one open request per (patient, doctor) at a time.
    const { data: existing } = await supabaseAdmin
      .from("consultation_requests")
      .select("id, status")
      .eq("patient_id", context.userId)
      .eq("doctor_details_id", data.doctorDetailsId)
      .in("status", ["pending_doctor", "proposed", "accepted"])
      .maybeSingle();
    if (existing) {
      throw new Error("لديك طلب مفتوح بالفعل مع هذا الطبيب");
    }

    const { data: row, error } = await supabaseAdmin
      .from("consultation_requests")
      .insert({
        patient_id: context.userId,
        doctor_details_id: data.doctorDetailsId,
        reason: data.reason,
        preferred_dates: data.preferredDates ?? null,
        consultation_type: data.consultationType,
        status: "pending_doctor" as ConsultationStatus,
      })
      .select("id, status, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------------------------------------------------------------------------
// Doctor: propose a slot (status pending_doctor → proposed)
// ---------------------------------------------------------------------------
export const proposeConsultationSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      requestId: z.string().uuid(),
      slot: z.string(), // ISO timestamp
      durationMinutes: z.number().int().min(10).max(180).default(30),
      feeCents: z.number().int().min(0).max(10_000_000),
      currency: z.string().length(3).default("EGP"),
      note: z.string().max(1000).optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    // Verify caller owns the doctor_details on this request.
    const { data: req } = await supabaseAdmin
      .from("consultation_requests")
      .select("id, status, doctor_details_id")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req) throw new Error("الطلب غير موجود");
    if (req.status !== "pending_doctor") {
      throw new Error("لا يمكن اقتراح ميعاد على طلب بهذه الحالة");
    }

    const { data: ddRaw } = await supabaseAdmin
      .from("doctor_details")
      .select("id, profile_id")
      .eq("id", req.doctor_details_id as string)
      .maybeSingle();
    const dd = ddRaw as { id: string; profile_id: string | null } | null;
    if (!dd || dd.profile_id !== context.userId) {
      throw new Error("غير مصرح");
    }

    const slotDate = new Date(data.slot);
    if (isNaN(slotDate.getTime()) || slotDate.getTime() < Date.now() + 5 * 60_000) {
      throw new Error("الميعاد المقترح غير صالح");
    }
    const expiresAt = new Date(Date.now() + PROPOSAL_TTL_HOURS * 3600_000);

    const { data: row, error } = await supabaseAdmin
      .from("consultation_requests")
      .update({
        status: "proposed" as ConsultationStatus,
        proposed_slot: slotDate.toISOString(),
        proposed_duration_minutes: data.durationMinutes,
        fee_cents: data.feeCents,
        currency: data.currency,
        doctor_note: data.note ?? null,
        proposed_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .eq("id", data.requestId)
      .select("id, status, proposed_slot, fee_cents, expires_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------------------------------------------------------------------------
// Doctor: reject the request (without proposing)
// ---------------------------------------------------------------------------
export const doctorRejectRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      requestId: z.string().uuid(),
      note: z.string().max(500).optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { data: reqRaw } = await supabaseAdmin
      .from("consultation_requests")
      .select("id, status, doctor_details_id")
      .eq("id", data.requestId)
      .maybeSingle();
    const req = reqRaw as
      | { id: string; status: ConsultationStatus; doctor_details_id: string }
      | null;
    if (!req) throw new Error("الطلب غير موجود");
    if (!["pending_doctor", "proposed"].includes(req.status)) {
      throw new Error("لا يمكن رفض طلب في هذه الحالة");
    }

    const { data: ddRaw } = await supabaseAdmin
      .from("doctor_details")
      .select("profile_id")
      .eq("id", req.doctor_details_id)
      .maybeSingle();
    const dd = ddRaw as { profile_id: string | null } | null;
    if (!dd || dd.profile_id !== context.userId) throw new Error("غير مصرح");

    const { error } = await supabaseAdmin
      .from("consultation_requests")
      .update({
        status: "rejected_by_doctor" as ConsultationStatus,
        doctor_reject_note: data.note ?? null,
        responded_at: new Date().toISOString(),
      })
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Patient: accept the proposed slot — creates appointment + Stripe checkout
// ---------------------------------------------------------------------------
export const acceptConsultationProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      requestId: z.string().uuid(),
      returnUrl: z.string().url(),
      cancelUrl: z.string().url(),
      customerEmail: z.string().email().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { data: reqRaw } = await supabaseAdmin
      .from("consultation_requests")
      .select(
        "id, status, patient_id, doctor_details_id, proposed_slot, proposed_duration_minutes, fee_cents, currency, expires_at",
      )
      .eq("id", data.requestId)
      .maybeSingle();
    const req = reqRaw as
      | {
          id: string;
          status: ConsultationStatus;
          patient_id: string;
          doctor_details_id: string;
          proposed_slot: string | null;
          proposed_duration_minutes: number | null;
          fee_cents: number | null;
          currency: string;
          expires_at: string | null;
        }
      | null;
    if (!req) throw new Error("الطلب غير موجود");
    if (req.patient_id !== context.userId) throw new Error("غير مصرح");
    if (req.status !== "proposed") throw new Error("لا يمكن قبول طلب في هذه الحالة");
    if (!req.proposed_slot || !req.fee_cents) throw new Error("بيانات الاقتراح ناقصة");
    if (req.expires_at && new Date(req.expires_at).getTime() < Date.now()) {
      await supabaseAdmin
        .from("consultation_requests")
        .update({ status: "expired" as ConsultationStatus })
        .eq("id", req.id);
      throw new Error("انتهت صلاحية الاقتراح");
    }

    // Doctor name for the checkout description.
    const { data: ddRaw } = await supabaseAdmin
      .from("doctor_details")
      .select("profile_id, profiles!inner(full_name)")
      .eq("id", req.doctor_details_id)
      .maybeSingle();
    const dd = ddRaw as
      | { profile_id: string; profiles: { full_name: string | null } | null }
      | null;
    const doctorName = dd?.profiles?.full_name ?? "طبيب";

    // Create appointment row in 'pending' status; webhook will flip to confirmed.
    const { data: apptRaw, error: apptErr } = await supabaseAdmin
      .from("appointments")
      .insert({
        patient_id: req.patient_id,
        doctor_id: req.doctor_details_id,
        scheduled_at: req.proposed_slot,
        duration_minutes: req.proposed_duration_minutes ?? 30,
        appointment_type: "online",
        status: "pending",
        fee: (req.fee_cents ?? 0) / 100,
      })
      .select("id")
      .single();
    if (apptErr) throw new Error(apptErr.message);
    const appt = apptRaw as { id: string };

    // Mark request accepted + link appointment.
    await supabaseAdmin
      .from("consultation_requests")
      .update({
        status: "accepted" as ConsultationStatus,
        appointment_id: appt.id,
        responded_at: new Date().toISOString(),
      })
      .eq("id", req.id);

    // Create Stripe checkout (hosted redirect) for the consultation fee.
    const env: StripeEnv = getStripeEnvironment();
    const stripe = createStripeClient(env);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: data.returnUrl,
      cancel_url: data.cancelUrl,
      ...(data.customerEmail && { customer_email: data.customerEmail }),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: req.currency.toLowerCase(),
            unit_amount: req.fee_cents,
            product_data: {
              name: `كشف أونلاين — د. ${doctorName}`,
              description: `Tabibi consultation ${req.id}`,
            },
          },
        },
      ],
      payment_intent_data: {
        description: `Tabibi consultation ${req.id}`,
        metadata: {
          consultation_request_id: req.id,
          appointment_id: appt.id,
          userId: context.userId,
        },
      },
      metadata: {
        consultation_request_id: req.id,
        appointment_id: appt.id,
        userId: context.userId,
      },
    });

    return { url: session.url, appointmentId: appt.id };
  });

// ---------------------------------------------------------------------------
// Patient: reject the proposed slot (no charge)
// ---------------------------------------------------------------------------
export const rejectConsultationProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      requestId: z.string().uuid(),
      note: z.string().max(500).optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { data: reqRaw } = await supabaseAdmin
      .from("consultation_requests")
      .select("id, patient_id, status")
      .eq("id", data.requestId)
      .maybeSingle();
    const req = reqRaw as
      | { id: string; patient_id: string; status: ConsultationStatus }
      | null;
    if (!req) throw new Error("الطلب غير موجود");
    if (req.patient_id !== context.userId) throw new Error("غير مصرح");
    if (req.status !== "proposed") throw new Error("لا يمكن رفض طلب في هذه الحالة");

    const { error } = await supabaseAdmin
      .from("consultation_requests")
      .update({
        status: "rejected_by_patient" as ConsultationStatus,
        patient_reject_note: data.note ?? null,
        responded_at: new Date().toISOString(),
      })
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Patient: cancel a request still pending with the doctor
// ---------------------------------------------------------------------------
export const cancelConsultationRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ requestId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: reqRaw } = await supabaseAdmin
      .from("consultation_requests")
      .select("id, patient_id, status")
      .eq("id", data.requestId)
      .maybeSingle();
    const req = reqRaw as
      | { id: string; patient_id: string; status: ConsultationStatus }
      | null;
    if (!req) throw new Error("الطلب غير موجود");
    if (req.patient_id !== context.userId) throw new Error("غير مصرح");
    if (req.status !== "pending_doctor") throw new Error("الطلب لا يمكن إلغاؤه الآن");

    const { error } = await supabaseAdmin
      .from("consultation_requests")
      .update({ status: "cancelled" as ConsultationStatus })
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// List requests (role-aware)
// ---------------------------------------------------------------------------
export const listMyConsultationRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Fetch as patient
    const { data: asPatientRaw } = await supabaseAdmin
      .from("consultation_requests")
      .select(
        "id, status, reason, consultation_type, proposed_slot, proposed_duration_minutes, fee_cents, currency, doctor_note, expires_at, created_at, doctor_details_id",
      )
      .eq("patient_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    const asPatient = (asPatientRaw ?? []) as Array<Record<string, unknown>>;

    // If user is a doctor, fetch as doctor too.
    const { data: ddRaw } = await supabaseAdmin
      .from("doctor_details")
      .select("id")
      .eq("profile_id", context.userId)
      .maybeSingle();
    const dd = ddRaw as { id: string } | null;
    let asDoctor: Array<Record<string, unknown>> = [];
    if (dd) {
      // Hydrate patient name for inbox display
      const { data: rawDocList } = await supabaseAdmin
        .from("consultation_requests")
        .select(
          "id, status, reason, consultation_type, proposed_slot, fee_cents, currency, expires_at, created_at, patient_id, profiles!consultation_requests_patient_id_fkey(full_name)",
        )
        .eq("doctor_details_id", dd.id)
        .order("created_at", { ascending: false })
        .limit(50);
      asDoctor = (rawDocList ?? []) as Array<Record<string, unknown>>;
    }

    return {
      // Stringify to satisfy the TanStack Start serializable-output guard for
      // jsonb-shaped rows. UI re-parses with JSON.parse(json).
      asPatient: JSON.stringify(asPatient),
      asDoctor: JSON.stringify(asDoctor),
    };
  });
