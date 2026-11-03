import { useCallback, useEffect, useState } from "react";
import { Users, Loader2, ShieldCheck, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";

interface CareDoctor {
  doctor_profile_id: string;
  full_name: string | null;
  specialty: string | null;
  linked_at: string;
}

/**
 * Shared-care control for the patient (managed-patient Phase D): see which
 * doctors are registered to follow you, and consent to letting them follow
 * your case together.
 */
export function SharedCareCard() {
  const { t } = useLanguage();
  const [doctors, setDoctors] = useState<CareDoctor[]>([]);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    const [{ data: docs }, prof] = await Promise.all([
      supabase.rpc("list_my_care_doctors"),
      uid
        ? supabase.from("profiles").select("shared_care_consent").eq("user_id", uid).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setDoctors((docs as CareDoctor[]) ?? []);
    setConsent(Boolean((prof as { data?: { shared_care_consent?: boolean } })?.data?.shared_care_consent));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async () => {
    const next = !consent;
    setSaving(true);
    setConsent(next); // optimistic
    const { error } = await supabase.rpc("set_shared_care_consent", { p_consent: next });
    setSaving(false);
    if (error) {
      setConsent(!next);
      toast.error(error.message);
    } else {
      toast.success(next ? t("Shared care enabled", "تم تفعيل الرعاية المشتركة") : t("Shared care disabled", "تم إيقاف الرعاية المشتركة"));
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">{t("Shared care", "الرعاية المشتركة")}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          "These doctors registered you. Turn on shared care to let them follow your visits and condition together.",
          "هؤلاء الأطباء سجّلوك لديهم. فعّل الرعاية المشتركة للسماح لهم بمتابعة زياراتك وحالتك معًا.",
        )}
      </p>

      {/* Consent toggle */}
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className={`mt-4 flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm transition ${
          consent ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-background"
        }`}
      >
        <span className="flex items-center gap-2 font-medium text-foreground">
          <ShieldCheck className={`h-4 w-4 ${consent ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} />
          {t("Allow my doctors to follow together", "السماح لأطبائي بالمتابعة المشتركة")}
        </span>
        <span
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
            consent ? "bg-emerald-500" : "bg-muted"
          }`}
          aria-hidden="true"
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${consent ? "translate-x-5" : "translate-x-0.5"}`} />
        </span>
      </button>

      {/* Doctors list */}
      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {t("Doctors following you", "الأطباء المسجَّلون لديك")} · {doctors.length}
        </p>
        {doctors.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("None yet.", "لا يوجد بعد.")}</p>
        ) : (
          <ul className="space-y-2">
            {doctors.map((d) => (
              <li key={d.doctor_profile_id} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <Stethoscope className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{d.full_name || t("Doctor", "طبيب")}</p>
                  {d.specialty && <p className="truncate text-xs text-muted-foreground">{d.specialty}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
