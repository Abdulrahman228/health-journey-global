import { createFileRoute } from "@tanstack/react-router";
import { useLanguage } from "@/hooks/useLanguage";
import { PaymentMethodsCard } from "@/components/payments/PaymentMethodsCard";
import { ReceiptUploadWidget } from "@/components/payments/ReceiptUploadWidget";
import { MANUAL_GOLD_PLAN_CODES, type ManualGoldPlanCode } from "@/lib/subscriptions.access";

export const Route = createFileRoute("/pay")({
  head: () => ({
    meta: [
      { title: "ادفع يدوياً — طبيبي | Manual Payment — Tabibi" },
      {
        name: "description",
        content:
          "بيانات الدفع: InstaPay، فودافون كاش، رقم الحساب البنكي. Pay manually via InstaPay, Vodafone Cash, or bank transfer.",
      },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    amount: typeof search.amount === "string" ? Number(search.amount) || undefined : undefined,
    ref: typeof search.ref === "string" ? search.ref : undefined,
  }),
  component: PayPage,
});

function PayPage() {
  const { language } = useLanguage();
  const isRTL = language === "ar";
  const { amount, ref } = Route.useSearch();

  // For subscription payments, pricing.tsx passes the plan code as `ref`. When
  // it's a Gold plan, show the receipt-upload widget so the doctor can finalize
  // the manual subscription request right here.
  const planCode = MANUAL_GOLD_PLAN_CODES.includes(ref as ManualGoldPlanCode)
    ? (ref as ManualGoldPlanCode)
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:px-6 lg:py-14">
      <PaymentMethodsCard
        language={language === "ar" ? "ar" : "en"}
        isRTL={isRTL}
        amount={amount}
        reference={ref}
      />
      {planCode && <ReceiptUploadWidget planCode={planCode} />}
    </div>
  );
}
