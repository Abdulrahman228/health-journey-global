import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { UserCheck, Loader2, ShieldCheck, LogIn, AlertTriangle, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";

export const Route = createFileRoute("/claim/$token")({
  component: ClaimPage,
  head: () => ({ meta: [{ title: "استلام ملفك الطبي — Tebana" }] }),
});

interface Preview {
  doctor_name: string | null;
  patient_name: string | null;
  valid: boolean;
}

const ERROR_AR: Record<string, string> = {
  invalid_or_expired: "هذا الرابط غير صالح أو منتهي الصلاحية.",
  already_claimed: "تم استلام هذا الملف بالفعل بحساب آخر.",
  account_has_history: "حسابك الحالي يحتوي على سجل طبي. تواصل مع الدعم لدمج الحسابات بأمان.",
  not_authenticated: "برجاء تسجيل الدخول أولاً.",
  doctor_account: "هذا الرابط مخصص للمرضى — سجّل الدخول بحساب المريض صاحب الرقم.",
};

// Optional store links (set VITE_APP_STORE_URL / VITE_PLAY_STORE_URL to show them).
const APP_STORE_URL = (import.meta.env.VITE_APP_STORE_URL as string | undefined) || "";
const PLAY_STORE_URL = (import.meta.env.VITE_PLAY_STORE_URL as string | undefined) || "";

function AppBadges({ t }: { t: (en: string, ar: string) => string }) {
  if (!APP_STORE_URL && !PLAY_STORE_URL) return null;
  return (
    <div className="mt-5 rounded-xl border border-border bg-muted/40 p-3">
      <p className="mb-2 flex items-center justify-center gap-1.5 text-xs font-medium text-foreground">
        <Smartphone className="h-4 w-4 text-primary" aria-hidden="true" />
        {t("Get the app to follow your care anywhere", "حمّل التطبيق لمتابعة رعايتك في أي وقت")}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {PLAY_STORE_URL && (
          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Google Play
          </a>
        )}
        {APP_STORE_URL && (
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            App Store
          </a>
        )}
      </div>
    </div>
  );
}

function ClaimPage() {
  const { token } = Route.useParams();
  const { t } = useLanguage();
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("preview_claim", { p_token: token });
      setPreview((data?.[0] as Preview) ?? null);
      setLoading(false);
    })();
  }, [token]);

  // Signed in with the same verified phone? The profile was adopted
  // automatically at sign-up (adopt_managed_profile_by_phone); claiming the
  // token is then a no-op that confirms ownership — do it silently.
  useEffect(() => {
    if (isLoading || loading || !isAuthenticated || !preview || preview.valid || done) return;
    (async () => {
      const { data, error: rpcErr } = await supabase.rpc("claim_managed_profile", {
        p_token: token,
      });
      if (!rpcErr && data) setDone(true);
    })();
  }, [isLoading, loading, isAuthenticated, preview, token, done]);

  const handleClaim = async () => {
    setClaiming(true);
    setError(null);
    const { error: rpcErr } = await supabase.rpc("claim_managed_profile", { p_token: token });
    setClaiming(false);
    if (rpcErr) {
      setError(ERROR_AR[rpcErr.message] ?? rpcErr.message);
      return;
    }
    setDone(true);
    // give useAuth a moment, then send them to their records
    setTimeout(() => navigate({ to: "/profile/medical-history" }), 1500);
  };

  const loginHref = `/login?redirect=${encodeURIComponent(`/claim/${token}`)}`;
  const signupHref = `/signup?redirect=${encodeURIComponent(`/claim/${token}`)}`;

  if (loading || isLoading) {
    return (
      <div className="mx-auto flex max-w-md items-center justify-center px-4 py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const invalid = !preview || !preview.valid;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {done ? (
          <>
            <ShieldCheck className="mx-auto h-14 w-14 text-emerald-500" />
            <h1 className="mt-4 text-2xl font-bold text-foreground">
              {t("Linked!", "تم الاستلام!")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Your profile and full medical history are now on your account.",
                "تم ربط ملفك وكامل تاريخك الطبي بحسابك.",
              )}
            </p>
            <AppBadges t={t} />
          </>
        ) : invalid ? (
          <>
            <AlertTriangle className="mx-auto h-14 w-14 text-amber-500" />
            <h1 className="mt-4 text-xl font-bold text-foreground">
              {t("Link unavailable", "الرابط غير متاح")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "This invitation is invalid, expired, or already used.",
                "هذه الدعوة غير صالحة أو منتهية أو مُستخدمة بالفعل.",
              )}
            </p>
            <Link
              to="/"
              className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
            >
              {t("Go to home", "الذهاب للرئيسية")}
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <UserCheck className="h-7 w-7 text-primary" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-foreground">
              {t("You've been registered", "تم تسجيلك")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {preview?.doctor_name
                ? t(
                    `Dr. ${preview.doctor_name} registered you on Tebana. Claim your profile to keep your visits, prescriptions and results.`,
                    `قام د. ${preview.doctor_name} بتسجيلك على طبانا. استلم ملفك لتحتفظ بزياراتك ووصفاتك ونتائجك.`,
                  )
                : t(
                    "Claim your profile to keep your medical history.",
                    "استلم ملفك لتحتفظ بتاريخك الطبي.",
                  )}
            </p>
            {!isAuthenticated && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t(
                  "Tip: sign up with the mobile number your doctor has for you and the file links automatically.",
                  "نصيحة: سجّل برقم الموبايل المسجّل لدى طبيبك وسيُربط ملفك تلقائياً.",
                )}
              </p>
            )}
            {preview?.patient_name && (
              <p className="mt-1 text-sm font-medium text-foreground">{preview.patient_name}</p>
            )}

            {error && (
              <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            )}

            {isAuthenticated ? (
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {claiming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {t("Claim my profile", "استلام ملفي")}
              </button>
            ) : (
              <div className="mt-6 space-y-2">
                <a
                  href={signupHref}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <UserCheck className="h-4 w-4" />
                  {t("Create account & claim", "إنشاء حساب واستلام")}
                </a>
                <a
                  href={loginHref}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent"
                >
                  <LogIn className="h-4 w-4" />
                  {t("I already have an account", "لدي حساب بالفعل")}
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
