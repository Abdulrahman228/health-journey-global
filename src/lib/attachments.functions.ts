/**
 * Medical attachments server fns.
 *
 * Files live in private storage bucket `medical-attachments`.
 * We return signed URLs (1-hour expiry) to authorized callers only.
 *
 * Authorization model: caller must be the patient themselves, a
 * doctor who has a medical_record with this patient, or an admin.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDoctorForUser, getProfileIdForUser, isDoctorLinkedToPatient } from "@/lib/_identity";
import { assertSelf } from "./_authz";

const BUCKET = "medical-attachments";
const SIGNED_URL_TTL = 60 * 60; // 1 hour

export interface AttachmentRow {
  id: string;
  patientProfileId: string;
  medicalRecordId: string | null;
  uploadedByProfileId: string | null;
  type: "lab_result" | "xray" | "mri" | "ct" | "ecg" | "prescription" | "other";
  fileName: string;
  filePath: string;
  fileSize: number | null;
  mimeType: string | null;
  notes: string | null;
  createdAt: string;
  signedUrl?: string;
}

async function getMyProfileId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.id as string | null) ?? null;
}

async function isAuthorizedForPatient(
  userId: string,
  patientProfileId: string,
): Promise<"patient" | "doctor" | "admin" | null> {
  const me = await getMyProfileId(userId);
  if (me === patientProfileId) return "patient";

  // admin OR super_admin (a user can hold both → read rows, not .maybeSingle()).
  const { data: adminRows } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"])
    .limit(1);
  if ((adminRows ?? []).length > 0) return "admin";

  if (!me) return null;
  // Same rule as the rest of the EMR (appointment / managed link / prior record).
  if (await isDoctorLinkedToPatient(me, patientProfileId)) return "doctor";

  return null;
}

// ============================================================
// List attachments for a patient (optionally scoped to a record)
// ============================================================
export const listAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        patientProfileId: z.string().uuid(),
        medicalRecordId: z.string().uuid().optional(),
      })
      .parse(x),
  )
  .handler(async ({ data, context }): Promise<AttachmentRow[]> => {
    assertSelf(context.userId, data.userId);
    const role = await isAuthorizedForPatient(data.userId, data.patientProfileId);
    if (!role) return [];

    let q = supabaseAdmin
      .from("medical_attachments")
      .select(
        "id, patient_profile_id, medical_record_id, appointment_id, lab_order_id, uploaded_by_profile_id, type, file_name, file_url, file_size, mime_type, notes, created_at",
      )
      .eq("patient_profile_id", data.patientProfileId)
      .order("created_at", { ascending: false });
    if (data.medicalRecordId) q = q.eq("medical_record_id", data.medicalRecordId);

    const { data: allRows, error } = await q;
    if (error) throw new Error("تعذّر تحميل المرفقات");
    if (!allRows) return [];

    // The service role bypasses RLS, so re-apply its visibility gates here
    // (otherwise this signed-URL list leaks results the patient hasn't paid for
    // and lab results the patient never authorised the doctor to see):
    //  • patient: appointment / lab-order files only once that one is PAID;
    //  • doctor:  lab-order files only when the patient authorised THIS doctor
    //             and the lab marked the order paid.
    let rows = allRows;
    if (role !== "admin") {
      const me = await getMyProfileId(data.userId);
      const apptIds = [...new Set(rows.map((r) => r.appointment_id).filter((x): x is string => !!x))];
      const labIds = [...new Set(rows.map((r) => r.lab_order_id).filter((x): x is string => !!x))];
      const [{ data: appts }, { data: labs }] = await Promise.all([
        apptIds.length
          ? supabaseAdmin.from("appointments").select("id, payment_status").in("id", apptIds)
          : Promise.resolve({ data: [] as { id: string; payment_status: string }[] }),
        labIds.length
          ? supabaseAdmin
              .from("lab_orders")
              .select("id, payment_status, patient_authorized, authorized_doctor_profile_id")
              .in("id", labIds)
          : Promise.resolve({
              data: [] as {
                id: string;
                payment_status: string;
                patient_authorized: boolean;
                authorized_doctor_profile_id: string | null;
              }[],
            }),
      ]);
      const paidAppt = new Set((appts ?? []).filter((a) => a.payment_status === "paid").map((a) => a.id));
      const labById = new Map((labs ?? []).map((l) => [l.id, l]));
      rows = rows.filter((r) => {
        const lab = r.lab_order_id ? labById.get(r.lab_order_id) : undefined;
        if (role === "patient") {
          if (!r.appointment_id && !r.lab_order_id) return true;
          if (r.appointment_id && paidAppt.has(r.appointment_id)) return true;
          return Boolean(lab && lab.payment_status === "paid");
        }
        // doctor
        if (!r.lab_order_id) return true;
        return Boolean(
          lab &&
            lab.payment_status === "paid" &&
            lab.patient_authorized &&
            lab.authorized_doctor_profile_id === me,
        );
      });
    }

    // Sign URLs in parallel
    const signed = await Promise.all(
      rows.map(async (r) => {
        const path = r.file_url as string;
        const { data: signedData } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(path, SIGNED_URL_TTL);
        return {
          id: r.id as string,
          patientProfileId: r.patient_profile_id as string,
          medicalRecordId: r.medical_record_id ?? null,
          uploadedByProfileId: r.uploaded_by_profile_id ?? null,
          type: r.type as AttachmentRow["type"],
          fileName: r.file_name ?? "",
          filePath: path,
          fileSize: (r.file_size as number | null) ?? null,
          mimeType: (r.mime_type as string | null) ?? null,
          notes: (r.notes as string | null) ?? null,
          createdAt: r.created_at as string,
          signedUrl: signedData?.signedUrl,
        } satisfies AttachmentRow;
      }),
    );
    return signed;
  });

/** A medical record id passed by the client must belong to that patient. */
async function recordBelongsToPatient(
  medicalRecordId: string,
  patientProfileId: string,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("medical_records")
    .select("id")
    .eq("id", medicalRecordId)
    .eq("patient_profile_id", patientProfileId)
    .maybeSingle();
  return Boolean(data);
}

