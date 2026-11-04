/**
 * EMR server functions — Electronic Medical Records.
 *
 * Privacy-first: every server fn validates that the calling user
 * belongs to (patient OR doctor OR admin) BEFORE returning data, even
 * though Supabase RLS will also enforce it. Defense in depth.
 *
 * `private_notes` are stripped from any payload that goes to a patient.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDoctorForUser, getProfileIdForUser, isDoctorLinkedToPatient } from "@/lib/_identity";
import { assertSelf } from "./_authz";
import { normalizePhone } from "./phone";
import { triggerOutboxDrain } from "./messaging.server";

// ---- Types ----
export interface VitalsJson {
  bp?: string;
  hr?: number;
  temp?: number;
  weight?: number;
  height?: number;
  o2?: number;
  glucose?: number;
}

export interface MedicalRecord {
  id: string;
  patientProfileId: string;
  doctorProfileId: string;
  appointmentId: string | null;
  visitType: "first_visit" | "follow_up" | "tele" | "emergency";
  chiefComplaint: string | null;
  historyPresentIllness: string | null;
  physicalExamination: string | null;
  diagnosis: string[];
  icd10Codes: string[];
  vitals: VitalsJson | null;
  treatmentPlan: string | null;
  recommendedTests: string[];
  followUpDays: number | null;
  privateNotes: string | null; // null for patient viewers
  visitDate: string;
  doctorName?: string | null;
  doctorSpecialty?: string | null;
  patientName?: string | null;
}

export interface PrescriptionItem {
  id: string;
  drugName: string;
  activeIngredient: string | null;
  dosage: string;
  frequency: string;
  duration: string;
  route: string | null;
  instructions: string | null;
  quantity: number | null;
  sortOrder: number;
}

export interface Prescription {
  id: string;
  medicalRecordId: string;
  prescriptionNumber: string;
  notes: string | null;
  validUntil: string | null;
  status: "active" | "dispensed" | "expired" | "cancelled";
  createdAt: string;
  items: PrescriptionItem[];
}

// ---- Helpers ----

async function getMyProfileId(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

async function isAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

function mapRecord(row: Record<string, unknown>, includePrivate: boolean): MedicalRecord {
  return {
    id: row.id as string,
    patientProfileId: row.patient_profile_id as string,
    doctorProfileId: row.doctor_profile_id as string,
    appointmentId: (row.appointment_id as string | null) ?? null,
    visitType: (row.visit_type as MedicalRecord["visitType"]) ?? "first_visit",
    chiefComplaint: (row.chief_complaint as string | null) ?? null,
    historyPresentIllness: (row.history_present_illness as string | null) ?? null,
    physicalExamination: (row.physical_examination as string | null) ?? null,
    diagnosis: (row.diagnosis as string[] | null) ?? [],
    icd10Codes: (row.icd10_codes as string[] | null) ?? [],
    vitals: (row.vitals as VitalsJson | null) ?? null,
    treatmentPlan: (row.treatment_plan as string | null) ?? null,
    recommendedTests: (row.recommended_tests as string[] | null) ?? [],
    followUpDays: (row.follow_up_days as number | null) ?? null,
    privateNotes: includePrivate ? ((row.private_notes as string | null) ?? null) : null,
    visitDate: row.visit_date as string,
  };
}

// ============================================================
// Read: doctor or admin lists a patient's full history with THIS doctor
// ============================================================
export const getPatientHistoryForDoctor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ patientProfileId: z.string().uuid() }).parse(x))
  .handler(async ({ data, context }) => {
    // Caller must be admin OR a doctor who has a medical_record with this patient.
    const myProfileId = await getMyProfileId(context.userId);
    const admin = await isAdmin(context.userId);
    if (!admin) {
      if (!myProfileId) return [];
      const { data: link } = await supabaseAdmin
        .from("medical_records")
        .select("id")
        .eq("patient_profile_id", data.patientProfileId)
        .eq("doctor_profile_id", myProfileId)
        .limit(1)
        .maybeSingle();
      if (!link && myProfileId !== data.patientProfileId) {
        // Shared care (Phase D): a doctor LINKED to this patient may follow the
        // case even without a prior record — but only if the patient consented.
        const [{ data: dpLink }, { data: pt }] = await Promise.all([
          supabaseAdmin
            .from("doctor_patients")
            .select("id")
            .eq("doctor_profile_id", myProfileId)
            .eq("patient_profile_id", data.patientProfileId)
            .limit(1)
            .maybeSingle(),
          supabaseAdmin
            .from("profiles")
            .select("shared_care_consent")
            .eq("id", data.patientProfileId)
            .maybeSingle(),
        ]);
        if (!(dpLink && pt?.shared_care_consent)) return [];
      }
    }

    const { data: rows, error } = await supabaseAdmin
      .from("medical_records")
      .select(
        "id, patient_profile_id, doctor_profile_id, appointment_id, visit_type, chief_complaint, history_present_illness, physical_examination, diagnosis, icd10_codes, vitals, treatment_plan, recommended_tests, follow_up_days, private_notes, visit_date",
      )
      .eq("patient_profile_id", data.patientProfileId)
      .order("visit_date", { ascending: false })
      .limit(200);
    if (error || !rows) return [];
    return rows.map((r) => mapRecord(r as Record<string, unknown>, true));
  });

// ============================================================
// Read: patient lists ALL their own records (across all doctors)
// `private_notes` are filtered out.
// ============================================================
export const getMyMedicalHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ userId: z.string().uuid() }).parse(x))
  .handler(async ({ data, context }) => {
    assertSelf(context.userId, data.userId);
    const profileId = await getMyProfileId(data.userId);
    if (!profileId) return [];

    const { data: rows, error } = await supabaseAdmin
      .from("medical_records")
      .select(
        "id, patient_profile_id, doctor_profile_id, appointment_id, visit_type, chief_complaint, history_present_illness, physical_examination, diagnosis, icd10_codes, vitals, treatment_plan, recommended_tests, follow_up_days, visit_date",
      )
      .eq("patient_profile_id", profileId)
      .order("visit_date", { ascending: false })
      .limit(500);
    if (error || !rows) return [];

    // Enrich with doctor info for the patient view
    const doctorIds = Array.from(new Set(rows.map((r) => r.doctor_profile_id as string)));
    const { data: docs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", doctorIds);
    const { data: docDetails } = await supabaseAdmin
      .from("doctor_details")
      .select("profile_id, specialty")
      .in("profile_id", doctorIds);

    const nameByProfile = new Map(
      (docs ?? []).map((d) => [d.id as string, (d.full_name as string | null) ?? ""]),
    );
    const specByProfile = new Map(
      (docDetails ?? []).map((d) => [d.profile_id as string, (d.specialty as string | null) ?? ""]),
    );

    return rows.map((r) => {
      const rec = mapRecord(r as Record<string, unknown>, false);
      rec.doctorName = nameByProfile.get(rec.doctorProfileId) ?? null;
      rec.doctorSpecialty = specByProfile.get(rec.doctorProfileId) ?? null;
      return rec;
    });
  });

// ============================================================
// Doctor: search/list patients they've ever treated
// ============================================================
export const searchMyPatients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        q: z.string().optional().default(""),
      })
      .parse(x),
  )
  .handler(async ({ data, context }) => {
    assertSelf(context.userId, data.userId);
    const doctorProfileId = await getMyProfileId(data.userId);
    if (!doctorProfileId) return [];

    // appointments.doctor_id references doctor_details.id (NOT the profile id),
    // so resolve it first. Without this, appointment-only patients (booked but
    // with no recorded visit yet) never surface — so a doctor can't find them to
    // open their file or write their first prescription. This was the bug.
    const { data: ddRow } = await supabaseAdmin
      .from("doctor_details")
      .select("id")
      .eq("profile_id", doctorProfileId)
      .maybeSingle();
    const doctorDetailsId = (ddRow?.id as string | undefined) ?? null;

    // Collect distinct patient ids across medical_records + appointments
    const [mr, ap] = await Promise.all([
      supabaseAdmin
        .from("medical_records")
        .select("patient_profile_id, visit_date")
        .eq("doctor_profile_id", doctorProfileId)
        .order("visit_date", { ascending: false })
        .limit(500),
      doctorDetailsId
        ? supabaseAdmin
            .from("appointments")
            .select("patient_id, scheduled_at")
            .eq("doctor_id", doctorDetailsId)
            .order("scheduled_at", { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [] as { patient_id: string; scheduled_at: string }[] }),
    ]);

    const lastSeen = new Map<string, string>();
    for (const r of mr.data ?? []) {
      const id = r.patient_profile_id as string;
      const date = r.visit_date as string;
      if (!lastSeen.has(id) || (lastSeen.get(id) ?? "") < date) lastSeen.set(id, date);
    }
    for (const a of ap.data ?? []) {
      const id = a.patient_id as string;
      const date = a.scheduled_at as string;
      if (!lastSeen.has(id) || (lastSeen.get(id) ?? "") < date) lastSeen.set(id, date);
    }

    const derivedIds = Array.from(lastSeen.keys());

    // Include doctor-managed (offline) patients — added/imported by this doctor,
    // even before they have any records or appointments.
    const { data: managed } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("managed_by_doctor", doctorProfileId)
      .limit(2000);
    const managedIds = (managed ?? []).map((m) => m.id as string);

    const allIds = Array.from(new Set([...derivedIds, ...managedIds]));
    if (allIds.length === 0) return [];

    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, avatar_url, city")
      .in("id", allIds);

    const q = data.q.trim().toLowerCase();
    return (profs ?? [])
      .map((p) => ({
        id: p.id as string,
        fullName: (p.full_name as string | null) ?? "",
        avatarUrl: (p.avatar_url as string | null) ?? null,
        city: (p.city as string | null) ?? null,
        lastSeen: lastSeen.get(p.id as string) ?? null,
      }))
      .filter((p) =>
        q ? p.fullName.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
  });

// ============================================================
// Doctor-managed (offline) patients: add one / bulk import
// ============================================================

const ManagedPatientSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  dateOfBirth: z.string().trim().optional().default(""), // "YYYY-MM-DD" or ""
});

/**
 * Welcome messages: linking a patient to a doctor (doctor_patients INSERT, or a
 * profiles INSERT with managed_by_doctor) makes the database queue ONE
 * "تم تسجيلك لدى د. فلان" WhatsApp/SMS with the patient's claim link
 * (migration 20261103100000 §5). The server functions below only decide
 * whether the doctor attested consent, and poke the sender so the message
 * leaves immediately instead of waiting for the minute cron.
 */
