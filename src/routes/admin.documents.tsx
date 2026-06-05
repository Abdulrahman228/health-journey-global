import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  Loader2,
  ShieldCheck,
  Eye,
  CheckCircle2,
  XCircle,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { AdminNav } from "@/components/admin/AdminNav";
import {
  adminListPendingDocuments,
  adminReviewDocument,
  getDocumentUrl,
} from "@/lib/credentials.functions";

export const Route = createFileRoute("/admin/documents")({
  head: () => ({
    meta: [
      { title: "لوحة الأدمن - مراجعة المستندات" },
      { name: "description", content: "مراجعة مستندات توثيق الأطباء." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminDocumentsPage,
});

const TYPE_LABEL: Record<string, string> = {
  national_id_front: "بطاقة - أمامي",
  national_id_back: "بطاقة - خلفي",
  syndicate_card: "كارنيه النقابة",
  medical_license: "رخصة المزاولة",
  degree_certificate: "شهادة التخرج",
  specialty_certificate: "شهادة تخصص",
  professional_photo: "صورة شخصية",
  liveness_selfie: "سيلفي تحقق",
  other: "أخرى",
};

interface Doc {
  id: string;
  document_type: string;
  status: string;
  rejection_reason: string | null;
  file_name: string | null;
  mime_type: string | null;
  uploaded_at: string;
  reviewed_at: string | null;
  doctor_details: {
    id: string;
    specialty: string | null;
    syndicate_number: string | null;
    national_id_last4: string | null;
    profiles: { id: string; full_name: string | null; email: string | null; phone: string | null } | null;
  } | null;
}

function AdminDocumentsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const list = useServerFn(adminListPendingDocuments);
  const review = useServerFn(adminReviewDocument);
  const sign = useServerFn(getDocumentUrl);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [actingId, setActingId] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await list();
      setDocs(res.documents as unknown as Doc[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (!isAdmin) return;
    load();
  }, [authLoading, roleLoading, user, isAdmin, navigate]);

  const handleReview = async (doc: Doc, action: "approve" | "reject") => {
    const reason = reasonById[doc.id] ?? "";
    if (action === "reject" && !reason.trim()) {
      toast.error("اكتب سبب الرفض");
      return;
    }
    setActingId(doc.id);
    try {
      await review({
        data: {
          documentId: doc.id,
          action,
          rejectionReason: action === "reject" ? reason : undefined,
        },
      });
      toast.success(action === "approve" ? "تم الاعتماد" : "تم الرفض");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActingId(null);
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

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="جاري التحميل" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">صلاحية الأدمن فقط.</p>
        <Link to="/" className="mt-3 inline-block text-primary hover:underline">
          العودة للرئيسية
        </Link>
      </div>
    );
  }

  const filtered = filter === "pending" ? docs.filter((d) => d.status === "pending") : docs;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6" dir="rtl">
      <AdminNav />
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-bold">مراجعة المستندات</h1>
      </div>

      <div className="mt-4 flex gap-2" role="tablist" aria-label="فلترة المستندات">
        {(["pending", "all"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              filter === k
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {k === "pending" ? `قيد المراجعة (${docs.filter((d) => d.status === "pending").length})` : "الكل"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-10 text-center text-muted-foreground">لا توجد مستندات.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {filtered.map((doc) => {
            const dr = doc.doctor_details;
            const profile = dr?.profiles;
            return (
              <li key={doc.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{profile?.full_name ?? "—"}</h3>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {TYPE_LABEL[doc.document_type] ?? doc.document_type}
                      </span>
                      {doc.status === "approved" && (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> معتمد
                        </span>
                      )}
                      {doc.status === "rejected" && (
                        <span className="inline-flex items-center gap-1 text-xs text-destructive">
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> مرفوض
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {dr?.specialty ?? "—"}
                      {dr?.syndicate_number ? ` · نقابة: ${dr.syndicate_number}` : ""}
                      {dr?.national_id_last4 ? ` · قومي: ****${dr.national_id_last4}` : ""}
                    </p>
                    {profile?.email && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{profile.email}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(doc.uploaded_at).toLocaleDateString("ar-EG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePreview(doc.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" /> معاينة
                    </button>
                  </div>
                </div>

                {doc.file_name && (
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="h-3 w-3" aria-hidden="true" />
                    {doc.file_name}
                  </p>
                )}

                {doc.status === "rejected" && doc.rejection_reason && (
                  <p className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">
                    سبب الرفض: {doc.rejection_reason}
                  </p>
                )}

                {doc.status === "pending" && (
                  <div className="mt-4 space-y-2">
                    <label htmlFor={`reason-${doc.id}`} className="sr-only">
                      سبب الرفض
                    </label>
                    <input
                      id={`reason-${doc.id}`}
                      type="text"
                      value={reasonById[doc.id] ?? ""}
                      onChange={(e) =>
                        setReasonById((s) => ({ ...s, [doc.id]: e.target.value }))
                      }
                      placeholder="سبب الرفض (مطلوب عند الرفض)"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleReview(doc, "approve")}
                        disabled={actingId === doc.id}
                        className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700"
                      >
                        اعتماد
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReview(doc, "reject")}
                        disabled={actingId === doc.id}
                        className="flex-1 rounded-lg bg-destructive py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                      >
                        رفض
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
