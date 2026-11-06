/**
 * Phone-number sign-in / sign-up with a one-time code.
 *
 * Step 1  the person enters their mobile number (Egyptian local format or
 *         international) → supabase.auth.signInWithOtp()
 * Step 2  they enter the 6-digit code they received (WhatsApp or SMS, chosen
 *         by the auth-send-sms hook) → supabase.auth.verifyOtp()
 * Step 3  bootstrapPhoneUser() creates profile / role / details for a new
 *         account and, for patients, adopts the profile a doctor registered
 *         under the same number — the caller decides where to go next.
 */
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Phone, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapPhoneUser } from "@/lib/auth.functions";
import { useLanguage } from "@/hooks/useLanguage";
import { formatPhoneForDisplay, normalizePhone } from "@/lib/phone";

export type PhoneBootstrapResult = {
  success: boolean;
  isNew: boolean;
  role: "doctor" | "patient";
  /** Every role the account holds (multi-role users: doctor+admin, lab, …). */
  roles: string[];
  adopted: boolean;
  doctors: string[];
};

type Props = {
  mode: "signin" | "signup";
  /** signup only: who the person is registering as */
  role?: "doctor" | "patient";
  fullName?: string;
  city?: string;
  /** Called after the session exists AND the account is bootstrapped. */
  onDone: (result: PhoneBootstrapResult) => void | Promise<void>;
  /** signup: the parent validates name etc. before we send a code */
  beforeSend?: () => boolean;
  submitLabel?: { en: string; ar: string };
};

const RESEND_SECONDS = 45;

function mapAuthError(message: string, t: (en: string, ar: string) => string): string {
  const m = message.toLowerCase();
  if (
    m.includes("invalid_phone") ||
    m.includes("phone_not_verified") ||
    m.includes("invalid phone")
  )
    return t(
      "This mobile number could not be verified — check it and try again.",
      "تعذّر التحقق من رقم الموبايل — راجعه وحاول مرة أخرى.",
    );
  if (m.includes("signups not allowed") || m.includes("user not found"))
    return t(
      "No account with this number — create one first.",
      "لا يوجد حساب بهذا الرقم — أنشئ حساباً أولاً.",
    );
  if (m.includes("expired") || m.includes("invalid"))
    return t("The code is wrong or has expired.", "الرمز غير صحيح أو انتهت صلاحيته.");
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes"))
    return t("Too many attempts — try again in a minute.", "محاولات كثيرة — حاول بعد دقيقة.");
  if (
    m.includes("sms_provider_not_configured") ||
    m.includes("error sending sms") ||
    m.includes("hook")
  )
    return t(
      "Code delivery is not available right now. Use e-mail sign-in or try again later.",
      "تعذّر إرسال الرمز حالياً. استخدم الدخول بالبريد أو حاول لاحقاً.",
    );
  if (m.includes("already registered") || m.includes("already exists"))
    return t(
      "This number is already registered — sign in instead.",
      "هذا الرقم مسجّل بالفعل — سجّل الدخول.",
    );
  if (m.includes("failed to fetch") || m.includes("network"))
    return t("No internet connection — try again.", "لا يوجد اتصال بالإنترنت — حاول مرة أخرى.");
  return t(message, "حدث خطأ غير متوقع — حاول مرة أخرى.");
}

