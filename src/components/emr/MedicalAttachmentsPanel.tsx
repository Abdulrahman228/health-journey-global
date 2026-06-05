/**
 * MedicalAttachmentsPanel — reusable card for any context that needs
 * to list / upload / delete medical files for a given patient.
 *
 * Browser uploads go directly to Supabase Storage (private bucket
 * `medical-attachments`) using the anon client; RLS enforces that the
 * folder prefix matches the patient_profile_id. We then call
 * `recordAttachment` to insert the metadata row.
 *
 * Accessibility:
 *   - Drop zone is a labelled <input type="file"> (keyboard accessible)
 *   - aria-live status region announces upload progress + errors
 *   - All action buttons have visible labels (no icon-only)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteAttachment,
  listAttachments,
  recordAttachment,
  type AttachmentRow,
} from "@/lib/attachments.functions";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

const TYPE_OPTIONS: Array<{ v: AttachmentRow["type"]; l: string }> = [
  { v: "lab_result", l: "تحليل معملي" },
  { v: "xray", l: "أشعة سينية" },
  { v: "mri", l: "رنين مغناطيسي" },
  { v: "ct", l: "أشعة مقطعية" },
  { v: "ecg", l: "رسم قلب" },
  { v: "prescription", l: "وصفة سابقة" },
  { v: "other", l: "أخرى" },
];

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];

interface Props {
  patientProfileId: string;
  medicalRecordId?: string | null;
  /** When true, hide the upload form (read-only viewer) */
  readOnly?: boolean;
  /** Allows callers to wrap in their own card */
  bare?: boolean;
}

export function MedicalAttachmentsPanel({
  patientProfileId,
  medicalRecordId,
  readOnly = false,
  bare = false,
}: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [type, setType] = useState<AttachmentRow["type"]>("lab_result");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const rows = await listAttachments({
      data: {
        userId: user.id,
        patientProfileId,
        medicalRecordId: medicalRecordId ?? undefined,
      },
    });
    setItems(rows);
    setLoading(false);
  }, [user, patientProfileId, medicalRecordId]);

  useEffect(() => {
    load();
  }, [load]);

  const onUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("اختر ملفاً للرفع");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("الحد الأقصى 20 ميجابايت");
      return;
    }
    if (file.type && !ALLOWED_MIME.includes(file.type)) {
      toast.error("نوع الملف غير مدعوم (JPG/PNG/WEBP/PDF)");
      return;
    }

    setUploading(true);
    setStatus("جارٍ الرفع…");
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const uuid =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const recordFolder = medicalRecordId ?? "inbox";
      const path = `${patientProfileId}/${recordFolder}/${uuid}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("medical-attachments")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });
      if (upErr) throw upErr;

      const res = await recordAttachment({
        data: {
          userId: user.id,
          patientProfileId,
          medicalRecordId: medicalRecordId ?? null,
          type,
          fileName: file.name,
          filePath: path,
          fileSize: file.size,
          mimeType: file.type || null,
          notes: notes || null,
        },
      });
      if (!res.ok) {
        // best effort cleanup
        await supabase.storage.from("medical-attachments").remove([path]);
        throw new Error(res.error);
      }

      setStatus("تم الرفع بنجاح");
      toast.success("تم رفع المرفق");
      setNotes("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      const m = err instanceof Error ? err.message : "فشل الرفع";
      setStatus("خطأ: " + m);
      toast.error(m);
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!user) return;
    if (!confirm("حذف هذا المرفق نهائياً؟")) return;
    const res = await deleteAttachment({
      data: { userId: user.id, attachmentId: id },
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("تم الحذف");
    await load();
  };

  const body = (
    <>
      <header className="mb-4 flex items-center gap-2">
        <Paperclip className="h-5 w-5 text-primary" aria-hidden="true" />
        <h3 className="text-base font-bold text-foreground">المرفقات الطبية</h3>
        <span className="ms-auto text-xs text-muted-foreground">
          {items.length} ملف
        </span>
      </header>

      {!readOnly && (
        <form
          onSubmit={onUpload}
          className="mb-5 rounded-lg border border-dashed border-border bg-background p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-foreground">نوع المرفق</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AttachmentRow["type"])}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.v} value={opt.v}>
                    {opt.l}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-foreground">الملف</span>
              <input
                ref={fileRef}
                type="file"
                accept={ALLOWED_MIME.join(",")}
                className="mt-1 block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground"
              />
              <span className="mt-0.5 block text-xs text-muted-foreground">
                JPG / PNG / WEBP / PDF · حتى 20MB
              </span>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-foreground">ملاحظات (اختياري)</span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div role="status" aria-live="polite" className="text-xs text-muted-foreground">
              {status}
            </div>
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-4 w-4" aria-hidden="true" />
              )}
              رفع
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          لا توجد مرفقات بعد.
        </p>
      ) : (
        <ul role="list" className="space-y-2">
          {items.map((it) => (
            <AttachmentItem
              key={it.id}
              item={it}
              onDelete={readOnly ? undefined : onDelete}
            />
          ))}
        </ul>
      )}
    </>
  );

  if (bare) return <div>{body}</div>;
  return <section className="rounded-xl border border-border bg-card p-5">{body}</section>;
}

function AttachmentItem({
  item,
  onDelete,
}: {
  item: AttachmentRow;
  onDelete?: (id: string) => void;
}) {
  const isImage = (item.mimeType ?? "").startsWith("image/");
  const Icon = isImage ? ImageIcon : FileText;
  const dateAr = new Date(item.createdAt).toLocaleDateString("ar-EG");
  const sizeKb = item.fileSize ? Math.round(item.fileSize / 1024) : null;
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {item.fileName}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {typeLabel(item.type)}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {dateAr}
          {sizeKb !== null && ` · ${sizeKb} KB`}
        </div>
        {item.notes && (
          <div className="mt-1 text-xs text-foreground">{item.notes}</div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {item.signedUrl && (
          <a
            href={item.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:underline"
            aria-label={`فتح ${item.fileName} في تبويب جديد`}
          >
            فتح
          </a>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
            aria-label={`حذف ${item.fileName}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            حذف
          </button>
        )}
      </div>
    </li>
  );
}

function typeLabel(t: AttachmentRow["type"]): string {
  return TYPE_OPTIONS.find((o) => o.v === t)?.l ?? t;
}
