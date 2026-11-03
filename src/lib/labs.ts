/**
 * Lab / radiology client helpers (RBAC Phase 2).
 *
 * The lab is the source of truth for payment (patient may pay in person), so
 * payment_status is set by the lab via the lab_update_order RPC — never by a
 * platform gateway. Result files reuse the medical-attachments bucket; reads
 * are served by a payment/consent-gated server fn (labs.functions.ts).
 *
 * lab_facilities / lab_orders are newer than the generated types, so the
 * Supabase client is used untyped (`sb`) for those calls.
 */
import { supabase } from "@/integrations/supabase/client";
import { getLabOrderResults, type LabResultFile } from "./labs.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

const RESULT_BUCKET = "medical-attachments";

export type FacilityType = "lab" | "radiology" | "both";
export type LabTestType = "lab_result" | "xray" | "mri" | "ct" | "ecg" | "other";
export type LabOrderStatus = "requested" | "in_progress" | "delivered" | "cancelled";
export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface LabFacility {
  id: string;
  owner_user_id: string;
  profile_id: string | null;
  name: string;
  facility_type: FacilityType;
  city: string | null;
  phone: string | null;
  address: string | null;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
}

export interface LabOrder {
  id: string;
  patient_profile_id: string;
  lab_id: string;
  ordering_doctor_profile_id: string | null;
  authorized_doctor_profile_id: string | null;
  test_type: LabTestType;
  test_name: string | null;
  status: LabOrderStatus;
  payment_status: PaymentStatus;
  patient_authorized: boolean;
  amount: number | null;
  amount_paid: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // optional embeds
  lab?: { name: string; facility_type: FacilityType; city: string | null } | null;
  patient?: { full_name: string | null } | null;
  doctor?: { full_name: string | null } | null;
}

export type { LabResultFile };
export { getLabOrderResults };

// ── Facility ───────────────────────────────────────────────────────────────
export async function getMyLab(userId: string): Promise<LabFacility | null> {
  const { data } = await sb
    .from("lab_facilities")
    .select("*")
    .eq("owner_user_id", userId)
    .maybeSingle();
  return (data as LabFacility | null) ?? null;
}