async function cancelQueuedWelcome(patientIds: string[]): Promise<void> {
  if (patientIds.length === 0) return;
  await supabaseAdmin
    .from("outbox_messages" as never)
    .update({ status: "skipped", error: "doctor_declined_notification" } as never)
    .in("patient_profile_id", patientIds)
    .eq("template_key", "patient_welcome")
    .eq("status", "queued");
}

async function countQueuedWelcome(patientIds: string[], since: string): Promise<number> {
  if (patientIds.length === 0) return 0;
  const { count } = await supabaseAdmin
    .from("outbox_messages" as never)
    .select("id", { count: "exact", head: true })
    .in("patient_profile_id", patientIds)
    .eq("template_key", "patient_welcome")
    .gte("created_at", since);
  return count ?? 0;
}

/** Add a single offline patient owned by the calling doctor. */
export const addManagedPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        /** Doctor confirmed the patient agreed to be contacted (default: send). */
        notify: z.boolean().optional().default(true),
      })
      .merge(ManagedPatientSchema)
      .parse(x),
  )
  .handler(async ({ data, context }) => {
    assertSelf(context.userId, data.userId);
    const doctorProfileId = await getMyProfileId(data.userId);
    if (!doctorProfileId) throw new Error("Doctor profile not found");

    const startedAt = new Date().toISOString();
    const phoneE164 = normalizePhone(data.phone);
    const phone = phoneE164 ?? (data.phone.trim() || null);
    let patientId: string | null = null;

    // Dedup: reuse an existing UNCLAIMED (managed) profile with the same phone
    // so multiple doctors share ONE patient identity (matches add_managed_patient).
    if (phoneE164) {
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("phone_e164" as never, phoneE164)
        .is("user_id", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (existing) patientId = existing.id as string;
    }

    if (!patientId) {
      const { data: prof, error } = await supabaseAdmin
        .from("profiles")
        .insert({
          user_id: null,
          managed_by_doctor: doctorProfileId,
          full_name: data.fullName.trim(),
          phone,
          city: data.city.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      patientId = prof.id as string;

      const dob = data.dateOfBirth.trim();
      if (dob) {
        await supabaseAdmin
          .from("patient_details")
          .insert({ profile_id: patientId, date_of_birth: dob });
      }
    }

    // Link this doctor to the patient (idempotent). The INSERT trigger queues
    // the welcome message; a no-op upsert (already linked) queues nothing.
    await supabaseAdmin
      .from("doctor_patients")
      .upsert(
        { doctor_profile_id: doctorProfileId, patient_profile_id: patientId },
        { onConflict: "doctor_profile_id,patient_profile_id", ignoreDuplicates: true },
      );

    let queued = 0;
    if (data.notify) {
      queued = await countQueuedWelcome([patientId], startedAt);
      if (queued > 0) void triggerOutboxDrain(5);
    } else {
      await cancelQueuedWelcome([patientId]);
    }

    return { id: patientId, queued, hasPhone: Boolean(phoneE164) };
  });

/** Bulk-import offline patients (e.g. parsed from a CSV of old patients). */
export const importManagedPatients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        patients: z.array(ManagedPatientSchema).min(1).max(1000),
        /** Doctor attests the listed patients agreed to be contacted by them. */
        consentAttested: z.literal(true),
      })
      .parse(x),
  )
  .handler(async ({ data, context }) => {
    assertSelf(context.userId, data.userId);
    const doctorProfileId = await getMyProfileId(data.userId);
    if (!doctorProfileId) throw new Error("Doctor profile not found");

    const startedAt = new Date().toISOString();
    const cleaned = data.patients
      .map((p) => {
        const e164 = normalizePhone(p.phone);
        return {
          full_name: p.fullName.trim(),
          phone: e164 ?? (p.phone.trim() || null),
          phone_e164: e164,
          city: p.city.trim() || null,
        };
      })
      .filter((r) => r.full_name.length > 0);
    if (cleaned.length === 0) return { inserted: 0, linked: 0, queued: 0, withoutPhone: 0 };

    // Dedup inside the file (same number twice) and against existing
    // UNCLAIMED profiles — those are LINKED, not duplicated.
    const seen = new Set<string>();
    const unique = cleaned.filter((r) => {
      if (!r.phone_e164) return true;
      if (seen.has(r.phone_e164)) return false;
      seen.add(r.phone_e164);
      return true;
    });
    const phones = unique.map((r) => r.phone_e164).filter((p): p is string => Boolean(p));
    const existingByPhone = new Map<string, string>();
    for (let i = 0; i < phones.length; i += 200) {
      const slice = phones.slice(i, i + 200);
      const { data: found } = await supabaseAdmin
        .from("profiles")
        .select("id, phone_e164")
        .in("phone_e164" as never, slice)
        .is("user_id", null)
        .order("created_at", { ascending: true });
      for (const f of (found ?? []) as unknown as Array<{ id: string; phone_e164: string }>) {
        if (!existingByPhone.has(f.phone_e164)) existingByPhone.set(f.phone_e164, f.id);
      }
    }

    const toLink = unique
      .filter((r) => r.phone_e164 && existingByPhone.has(r.phone_e164))
      .map((r) => existingByPhone.get(r.phone_e164!)!);
    const toInsert = unique
      .filter((r) => !(r.phone_e164 && existingByPhone.has(r.phone_e164)))
      .map((r) => ({
        user_id: null as string | null,
        managed_by_doctor: doctorProfileId,
        full_name: r.full_name,
        phone: r.phone,
        city: r.city,
      }));

    let inserted = 0;
    const insertedIds: string[] = [];
    for (let i = 0; i < toInsert.length; i += 200) {
      const { data: rows, error } = await supabaseAdmin
        .from("profiles")
        .insert(toInsert.slice(i, i + 200))
        .select("id");
      if (error) throw new Error(error.message);
      inserted += rows?.length ?? 0;
      for (const r of rows ?? []) insertedIds.push(r.id as string);
    }

    if (toLink.length > 0) {
      await supabaseAdmin.from("doctor_patients").upsert(
        toLink.map((patient_profile_id) => ({
          doctor_profile_id: doctorProfileId,
          patient_profile_id,
        })),
        { onConflict: "doctor_profile_id,patient_profile_id", ignoreDuplicates: true },
      );
    }

    const queued = await countQueuedWelcome([...insertedIds, ...toLink], startedAt);
    if (queued > 0) void triggerOutboxDrain(25);

    return {
      inserted,
      linked: toLink.length,
      queued,
      withoutPhone: unique.filter((r) => !r.phone_e164).length,
    };
  });

