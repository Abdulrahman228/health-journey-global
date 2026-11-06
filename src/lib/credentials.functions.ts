import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "doctor-credentials";

const ALLOWED_TYPES = [
  "national_id_front",
  "national_id_back",
  "syndicate_card",
  "medical_license",
  "degree_certificate",
  "specialty_certificate",
  "professional_photo",
  "liveness_selfie",
  "other",
] as const;

type DocumentType = (typeof ALLOWED_TYPES)[number];

async function getDoctorIdForUser(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("doctor_details")
    .select("id, profiles!inner(user_id)")
    .eq("profiles.user_id", userId)
    .maybeSingle();
  if (error) throw new Error("تعذّر تحميل بيانات الطبيب: " + error.message);
  if (!data) throw new Error("هذه الصفحة للأطباء فقط");
  return data.id;
}

async function assertAdmin(userId: string) {
  // limit(1): admin + super_admin rows for one user made maybeSingle() throw
  // ("multiple rows") and locked those admins out of the documents queue.
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"])
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("غير مصرح: هذه العملية للمشرفين فقط");
}

// ----------------------------------------------------------------------------
// Doctor: list own documents
// ----------------------------------------------------------------------------
export const listMyDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const doctorId = await getDoctorIdForUser(context.userId);
    const { data, error } = await supabaseAdmin
      .from("doctor_documents")
      .select(
        "id, document_type, status, rejection_reason, file_name, mime_type, uploaded_at, reviewed_at",
      )
      .eq("doctor_id", doctorId)
      .order("uploaded_at", { ascending: false });
    if (error) throw new Error("تعذّر تحميل المستندات: " + error.message);
    return { doctorId, documents: data ?? [] };
  });

