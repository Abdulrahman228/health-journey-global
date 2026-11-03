import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PatientShell } from "@/components/patient/PatientNav";
import { DoctorShell } from "@/components/doctor/DoctorNav";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { createPortalSession } from "@/lib/payments.functions";
import { Loader2, ExternalLink, FileText, CheckCircle2, AlertCircle, Download, Settings } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [
      { title: "الفواتير والاشتراك — طبانا" },
      { name: "description", content: "إدارة اشتراكك، طريقة الدفع، وتنزيل فواتيرك على طبانا." },
    ],
  }),
  component: BillingPage,
});

interface InvoiceRow {
  id: string;
  number: number;
  amount_cents: number;
  currency: string;
  status: string;
  description: string | null;
  issued_at: string | null;
  paid_at: string | null;
  pdf_url: string | null;
}

function formatMoney(cents: number, currency: string) {
  const value = (cents / 100).toLocaleString("ar-EG", { minimumFractionDigits: 2 });
  return `${value} ${currency === "EGP" ? "ج.م" : currency}`;
}

function formatDate(iso: string | null, t: (en: string, ar: string) => string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}

function statusBadge(status: string, t: (en: string, ar: string) => string) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: t("Paid", "مدفوعة"), cls: "bg-teal/10 text-teal" },
    open: { label: t("Open", "مفتوحة"), cls: "bg-amber-500/10 text-amber-600" },
    uncollectible: { label: t("Failed", "فشل"), cls: "bg-destructive/10 text-destructive" },
    void: { label: t("Void", "ملغاة"), cls: "bg-muted text-muted-foreground" },
    draft: { label: t("Draft", "مسودة"), cls: "bg-muted text-muted-foreground" },
  };
  const cfg = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function BillingPage() {
  const { t } = useLanguage();
  const { user, role, isLoading: authLoading, isAuthenticated } = useAuth();
  const { subscription, isActive, isLoading: subLoading } = useSubscription(user?.id);
  // /billing is shared: doctors manage their Gold plan, patients see receipts.
  // Show each role its own sidebar instead of always the patient one.
  const Shell = role === "doctor" ? DoctorShell : PatientShell;
  const navigate = useNavigate();
  const openPortal = useServerFn(createPortalSession);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate({ to: "/login" });
  }, [authLoading, isAuthenticated, navigate]);

  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ["invoices", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const env = getStripeEnvironment();
      const { data, error } = await supabase
        .from("invoices")
        .select("id,number,amount_cents,currency,status,description,issued_at,paid_at,pdf_url")
        .eq("user_id", user!.id)
        // Subscription invoices keep Stripe env separation; appointment
        // receipts (appointment_id set) always show regardless of environment.
        .or(`environment.eq.${env},appointment_id.not.is.null`)
        .order("issued_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
  });

  const handleManage = async () => {
    try {
      setPortalLoading(true);
      const env = getStripeEnvironment();
      const url = await openPortal({
        data: { environment: env, returnUrl: window.location.href },
      });
      if (url) window.open(url as string, "_blank");
    } catch (e) {
      console.error(e);
      toast.error(t("Could not open billing portal", "تعذّر فتح بوابة الفواتير"));
    } finally {
      setPortalLoading(false);
    }
  };

  if (authLoading || subLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })
    : null;

  // Manual grants — admin "Grant Gold" (stripe_customer_id "comp") or receipt
  // approval (prefix "manual_") — carry is_manual = true. They have no Stripe
  // portal and may be lifetime (current_period_end = null), so the Stripe
  // "Manage" button must NOT show for them (it silently fails).
  const isManual =
    subscription?.is_manual === true ||
    subscription?.stripe_customer_id === "comp" ||
    (subscription?.stripe_customer_id?.startsWith("manual_") ?? false);
  const isLifetime = isActive && !subscription?.current_period_end;
  const planLabel =
    subscription?.plan_code === "doctor_gold_yearly"
      ? t("Gold (Yearly)", "الخطة الذهبية — سنوي")
      : subscription?.plan_code === "doctor_gold_monthly"
      ? t("Gold", "الخطة الذهبية")
      : subscription?.plan_code === "doctor_pro_plus_monthly"
      ? t("Doctor Pro+", "طبيب برو+")
      : subscription?.plan_code === "doctor_pro_monthly"
      ? t("Doctor Pro", "طبيب برو")
      : isActive
      ? t("Gold", "الخطة الذهبية")
      : t("Free plan", "الخطة المجانية");

  return (
    <Shell>
      <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">{t("Billing & Subscription", "الفواتير والاشتراك")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("Manage your plan, payment method, and download invoices.", "إدارة خطتك، طريقة الدفع، وتنزيل الفواتير.")}
        </p>
      </div>

      {/* Subscription card */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isActive ? "bg-teal/10 text-teal" : "bg-muted text-muted-foreground"}`}>
              {isActive ? <CheckCircle2 className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{planLabel}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {!isActive
                  ? t("No active subscription.", "لا يوجد اشتراك مفعّل.")
                  : isLifetime
                  ? t("Lifetime access — never expires.", "اشتراك دائم — مدى الحياة، لا ينتهي.")
                  : subscription?.cancel_at_period_end
                  ? t(`Cancels on ${periodEnd}`, `يُلغى في ${periodEnd}`)
                  : t(`Renews on ${periodEnd}`, `يتجدد في ${periodEnd}`)}
              </p>
              {subscription?.status === "past_due" && (
                <p className="mt-1 text-sm text-amber-600">
                  {t("Payment failed — please update your card.", "فشل الدفع — يُرجى تحديث بطاقتك.")}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isManual ? (
              <span className="inline-flex items-center gap-2 rounded-lg bg-teal/10 px-4 py-2 text-sm font-medium text-teal">
                <CheckCircle2 className="h-4 w-4" />
                {t("Activated by Tebana admin", "مُفعّل من إدارة طبانا")}
              </span>
            ) : subscription ? (
              <button
                onClick={handleManage}
                disabled={portalLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
                {t("Manage subscription", "إدارة الاشتراك")}
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </button>
            ) : (
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t("Upgrade plan", "ترقية الخطة")}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Invoices */}
      <div className="mt-8">
        <h2 className="mb-4 text-xl font-semibold text-foreground">{t("Invoices", "الفواتير")}</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {invoicesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !invoices || invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/60" />
              <p className="mt-3 text-sm text-muted-foreground">
                {t("No invoices yet.", "لا توجد فواتير بعد.")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium">{t("Invoice #", "رقم الفاتورة")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("Description", "البيان")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("Date", "التاريخ")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("Amount", "المبلغ")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("Status", "الحالة")}</th>
                    <th className="px-4 py-3 text-end font-medium">{t("PDF", "PDF")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs text-foreground">#{inv.number}</td>
                      <td className="px-4 py-3 text-foreground">{inv.description ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.issued_at, t)}</td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {formatMoney(inv.amount_cents, inv.currency)}
                      </td>
                      <td className="px-4 py-3">{statusBadge(inv.status, t)}</td>
                      <td className="px-4 py-3 text-end">
                        {inv.pdf_url ? (
                          <a
                            href={inv.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t(
            "Note: Egyptian Tax Authority (ETA) e-invoicing is not yet automated. Stripe PDF receipts above serve as proof of payment.",
            "ملاحظة: الفوترة الإلكترونية لمصلحة الضرائب المصرية (ETA) غير مفعّلة آلياً بعد. إيصالات Stripe بصيغة PDF أعلاه تُستخدم كإثبات للدفع.",
          )}
        </p>
      </div>
    </div>
    </Shell>
  );
}
