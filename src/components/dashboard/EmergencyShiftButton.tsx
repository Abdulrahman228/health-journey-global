import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Siren, X } from "lucide-react";
import { triggerEmergencyShift } from "@/lib/emergency.shift";
import { useLanguage } from "@/hooks/useLanguage";

/**
 * Doctor's Emergency Shift control: opens a dialog to pick a delay (default 30),
 * shifts today's queue via triggerEmergencyShift, and switches to an "Active
 * Emergency Mode" styling once triggered.
 */
export function EmergencyShiftButton({ doctorId }: { doctorId: string }) {
  const { t } = useLanguage();
  const shift = useServerFn(triggerEmergencyShift);
  const [open, setOpen] = useState(false);
  const [delay, setDelay] = useState("30");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);

  const confirm = async () => {
    const minutes = Math.round(Number(delay));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) {
      toast.error(t("Enter minutes between 1 and 240", "أدخل مدة بين 1 و240 دقيقة"));
      return;
    }
    setBusy(true);
    try {
      const res = await shift({ data: { doctorId, delayMinutes: minutes } });
      setActive(true);
      toast.success(
        t(
          `Delayed ${res.shifted} appointment(s) by ${minutes} min`,
          `تم ترحيل ${res.shifted} موعد لمدة ${minutes} دقيقة`,
        ),
      );
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition " +
          (active
            ? "animate-pulse bg-destructive text-white"
            : "border border-destructive/40 text-destructive hover:bg-destructive/10")
        }
      >
        <Siren className="h-4 w-4" aria-hidden="true" />
        {active
          ? t("Active Emergency Mode", "وضع الطوارئ مُفعّل")
          : t("Emergency Shift", "ترحيل طارئ")}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Emergency Shift", "ترحيل طارئ")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && setOpen(false)}
          dir="rtl"
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-xl bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-lg font-bold">{t("Emergency Shift", "ترحيل طارئ للمواعيد")}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("Close", "إغلاق")}
                className="rounded-md p-1 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="space-y-4 p-5">
              <div className="flex gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                <p className="text-muted-foreground">
                  {t(
                    "Delay all waiting patients today by the minutes below and notify them.",
                    "سيتم ترحيل كل المرضى المنتظرين اليوم بالدقائق التالية وإخطارهم فوراً.",
                  )}
                </p>
              </div>
              <label className="block text-sm">
                <span className="font-medium text-foreground">
                  {t("Delay (minutes)", "مدة الترحيل (دقيقة)")}
                </span>
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={delay}
                  onChange={(e) => setDelay(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
            </div>

            <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
              >
                {t("Cancel", "إلغاء")}
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Siren className="h-4 w-4" />}
                {t("Confirm shift", "تأكيد الترحيل")}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
