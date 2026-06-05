/**
 * PaymentMethodsCard — manual payment options for Egypt:
 *   • InstaPay (QR + handle + direct link)
 *   • Vodafone Cash
 *   • Bank account number
 * QR is rendered client-side from the InstaPay URL using the existing
 * `qrcode` dependency, so no static image is needed.
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Check, ExternalLink, Smartphone, Building2 } from "lucide-react";

const INSTAPAY_HANDLE = "nagahakl@instapay";
const INSTAPAY_URL = "https://ipn.eg/S/nagahakl/instapay/2Wpf6F";
const VODAFONE_NUMBER = "01094898229";
const BANK_ACCOUNT = "9983011569787801013";

interface Props {
  language: "ar" | "en";
  isRTL: boolean;
  amount?: number;
  currency?: string;
  reference?: string;
  /** Optional text shown above the card (e.g. "After paying, send the receipt to WhatsApp"). */
  helpText?: string;
}

export function PaymentMethodsCard({
  language,
  isRTL,
  amount,
  currency = "EGP",
  reference,
  helpText,
}: Props) {
  const t = (en: string, ar: string) => (language === "ar" ? ar : en);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(INSTAPAY_URL, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 240,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, []);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <section
      dir={isRTL ? "rtl" : "ltr"}
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
      aria-label={t("Manual payment methods", "طرق الدفع اليدوية")}
    >
      <header className="mb-4">
        <h2 className="text-xl font-bold text-foreground">
          {t("Pay manually", "ادفع يدوياً")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Choose any of the methods below. After paying, send the receipt to confirm.",
            "اختر أي طريقة من الطرق التالية. بعد الدفع، أرسل صورة الإيصال لتأكيد الحجز.",
          )}
        </p>
        {(amount || reference) && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {amount ? (
              <span className="rounded-lg bg-primary/10 px-3 py-1 font-semibold text-primary">
                {t("Amount", "المبلغ")}: {amount.toLocaleString()} {currency}
              </span>
            ) : null}
            {reference ? (
              <span className="rounded-lg bg-muted px-3 py-1 text-foreground">
                {t("Reference", "رقم المرجع")}: {reference}
              </span>
            ) : null}
          </div>
        )}
        {helpText && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {helpText}
          </p>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {/* InstaPay */}
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-950/40">
              <Smartphone className="h-5 w-5" />
            </span>
            <h3 className="text-base font-semibold text-foreground">InstaPay</h3>
          </div>

          {qrDataUrl ? (
            <div className="mb-3 flex justify-center rounded-lg bg-white p-3">
              <img
                src={qrDataUrl}
                alt={t(
                  "InstaPay QR code — scan with your banking app",
                  "كود InstaPay — امسح بكاميرا تطبيق البنك",
                )}
                className="h-48 w-48"
                width={192}
                height={192}
              />
            </div>
          ) : (
            <div className="mb-3 flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
              {t("Generating QR…", "جارٍ توليد الكود…")}
            </div>
          )}

          <div className="space-y-2">
            <FieldRow
              label={t("Handle", "اسم المستخدم")}
              value={INSTAPAY_HANDLE}
              copied={copied === "handle"}
              onCopy={() => copy("handle", INSTAPAY_HANDLE)}
              t={t}
            />
            <a
              href={INSTAPAY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-700"
            >
              <ExternalLink className="h-4 w-4" />
              {t("Pay via InstaPay link", "ادفع مباشرة عبر رابط InstaPay")}
            </a>
          </div>
        </div>

        {/* Vodafone Cash + Bank */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-950/40">
                <Smartphone className="h-5 w-5" />
              </span>
              <h3 className="text-base font-semibold text-foreground">
                {t("Vodafone Cash", "فودافون كاش")}
              </h3>
            </div>
            <FieldRow
              label={t("Wallet number", "رقم المحفظة")}
              value={VODAFONE_NUMBER}
              copied={copied === "vf"}
              onCopy={() => copy("vf", VODAFONE_NUMBER)}
              t={t}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "Open Vodafone Cash → Send Money → enter the number above.",
                "افتح فودافون كاش ← تحويل أموال ← أدخل الرقم أعلاه.",
              )}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/40">
                <Building2 className="h-5 w-5" />
              </span>
              <h3 className="text-base font-semibold text-foreground">
                {t("Bank account", "حساب بنكي")}
              </h3>
            </div>
            <FieldRow
              label={t("Account number", "رقم الحساب")}
              value={BANK_ACCOUNT}
              copied={copied === "bank"}
              onCopy={() => copy("bank", BANK_ACCOUNT)}
              t={t}
              mono
            />
          </div>
        </div>
      </div>

      <footer className="mt-5 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
        {t(
          "After payment, please send the receipt screenshot via WhatsApp or to the support email so we can confirm your booking.",
          "بعد إتمام الدفع، أرسل صورة من إيصال التحويل عبر واتساب أو على بريد الدعم لتأكيد حجزك.",
        )}
      </footer>
    </section>
  );
}

function FieldRow({
  label,
  value,
  copied,
  onCopy,
  t,
  mono = false,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  t: (en: string, ar: string) => string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className={`truncate text-sm font-semibold text-foreground ${
            mono ? "font-mono tracking-tight" : ""
          }`}
          dir="ltr"
        >
          {value}
        </div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
        aria-label={t("Copy", "نسخ")}
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-green-600" />
            {t("Copied", "تم النسخ")}
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            {t("Copy", "نسخ")}
          </>
        )}
      </button>
    </div>
  );
}

export default PaymentMethodsCard;