// ============================================================
// Create/update medical record + prescription
// ============================================================
export const createMedicalRecord = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        patientProfileId: z.string().uuid(),
        appointmentId: z.string().uuid().nullable().optional(),
        visitType: z.enum(["first_visit", "follow_up", "tele", "emergency"]),
        chiefComplaint: z.string().optional().default(""),
        historyPresentIllness: z.string().optional().default(""),
        physicalExamination: z.string().optional().default(""),
        diagnosis: z.array(z.string()).default([]),
        icd10Codes: z.array(z.string()).default([]),
        vitals: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
        treatmentPlan: z.string().optional().default(""),
        recommendedTests: z.array(z.string()).default([]),
        followUpDays: z.number().int().min(0).max(365).nullable().optional(),
        privateNotes: z.string().optional().default(""),
        prescription: z
          .object({
            notes: z.string().optional().default(""),
            validDays: z.number().int().min(1).max(180).default(30),
            items: z
              .array(
                z.object({
                  drugName: z.string().min(1),
                  activeIngredient: z.string().optional().default(""),
                  dosage: z.string().min(1),
                  frequency: z.string().min(1),
                  duration: z.string().min(1),
                  route: z.string().optional().default(""),
                  instructions: z.string().optional().default(""),
                  quantity: z.number().int().positive().nullable().optional(),
                }),
              )
              .default([]),
          })
          .nullable()
          .optional(),
      })
      .parse(x),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    assertSelf(context.userId, data.userId);
    const doctorProfileId = await getMyProfileId(data.userId);
    if (!doctorProfileId) {
      return { ok: false as const, error: "unauth" };
    }
    // Only a doctor who is actually linked to this patient (appointment,
    // managed-patient link, prior record) may write into their file.
    const me = await getDoctorForUser(data.userId);
    if (!me) return { ok: false as const, error: "not_a_doctor" };
    if (!(await isDoctorLinkedToPatient(doctorProfileId, data.patientProfileId))) {
      return { ok: false as const, error: "not_your_patient" };
    }
    // Insert medical record
    const { data: rec, error: recErr } = await supabaseAdmin
      .from("medical_records")
      .insert({
        patient_profile_id: data.patientProfileId,
        doctor_profile_id: doctorProfileId,
        appointment_id: data.appointmentId ?? null,
        visit_type: data.visitType,
        chief_complaint: data.chiefComplaint || null,
        history_present_illness: data.historyPresentIllness || null,
        physical_examination: data.physicalExamination || null,
        diagnosis: data.diagnosis,
        icd10_codes: data.icd10Codes,
        vitals: data.vitals ?? null,
        treatment_plan: data.treatmentPlan || null,
        recommended_tests: data.recommendedTests,
        follow_up_days: data.followUpDays ?? null,
        private_notes: data.privateNotes || null,
      })
      .select("id")
      .single();
    if (recErr || !rec) {
      return { ok: false as const, error: recErr?.message ?? "insert_failed" };
    }

    // Writing the visit note completes the consultation: mark the linked
    // appointment 'completed' so the accounting trigger posts revenue (no
    // separate "close visit" step to forget). Idempotent + best-effort.
    if (data.appointmentId) {
      await supabaseAdmin
        .from("appointments")
        .update({ status: "completed" })
        .eq("id", data.appointmentId)
        .neq("status", "completed");
    }

    let prescriptionId: string | null = null;
    if (data.prescription && data.prescription.items.length > 0) {
      const { data: rxNumRes } = await supabaseAdmin.rpc("next_prescription_number");
      const rxNumber = (rxNumRes as string) ?? `RX-${Date.now()}`;
      const validUntil = new Date(Date.now() + data.prescription.validDays * 86400_000)
        .toISOString()
        .slice(0, 10);
      const { data: rx, error: rxErr } = await supabaseAdmin
        .from("prescriptions")
        .insert({
          medical_record_id: rec.id,
          prescription_number: rxNumber,
          notes: data.prescription.notes || null,
          valid_until: validUntil,
          status: "active",
        })
        .select("id")
        .single();
      if (rxErr || !rx) {
        return {
          ok: false as const,
          error: "visit_saved_prescription_failed:" + (rxErr?.message ?? "insert"),
          recordId: rec.id,
        };
      }
      {
        prescriptionId = rx.id;
        const items = data.prescription.items.map((it, idx) => ({
          prescription_id: rx.id,
          drug_name: it.drugName,
          active_ingredient: it.activeIngredient || null,
          dosage: it.dosage,
          frequency: it.frequency,
          duration: it.duration,
          route: it.route || null,
          instructions: it.instructions || null,
          quantity: it.quantity ?? null,
          sort_order: idx,
        }));
        const { error: itemsErr } = await supabaseAdmin.from("prescription_items").insert(items);
        if (itemsErr) {
          return {
            ok: false as const,
            error: "visit_saved_prescription_failed:" + itemsErr.message,
            recordId: rec.id,
          };
        }
      }
    }

    return { ok: true as const, recordId: rec.id, prescriptionId };
  });

