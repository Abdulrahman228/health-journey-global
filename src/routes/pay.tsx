import { createFileRoute } from "@tanstack/react-router";
import { useLanguage } from "@/hooks/useLanguage";
import { PaymentMethodsCard } from "@/components/payments/PaymentMethodsCard";

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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <PaymentMethodsCard
        language={language === "ar" ? "ar" : "en"}
        isRTL={isRTL}
        amount={amount}
        reference={ref}
      />
    </div>
  );
}
