/**
 * /forgot-password — request a password reset link.
 *
 * Submits to the `requestPasswordReset` server function which generates
 * a Supabase recovery link and emails it via Resend (Arabic template).
 *
 * Always shows the same "if the email exists, we've sent…" success message
 * regardless of whether the email is registered, to avoid user enumeration.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { HeartPulse, Loader2, Mail } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { requestPasswordReset } from "@/lib/auth.functions";

const formSchema = z.object({
  email: z.string().email(),
});

type FormValues = z.infer<typeof formSchema>;

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot Password — Tabibi" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useLanguage();
  const submit = useServerFn(requestPasswordReset);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined;
      await submit({ data: { email: values.email, redirectTo } });
    } catch {
      // Server fn always returns ok; ignore network blips silently.
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-primary to-teal">
              <HeartPulse className="h-5 w-5 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-foreground">
              Tabibi
            </span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-foreground">
            {t("Forgot password", "نسيت كلمة المرور")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "We'll email you a link to reset your password.",
              "هنبعتلك رابط لإعادة تعيين كلمة المرور على بريدك.",
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {submitted ? (
            <div className="space-y-4 text-center">
              <div
                role="status"
                className="rounded-lg bg-emerald-50 px-4 py-4 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
              >
                {t(
                  "If an account with that email exists, we've sent a reset link. Check your inbox (and spam folder).",
                  "لو عندك حساب بهذا البريد، تم إرسال رابط إعادة التعيين. راجع البريد الوارد (وسبام).",
                )}
              </div>
              <Link
                to="/login"
                className="inline-block text-sm font-medium text-primary hover:text-primary/80"
              >
                {t("Back to sign in", "العودة لتسجيل الدخول")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("Email", "البريد الإلكتروني")}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    autoComplete="email"
                    {...register("email")}
                    className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-4 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder={t("your@email.com", "بريدك@email.com")}
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading
                  ? t("Sending...", "جاري الإرسال...")
                  : t("Send reset link", "إرسال رابط إعادة التعيين")}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("Remembered your password?", "تذكرت كلمة المرور؟")}{" "}
          <Link
            to="/login"
            className="font-medium text-primary hover:text-primary/80"
          >
            {t("Sign in", "تسجيل الدخول")}
          </Link>
        </p>
      </div>
    </div>
  );
}