// ============================================================
// Get prescriptions for a medical record (with items)
// ============================================================
export const getPrescriptionsForRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ medicalRecordId: z.string().uuid() }).parse(x))
  .handler(async ({ data, context }): Promise<Prescription[]> => {
    // Authorize: caller must be patient, prescribing doctor, or admin.
    const { data: rec } = await supabaseAdmin
      .from("medical_records")
      .select("patient_profile_id, doctor_profile_id")
      .eq("id", data.medicalRecordId)
      .maybeSingle();
    if (!rec) return [];
    const myProfileId = await getMyProfileId(context.userId);
    const admin = await isAdmin(context.userId);
    if (
      !admin &&
      myProfileId !== (rec.patient_profile_id as string) &&
      myProfileId !== (rec.doctor_profile_id as string)
    ) {
      return [];
    }

    const { data: rxs, error } = await supabaseAdmin
      .from("prescriptions")
      .select("id, medical_record_id, prescription_number, notes, valid_until, status, created_at")
      .eq("medical_record_id", data.medicalRecordId)
      .order("created_at", { ascending: false });
    if (error || !rxs || rxs.length === 0) return [];

    const ids = rxs.map((r) => r.id as string);
    const { data: items } = await supabaseAdmin
      .from("prescription_items")
      .select(
        "id, prescription_id, drug_name, active_ingredient, dosage, frequency, duration, route, instructions, quantity, sort_order",
      )
      .in("prescription_id", ids)
      .order("sort_order");

    return rxs.map((r) => ({
      id: r.id as string,
      medicalRecordId: r.medical_record_id as string,
      prescriptionNumber: r.prescription_number as string,
      notes: (r.notes as string | null) ?? null,
      validUntil: (r.valid_until as string | null) ?? null,
      status: (r.status as Prescription["status"]) ?? "active",
      createdAt: r.created_at as string,
      items: (items ?? [])
        .filter((it) => (it.prescription_id as string) === (r.id as string))
        .map((it) => ({
          id: it.id as string,
          drugName: it.drug_name as string,
          activeIngredient: (it.active_ingredient as string | null) ?? null,
          dosage: it.dosage as string,
          frequency: it.frequency as string,
          duration: it.duration as string,
          route: (it.route as string | null) ?? null,
          instructions: (it.instructions as string | null) ?? null,
          quantity: (it.quantity as number | null) ?? null,
          sortOrder: (it.sort_order as number | null) ?? 0,
        })),
    }));
  });

