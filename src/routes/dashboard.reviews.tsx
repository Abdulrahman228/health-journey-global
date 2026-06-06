/**
 * /dashboard/reviews — Doctor self-curation of patient reviews.
 *
 * Two-gate model:
 *   1. Admin moderates for safety/spam   → status: pending → approved/rejected
 *   2. Doctor curates which approved      → is_published_by_doctor: true/false
 *      reviews appear publicly on profile
 *
 * Public profile + aggregate rating count ONLY published reviews. This
 * protects the doctor from coordinated negative campaigns and lets them
 * surface constructive feedback while privately tracking everything.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import {
  doctorListMyReviews,
  doctorTogglePublishReview,
  doctorRespondToReview,
  type DoctorReviewRow,
} from "@/lib/reviews.functions";
import {
  Eye,
  EyeOff,
  Star,
  Loader2,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

type FilterKey = "all" | "published" | "unpublished" | "pending" | "rejected";

export const Route = createFileRoute("/dashboard/reviews")({
  head: () => ({
    meta: [
      { title: "تقييمات المرضى | لوحة الطبيب — طبيبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DoctorReviewsPage,
});

function DoctorReviewsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate({ to: "/login" });
  }, [authLoading, user, navigate]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["doctor-my-reviews", user?.id, filter],
    enabled: !!user?.id,
    queryFn: () =>
      doctorListMyReviews({ data: { userId: user!.id, filter, limit: 200 } }),
  });

  const togglePublish = useMutation({
    mutationFn: (p: { reviewId: string; publish: boolean }) =>
      doctorTogglePublishReview({
        data: { userId: user!.id, reviewId: p.reviewId, publish: p.publish },
      }),
    onSuccess: (res, vars) => {
      if (!res.ok) {
        if (res.error === "review_not_approved_yet") {
          toast.error(
            t(
              "Cannot publish — admin has not approved this review yet.",
              "لا يمكن النشر — لم يوافق المشرف على هذا التقييم بعد.",
            ),
          );
        } else {
          toast.error(res.error);
        }
        return;
      }
      toast.success(
        vars.publish
          ? t("Published on your public profile", "تم النشر على صفحتك العامة")
          : t("Removed from public profile", "تمت الإزالة من الصفحة العامة"),
      );
      qc.invalidateQueries({ queryKey: ["doctor-my-reviews"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = useMemo(() => {
    const total = rows.length;
    const published = rows.filter((r) => r.isPublished).length;
    const pending = rows.filter((r) => r.status === "pending").length;
    const approved = rows.filter((r) => r.status === "approved").length;
    return { total, published, pending, approved };
  }, [rows]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-6">
        <Link
          to="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t("Back to dashboard", "عودة للوحة التحكم")}
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          {t("Patient reviews", "تقييمات المرضى")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl leading-relaxed">
          {t(
            "You decide which approved reviews appear on your public profile. Constructive but unflattering feedback can stay private so you can act on it without it counting against your public rating.",
            "أنت تقرر أي التقييمات الموافق عليها تظهر على صفحتك العامة. يمكنك الاحتفاظ بالملاحظات السلبية بشكل خاص للعمل على تحسينها دون أن تؤثر على تقييمك العام.",
          )}
        </p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<MessageSquare className="h-4 w-4" />}
          label={t("Total", "الإجمالي")}
          value={stats.total}
        />
        <StatCard
          icon={<Eye className="h-4 w-4 text-emerald-600" />}
          label={t("Published", "منشورة")}
          value={stats.published}
          tone="emerald"
        />
        <StatCard
          icon={<ShieldCheck className="h-4 w-4 text-blue-600" />}
          label={t("Approved (admin)", "موافق عليها")}
          value={stats.approved}
          tone="blue"
        />
        <StatCard
          icon={<Clock className="h-4 w-4 text-amber-600" />}
          label={t("Pending review", "قيد المراجعة")}
          value={stats.pending}
          tone="amber"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        <FilterTab active={filter === "all"} onClick={() => setFilter("all")}>
          {t("All", "الكل")}
        </FilterTab>
        <FilterTab
          active={filter === "published"}
          onClick={() => setFilter("published")}
        >
          {t("Published", "منشورة")}
        </FilterTab>
        <FilterTab
          active={filter === "unpublished"}
          onClick={() => setFilter("unpublished")}
        >
          {t("Approved (not published)", "موافق عليها (غير منشورة)")}
        </FilterTab>
        <FilterTab
          active={filter === "pending"}
          onClick={() => setFilter("pending")}
        >
          {t("Pending admin review", "قيد المراجعة")}
        </FilterTab>
        <FilterTab
          active={filter === "rejected"}
          onClick={() => setFilter("rejected")}
        >
          {t("Rejected", "مرفوضة")}
        </FilterTab>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-center py-12 text-sm text-muted-foreground border border-dashed border-border rounded-2xl">
          {t("No reviews in this view yet.", "لا توجد تقييمات في هذا العرض.")}
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              onTogglePublish={(publish) =>
                togglePublish.mutate({ reviewId: r.id, publish })
              }
              busy={
                togglePublish.isPending && togglePublish.variables?.reviewId === r.id
              }
              userId={user.id}
              onResponseSaved={() =>
                qc.invalidateQueries({ queryKey: ["doctor-my-reviews"] })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "emerald" | "blue" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/50"
      : tone === "blue"
      ? "border-blue-200 bg-blue-50/50"
      : tone === "amber"
      ? "border-amber-200 bg-amber-50/50"
      : "border-border bg-card";
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border transition ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground border-border hover:border-primary/50"
      }`}
    >
      {children}
    </button>
  );
}

function ReviewCard({
  review,
  onTogglePublish,
  busy,
  userId,
  onResponseSaved,
}: {
  review: DoctorReviewRow;
  onTogglePublish: (publish: boolean) => void;
  busy: boolean;
  userId: string;
  onResponseSaved: () => void;
}) {
  const { t } = useLanguage();
  const [editingResponse, setEditingResponse] = useState(false);
  const [response, setResponse] = useState(review.doctorResponse ?? "");
  const [savingResponse, setSavingResponse] = useState(false);

  async function saveResponse() {
    setSavingResponse(true);
    try {
      const res = await doctorRespondToReview({
        data: { userId, reviewId: review.id, response },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t("Response saved", "تم حفظ الرد"));
      setEditingResponse(false);
      onResponseSaved();
    } finally {
      setSavingResponse(false);
    }
  }

  const isApproved = review.status === "approved";
  const isPublished = review.isPublished;

  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-foreground">
              {review.patientName}
            </span>
            <StatusPill status={review.status} isPublished={isPublished} />
          </div>
          <div className="flex items-center gap-1 text-amber-500">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-4 w-4 ${
                  i < review.rating ? "fill-amber-400" : "text-muted-foreground/40"
                }`}
              />
            ))}
            <span className="ms-2 text-xs text-muted-foreground">
              {new Date(review.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {isApproved && (
          <button
            type="button"
            onClick={() => onTogglePublish(!isPublished)}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition disabled:opacity-50 ${
              isPublished
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                : "bg-card text-foreground border-border hover:border-primary"
            }`}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isPublished ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
            {isPublished
              ? t("Published", "منشورة")
              : t("Publish on profile", "نشر على الصفحة")}
          </button>
        )}
      </header>

      {review.comment && (
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {review.comment}
        </p>
      )}

      {/* Doctor response */}
      <div className="mt-4 border-t border-border pt-3">
        {editingResponse ? (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t("Your public response", "ردك العام")}
            </label>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={t(
                "Thank the patient or address their concern professionally...",
                "اشكر المريض أو رد على ملاحظته باحترافية...",
              )}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={saveResponse}
                disabled={savingResponse}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {savingResponse ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("Save response", "حفظ الرد")
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setResponse(review.doctorResponse ?? "");
                  setEditingResponse(false);
                }}
                className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-accent"
              >
                {t("Cancel", "إلغاء")}
              </button>
            </div>
          </div>
        ) : review.doctorResponse ? (
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-xs font-semibold text-primary">
                {t("Doctor's response", "رد الطبيب")}
              </span>
              <button
                type="button"
                onClick={() => setEditingResponse(true)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {t("Edit", "تعديل")}
              </button>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {review.doctorResponse}
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingResponse(true)}
            className="text-xs text-primary hover:underline"
          >
            + {t("Add a public response", "إضافة رد عام")}
          </button>
        )}
      </div>

      {!isApproved && (
        <p className="mt-3 text-xs text-muted-foreground inline-flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {review.status === "pending"
            ? t(
                "Awaiting safety review by admin before you can publish.",
                "في انتظار مراجعة المشرف للسلامة قبل أن تتمكن من النشر.",
              )
            : t(
                "Removed by admin (safety/policy). It will not appear publicly.",
                "تمت إزالته من قِبل المشرف (سياسة/سلامة). لن يظهر للعموم.",
              )}
        </p>
      )}
    </article>
  );
}

function StatusPill({
  status,
  isPublished,
}: {
  status: "pending" | "approved" | "rejected";
  isPublished: boolean;
}) {
  const { t } = useLanguage();
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px]">
        <Clock className="h-3 w-3" />
        {t("Pending", "قيد المراجعة")}
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 text-[10px]">
        <XCircle className="h-3 w-3" />
        {t("Rejected", "مرفوض")}
      </span>
    );
  }
  if (isPublished) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px]">
        <Eye className="h-3 w-3" />
        {t("Published", "منشورة")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[10px]">
      <CheckCircle2 className="h-3 w-3" />
      {t("Approved (private)", "موافق عليها (خاص)")}
    </span>
  );
}
