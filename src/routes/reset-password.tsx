/**
 * /reset-password — destination page after the user clicks the reset link.
 *
 * Supabase delivers a session via URL hash (`#access_token=...&type=recovery`).
 * Our `supabase` client picks it up automatically (detectSessionInUrl=true);
 * we then call `supabase.auth.updateUser({ password })` to set the new one.
 *
 * The session granted here is short-lived and intended for password update
 * only — we sign the user out after success so they re-login normally.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { siteConfig } from "@/lib/seo";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, Lock, ShieldAlert } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";

const formSchema = z
  .object({
    password: z
      .string()
      .min(10, "Password must be at least 10 characters")
      .regex(/[A-Za-z]/, "Password must contain a letter")
      .regex(/[0-9]/, "Password must contain a digit"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

type FormValues = z.infer<typeof formSchema>;

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Reset Password — Tebana" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState<"checking" | "yes" | "no">(
    "checking",
  );
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      // 1) Our own reset link: ?token_hash=…&type=recovery → verify it here.
      //    (The PKCE browser client rejects the implicit #access_token redirect
      //    that GoTrue's /verify sends for admin-generated links.)
      const tokenHash = query.get("token_hash");
      if (tokenHash) {
        const { data, error: vErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        window.history.replaceState(null, "", window.location.pathname);
        if (cancelled) return;
        setHasRecoverySession(!vErr && data.session ? "yes" : "no");
        return;
      }
      // 2) Legacy link that landed with #access_token=…&refresh_token=….
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        const { data, error: sErr } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        window.history.replaceState(null, "", window.location.pathname);
        if (cancelled) return;
        setHasRecoverySession(!sErr && data.session ? "yes" : "no");
        return;
      }
      // 3) Wait briefly for detectSessionInUrl to populate the session.
      let session = (await supabase.auth.getSession()).data.session;
      for (let i = 0; i < 12 && !session; i += 1) {
        await new Promise((r) => setTimeout(r, 250));
        session = (await supabase.auth.getSession()).data.session;
      }
      if (cancelled) return;
      setHasRecoverySession(session ? "yes" : "no");
    };
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({
        password: values.password,
      });
      if (updateErr) {
        const m = updateErr.message.toLowerCase();
        setError(
          m.includes("different from the old") || m.includes("same password")
            ? t(
                "The new password must be different from the old one.",
                "كلمة المرور الجديدة يجب أن تختلف عن القديمة.",
              )
            : m.includes("session") || m.includes("jwt") || m.includes("expired")
              ? t(
                  "The reset link has expired — request a new one.",
                  "انتهت صلاحية رابط إعادة التعيين — اطلب رابطاً جديداً.",
                )
              : m.includes("weak") || m.includes("password")
                ? t(
                    "This password is too weak — choose a stronger one.",
                    "كلمة المرور ضعيفة — اختر كلمة أقوى.",
                  )
                : t(updateErr.message, "تعذّر تغيير كلمة المرور — حاول مرة أخرى."),
        );
        return;
      }
      // Sign out so the user re-authenticates with the new password.
      await supabase.auth.signOut();
      setDone(true);
      setTimeout(() => navigate({ to: "/login" }), 2500);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <img
              src="/logo-mark.png"
              alt={`${siteConfig.brand.ar} ${siteConfig.brand.en}`}
              className="h-10 w-10 rounded-xl object-cover"
            />
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {siteConfig.brand.en}
            </span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-foreground">
            {t("New password", "كلمة مرور جديدة")}
          </h1>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {hasRecoverySession === "checking" && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {hasRecoverySession === "no" && (
            <div className="space-y-4 text-center">
              <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {t(
                  "This reset link is invalid or has expired. Please request a new one.",
                  "هذا الرابط غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً.",
                )}
              </p>
              <Link
                to="/forgot-password"
                className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {t("Request new link", "طلب رابط جديد")}
              </Link>
            </div>
          )}

          {hasRecoverySession === "yes" && done && (
            <div
              role="status"
              className="rounded-lg bg-emerald-50 px-4 py-4 text-center text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
            >
              {t(
                "Password updated. Redirecting to sign in…",
                "تم تحديث كلمة المرور. جارِ التحويل لتسجيل الدخول…",
              )}
            </div>
          )}

          {hasRecoverySession === "yes" && !done && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("New password", "كلمة المرور الجديدة")}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    {...register("password")}
                    className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-10 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-xs text-destructive">
                    {t(
                      "At least 10 characters, with letters and numbers.",
                      "10 أحرف على الأقل وتحتوي على حروف وأرقام.",
                    )}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("Confirm new password", "تأكيد كلمة المرور")}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    {...register("confirmPassword")}
                    className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-4 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="mt-1 text-xs text-destructive">
                    {t("Passwords don't match.", "كلمتا المرور غير متطابقتين.")}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting
                  ? t("Updating...", "جاري التحديث...")
                  : t("Update password", "تحديث كلمة المرور")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