// ============================================================
// Patient medical profile (allergies, chronic, meds)
// ============================================================
export const getPatientMedicalProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ patientProfileId: z.string().uuid() }).parse(x))
  .handler(async ({ data, context }) => {
    // Authorize: caller must be the patient, admin, or a treating doctor.
    const myProfileId = await getMyProfileId(context.userId);
    const admin = await isAdmin(context.userId);
    if (!admin && myProfileId !== data.patientProfileId) {
      if (!myProfileId) return null;
      // Same rule as the visit history: appointment / managed link / prior record.
      if (!(await isDoctorLinkedToPatient(myProfileId, data.patientProfileId))) return null;
    }
    const { data: p } = await supabaseAdmin
      .from("patient_medical_profile")
      .select("*")
      .eq("patient_profile_id", data.patientProfileId)
      .maybeSingle();
    if (!p) return null;
    return {
      patientProfileId: p.patient_profile_id as string,
      bloodType: (p.blood_type as string | null) ?? null,
      allergies: (p.allergies as string[] | null) ?? [],
      chronicConditions: (p.chronic_conditions as string[] | null) ?? [],
      currentMedications: (p.current_medications as string[] | null) ?? [],
      familyHistory: (p.family_history as string | null) ?? null,
      smoking: Boolean(p.smoking),
      alcohol: Boolean(p.alcohol),
    };
  });

