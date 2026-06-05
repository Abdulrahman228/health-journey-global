import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Lock, Star, UserX } from "lucide-react";
import { toast } from "sonner";
import { readMyPrivateFeedback } from "@/lib/feedback.functions";

interface FeedbackRow {
  id: string;
  is_anonymous: boolean;
  patient_profile_id: string | null;
  message: string;
  rating: number | null;
  created_at: string;
}

export const Route = createFileRoute("/doctor/feedback")({
  head: () => ({
    meta: [
      { title: "ملاحظات خاصة — طبيبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FeedbackInbox,
});

function FeedbackInbox() {
  const { user, role, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const fetchFeedback = useServerFn(readMyPrivateFeedback);
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (role !== "doctor") return;
    (async () => {
      try {
        const r = await fetchFeedback({ data: { limit: 100 } });
        setRows(r as FeedbackRow[]);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, user, role, navigate]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="جاري التحميل" />
      </div>
    );
  }

  if (role !== "doctor") {
    return <p className="text-center py-16 text-muted-foreground">صفحة الأطباء فقط.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6" dir="rtl">
      <div className="flex items-center gap-2 mb-2">
        <Lock className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-bold">ملاحظات خاصة</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        ملاحظات مشفّرة من المرضى — مرئية لك فقط ولا تظهر في التقييمات العامة.
        مخزّنة بتشفير AES متماثل في قاعدة البيانات.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <Lock className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-foreground">لا توجد ملاحظات بعد.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {r.is_anonymous ? (
                    <>
                      <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>مجهول</span>
                    </>
                  ) : (
                    <span>مريض مسجَّل</span>
                  )}
                  <span aria-hidden="true">·</span>
                  <time dateTime={r.created_at}>
                    {new Date(r.created_at).toLocaleDateString("ar-EG", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </div>
                {r.rating != null && (
                  <div className="flex items-center gap-0.5" aria-label={`تقييم ${r.rating} من 5`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3.5 w-3.5 ${i < (r.rating ?? 0) ? "fill-amber-500 text-amber-500" : "text-muted-foreground/30"}`}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">{r.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
