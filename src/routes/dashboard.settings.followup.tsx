/**
 * /dashboard/settings/followup — doctor's free follow-up configuration.
 *
 * Lets the doctor define:
 *   - free_followup_days: window in days for a free/discounted revisit
 *   - followup_fee:       0 = free, or reduced fee in EGP
 *   - max_free_followups: cap on consecutive follow-ups before a new visit
 *
 * The booking flow consults these via determineVisitFee server fn.
 *
 * Private — noindex, nofollow.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  getMyFollowupSettings,
  updateMyFollowupSettings,
} from "@/lib/visit-fee.functions";
import { CalendarClock, Loader2, Save, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/settings/followup")({
  head: () => ({
    meta: [
      { title: "إعدادات المتابعة | لوحة الطبيب — طبيبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FollowupSettingsPage,
});

interface FormState {
  freeFollowupDays: number;
  followupFee: number;
  maxFreeFollowups: number;
}

function FollowupSettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDoctor, setIsDoctor] = useState(true);
  const [consultationFee, setConsultationFee] = useState(0);
  const [form, setForm] = useState<FormState>({
    freeFollowupDays: 14,
    followupFee: 0,
    maxFreeFollowups: 2,
  });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const s = await getMyFollowupSettings({ data: { userId: user.id } });
    if (!s) {
      setIsDoctor(false);
    } else {
      const sx = s as {
        consultationFee: number;
        freeFollowupDays: number;
        followupFee: number;
        maxFreeFollowups: number;
      };
      setConsultationFee(sx.consultationFee);
      setForm({
        freeFollowupDays: sx.freeFollowupDays,
        followupFee: sx.followupFee,
        maxFreeFollowups: sx.maxFreeFollowups,
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    load();
  }, [authLoading, user, navigate, load]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const res = await updateMyFollowupSettings({
      data: { userId: user.id, ...form },
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("فشل الحفظ: " + res.error);
      return;
    }
    toast.success("تم حفظ إعدادات المتابعة");
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isDoctor) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-destructive" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold">هذه الصفحة للأطباء فقط</h1>
        <p className="mt-2 text-muted-foreground">
          سجّل حسابك كطبيب لتظهر لك هذه الإعدادات.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <CalendarClock className="h-6 w-6 text-primary" aria-hidden="true" />
          إعدادات المتابعة المجانية
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تحكّم في فترة المتابعة المجانية بعد كل كشف. هذه الإعدادات تظهر للمريض
          قبل الحجز.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-border bg-card p-6"
      >
        <div className="mb-6 rounded-lg bg-muted/40 p-4 text-sm">
          <span className="font-semibold text-foreground">سعر الكشف الحالي:</span>{" "}
          {consultationFee.toLocaleString("ar-EG")} ج.م
          <span className="ms-2 text-xs text-muted-foreground">
            (يُعدَّل من ملفك الشخصي)
          </span>
        </div>

        <div className="space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-foreground">
              مدة المتابعة المجانية (يوم)
            </span>
            <input
              type="range"
              min={0}
              max={60}
              value={form.freeFollowupDays}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  freeFollowupDays: Number(e.target.value),
                }))
              }
              className="mt-2 w-full accent-primary"
              aria-valuemin={0}
              aria-valuemax={60}
              aria-valuenow={form.freeFollowupDays}
            />
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>0 يوم (لا متابعة)</span>
              <span className="text-base font-bold text-primary">
                {form.freeFollowupDays} يوم
              </span>
              <span>60 يوم</span>
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-foreground">
              سعر المتابعة (ج.م)
            </span>
            <input
              type="number"
              min={0}
              max={consultationFee}
              step={10}
              value={form.followupFee}
              onChange={(e) =>
                setForm((f) => ({ ...f, followupFee: Number(e.target.value) }))
              }
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <span className="mt-0.5 block text-xs text-muted-foreground">
              ضع <strong>0</strong> لجعل المتابعة مجانية تماماً، أو أدخل سعراً
              مخفّضاً.
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-foreground">
              أقصى عدد متابعات مجانية بعد كل كشف
            </span>
            <input
              type="number"
              min={0}
              max={10}
              value={form.maxFreeFollowups}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  maxFreeFollowups: Number(e.target.value),
                }))
              }
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <span className="mt-0.5 block text-xs text-muted-foreground">
              بعد تجاوز هذا العدد، الزيارة التالية تُحتسب كشفاً جديداً.
            </span>
          </label>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="text-sm font-semibold text-primary">معاينة</div>
            <p className="mt-1 text-sm text-foreground">
              المريض الذي يحجز خلال <strong>{form.freeFollowupDays}</strong> يوم
              من زيارته السابقة يدفع{" "}
              <strong>
                {form.followupFee === 0
                  ? "مجاناً"
                  : `${form.followupFee.toLocaleString("ar-EG")} ج.م`}
              </strong>{" "}
              كمتابعة (بحد أقصى <strong>{form.maxFreeFollowups}</strong> متابعات
              بعد كل كشف).
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            حفظ الإعدادات
          </button>
        </div>
      </form>
    </div>
  );
}
