/**
 * "Pay online" (card / Vodafone Cash / Fawry through Paymob) for an
 * appointment. Rendered only when VITE_PAYMOB_ENABLED="true" — i.e. after the
 * Paymob merchant account exists and the edge-function secrets are set.
 *
 * Flow: paymob-initiate → hosted checkout URL → Paymob calls paymob-webhook
 * → appointment marked paid (same state as the manual-transfer confirmation).
 */
import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";

export const PAYMOB_ENABLED =
  (import.meta.env.VITE_PAYMOB_ENABLED as string | undefined) === "true";

export function PaymobPayButton({
  appointmentId,
  amount,
}: {
  appointmentId: string;
  amount?: number;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  if (!PAYMOB_ENABLED) return null;

  const pay = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("paymob-initiate", {
        body: { kind: "appointment", appointmentId },
      });
      if (error) {
        // The edge fn answers non-2xx with { error: "<English code>" }.
        let code = "";
        if (error instanceof FunctionsHttpError) {
          try {
            const body: unknown = await error.context.json();
            if (body && typeof body === "object" && "error" in body) code = String(body.error);
          } catch {
            /* non-JSON body */
          }
        }
        throw new Error(code || error.message);
      }
      const url = (data as { url?: string } | null)?.url;
      if (!url) throw new Error("no_checkout_url");
      window.location.href = url;
    } catch (e) {
      console.error("[paymob] initiate failed", e);
      const code = e instanceof Error ? e.message : "";
      const messages: Record<string, string> = {
        "Already paid": t("This appointment is already paid", "هذا الموعد مدفوع بالفعل"),
        "Appointment is not payable": t(
          "This appointment can no longer be paid",
          "لا يمكن دفع هذا الموعد (ملغي أو منتهي)",
        ),
        "Appointment has no payable fee": t(
          "Nothing to pay for this appointment",
          "لا يوجد مبلغ مستحق لهذا الموعد",
        ),
        "Appointment not found": t("Appointment not found", "الموعد غير موجود"),
        Unauthorized: t("Please sign in first", "يجب تسجيل الدخول أولاً"),
        "Paymob is not configured yet.": t(
          "Online payment is not available yet",
          "الدفع الإلكتروني غير متاح حاليًا",
        ),
      };
      toast.error(
        messages[code] ?? t("Could not start payment, please try again", "تعذّر بدء الدفع، حاول مرة أخرى"),
      );
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={pay}
      disabled={busy}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60 sm:w-auto"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
      {busy
        ? t("Opening secure checkout…", "جارٍ فتح صفحة الدفع الآمنة…")
        : amount
          ? t(
              `Pay ${amount} EGP online (card / wallet)`,
              `ادفع ${amount} ج.م أونلاين (بطاقة / محفظة)`,
            )
          : t("Pay online (card / wallet)", "ادفع أونلاين (بطاقة / محفظة)")}
    </button>
  );
}
