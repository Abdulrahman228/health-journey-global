import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { Lock, Star, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { submitPrivateFeedback } from "@/lib/feedback.functions";

interface Props {
  doctorDetailsId: string;
  doctorName?: string;
}

/**
 * Patient-facing button + modal that submits encrypted private feedback to a
 * doctor. Stored encrypted (pgcrypto pgp_sym_encrypt) — only the doctor can
 * decrypt via SECURITY DEFINER RPC. Anonymous mode supported.
 */
export function PrivateFeedbackButton({ doctorDetailsId, doctorName }: Props) {
  const { user } = useAuth();
  const submit = useServerFn(submitPrivateFeedback);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Lock className="h-4 w-4" aria-hidden="true" />
        ملاحظة خاصة للطبيب
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pf-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border p-5 shadow-2xl" dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 id="pf-title" className="text-lg font-bold">
                  ملاحظة خاصة {doctorName ? `لـ ${doctorName}` : ""}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق"
                className="rounded-md p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-3">
              مشفّرة من طرف لطرف — لن يقرأها أحد سوى الطبيب نفسه. لن تظهر في
              التقييمات العامة.
            </p>

            <div className="space-y-3">
              <div>
                <span className="block text-sm font-medium mb-1.5">التقييم (اختياري)</span>
                <div className="flex gap-1" role="radiogroup" aria-label="تقييم">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={rating === n}
                      aria-label={`${n} نجوم`}
                      onClick={() => setRating(rating === n ? null : n)}
                      className="rounded p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Star
                        className={`h-6 w-6 ${rating !== null && n <= rating ? "fill-amber-500 text-amber-500" : "text-muted-foreground/40"}`}
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="pf-message" className="mb-1.5 block text-sm font-medium">
                  رسالتك <span className="text-destructive" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="pf-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  minLength={5}
                  maxLength={5000}
                  required
                  placeholder="اكتب ملاحظتك هنا..."
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {message.length} / 5000
                </p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm">أرسل بشكل مجهول (بدون اسمي)</span>
              </label>

              <button
                type="button"
                disabled={submitting || message.trim().length < 5}
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    await submit({
                      data: {
                        doctorDetailsId,
                        message: message.trim(),
                        rating: rating ?? undefined,
                        anonymous,
                      },
                    });
                    toast.success("تم إرسال الملاحظة بشكل مشفّر");
                    setOpen(false);
                    setMessage("");
                    setRating(null);
                    setAnonymous(false);
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
                إرسال مشفّر
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
