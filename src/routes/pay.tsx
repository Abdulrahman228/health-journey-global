import { PaymobPayButton } from "@/components/payments/PaymobPayButton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, CalendarClock, ListChecks } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { PaymentMethodsCard } from "@/components/payments/PaymentMethodsCard";
import { ReceiptUploadWidget } from "@/components/payments/ReceiptUploadWidget";
import { AppointmentReceiptUpload } from "@/components/payments/AppointmentReceiptUpload";
import { MANUAL_GOLD_PLAN_CODES, type ManualGoldPlanCode } from "@/lib/subscriptions.access";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/pay")({
  head: () => ({
    meta: [
      { title: "ادفع يدوياً — طبانا | Manual Payment — Tebana" },
      {
        name: "description",
        content:
          "بيانات الدفع: InstaPay، فودافون كاش، رقم الحساب البنكي. Pay manually via InstaPay, Vodafone Cash, or bank transfer.",
      },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  // TanStack Router JSON-parses search values, so `?amount=750` arrives as a
  // number (and a Link with search={{ amount: 750 }} passes a number too).
  validateSearch: (search: Record<string, unknown>) => ({
    amount:
      typeof search.amount === "number" && Number.isFinite(search.amount) && search.amount > 0
        ? search.amount
        : typeof search.amount === "string"
          ? Number(search.amount) || undefined
          : undefined,
    ref:
      typeof search.ref === "string"
        ? search.ref
        : typeof search.ref === "number"
          ? String(search.ref)
          : undefined,
  }),
  component: PayPage,
});

function PayPage() {
  const { t, language } = useLanguage();
  const isRTL = language === "ar";
  const { amount, ref } = Route.useSearch();

  // For subscription payments, pricing.tsx passes the plan code as `ref`. When
  // it's a Gold plan, show the receipt-upload widget so the doctor can finalize
  // the manual subscription request right here.
  const planCode = MANUAL_GOLD_PLAN_CODES.includes(ref as ManualGoldPlanCode)
    ? (ref as ManualGoldPlanCode)
    : null;

  // Otherwise a UUID ref is an appointment payment → guide the patient on what
  // happens next (the booking already exists; this removes the dead-end).
  const isAppointment = !planCode && !!ref && /^[0-9a-f-]{36}$/i.test(ref);

  // The URL amount is only a hint — read the authoritative fee (after any
  // coupon) and payment state from the patient's own appointment row (RLS).
  const { user } = useAuth();
  const { data: appt } = useQuery({
    queryKey: ["pay-appointment", ref, user?.id],
    enabled: isAppointment && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, fee, payment_status, payment_receipt_url")
        .eq("id", ref!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const payAmount = appt ? Math.round(Number(appt.fee ?? 0)) || undefined : amount;
  const alreadyPaid = appt?.payment_status === "paid";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:px-6 lg:py-14">
      <PaymentMethodsCard
        language={language === "ar" ? "ar" : "en"}
        isRTL={isRTL}
        amount={payAmount}
        reference={ref}
      />
      {planCode && <ReceiptUploadWidget planCode={planCode} />}

      {isAppointment && (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {t("Your appointment is booked", "موعدك محجوز بالفعل ✅")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(
                  "It already appears in “My appointments”. After you transfer the amount, the payment is confirmed by our team shortly — no extra step needed.",
                  "يظهر بالفعل في «مواعيدي». بعد تحويل المبلغ، يتم تأكيد الدفع من فريقنا قريبًا — دون أي خطوة إضافية.",
                )}
              </p>
            </div>
          </div>

          {alreadyPaid ? (
            <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              {t("Payment confirmed for this appointment.", "تم تأكيد الدفع لهذا الموعد.")}
            </p>
          ) : (
            <div className="mt-5">
              <PaymobPayButton appointmentId={ref!} amount={payAmount} />
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link
              to="/appointments"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              <CalendarClock className="h-4 w-4" />
              {t("Go to my appointments", "الذهاب لمواعيدي")}
            </Link>
            <Link
              to="/my-queue/$appointmentId"
              params={{ appointmentId: ref! }}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium transition hover:bg-accent"
            >
              <ListChecks className="h-4 w-4" />
              {t("Follow the live queue", "متابعة الطابور المباشر")}
            </Link>
          </div>

          {!alreadyPaid && <AppointmentReceiptUpload appointmentId={ref!} />}
        </div>
      )}
    </div>
  );
}