// ============================================================
// Signed upload URL — the browser uploads straight to the private
// bucket with a one-time token minted AFTER the same authorization
// check as listAttachments. (The storage INSERT policy only admits a
// doctor who already wrote a medical_record for the patient, so a
// doctor uploading for a new managed / appointment-only patient was
// rejected with an RLS error; the path is also fixed server-side.)
// ============================================================
export const createAttachmentUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        patientProfileId: z.string().uuid(),
        medicalRecordId: z.string().uuid().nullable(),
        ext: z
          .string()
          .regex(/^[a-z0-9]{1,8}$/)
          .catch("bin"),
      })
      .parse(x),
  )
  .handler(async ({ data, context }) => {
    assertSelf(context.userId, data.userId);
    const role = await isAuthorizedForPatient(data.userId, data.patientProfileId);
    if (!role) return { ok: false as const, error: "Unauthorized" };
    if (
      data.medicalRecordId &&
      !(await recordBelongsToPatient(data.medicalRecordId, data.patientProfileId))
    ) {
      return { ok: false as const, error: "Record mismatch" };
    }
    const path = `${data.patientProfileId}/${data.medicalRecordId ?? "inbox"}/${crypto.randomUUID()}.${data.ext}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error || !signed) return { ok: false as const, error: error?.message ?? "upload_url_failed" };
    return { ok: true as const, path: signed.path, token: signed.token };
  });

// ============================================================
// Record an attachment row AFTER the file has been uploaded
// directly to storage from the browser (signed upload URL above).
// ============================================================
export const recordAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        patientProfileId: z.string().uuid(),
        medicalRecordId: z.string().uuid().nullable(),
        type: z.enum(["lab_result", "xray", "mri", "ct", "ecg", "prescription", "other"]),
        fileName: z.string().min(1).max(255),
        filePath: z.string().min(1).max(512),
        fileSize: z.number().int().nonnegative().nullable(),
        mimeType: z.string().max(120).nullable(),
        notes: z.string().max(1000).nullable(),
      })
      .parse(x),
  )
  .handler(async ({ data, context }) => {
    assertSelf(context.userId, data.userId);
    const role = await isAuthorizedForPatient(data.userId, data.patientProfileId);
    if (!role) return { ok: false as const, error: "Unauthorized" };

    const me = await getMyProfileId(data.userId);
    if (!me) return { ok: false as const, error: "No profile" };

    // Enforce path prefix matches patient id (and no traversal out of it)
    if (
      !data.filePath.startsWith(data.patientProfileId + "/") ||
      data.filePath.split("/").some((seg) => seg === ".." || seg === ".")
    ) {
      return { ok: false as const, error: "Path mismatch" };
    }
    if (
      data.medicalRecordId &&
      !(await recordBelongsToPatient(data.medicalRecordId, data.patientProfileId))
    ) {
      return { ok: false as const, error: "Record mismatch" };
    }

    const { data: ins, error } = await supabaseAdmin
      .from("medical_attachments")
      .insert({
        patient_profile_id: data.patientProfileId,
        medical_record_id: data.medicalRecordId,
        uploaded_by_profile_id: me,
        type: data.type,
        file_name: data.fileName,
        file_url: data.filePath,
        file_size: data.fileSize,
        mime_type: data.mimeType,
        notes: data.notes,
      })
      .select("id")
      .single();
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, id: ins?.id as string };
  });

// ============================================================
// Delete an attachment (row + storage object)
// ============================================================
export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        attachmentId: z.string().uuid(),
      })
      .parse(x),
  )
  .handler(async ({ data, context }) => {
    assertSelf(context.userId, data.userId);
    const { data: row } = await supabaseAdmin
      .from("medical_attachments")
      .select("patient_profile_id, file_url, uploaded_by_profile_id")
      .eq("id", data.attachmentId)
      .maybeSingle();
    if (!row) return { ok: false as const, error: "Not found" };

    const role = await isAuthorizedForPatient(data.userId, row.patient_profile_id as string);
    if (!role) return { ok: false as const, error: "Unauthorized" };

    // Only owner-patient, the uploader-doctor, or admin can delete
    const me = await getMyProfileId(data.userId);
    if (role !== "admin" && role !== "patient" && me !== (row.uploaded_by_profile_id as string)) {
      return { ok: false as const, error: "Forbidden" };
    }

    await supabaseAdmin.storage.from(BUCKET).remove([row.file_url as string]);
    const { error } = await supabaseAdmin
      .from("medical_attachments")
      .delete()
      .eq("id", data.attachmentId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