export function PhoneOtpForm({
  mode,
  role,
  fullName,
  city,
  onDone,
  beforeSend,
  submitLabel,
}: Props) {
  const { t } = useLanguage();
  const bootstrap = useServerFn(bootstrapPhoneUser);
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [verified, setVerified] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const sendCode = async (target: string) => {
    setBusy(true);
    setError("");
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      phone: target,
      options: {
        shouldCreateUser: mode === "signup",
        ...(mode === "signup"
          ? {
              data: { full_name: fullName ?? "", signup_role: role ?? "patient", city: city ?? "" },
            }
          : {}),
      },
    });
    setBusy(false);
    if (otpErr) {
      setError(mapAuthError(otpErr.message, t));
      return false;
    }
    setCooldown(RESEND_SECONDS);
    return true;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (beforeSend && !beforeSend()) return;
    const target = normalizePhone(phoneInput);
    if (!target) {
      setError(
        t(
          "Enter a valid mobile number (e.g. 010XXXXXXXX).",
          "أدخل رقم موبايل صحيح (مثال: 010XXXXXXXX).",
        ),
      );
      return;
    }
    setPhoneE164(target);
    if (await sendCode(target)) {
      setCode("");
      setStep("code");
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneE164) return;
    const token = code.replace(/\D/g, "");
    if (token.length < 6) {
      setError(t("Enter the 6-digit code.", "أدخل الرمز المكوّن من 6 أرقام."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      // The code is single-use: if a previous attempt verified it but the
      // bootstrap call failed, retry only the bootstrap with the live session.
      if (!verified) {
        const { error: vErr } = await supabase.auth.verifyOtp({
          phone: phoneE164,
          token,
          type: "sms",
        });
        if (vErr) throw vErr;
        setVerified(true);
      }
      const result: PhoneBootstrapResult = await bootstrap({
        data: {
          ...(mode === "signup"
            ? { role, fullName: fullName?.trim() || undefined, city: city?.trim() || undefined }
            : {}),
        },
      });
      await onDone(result);
    } catch (err) {
      setError(mapAuthError(err instanceof Error ? err.message : String(err), t));
      setBusy(false);
    }
  };

  if (step === "code") {
    return (
      <form onSubmit={handleVerify} className="space-y-4" noValidate>
        {error && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t("We sent a 6-digit code to", "أرسلنا رمزاً من 6 أرقام إلى")}{" "}
          <span className="font-semibold text-foreground" dir="ltr">
            {formatPhoneForDisplay(phoneE164)}
          </span>{" "}
          {t("(WhatsApp or SMS).", "(واتساب أو SMS).")}
          <button
            type="button"
            onClick={() => {
              setStep("phone");
              setError("");
              setVerified(false);
            }}
            className="ms-2 font-medium text-primary hover:underline"
          >
            {t("Change number", "تغيير الرقم")}
          </button>
        </div>
        <div>
          <label htmlFor="otp-code" className="mb-1.5 block text-sm font-medium text-foreground">
            {t("Verification code", "رمز التحقق")}
          </label>
          <input
            id="otp-code"
            ref={codeRef}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            dir="ltr"
            className="w-full rounded-lg border border-input bg-background py-3 text-center font-mono text-2xl tracking-[0.5em] text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="••••••"
          />
        </div>
        <button
          type="submit"
          disabled={busy || code.length < 6}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          {busy ? t("Verifying...", "جارٍ التحقق...") : t("Confirm", "تأكيد")}
        </button>
        <div className="text-center text-xs text-muted-foreground">
          {cooldown > 0 ? (
            <span>
              {t("Resend code in", "إعادة الإرسال بعد")} {cooldown} {t("s", "ث")}
            </span>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => phoneE164 && sendCode(phoneE164)}
              className="font-medium text-primary hover:underline disabled:opacity-50"
            >
              {t("Resend code", "إعادة إرسال الرمز")}
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSend} className="space-y-4" noValidate>
      {error && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="otp-phone" className="mb-1.5 block text-sm font-medium text-foreground">
          {t("Mobile number", "رقم الموبايل")}
        </label>
        <div className="relative">
          <Phone className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="otp-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            dir="ltr"
            className="w-full rounded-lg border border-input bg-background py-2.5 pe-4 ps-10 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="010 1234 5678"
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "We'll send a one-time code by WhatsApp or SMS.",
            "سنرسل لك رمزاً لمرة واحدة عبر واتساب أو SMS.",
          )}
        </p>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy
          ? t("Sending code...", "جارٍ إرسال الرمز...")
          : submitLabel
            ? t(submitLabel.en, submitLabel.ar)
            : t("Send code", "إرسال الرمز")}
      </button>
    </form>
  );
}
