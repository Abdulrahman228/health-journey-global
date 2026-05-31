import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AdminNav } from "@/components/admin/AdminNav";
import {
  adminListReviews,
  adminModerateReview,
} from "@/lib/reviews.functions";
import {
  Loader2,
  Star,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/reviews")({
  head: () => ({
    meta: [
      { title: "مراجعة تقييمات المرضى — لوحة الأدمن" },
      {
        name: "description",
        content: "اعتماد أو رفض تقييمات المرضى للأطباء قبل نشرها.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminReviewsPage,
});

type Row = Awaited<ReturnType<typeof adminListReviews>>[number];
type Filter = "pending" | "approved" | "rejected" | "all";

function AdminReviewsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();

  const [filter, setFilter] = useState<Filter>("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await adminListReviews({
        data: { userId: user.id, status: filter, limit: 100 },
      });
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل التقييمات");
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (!isAdmin) {
      navigate({ to: "/dashboard" });
      return;
    }
    load();
  }, [authLoading, roleLoading, user, isAdmin, navigate, load]);

  const moderate = async (
    reviewId: string,
    decision: "approved" | "rejected",
  ) => {
    if (!user) return;
    setActingId(reviewId);
    try {
      const res = await adminModerateReview({
        data: { userId: user.id, reviewId, decision },
      });
      if (!res.ok) throw new Error(res.error);
      toast.success(decision === "approved" ? "تم الاعتماد" : "تم الرفض");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشلت العملية");
    } finally {
      setActingId(null);
    }
  };

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8" dir="rtl">
      <AdminNav />
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <MessageSquare className="h-6 w-6 text-primary" aria-hidden="true" />
          مراجعة تقييمات المرضى
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          اعتمد التقييمات السليمة أو ارفض المسيء منها قبل نشرها.
        </p>
      </header>

      <nav
        className="mb-6 flex flex-wrap gap-1 border-b border-border"
        role="tablist"
        aria-label="تصفية التقييمات"
      >
        {(
          [
            { id: "pending", label: "قيد المراجعة", icon: Clock },
            { id: "approved", label: "معتمدة", icon: CheckCircle2 },
            { id: "rejected", label: "مرفوضة", icon: XCircle },
            { id: "all", label: "الكل", icon: MessageSquare },
          ] as const
        ).map((it) => (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={filter === it.id}
            onClick={() => setFilter(it.id)}
            className={
              "inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary/40 " +
              (filter === it.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            <it.icon className="h-4 w-4" aria-hidden="true" />
            {it.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <MessageSquare
            className="mx-auto h-10 w-10 text-muted-foreground/60"
            aria-hidden="true"
          />
          <p className="mt-3 font-medium text-foreground">
            لا توجد تقييمات في هذا القسم
          </p>
        </div>
      ) : (
        <ul role="list" className="space-y-3">
          {rows.map((r) => (
            <ReviewCard
              key={r.id}
              r={r}
              acting={actingId === r.id}
              onApprove={() => moderate(r.id, "approved")}
              onReject={() => moderate(r.id, "rejected")}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewCard({
  r,
  acting,
  onApprove,
  onReject,
}: {
  r: Row;
  acting: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const dateAr = new Date(r.createdAt).toLocaleDateString("ar-EG");
  const badge =
    r.status === "approved"
      ? { l: "معتمدة", c: "bg-emerald-50 text-emerald-700 border-emerald-200" }
      : r.status === "rejected"
        ? { l: "مرفوضة", c: "bg-red-50 text-red-700 border-red-200" }
        : { l: "قيد المراجعة", c: "bg-amber-50 text-amber-700 border-amber-200" };

  return (
    <li className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">
              {r.patientName}
            </span>
            <span className="text-sm text-muted-foreground">→</span>
            <span className="text-sm font-bold text-primary">
              د. {r.doctorName}
            </span>
            <span
              className={
                "rounded-full border px-2 py-0.5 text-xs font-medium " + badge.c
              }
            >
              {badge.l}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex" aria-label={`تقييم ${r.rating} من 5`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={
                    "h-4 w-4 " +
                    (n <= r.rating
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/40")
                  }
                  aria-hidden="true"
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">{dateAr}</span>
          </div>
        </div>

        {r.status === "pending" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onApprove}
              disabled={acting}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {acting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              )}
              اعتماد
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={acting}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              رفض
            </button>
          </div>
        )}
      </div>

      {r.comment && (
        <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm text-foreground">
          {r.comment}
        </p>
      )}
      {r.notes && (
        <p className="mt-2 text-xs text-muted-foreground">
          ملاحظات الإدارة: {r.notes}
        </p>
      )}
    </li>
  );
}
