import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Lock, ShieldCheck, Video, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/hooks/useLanguage";
import {
  getMyTelemedicineStatus,
  toggleTelemedicine,
} from "@/lib/telemedicine.functions";

type T = (en: string, ar: string) => string;

/**
 * Doctor-facing Online Consultation (telemedicine) toggle.
 *
 * - Verified doctor  → switch works, calls toggleTelemedicine.
 * - Unverified doctor → switch is visually disabled; clicking it opens a
 *   "Verification Required" modal linking to /doctor/verification.
 * - Loading state keeps the doctor informed while the status resolves.
 */
export function TelemedicineToggle() {
  const { t } = useLanguage();
  const getStatus = useServerFn(getMyTelemedicineStatus);
  const toggle = useServerFn(toggleTelemedicine);

  const [status, setStatus] = useState<{
    isVerified: boolean;
    telemedicineEnabled: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await getStatus();
      setStatus({ isVerified: s.isVerified, telemedicineEnabled: s.telemedicineEnabled });
    } catch {
      setStatus({ isVerified: false, telemedicineEnabled: false });
    }
  }, [getStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = async (next: boolean) => {
    if (!status || saving) return;
    setSaving(true);
    setStatus((s) => (s ? { ...s, telemedicineEnabled: next } : s)); // optimistic
    try {
      await toggle({ data: { enabled: next } });
      toast.success(
        next
          ? t("Online consultations enabled", "تم تفعيل الاستشارات عن بُعد")
          : t("Online consultations disabled", "تم إيقاف الاستشارات عن بُعد"),
      );
    } catch (e) {
      setStatus((s) => (s ? { ...s, telemedicineEnabled: !next } : s)); // revert
      toast.error((e as Error).message || t("Something went wrong", "حدث خطأ ما"));
    } finally {
      setSaving(false);
    }
  };

  const loading = status === null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Video className="h-4 w-4 text-primary" aria-hidden="true" />
            {t("Online Consultations", "الاستشارات عن بُعد")}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Let patients book online video visits. Clinic bookings are unaffected.",
              "اسمح للمرضى بحجز استشارات فيديو أونلاين. حجوزات العيادة غير متأثرة.",
            )}
          </p>
          {!loading && !status.isVerified && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
              <Lock className="h-3 w-3" aria-hidden="true" />
              {t("Requires document verification", "يتطلب توثيق المستندات")}
            </p>
          )}
        </div>

        <div className="shrink-0 pt-1">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={t("Loading", "جاري التحميل")} />
          ) : status.isVerified ? (
            <Switch
              checked={status.telemedicineEnabled}
              onCheckedChange={handleToggle}
              disabled={saving}
              aria-label={t("Toggle online consultations", "تفعيل/إيقاف الاستشارات عن بُعد")}
            />
          ) : (
            // Disabled visual state; the wrapping button opens the modal on click.
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex cursor-pointer items-center rounded-md"
              aria-label={t("Verification required to enable", "التوثيق مطلوب للتفعيل")}
            >
              <Switch checked={false} disabled className="pointer-events-none" />
            </button>
          )}
        </div>
      </div>

      {modalOpen && <VerificationRequiredModal t={t} onClose={() => setModalOpen(false)} />}
    </div>
  );
}

function VerificationRequiredModal({ t, onClose }: { t: T; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("Verification Required", "التوثيق مطلوب")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-lg font-bold">{t("Verification Required", "التوثيق مطلوب")}</h2>
          <button type="button" onClick={onClose} aria-label={t("Close", "إغلاق")} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <div className="flex gap-2 rounded-lg bg-muted/50 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
            <p className="text-muted-foreground">
              {t(
                "Your account is under review. Please upload your medical practice license to enable services.",
                "حسابك قيد المراجعة، يرجى رفع صورة ترخيص مزاولة المهنة لتفعيل الخدمات",
              )}
            </p>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            {t("Later", "لاحقاً")}
          </button>
          <Link
            to="/doctor/verification"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {t("Upload documents", "رفع المستندات")}
          </Link>
        </footer>
      </div>
    </div>
  );
}
