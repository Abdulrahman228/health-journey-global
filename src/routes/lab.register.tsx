import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FlaskConical, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { getMyLab, registerLab, type FacilityType } from "@/lib/labs";
import { toast } from "sonner";

export const Route = createFileRoute("/lab/register")({
  component: LabRegisterPage,
  head: () => ({
    meta: [
      { title: "تسجيل معمل / مركز أشعة — Tebana" },
      {
        name: "description",
        content: "سجّل معملك أو مركز الأشعة على طبانا لاستقبال طلبات المرضى وتسليم النتائج.",
      },
    ],
  }),
});

function LabRegisterPage() {
  const { user, profile, isAuthenticated, isLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [facilityType, setFacilityType] = useState<FacilityType>("lab");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate({ to: "/login" });
  }, [isLoading, isAuthenticated, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      toast.error(t("Name is required", "الاسم مطلوب"));
      return;
    }
    setSubmitting(true);
    try {
      const existing = await getMyLab(user.id);
      if (existing) {
        toast.error(t("You already have a facility", "لديك منشأة مسجّلة بالفعل"));
        navigate({ to: "/lab/dashboard" });
        return;
      }
      await registerLab({
        ownerUserId: user.id,
        profileId: profile?.id ?? null,
        name: name.trim(),
        facilityType,
        city: city.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
      });
      toast.success(
        t("Registered! You can now receive orders.", "تم التسجيل! يمكنك الآن استقبال الطلبات."),
      );
      navigate({ to: "/lab/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed", "فشل"));
    } finally {
      setSubmitting(false);
    }
  }

  const typeOptions: { key: FacilityType; labelEn: string; labelAr: string }[] = [
    { key: "lab", labelEn: "Lab", labelAr: "معمل تحاليل" },
    { key: "radiology", labelEn: "Radiology", labelAr: "مركز أشعة" },
    { key: "both", labelEn: "Both", labelAr: "الاثنان" },
  ];

  return (
    <div>
      <section className="border-b border-border bg-linear-to-br from-teal/10 via-background to-background">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal/15 text-teal">
              <FlaskConical className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {t("Register your lab / radiology center", "سجّل معملك أو مركز الأشعة")}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {t(
                  "Receive test orders from patients, confirm payment on your side, and deliver reports securely.",
                  "استقبل طلبات التحاليل من المرضى، أكّد الدفع من جهتك، وسلّم التقارير بأمان.",
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
          <ShieldCheck className="inline h-4 w-4 me-1" />
          {t(
            "You control payment status for each order (paid / partial / unpaid). Results are released to the patient once you mark them paid.",
            "أنت من يتحكم في حالة الدفع لكل طلب (مدفوع / جزئي / غير مدفوع). تُكشف النتيجة للمريض بمجرد تعليمها كمدفوعة.",
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-border bg-card p-6"
        >
          <Field label={t("Facility name", "اسم المنشأة") + " *"}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("Cairo Lab", "معمل القاهرة")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>

          <Field label={t("Type", "النوع") + " *"}>
            <div className="grid grid-cols-3 gap-2">
              {typeOptions.map((o) => {
                const active = facilityType === o.key;
                return (
                  <button
                    type="button"
                    key={o.key}
                    onClick={() => setFacilityType(o.key)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {t(o.labelEn, o.labelAr)}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={t("City", "المدينة")}>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={t("Cairo", "القاهرة")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>

          <Field label={t("Phone", "الهاتف")}>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01000000000"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>

          <Field label={t("Address", "العنوان")}>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("Register facility", "تسجيل المنشأة")}
            </button>
            <Link
              to="/"
              className="rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium hover:bg-accent"
            >
              {t("Cancel", "إلغاء")}
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}
