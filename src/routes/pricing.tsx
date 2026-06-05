import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { DOCTOR_PLANS, formatEgp, type PlanCode } from "@/lib/plans";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "خطط الأطباء - طبيبي" },
      {
        name: "description",
        content:
          "خطط طبيبي للأطباء: مجانى، بريميوم، وجولد. عمولة فقط على الكشف الأونلاين، الحجوزات الحضورية مجانية 100%. اشترك بالشهر وألغِ في أي وقت.",
      },
    ],
  }),
});

const PAID_PLAN_CODES = new Set<PlanCode>(["doctor_premium_monthly", "doctor_gold_monthly"]);

function PricingPage() {
  const { user } = useAuth();
  const { subscription, isActive } = useSubscription(user?.id);

  const handleSubscribe = (planCode: PlanCode) => {
    if (!PAID_PLAN_CODES.has(planCode)) return;
    const plan = DOCTOR_PLANS.find((p) => p.code === planCode);
    if (!plan) return;
    // Manual payment flow → /pay with plan amount + reference.
    const params = new URLSearchParams({
      amount: String(plan.priceEgp),
      ref: planCode,
    });
    window.location.href = `/pay?${params.toString()}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <PaymentTestModeBanner />

      <section className="border-b border-border bg-card py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
              <Sparkles className="h-3.5 w-3.5" /> خطط الأطباء
            </span>
            <h1 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
              أسعار بسيطة وشفّافة
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              ابدأ مجاناً. عمولة فقط على الكشف الأونلاين، والحجوزات الحضورية مجانية 100%.
              ارفع باقتك فقط عندما تنمو ممارستك.
            </p>
            {isActive && subscription?.plan_code && (
              <p className="mt-2 text-sm text-success">
                خطتك الحالية: <strong>{subscription.plan_code}</strong>
              </p>
            )}
          </div>

          <div className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-3">
            {DOCTOR_PLANS.map((plan) => {
              const isCurrent = isActive && subscription?.plan_code === plan.code;
              const isFree = plan.priceEgp === 0;
              return (
                <div
                  key={plan.code}
                  className={`relative rounded-2xl border p-8 transition ${
                    plan.featured
                      ? "scale-105 border-primary bg-background shadow-xl ring-2 ring-primary/20"
                      : "border-border bg-background hover:shadow-md"
                  }`}
                >
                  {plan.badgeAr && (
                    <div className="absolute -top-3 start-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-bold text-white">
                      {plan.badgeAr}
                    </div>
                  )}
                  <div className="text-lg font-bold text-foreground">{plan.nameAr}</div>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-5xl font-bold text-foreground">
                      {isFree ? "0" : formatEgp(plan.priceEgp, "en")}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {isFree ? "للأبد" : "ج.م / شهرياً"}
                    </span>
                  </div>
                  <ul className="mt-6 space-y-3 text-sm">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-foreground/90">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
                        <span>{f.ar}</span>
                      </li>
                    ))}
                  </ul>

                  {isFree ? (
                    <Link
                      to="/signup"
                      search={{ role: "doctor" }}
                      className="mt-8 block rounded-xl border border-border bg-card px-4 py-3 text-center font-bold text-foreground transition hover:bg-muted"
                    >
                      {plan.ctaAr}
                    </Link>
                  ) : isCurrent ? (
                    <button
                      disabled
                      className="mt-8 block w-full cursor-default rounded-xl bg-muted px-4 py-3 text-center font-bold text-muted-foreground"
                    >
                      خطتك الحالية
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSubscribe(plan.code)}
                      className={`mt-8 block w-full rounded-xl px-4 py-3 text-center font-bold transition ${
                        plan.featured
                          ? "bg-primary text-white hover:bg-primary/90"
                          : "border border-border bg-card text-foreground hover:bg-muted"
                      }`}
                    >
                      {plan.ctaAr}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            الأسعار شاملة جميع الضرائب المطبقة. يمكنك الإلغاء في أي وقت من لوحة التحكم. للاطلاع على
            شروط الكشف الأونلاين راجع{" "}
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
