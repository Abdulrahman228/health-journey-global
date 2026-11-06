import { createFileRoute, Link } from "@tanstack/react-router";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { homePathForRoles, useAuth } from "@/hooks/useAuth";
import { siteConfig } from "@/lib/seo";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import { Mail, Lock, Eye, EyeOff, Phone as PhoneIcon } from "lucide-react";
import { PhoneOtpForm, type PhoneBootstrapResult } from "@/components/auth/PhoneOtpForm";
import { GoogleButton } from "@/components/auth/GoogleButton";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

type LoginForm = z.infer<typeof loginSchema>;
type Method = "phone" | "email";
const OAUTH_CALLBACK_PATH = "/auth/callback";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Tebana" },
      { name: "description", content: "Sign in to your Tebana account to manage your health." },
    ],
  }),
  component: LoginPage,
});

/** Safe relative ?redirect= target (used by the claim flow), else null. */
function safeRedirect(): string | null {
  if (typeof window === "undefined") return null;
  const rp = new URLSearchParams(window.location.search).get("redirect");
  return rp && rp.startsWith("/") && !rp.startsWith("//") ? rp : null;
}

/** Where a signed-in user lands when no redirect was requested (ALL roles). */
async function landingFor(userId: string | undefined, knownRoles?: string[]): Promise<string> {
  let roles = knownRoles;
  if (!roles && userId) {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    roles = (data ?? []).map((r) => r.role);
  }
  return homePathForRoles(roles ?? []);
}

function mapLoginError(message: string, t: (en: string, ar: string) => string): string {
  if (/email not confirmed/i.test(message))
    return t(
      "Please confirm your e-mail first (check your inbox).",
      "أكّد بريدك الإلكتروني أولاً (راجع صندوق الوارد).",
    );
  if (/invalid login credentials|invalid.*(email|password)/i.test(message))
    return t("Wrong e-mail or password.", "البريد الإلكتروني أو كلمة المرور غير صحيحة.");
  if (/rate limit|too many|security purposes/i.test(message))
    return t("Too many attempts — try again in a minute.", "محاولات كثيرة — حاول بعد دقيقة.");
  if (/failed to fetch|network/i.test(message))
    return t("No internet connection — try again.", "لا يوجد اتصال بالإنترنت — حاول مرة أخرى.");
  return t(message, "تعذّر تسجيل الدخول — حاول مرة أخرى.");
}

function LoginPage() {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [method, setMethod] = useState<Method>("phone");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // After auth, honor a safe relative ?redirect= (used by the claim flow).
  const redirectParam = safeRedirect();
  useEffect(() => {
    if (isAuthenticated && redirectParam) window.location.href = redirectParam;
  }, [isAuthenticated, redirectParam]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setError("");
    const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (signInError) {
      setIsLoading(false);
      setError(mapLoginError(signInError.message, t));
      return;
    }
    window.location.href = redirectParam ?? (await landingFor(signIn.user?.id));
  };

  const onPhoneDone = async (result: PhoneBootstrapResult) => {
    setFinishing(true);
    window.location.href = redirectParam ?? (await landingFor(undefined, result.roles));
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError("");
    const redirectTo = `${window.location.origin}${OAUTH_CALLBACK_PATH}`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, queryParams: { prompt: "select_account" } },
    });
    if (oauthError) {
      setError(mapLoginError(oauthError.message, t));
      setIsLoading(false);
    }
  };

  if (isAuthenticated && !finishing) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <div className="text-center">
          <p className="text-muted-foreground">
            {t("You are already signed in", "أنت مسجل الدخول بالفعل")}
          </p>
          <Link to="/" className="mt-4 inline-block text-primary hover:underline">
            {t("Go to home", "الذهاب للرئيسية")}
          </Link>
        </div>
      </div>
    );
  }

  const tabClass = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
      active
        ? "bg-primary text-primary-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
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
            {t("Welcome back", "مرحباً بعودتك")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Sign in to continue your healthcare journey", "سجل الدخول لمتابعة رحلتك الصحية")}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div
            className="mb-5 flex rounded-xl bg-muted p-1"
            role="tablist"
            aria-label={t("Sign-in method", "طريقة الدخول")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={method === "phone"}
              className={tabClass(method === "phone")}
              onClick={() => setMethod("phone")}
            >
              <PhoneIcon className="h-4 w-4" /> {t("Mobile number", "رقم الموبايل")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={method === "email"}
              className={tabClass(method === "email")}
              onClick={() => setMethod("email")}
            >
              <Mail className="h-4 w-4" /> {t("E-mail", "البريد الإلكتروني")}
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {method === "phone" ? (
            <PhoneOtpForm
              mode="signin"
              onDone={onPhoneDone}
              submitLabel={{ en: "Sign in", ar: "تسجيل الدخول" }}
            />
          ) : (
            <>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    {t("Email", "البريد الإلكتروني")}
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      autoComplete="email"
                      {...register("email")}
                      className="w-full rounded-lg border border-input bg-background py-2.5 pe-4 ps-10 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder={t("your@email.com", "بريدك@email.com")}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-xs text-destructive">
                      {t("Enter a valid e-mail address.", "أدخل بريداً إلكترونياً صحيحاً.")}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    {t("Password", "كلمة المرور")}
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      {...register("password")}
                      className="w-full rounded-lg border border-input bg-background py-2.5 pe-10 ps-10 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder={t("Enter your password", "أدخل كلمة المرور")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={
                        showPassword
                          ? t("Hide password", "إخفاء كلمة المرور")
                          : t("Show password", "إظهار كلمة المرور")
                      }
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1 text-xs text-destructive">
                      {t("Enter your password.", "أدخل كلمة المرور.")}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isLoading
                    ? t("Signing in...", "جاري تسجيل الدخول...")
                    : t("Sign In", "تسجيل الدخول")}
                </button>

                <div className="text-center">
                  <Link
                    to="/forgot-password"
                    className="text-xs font-medium text-primary hover:text-primary/80"
                  >
                    {t("Forgot your password?", "نسيت كلمة المرور؟")}
                  </Link>
                </div>
              </form>
            </>
          )}

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">
                {t("or continue with", "أو تابع باستخدام")}
              </span>
            </div>
          </div>

          <GoogleButton
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            label={{ en: "Sign in with Google", ar: "تسجيل الدخول بـ Google" }}
          />
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("Don't have an account?", "ليس لديك حساب؟")}{" "}
          {redirectParam ? (
            <a
              href={`/signup?redirect=${encodeURIComponent(redirectParam)}`}
              className="font-medium text-primary hover:text-primary/80"
            >
              {t("Sign up", "إنشاء حساب")}
            </a>
          ) : (
            <Link to="/signup" className="font-medium text-primary hover:text-primary/80">
              {t("Sign up", "إنشاء حساب")}
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}