export const upsertMyMedicalProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        bloodType: z.string().nullable().optional(),
        allergies: z.array(z.string()).default([]),
        chronicConditions: z.array(z.string()).default([]),
        currentMedications: z.array(z.string()).default([]),
        familyHistory: z.string().nullable().optional(),
        smoking: z.boolean().default(false),
        alcohol: z.boolean().default(false),
      })
      .parse(x),
  )
  .handler(async ({ data, context }) => {
    assertSelf(context.userId, data.userId);
    const profileId = await getMyProfileId(data.userId);
    if (!profileId) return { ok: false as const, error: "unauth" };
    const { error } = await supabaseAdmin.from("patient_medical_profile").upsert(
      {
        patient_profile_id: profileId,
        blood_type: data.bloodType ?? null,
        allergies: data.allergies,
        chronic_conditions: data.chronicConditions,
        current_medications: data.currentMedications,
        family_history: data.familyHistory ?? null,
        smoking: data.smoking,
        alcohol: data.alcohol,
      },
      { onConflict: "patient_profile_id" },
    );
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// Unused helper kept exported for admin audits if needed later
export { isAdmin };

// ============================================================
// PUBLIC verification endpoint — used by pharmacies via QR scan.
//
// Returns ONLY authenticity metadata (no patient name, no drug list,
// no diagnosis). Anyone with the prescription number can verify it
// exists and is valid; PHI is never exposed.
// ============================================================
export interface PrescriptionVerification {
  prescriptionNumber: string;
  status: "active" | "dispensed" | "cancelled" | "expired";
  issuedAt: string;
  validUntil: string | null;
  doctorName: string | null;
  doctorLicense: string | null;
  itemCount: number;
}

export const verifyPrescription = createServerFn({ method: "GET" })
  .inputValidator((x: unknown) =>
    z.object({ prescriptionNumber: z.string().min(3).max(64) }).parse(x),
  )
  .handler(async ({ data }): Promise<PrescriptionVerification | null> => {
    const { data: rx } = await supabaseAdmin
      .from("prescriptions")
      .select("id, prescription_number, status, valid_until, created_at, medical_record_id")
      .eq("prescription_number", data.prescriptionNumber)
      .maybeSingle();
    if (!rx) return null;

    const { data: rec } = await supabaseAdmin
      .from("medical_records")
      .select("doctor_profile_id")
      .eq("id", rx.medical_record_id as string)
      .maybeSingle();

    const [doctorProfRes, doctorDetailsRes, { count }] = await Promise.all([
      rec
        ? supabaseAdmin
            .from("profiles")
            .select("full_name")
            .eq("id", rec.doctor_profile_id as string)
            .maybeSingle()
        : Promise.resolve({ data: null as { full_name: string | null } | null }),
      rec
        ? supabaseAdmin
            .from("doctor_details")
            .select("syndicate_number")
            .eq("profile_id", rec.doctor_profile_id as string)
            .maybeSingle()
        : Promise.resolve({ data: null as { syndicate_number: string | null } | null }),
      supabaseAdmin
        .from("prescription_items")
        .select("*", { count: "exact", head: true })
        .eq("prescription_id", rx.id as string),
    ]);

    // Auto-mark expired if past valid_until
    let status = (rx.status as PrescriptionVerification["status"]) ?? "active";
    if (status === "active" && rx.valid_until && new Date(rx.valid_until as string) < new Date()) {
      status = "expired";
    }

    return {
      prescriptionNumber: rx.prescription_number as string,
      status,
      issuedAt: rx.created_at as string,
      validUntil: (rx.valid_until as string | null) ?? null,
      doctorName: (doctorProfRes.data?.full_name as string | null) ?? null,
      doctorLicense:
        ((doctorDetailsRes.data as { syndicate_number: string | null } | null)?.syndicate_number as
          | string
          | null) ?? null,
      itemCount: count ?? 0,
    };
  });

// ============================================================
// Public-but-authorized prescription view (for /rx/$id print page)
//
// Authorization: caller must be the patient, the prescribing doctor,
// or an admin. RLS double-enforces via the SELECT on prescriptions.
// ============================================================
export interface PrescriptionView {
  prescription: Prescription;
  record: Pick<
    MedicalRecord,
    | "id"
    | "visitDate"
    | "diagnosis"
    | "icd10Codes"
    | "chiefComplaint"
    | "patientProfileId"
    | "doctorProfileId"
  >;
  patient: { name: string | null; allergies: string[] };
  doctor: {
    name: string | null;
    specialty: string | null;
    licenseNumber: string | null;
    phone: string | null;
    signatureUrl: string | null;
    stampUrl: string | null;
  };
}

export const getPrescriptionView = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        prescriptionId: z.string().uuid(),
      })
      .parse(x),
  )
  .handler(async ({ data, context }): Promise<PrescriptionView | null> => {
    assertSelf(context.userId, data.userId);
    // 1. Load the prescription + record
    const { data: rx } = await supabaseAdmin
      .from("prescriptions")
      .select("id, medical_record_id, prescription_number, notes, valid_until, status, created_at")
      .eq("id", data.prescriptionId)
      .maybeSingle();
    if (!rx) return null;

    const { data: rec } = await supabaseAdmin
      .from("medical_records")
      .select(
        "id, patient_profile_id, doctor_profile_id, visit_date, diagnosis, icd10_codes, chief_complaint",
      )
      .eq("id", rx.medical_record_id as string)
      .maybeSingle();
    if (!rec) return null;

    // 2. Authorize: caller must be patient OR doctor OR admin
    const myProfileId = await getMyProfileId(data.userId);
    const admin = await isAdmin(data.userId);
    if (
      !admin &&
      myProfileId !== (rec.patient_profile_id as string) &&
      myProfileId !== (rec.doctor_profile_id as string)
    ) {
      return null;
    }

    // 3. Items
    const { data: items } = await supabaseAdmin
      .from("prescription_items")
      .select(
        "id, prescription_id, drug_name, active_ingredient, dosage, frequency, duration, route, instructions, quantity, sort_order",
      )
      .eq("prescription_id", rx.id as string)
      .order("sort_order");

    // 4. Patient + doctor details (parallel)
    const [{ data: pPatient }, { data: medProf }, { data: pDoctor }, doctorDetailsRes] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", rec.patient_profile_id as string)
          .maybeSingle(),
        supabaseAdmin
          .from("patient_medical_profile")
          .select("allergies")
          .eq("patient_profile_id", rec.patient_profile_id as string)
          .maybeSingle(),
        supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", rec.doctor_profile_id as string)
          .maybeSingle(),
        supabaseAdmin
          .from("doctor_details")
          .select("specialty, syndicate_number, signature_url, stamp_url")
          .eq("profile_id", rec.doctor_profile_id as string)
          .maybeSingle(),
      ]);

    const dd = doctorDetailsRes.data as {
      specialty: string | null;
      syndicate_number: string | null;
      signature_url: string | null;
      stamp_url: string | null;
    } | null;

    const prescription: Prescription = {
      id: rx.id as string,
      medicalRecordId: rx.medical_record_id as string,
      prescriptionNumber: rx.prescription_number as string,
      notes: (rx.notes as string | null) ?? null,
      validUntil: (rx.valid_until as string | null) ?? null,
      status: (rx.status as Prescription["status"]) ?? "active",
      createdAt: rx.created_at as string,
      items: (items ?? []).map((it) => ({
        id: it.id as string,
        drugName: it.drug_name as string,
        activeIngredient: (it.active_ingredient as string | null) ?? null,
        dosage: it.dosage as string,
        frequency: it.frequency as string,
        duration: it.duration as string,
        route: (it.route as string | null) ?? null,
        instructions: (it.instructions as string | null) ?? null,
        quantity: (it.quantity as number | null) ?? null,
        sortOrder: (it.sort_order as number | null) ?? 0,
      })),
    };

    return {
      prescription,
      record: {
        id: rec.id as string,
        visitDate: rec.visit_date as string,
        diagnosis: (rec.diagnosis as string[] | null) ?? [],
        icd10Codes: (rec.icd10_codes as string[] | null) ?? [],
        chiefComplaint: (rec.chief_complaint as string | null) ?? null,
        patientProfileId: rec.patient_profile_id as string,
        doctorProfileId: rec.doctor_profile_id as string,
      },
      patient: {
        name: (pPatient?.full_name as string | null) ?? null,
        allergies:
          ((medProf as { allergies?: string[] } | null)?.allergies as string[] | undefined) ?? [],
      },
      doctor: {
        name: (pDoctor?.full_name as string | null) ?? null,
        specialty: (dd?.specialty as string | null) ?? null,
        licenseNumber: (dd?.syndicate_number as string | null) ?? null,
        phone: null as string | null,
        signatureUrl: (dd?.signature_url as string | null) ?? null,
        stampUrl: (dd?.stamp_url as string | null) ?? null,
      },
    };
  });
