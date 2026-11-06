import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DoctorShell } from "@/components/doctor/DoctorNav";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Lock, Star, UserX, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { readMyPrivateFeedback, replyToPrivateFeedback } from "@/lib/feedback.functions";

interface FeedbackRow {
  id: string;
  is_anonymous: boolean;
  patient_profile_id: string | null;
  message: string;
  rating: number | null;
  created_at: string;
  doctor_reply: string | null;
  doctor_replied_at: string | null;
}

export const Route = createFileRoute("/doctor/feedback")({
  head: () => ({
    meta: [
      { title: "ملاحظات خاصة — طبانا" },
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

  const onReplied = (id: string, reply: string) =>
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, doctor_reply: reply, doctor_replied_at: new Date().toISOString() } : r,
      ),
    );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (role !== "doctor") {
      // Not a doctor → stop the spinner so the "doctors only" notice renders.
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const r = await fetchFeedback({ data: { limit: 100 } });
        setRows(r);
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : "تعذّر تحميل الملاحظات");
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
    <DoctorShell>
      <div dir="rtl">
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
            <FeedbackItem key={r.id} row={r} onReplied={onReplied} />
          ))}
        </ul>
      )}
      </div>
    </DoctorShell>
  );
}

function FeedbackItem({
  row: r,
  onReplied,
}: {
  row: FeedbackRow;
  onReplied: (id: string, reply: string) => void;
}) {
  const sendReply = useServerFn(replyToPrivateFeedback);
  const encrypted = r.message.startsWith("[encrypted");
  const canReply = !r.is_anonymous && !!r.patient_profile_id;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const reply = text.trim();
    if (reply.length < 1) return;
    setSaving(true);
    try {
      await sendReply({ data: { feedbackId: r.id, reply } });
      onReplied(r.id, reply);
      setEditing(false);
      setText("");
      toast.success("تم إرسال الرد للمريض");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "تعذّر إرسال الرد");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-xl border border-border bg-card p-4">
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

      {/* Existing reply */}
      {r.doctor_reply && (
        <div className="mt-3 rounded-lg border-s-2 border-primary bg-primary/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            ردّك للمريض
          </div>
          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">{r.doctor_reply}</p>
        </div>
      )}

      {/* Reply action — registered (non-anonymous) patients only */}
      {canReply && !r.doctor_reply && !encrypted && (
        editing ? (
          <div className="mt-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="اكتب ردًّا خاصًّا للمريض — سيصله كإشعار داخل التطبيق…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={saving || text.trim().length < 1}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                إرسال الرد
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setText(""); }}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                إلغاء
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            رد خاص على المريض
          </button>
        )
      )}

      {r.is_anonymous && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          لا يمكن الرد على ملاحظة مجهولة (لا يوجد مريض للتواصل معه).
        </p>
      )}
    </li>
  );
}
