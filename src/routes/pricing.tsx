import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { DOCTOR_PLANS, formatEgp, annualSavingsEgp, type PlanCode } from "@/lib/plans";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "خطة جولد للأطباء - طبيبي" },
      {
        name: "description",
        content:
          "خطة جولد لطبيبي: كل المزايا الاحترافية للأطباء. اشترك شهرياً (999 ج.م) أو سنوياً (9999 ج.م) ووفّر أكثر. تجربة مجانية 30 يوماً، وألغِ في أي وقت.",
      },
    ],
  }),
});

const PAID_PLAN_CODES = new Set<PlanCode>(["doctor_gold_monthly", "doctor_gold_yearly"]);

function PricingPage() {
  const { user } = useAuth();
  const { subscription, isActive } = useSubscription(user?.id);

  // Gold Yearly is the default, pre-selected option.
  const [selected, setSelected] = useState<PlanCode>("doctor_gold_yearly");

  const selectedPlan = DOCTOR_PLANS.find((p) => p.code === selected) ?? DOCTOR_PLANS[0];
  const isCurrent = isActive && subscription?.plan_code === selectedPlan.code;
  const savings = annualSavingsEgp();

  const handleSubscribe = () => {
    if (!PAID_PLAN_CODES.has(selectedPlan.code)) return;
    // Payment flow → /pay with the plan amount + reference (the plan code is the
    // Stripe lookup key resolved server-side; the amount is derived from it).
    const params = new URLSearchParams({
      amount: String(selectedPlan.priceEgp),
      ref: selectedPlan.code,
    });
    window.location.href = `/pay?${params.toString()}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <PaymentTestModeBanner />

      <section className="border-b border-border bg-card py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
              <Sparkles className="h-3.5 w-3.5" /> خطة جولد
            </span>
            <h1 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
              كل المزايا الاحترافية في خطة واحدة
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              اختر الفوترة الشهرية أو السنوية. تجربة مجانية 30 يوماً، وألغِ في أي وقت.
            </p>
            {isActive && subscription?.plan_code && (
              <p className="mt-2 text-sm text-success">
                خطتك الحالية: <strong>{subscription.plan_code}</strong>
              </p>
            )}
          </div>

          {/* Billing-period selector (two Gold options) */}
          <div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
            {DOCTOR_PLANS.map((plan) => {
              const isSel = plan.code === selected;
              const isYearly = plan.billingPeriod === "yearly";
              return (
                <button
                  key={plan.code}
                  type="button"
                  onClick={() => setSelected(plan.code)}
                  aria-pressed={isSel}
                  className={`relative rounded-2xl border p-6 text-start transition ${
                    isSel
                      ? "border-primary bg-background shadow-xl ring-2 ring-primary/30"
                      : "border-border bg-background hover:border-primary/40 hover:shadow-md"
                  }`}
                >
                  {plan.badgeAr && (
                    <div className="absolute -top-3 start-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-bold text-white">
                      {plan.badgeAr}
                    </div>
                  )}
                  <div className="text-lg font-bold text-foreground">{plan.nameAr}</div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-foreground">
                      {formatEgp(plan.priceEgp, "en")}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {isYearly ? "ج.م / سنوياً" : "ج.م / شهرياً"}
                    </span>
                  </div>
                  {isYearly && savings > 0 && (
                    <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-sm font-semibold text-emerald-600">
                      وفّر {formatEgp(savings, "en")} ج.م سنوياً
                    </div>
                  )}
                  <span
                    className={`mt-3 flex h-5 w-5 items-center justify-center rounded-full border ${
                      isSel ? "border-primary bg-primary text-white" : "border-border"
                    }`}
                    aria-hidden="true"
                  >
                    {isSel && <CheckCircle2 className="h-4 w-4" />}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Shared Gold feature list (identical for both billing periods) */}
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-border bg-background p-8">
            <div className="text-lg font-bold text-foreground">مزايا جولد</div>
            <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              {selectedPlan.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-foreground/90">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
                  <span>{f.ar}</span>
                </li>
              ))}
            </ul>

            {isCurrent ? (
              <button
                disabled
                className="mt-8 block w-full cursor-default rounded-xl bg-muted px-4 py-3 text-center font-bold text-muted-foreground"
              >
                خطتك الحالية
              </button>
            ) : (
              <button
                onClick={handleSubscribe}
                className="mt-8 block w-full rounded-xl bg-primary px-4 py-3 text-center font-bold text-white transition hover:bg-primary/90"
              >
                {selectedPlan.ctaAr} — {formatEgp(selectedPlan.priceEgp, "en")} ج.م
              </button>
            )}
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            الأسعار شاملة جميع الضرائب المطبقة. تبدأ بتجربة مجانية 30 يوماً، ويمكنك الإلغاء في أي وقت
            من لوحة التحكم. راجع{" "}
            <Link to="/terms" className="underline">
              الشروط
            </Link>{" "}
            و{" "}
            <Link to="/privacy" className="underline">
              سياسة الخصوصية
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
