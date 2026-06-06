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
import { assertSelf } from "./_authz";

const BUCKET = "medical-attachments";
const SIGNED_URL_TTL = 60 * 60; // 1 hour

export interface AttachmentRow {
  id: string;
  patientProfileId: string;
  medicalRecordId: string | null;
  uploadedByProfileId: string;
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

  const { data: adminCheck } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (adminCheck) return "admin";

  if (!me) return null;
  const { data: rec } = await supabaseAdmin
    .from("medical_records")
    .select("id")
    .eq("patient_profile_id", patientProfileId)
    .eq("doctor_profile_id", me)
    .limit(1)
    .maybeSingle();
  if (rec) return "doctor";

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
        "id, patient_profile_id, medical_record_id, uploaded_by_profile_id, type, file_name, file_url, file_size, mime_type, notes, created_at",
      )
      .eq("patient_profile_id", data.patientProfileId)
      .order("created_at", { ascending: false });
    if (data.medicalRecordId) q = q.eq("medical_record_id", data.medicalRecordId);

    const { data: rows } = await q;
    if (!rows) return [];

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
          medicalRecordId: (r.medical_record_id as string | null) ?? null,
          uploadedByProfileId: r.uploaded_by_profile_id as string,
          type: r.type as AttachmentRow["type"],
          fileName: r.file_name as string,
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

// ============================================================
// Record an attachment row AFTER the file has been uploaded
// directly to storage from the browser (using anon client + RLS).
// ============================================================
export const recordAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        patientProfileId: z.string().uuid(),
        medicalRecordId: z.string().uuid().nullable(),
        type: z.enum([
          "lab_result",
          "xray",
          "mri",
          "ct",
          "ecg",
          "prescription",
          "other",
        ]),
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

    // Enforce path prefix matches patient id
    if (!data.filePath.startsWith(data.patientProfileId + "/")) {
      return { ok: false as const, error: "Path mismatch" };
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

    const role = await isAuthorizedForPatient(
      data.userId,
      row.patient_profile_id as string,
    );
    if (!role) return { ok: false as const, error: "Unauthorized" };

    // Only owner-patient, the uploader-doctor, or admin can delete
    const me = await getMyProfileId(data.userId);
    if (
      role !== "admin" &&
      role !== "patient" &&
      me !== (row.uploaded_by_profile_id as string)
    ) {
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