export async function registerLab(input: {
  ownerUserId: string;
  profileId: string | null;
  name: string;
  facilityType: FacilityType;
  city?: string;
  phone?: string;
  address?: string;
}): Promise<string> {
  const { data, error } = await sb
    .from("lab_facilities")
    .insert({
      owner_user_id: input.ownerUserId,
      profile_id: input.profileId,
      name: input.name,
      facility_type: input.facilityType,
      city: input.city ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await sb.from("user_roles").upsert({ user_id: input.ownerUserId, role: "lab" });
  return data!.id as string;
}

export async function listActiveLabs(city?: string): Promise<LabFacility[]> {
  let q = sb
    .from("lab_facilities")
    .select("*")
    .eq("is_active", true)
    .order("is_verified", { ascending: false })
    .order("name", { ascending: true });
  if (city && city.trim()) q = q.ilike("city", `%${city.trim()}%`);
  const { data } = await q;
  return (data as LabFacility[]) ?? [];
}

// ── Orders ───────────────────────────────────────────────────────────────
export async function createLabOrder(input: {
  labId: string;
  testType: LabTestType;
  testName?: string;
  authorizedDoctorProfileId?: string | null;
  amount?: number | null;
  notes?: string | null;
}): Promise<string> {
  const { data, error } = await sb.rpc("create_lab_order", {
    p_lab_id: input.labId,
    p_test_type: input.testType,
    p_test_name: input.testName ?? null,
    p_authorized_doctor_profile_id: input.authorizedDoctorProfileId ?? null,
    p_amount: input.amount ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function setLabOrderAuthorization(input: {
  orderId: string;
  doctorProfileId: string;
  authorized: boolean;
}): Promise<void> {
  const { error } = await sb.rpc("set_lab_order_authorization", {
    p_order_id: input.orderId,
    p_authorized_doctor_profile_id: input.doctorProfileId,
    p_authorized: input.authorized,
  });
  if (error) throw new Error(error.message);
}

/** Lab-only: control payment_status / status / amount_paid. */
export async function labUpdateOrder(input: {
  orderId: string;
  status?: LabOrderStatus;
  paymentStatus?: PaymentStatus;
  amountPaid?: number;
}): Promise<void> {
  const { error } = await sb.rpc("lab_update_order", {
    p_order_id: input.orderId,
    p_status: input.status ?? null,
    p_payment_status: input.paymentStatus ?? null,
    p_amount_paid: input.amountPaid ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Patient's own orders (RLS scopes the rows). */
export async function listMyLabOrders(): Promise<LabOrder[]> {
  const { data } = await sb
    .from("lab_orders")
    .select(
      "*, lab:lab_facilities!lab_orders_lab_id_fkey(name,facility_type,city), doctor:profiles!lab_orders_authorized_doctor_profile_id_fkey(full_name)",
    )
    .order("created_at", { ascending: false });
  return (data as LabOrder[]) ?? [];
}

/** Lab inbox — orders assigned to my facility (RLS scopes the rows). */
export async function listLabInboxOrders(): Promise<LabOrder[]> {
  const { data } = await sb
    .from("lab_orders")
    .select(
      "*, patient:profiles!lab_orders_patient_profile_id_fkey(full_name), doctor:profiles!lab_orders_authorized_doctor_profile_id_fkey(full_name)",
    )
    .order("created_at", { ascending: false });
  return (data as LabOrder[]) ?? [];
}

/** Doctor — lab orders where I am the authorized reader (RLS scopes rows). */
export async function listAuthorizedLabOrders(): Promise<LabOrder[]> {
  const { data } = await sb
    .from("lab_orders")
    .select(
      "*, lab:lab_facilities!lab_orders_lab_id_fkey(name,facility_type,city), patient:profiles!lab_orders_patient_profile_id_fkey(full_name)",
    )
    .eq("patient_authorized", true)
    .order("created_at", { ascending: false });
  return (data as LabOrder[]) ?? [];
}

export interface MyDoctor {
  profileId: string;
  fullName: string | null;
}

/**
 * Doctors the current patient has a relationship with (via appointments),
 * so they can authorize one to read a lab result. Explicit multi-step queries
 * avoid brittle nested PostgREST embeds.
 */
export async function listMyDoctors(patientProfileId: string): Promise<MyDoctor[]> {
  const { data: appts } = await sb
    .from("appointments")
    .select("doctor_id")
    .eq("patient_id", patientProfileId);
  const doctorIds = Array.from(
    new Set(((appts as { doctor_id: string }[]) ?? []).map((a) => a.doctor_id).filter(Boolean)),
  );
  if (doctorIds.length === 0) return [];

  const { data: dds } = await sb
    .from("doctor_details")
    .select("id, profile_id")
    .in("id", doctorIds);
  const profileIds = Array.from(
    new Set(((dds as { profile_id: string }[]) ?? []).map((d) => d.profile_id).filter(Boolean)),
  );
  if (profileIds.length === 0) return [];

  const { data: profs } = await sb
    .from("profiles")
    .select("id, full_name")
    .in("id", profileIds);
  return ((profs as { id: string; full_name: string | null }[]) ?? []).map((p) => ({
    profileId: p.id,
    fullName: p.full_name,
  }));
}

// ── Result upload (lab) ──────────────────────────────────────────────────
const TYPE_TO_ATTACHMENT: Record<LabTestType, string> = {
  lab_result: "lab_result",
  xray: "xray",
  mri: "mri",
  ct: "ct",
  ecg: "ecg",
  other: "other",
};

/**
 * Lab uploads a result file for an order, then marks it delivered.
 * The storage upload is allowed by the lab_upload_order_attachment policy;
 * the row insert by the "lab delivers result to its order" policy.
 */
export async function uploadLabResult(input: {
  orderId: string;
  patientProfileId: string;
  labProfileId: string;
  testType: LabTestType;
  file: File;
  notes?: string;
}): Promise<void> {
  const ext = input.file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${input.patientProfileId}/lab/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await sb.storage
    .from(RESULT_BUCKET)
    .upload(path, input.file, { contentType: input.file.type, upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { error: insErr } = await sb.from("medical_attachments").insert({
    patient_profile_id: input.patientProfileId,
    lab_order_id: input.orderId,
    uploaded_by_profile_id: input.labProfileId,
    type: TYPE_TO_ATTACHMENT[input.testType],
    file_url: path,
    file_name: input.file.name,
    file_size: input.file.size,
    mime_type: input.file.type || null,
    notes: input.notes ?? null,
  });
  if (insErr) {
    // best-effort cleanup so we don't leave an orphan object
    await sb.storage.from(RESULT_BUCKET).remove([path]);
    throw new Error(insErr.message);
  }

  await labUpdateOrder({ orderId: input.orderId, status: "delivered" });
}
