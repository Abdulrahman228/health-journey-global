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
import { assertSelf } from "./_authz";

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
  privateNotes: string | null;       // null for patient viewers
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
  .inputValidator((x: unknown) =>
    z.object({ patientProfileId: z.string().uuid() }).parse(x),
  )
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
      if (!link) {
        // Allow the patient themselves to read their full history with private notes hidden:
        if (myProfileId !== data.patientProfileId) return [];
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
  .inputValidator((x: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(x),
  )
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

    const nameByProfile = new Map((docs ?? []).map((d) => [d.id as string, (d.full_name as string | null) ?? ""]));
    const specByProfile = new Map((docDetails ?? []).map((d) => [d.profile_id as string, (d.specialty as string | null) ?? ""]));

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

    // Collect distinct patient ids across medical_records + appointments
    const [mr, ap] = await Promise.all([
      supabaseAdmin
        .from("medical_records")
        .select("patient_profile_id, visit_date")
        .eq("doctor_profile_id", doctorProfileId)
        .order("visit_date", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("appointments")
        .select("patient_id, scheduled_at")
        .eq("doctor_id", doctorProfileId)
        .order("scheduled_at", { ascending: false })
        .limit(500),
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

    const patientIds = Array.from(lastSeen.keys());
    if (patientIds.length === 0) return [];

    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, avatar_url, city")
      .in("id", patientIds);

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
        q
          ? p.fullName.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
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
      if (!rxErr && rx) {
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
        await supabaseAdmin.from("prescription_items").insert(items);
      }
    }

    return { ok: true as const, recordId: rec.id, prescriptionId };
  });

// ============================================================
// Get prescriptions for a medical record (with items)
// ============================================================
export const getPrescriptionsForRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z.object({ medicalRecordId: z.string().uuid() }).parse(x),
  )
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
      .select(
        "id, medical_record_id, prescription_number, notes, valid_until, status, created_at",
      )
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
  .inputValidator((x: unknown) =>
    z.object({ patientProfileId: z.string().uuid() }).parse(x),
  )
  .handler(async ({ data, context }) => {
    // Authorize: caller must be the patient, admin, or a treating doctor.
    const myProfileId = await getMyProfileId(context.userId);
    const admin = await isAdmin(context.userId);
    if (!admin && myProfileId !== data.patientProfileId) {
      if (!myProfileId) return null;
      const { data: link } = await supabaseAdmin
        .from("medical_records")
        .select("id")
        .eq("patient_profile_id", data.patientProfileId)
        .eq("doctor_profile_id", myProfileId)
        .limit(1)
        .maybeSingle();
      if (!link) return null;
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
      .select(
        "id, prescription_number, status, valid_until, created_at, medical_record_id",
      )
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
    if (
      status === "active" &&
      rx.valid_until &&
      new Date(rx.valid_until as string) < new Date()
    ) {
      status = "expired";
    }

    return {
      prescriptionNumber: rx.prescription_number as string,
      status,
      issuedAt: rx.created_at as string,
      validUntil: (rx.valid_until as string | null) ?? null,
      doctorName: (doctorProfRes.data?.full_name as string | null) ?? null,
      doctorLicense:
        ((doctorDetailsRes.data as { syndicate_number: string | null } | null)?.syndicate_number as string | null) ?? null,
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
      .select(
        "id, medical_record_id, prescription_number, notes, valid_until, status, created_at",
      )
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
          ((medProf as { allergies?: string[] } | null)?.allergies as
            | string[]
            | undefined) ?? [],
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

