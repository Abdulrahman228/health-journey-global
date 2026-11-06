/**
 * Lab / radiology client helpers (RBAC Phase 2).
 *
 * The lab is the source of truth for payment (patient may pay in person), so
 * payment_status is set by the lab via the lab_update_order RPC — never by a
 * platform gateway. Result files reuse the medical-attachments bucket; reads
 * are served by a payment/consent-gated server fn (labs.functions.ts).
 */
import { supabase } from "@/integrations/supabase/client";
import { getLabOrderResults, type LabResultFile } from "./labs.functions";

const sb = supabase;

// The lab RPCs / RLS raise English messages — surface them in Arabic.
const AR_ERRORS: Array<[RegExp, string]> = [
  [/No profile for current user/i, "سجّل الدخول أولاً"],
  [/Order not found or not yours/i, "الطلب غير موجود أو ليس لك"],
  [/You are not the lab for this order/i, "هذا الطلب ليس لمعملك"],
  [/Invalid (status|payment_status)/i, "قيمة حالة غير صحيحة"],
  [/row-level security|violates|permission denied/i, "غير مصرح بهذه العملية"],
];
function arError(message: string, fallback = "حدث خطأ، حاول مرة أخرى"): Error {
  for (const [re, ar] of AR_ERRORS) if (re.test(message)) return new Error(ar);
  return new Error(fallback);
}

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
  const { data, error } = await sb
    .from("lab_facilities")
    .select("*")
    .eq("owner_user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw arError(error.message, "تعذّر تحميل بيانات المعمل");
  // facility_type is a CHECK-constrained text column → narrow to the union.
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
  if (error) throw arError(error.message, "تعذّر تسجيل المنشأة");
  const { error: roleErr } = await sb
    .from("user_roles")
    .upsert(
      { user_id: input.ownerUserId, role: "lab" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
  if (roleErr) throw new Error("تم إنشاء المنشأة لكن تعذّر تفعيل صلاحية المعمل");
  return data.id;
}

export async function listActiveLabs(city?: string): Promise<LabFacility[]> {
  let q = sb
    .from("lab_facilities")
    .select("*")
    .eq("is_active", true)
    .order("is_verified", { ascending: false })
    .order("name", { ascending: true });
  if (city && city.trim()) q = q.ilike("city", `%${city.trim()}%`);
  const { data, error } = await q;
  if (error) throw arError(error.message, "تعذّر تحميل المعامل");
  return (data ?? []) as LabFacility[];
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
    p_test_name: input.testName || undefined,
    p_authorized_doctor_profile_id: input.authorizedDoctorProfileId ?? undefined,
    p_amount: input.amount ?? undefined,
    p_notes: input.notes || undefined,
  });
  if (error) throw arError(error.message, "تعذّر إنشاء الطلب");
  return data;
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
  if (error) throw arError(error.message, "تعذّر تحديث الصلاحية");
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
    p_status: input.status,
    p_payment_status: input.paymentStatus,
    p_amount_paid: input.amountPaid,
  });
  if (error) throw arError(error.message, "تعذّر تحديث الطلب");
}

/** Patient's own orders (RLS scopes the rows). */
export async function listMyLabOrders(): Promise<LabOrder[]> {
  const { data, error } = await sb
    .from("lab_orders")
    .select(
      "*, lab:lab_facilities!lab_orders_lab_id_fkey(name,facility_type,city), doctor:profiles!lab_orders_authorized_doctor_profile_id_fkey(full_name)",
    )
    .order("created_at", { ascending: false });
  if (error) throw arError(error.message, "تعذّر تحميل الطلبات");
  // CHECK-constrained text columns (status, test_type…) → narrow to the unions.
  return (data ?? []) as LabOrder[];
}

/** Lab inbox — orders assigned to my facility (RLS scopes the rows). */
export async function listLabInboxOrders(): Promise<LabOrder[]> {
  const { data, error } = await sb
    .from("lab_orders")
    .select(
      "*, patient:profiles!lab_orders_patient_profile_id_fkey(full_name), doctor:profiles!lab_orders_authorized_doctor_profile_id_fkey(full_name)",
    )
    .order("created_at", { ascending: false });
  if (error) throw arError(error.message, "تعذّر تحميل الطلبات");
  return (data ?? []) as LabOrder[];
}

/** Doctor — lab orders where I am the authorized reader (RLS scopes rows). */
export async function listAuthorizedLabOrders(): Promise<LabOrder[]> {
  const { data, error } = await sb
    .from("lab_orders")
    .select(
      "*, lab:lab_facilities!lab_orders_lab_id_fkey(name,facility_type,city), patient:profiles!lab_orders_patient_profile_id_fkey(full_name)",
    )
    .eq("patient_authorized", true)
    .order("created_at", { ascending: false });
  if (error) throw arError(error.message, "تعذّر تحميل الطلبات");
  return (data ?? []) as LabOrder[];
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
  const { data: appts, error: apptErr } = await sb
    .from("appointments")
    .select("doctor_id")
    .eq("patient_id", patientProfileId);
  if (apptErr) throw arError(apptErr.message, "تعذّر تحميل أطبائك");
  const doctorIds = Array.from(new Set((appts ?? []).map((a) => a.doctor_id).filter(Boolean)));
  if (doctorIds.length === 0) return [];

  const { data: dds } = await sb
    .from("doctor_details")
    .select("id, profile_id")
    .in("id", doctorIds);
  const profileIds = Array.from(
    new Set((dds ?? []).map((d) => d.profile_id).filter((x): x is string => Boolean(x))),
  );
  if (profileIds.length === 0) return [];

  const { data: profs } = await sb.from("profiles").select("id, full_name").in("id", profileIds);
  return (profs ?? []).map((p) => ({
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
  if (upErr) throw arError(upErr.message, "تعذّر رفع الملف");

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
    throw arError(insErr.message, "تعذّر حفظ النتيجة");
  }

  await labUpdateOrder({ orderId: input.orderId, status: "delivered" });
}
