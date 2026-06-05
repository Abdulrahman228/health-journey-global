import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  FileText,
  Eye,
} from "lucide-react";
import {
  listMyDocuments,
  uploadDocument,
  deleteMyDocument,
  getDocumentUrl,
} from "@/lib/credentials.functions";

const DOCUMENT_TYPES: Array<{
  key:
    | "national_id_front"
    | "national_id_back"
    | "syndicate_card"
    | "medical_license"
    | "degree_certificate"
    | "specialty_certificate"
    | "professional_photo"
    | "liveness_selfie";
  label: string;
  hint: string;
  required: boolean;
}> = [
  { key: "national_id_front", label: "البطاقة الشخصية - الوجه الأمامي", hint: "صورة واضحة للوجه الأمامي", required: true },
  { key: "national_id_back",  label: "البطاقة الشخصية - الوجه الخلفي", hint: "صورة واضحة للظهر",        required: true },
  { key: "syndicate_card",    label: "كارنيه نقابة الأطباء",          hint: "كارنيه ساري المفعول",     required: true },
  { key: "medical_license",   label: "رخصة مزاولة المهنة",            hint: "آخر رخصة مزاولة سارية",   required: true },
  { key: "degree_certificate",label: "شهادة التخرج (بكالوريوس)",      hint: "شهادة معتمدة من الجامعة", required: false },
  { key: "specialty_certificate", label: "شهادات التخصص (دكتوراه/ماجستير/زمالة)", hint: "اختياري - يرفع المستوى لـ Premium-Verified", required: false },
  { key: "professional_photo", label: "صورة شخصية مهنية",            hint: "خلفية بيضاء، الوجه واضح", required: true },
  { key: "liveness_selfie",   label: "سيلفي تحقق",                   hint: "سيلفي وأنت ماسك البطاقة - للتحقق من حيوية الصورة", required: true },
];

interface DocRow {
  id: string;
  document_type: string;
  status: "pending" | "approved" | "rejected" | "superseded";
  rejection_reason: string | null;
  file_name: string | null;
  mime_type: string | null;
  uploaded_at: string;
  reviewed_at: string | null;
}

const MAX_BYTES = 10 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const str = reader.result as string;
      const idx = str.indexOf(",");
      resolve(idx >= 0 ? str.slice(idx + 1) : str);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function StatusBadge({ status }: { status: DocRow["status"] }) {
  if (status === "approved")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> معتمد
      </span>
    );
  if (status === "rejected")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
        <XCircle className="h-3 w-3" aria-hidden="true" /> مرفوض
      </span>
    );
  if (status === "pending")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        <Clock className="h-3 w-3" aria-hidden="true" /> قيد المراجعة
      </span>
    );
  return null;
}

export function DoctorDocumentsUploader() {
  const list = useServerFn(listMyDocuments);
  const upload = useServerFn(uploadDocument);
  const remove = useServerFn(deleteMyDocument);
  const sign = useServerFn(getDocumentUrl);

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await list();
      setDocs(res.documents as DocRow[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const activeDocFor = (type: string) =>
    docs.find((d) => d.document_type === type && d.status !== "superseded");

  const handleFile = async (type: (typeof DOCUMENT_TYPES)[number]["key"], file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error("الحجم الأقصى 10 ميجا");
      return;
    }
    setUploadingType(type);
    try {
      const contentBase64 = await fileToBase64(file);
      await upload({
        data: {
          documentType: type,
          fileName: file.name,
          mimeType: file.type,
          contentBase64,
        },
      });
      toast.success("تم رفع المستند");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploadingType(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("حذف المستند؟")) return;
    try {
      await remove({ data: { documentId: id } });
      toast.success("تم الحذف");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handlePreview = async (id: string) => {
    try {
      const { url } = await sign({ data: { documentId: id } });
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="جاري التحميل" />
      </div>
    );

  const requiredCount = DOCUMENT_TYPES.filter((t) => t.required).length;
  const approvedRequired = DOCUMENT_TYPES.filter(
    (t) => t.required && activeDocFor(t.key)?.status === "approved",
  ).length;

  return (
    <section aria-labelledby="docs-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 id="docs-heading" className="text-lg font-bold">
          المستندات الرسمية
        </h2>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {approvedRequired} / {requiredCount} مستند إلزامي معتمد
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        المستندات بتُحفظ مشفرة ولا يطلع عليها غير فريق التوثيق. صيغ مدعومة: JPG, PNG, WebP, HEIC, PDF (10 ميجا حد أقصى).
      </p>

      <ul className="space-y-3">
        {DOCUMENT_TYPES.map((t) => {
          const doc = activeDocFor(t.key);
          const inputId = `doc-${t.key}`;
          const isUploading = uploadingType === t.key;
          return (
            <li
              key={t.key}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground">
                      {t.label}
                      {t.required && (
                        <span className="ms-1 text-destructive" aria-label="إلزامي">*</span>
                      )}
                    </h3>
                    {doc && <StatusBadge status={doc.status} />}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.hint}</p>
                  {doc?.status === "rejected" && doc.rejection_reason && (
                    <p
                      role="alert"
                      className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300"
                    >
                      <strong>سبب الرفض:</strong> {doc.rejection_reason}
                    </p>
                  )}
                  {doc?.file_name && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <FileText className="h-3 w-3" aria-hidden="true" />
                      {doc.file_name}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {doc && (
                    <button
                      type="button"
                      onClick={() => handlePreview(doc.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`معاينة ${t.label}`}
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" /> معاينة
                    </button>
                  )}
                  {doc?.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => handleDelete(doc.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-background px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                      aria-label={`حذف ${t.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> حذف
                    </button>
                  )}
                  <label
                    htmlFor={inputId}
                    className={`inline-flex cursor-pointer items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 focus-within:ring-2 focus-within:ring-ring ${isUploading ? "pointer-events-none opacity-60" : ""}`}
                  >
                    {isUploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {doc ? "إعادة رفع" : "رفع"}
                  </label>
                  <input
                    id={inputId}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(t.key, f);
                      e.target.value = "";
                    }}
                    disabled={isUploading}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
