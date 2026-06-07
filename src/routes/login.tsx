import { createFileRoute, Link } from "@tanstack/react-router";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { HeartPulse, Mail, Lock, Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

type LoginForm = z.infer<typeof loginSchema>;
const OAUTH_CALLBACK_PATH = "/auth/callback";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Tabibi" },
      { name: "description", content: "Sign in to your Tabibi account to manage your health." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    setIsLoading(false);

    if (signInError) {
      setError(signInError.message);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError("");
    const redirectTo = `${window.location.origin}${OAUTH_CALLBACK_PATH}`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setIsLoading(false);
    }
  };

  if (isAuthenticated) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <div className="text-center">
          <p className="text-muted-foreground">{t("You are already signed in", "أنت مسجل الدخول بالفعل")}</p>
          <Link to="/" className="mt-4 inline-block text-primary hover:underline">
            {t("Go to home", "الذهاب للرئيسية")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-primary to-teal">
              <HeartPulse className="h-5 w-5 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-foreground">Tabibi</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-foreground">
            {t("Welcome back", "مرحباً بعودتك")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Sign in to continue your healthcare journey", "سجل الدخول لمتابعة رحلتك الصحية")}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {t("Email", "البريد الإلكتروني")}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  {...register("email")}
                  className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-4 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder={t("your@email.com", "بريدك@email.com")}
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {t("Password", "كلمة المرور")}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  {...register("password")}
                  className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-10 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder={t("Enter your password", "أدخل كلمة المرور")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
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

          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {t("Sign in with Google", "تسجيل الدخول بـ Google")}
          </button>

        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("Don't have an account?", "ليس لديك حساب؟")}{" "}
          <Link to="/signup" className="font-medium text-primary hover:text-primary/80">
            {t("Sign up", "إنشاء حساب")}
          </Link>
        </p>
      </div>
    </div>
  );
}