// ----------------------------------------------------------------------------
// Doctor: upload a document (base64 payload)
// ----------------------------------------------------------------------------
export const uploadDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      documentType: DocumentType;
      fileName: string;
      mimeType: string;
      contentBase64: string;
    }) => {
      if (!ALLOWED_TYPES.includes(data.documentType)) {
        throw new Error("نوع المستند غير صالح");
      }
      if (!data.fileName) throw new Error("اسم الملف مطلوب");
      if (!data.contentBase64) throw new Error("الملف فارغ");
      const allowedMime = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "application/pdf",
      ];
      // Browsers often report an empty or generic MIME (""/application/octet-stream)
      // for HEIC (iPhone photos) and sometimes PDFs. Fall back to the file
      // extension so a valid file is not rejected as "Unsupported file type".
      const extMime: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        heic: "image/heic",
        heif: "image/heic",
        pdf: "application/pdf",
      };
      let mime = (data.mimeType || "").toLowerCase();
      if (!allowedMime.includes(mime)) {
        const ext = (data.fileName.split(".").pop() || "").toLowerCase();
        mime = extMime[ext] ?? "";
      }
      if (!allowedMime.includes(mime)) {
        throw new Error("صيغة الملف غير مدعومة. المسموح: jpg, png, webp, heic, pdf");
      }
      return { ...data, mimeType: mime };
    },
  )
  .handler(async ({ data, context }) => {
    const doctorId = await getDoctorIdForUser(context.userId);

    // Decode base64
    const buf = Buffer.from(data.contentBase64, "base64");
    if (buf.byteLength === 0) throw new Error("الملف فارغ");
    if (buf.byteLength > 10 * 1024 * 1024) throw new Error("حجم الملف يتجاوز 10 ميجابايت");

    const ext = (data.fileName.split(".").pop() || "bin").toLowerCase().slice(0, 5);
    const path = `${doctorId}/${data.documentType}-${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: data.mimeType, upsert: false });
    if (upErr) throw new Error(`فشل رفع الملف: ${upErr.message}`);

    // Mark previous of same type as superseded
    await supabaseAdmin
      .from("doctor_documents")
      .update({ status: "superseded" })
      .eq("doctor_id", doctorId)
      .eq("document_type", data.documentType)
      .in("status", ["pending", "rejected"]);

    const { data: row, error: insErr } = await supabaseAdmin
      .from("doctor_documents")
      .insert({
        doctor_id: doctorId,
        document_type: data.documentType,
        storage_path: path,
        file_name: data.fileName,
        mime_type: data.mimeType,
        file_size: buf.byteLength,
        status: "pending",
      })
      .select()
      .single();
    if (insErr) {
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
      throw new Error("تعذّر حفظ المستند: " + insErr.message);
    }

    // Stamp doctor_details verification_level/credentials_completed_at — only
    // raise 0/NULL → 1. Re-uploading an optional document must never demote
    // an already-verified doctor (level 2) back to level 1.
    await supabaseAdmin
      .from("doctor_details")
      .update({
        verification_level: 1,
        credentials_completed_at: new Date().toISOString(),
      })
      .eq("id", doctorId)
      .or("verification_level.is.null,verification_level.lt.1");

    return { document: row };
  });

// ----------------------------------------------------------------------------
// Doctor: delete pending document
// ----------------------------------------------------------------------------
export const deleteMyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string }) => {
    if (!data.documentId) throw new Error("معرّف المستند مطلوب");
    return data;
  })
  .handler(async ({ data, context }) => {
    const doctorId = await getDoctorIdForUser(context.userId);
    const { data: doc, error } = await supabaseAdmin
      .from("doctor_documents")
      .select("id, doctor_id, status, storage_path")
      .eq("id", data.documentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc || doc.doctor_id !== doctorId) throw new Error("المستند غير موجود");
    if (doc.status !== "pending") throw new Error("لا يمكن حذف مستند تمت مراجعته");

    // Row first: if it fails nothing is lost; an orphaned file is harmless.
    const { error: delErr } = await supabaseAdmin
      .from("doctor_documents")
      .delete()
      .eq("id", doc.id);
    if (delErr) throw new Error("تعذّر حذف المستند: " + delErr.message);
    await supabaseAdmin.storage.from(BUCKET).remove([doc.storage_path]);
    return { ok: true };
  });

// ----------------------------------------------------------------------------
// Doctor / Admin: get signed URL for document (1-hour validity)
// ----------------------------------------------------------------------------
export const getDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string }) => {
    if (!data.documentId) throw new Error("معرّف المستند مطلوب");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await supabaseAdmin
      .from("doctor_documents")
      .select("id, doctor_id, storage_path")
      .eq("id", data.documentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("المستند غير موجود");

    // Authorization: owner or admin
    const { data: ownerCheck } = await supabaseAdmin
      .from("doctor_details")
      .select("profiles:profile_id(user_id)")
      .eq("id", doc.doctor_id)
      .maybeSingle();
    const ownerUserId = ownerCheck?.profiles?.user_id ?? null;
    if (ownerUserId !== context.userId) {
      await assertAdmin(context.userId);
    }

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 3600);
    if (signErr) throw new Error("تعذّر فتح المستند: " + signErr.message);
    return { url: signed?.signedUrl };
  });

// ----------------------------------------------------------------------------
// Admin: list all pending documents (queue)
// ----------------------------------------------------------------------------
export const adminListPendingDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("doctor_documents")
      .select(
        `
        id, document_type, status, rejection_reason, file_name, mime_type,
        uploaded_at, reviewed_at, storage_path,
        doctor_details:doctor_id (
          id, specialty, syndicate_number, national_id_last4,
          profiles:profile_id ( id, full_name, phone )
        )
      `,
      )
      .order("uploaded_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { documents: data ?? [] };
  });

// ----------------------------------------------------------------------------
// Admin: approve / reject a document
// ----------------------------------------------------------------------------
export const adminReviewDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { documentId: string; action: "approve" | "reject"; rejectionReason?: string }) => {
      if (!data.documentId) throw new Error("معرّف المستند مطلوب");
      if (data.action !== "approve" && data.action !== "reject") {
        throw new Error("Invalid action");
      }
      if (data.action === "reject" && !data.rejectionReason?.trim()) {
        throw new Error("سبب الرفض مطلوب");
      }
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const newStatus = data.action === "approve" ? "approved" : "rejected";
    const { data: row, error } = await supabaseAdmin
      .from("doctor_documents")
      .update({
        status: newStatus,
        rejection_reason: data.action === "reject" ? data.rejectionReason : null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
      })
      .eq("id", data.documentId)
      .select("doctor_id")
      .single();
    if (error) throw new Error(error.message);

    // If all required documents approved → bump verification_level to 2
    if (data.action === "approve") {
      const REQUIRED: DocumentType[] = [
        "national_id_front",
        "national_id_back",
        "syndicate_card",
        "medical_license",
      ];
      const { data: docs } = await supabaseAdmin
        .from("doctor_documents")
        .select("document_type, status")
        .eq("doctor_id", row.doctor_id)
        .eq("status", "approved");
      const approvedTypes = new Set((docs ?? []).map((d) => d.document_type));
      const allRequiredApproved = REQUIRED.every((t) => approvedTypes.has(t));
      if (allRequiredApproved) {
        const { error: verErr } = await supabaseAdmin
          .from("doctor_details")
          .update({
            verification_level: 2,
            is_verified: true,
            verification_status: "approved",
          })
          .eq("id", row.doctor_id);
        if (verErr) throw new Error("تم اعتماد المستند لكن تعذّر توثيق الطبيب: " + verErr.message);
      }
    }

    return { ok: true };
  });
