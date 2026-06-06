import { createFileRoute, Link } from "@tanstack/react-router";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { HeartPulse, Mail, Lock, User, Phone, MapPin, Stethoscope, UserRound, Eye, EyeOff } from "lucide-react";
import { signUpUser } from "@/lib/auth.functions";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

const signupSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email(),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128)
    .regex(/[A-Za-z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a digit"),
  phone: z.string().optional(),
  city: z.string().optional(),
  role: z.enum(["doctor", "patient"]),
});

type SignupForm = z.infer<typeof signupSchema>;
const OAUTH_CALLBACK_PATH = "/auth/callback";
const OAUTH_ROLE_KEY = "tabibi-oauth-role";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign Up — Tabibi" },
      { name: "description", content: "Create your Tabibi account and connect with trusted doctors." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { t, language } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"role" | "form">("role");
  const signUp = useServerFn(signUpUser);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { role: "patient" },
  });

  const selectedRole = watch("role");

  const onSubmit = async (data: SignupForm) => {
    setIsLoading(true);
    setError("");
    try {
      await signUp({ data });
      // Server function created the account (email pre-confirmed). Now sign in
      // the client so the session cookie is established before redirect.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (signInError) throw signInError;
      window.location.href = "/";
    } catch (e: any) {
      setError(e?.message ?? "Sign up failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsLoading(true);
    setError("");
    try {
      localStorage.setItem(OAUTH_ROLE_KEY, selectedRole);
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
        localStorage.removeItem(OAUTH_ROLE_KEY);
        throw oauthError;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign up failed");
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

  if (step === "role") {
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
              {t("Join Tabibi", "انضم لطبيبي")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("How would you like to join us?", "كيف تريد الانضمام إلينا؟")}
            </p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => {
                setValue("role", "patient");
                setStep("form");
              }}
              className={`w-full rounded-2xl border-2 p-6 text-start transition-all hover:border-primary/50 hover:bg-primary/5 ${
                selectedRole === "patient" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal/10">
                  <UserRound className="h-6 w-6 text-teal" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    {t("I'm a Patient", "أنا مريض")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("Book appointments & manage health records", "احجز مواعيد وادارء سجلاتك الصحية")}
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                setValue("role", "doctor");
                setStep("form");
              }}
              className={`w-full rounded-2xl border-2 p-6 text-start transition-all hover:border-primary/50 hover:bg-primary/5 ${
                selectedRole === "doctor" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Stethoscope className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    {t("I'm a Doctor", "أنا طبيب")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("Grow your practice & consult online", "طوّر عيادتك واستشر أونلاين")}
                  </p>
                </div>
              </div>
            </button>
          </div>
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
            {selectedRole === "doctor"
              ? t("Join as Doctor", "انضم كطبيب")
              : t("Join as Patient", "انضم كمريض")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Create your account in seconds", "أنشئ حسابك في ثوانٍ")}
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
                {t("Full Name", "الاسم الكامل")}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  {...register("fullName")}
                  className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-4 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder={t("Your full name", "اسمك الكامل")}
                />
              </div>
              {errors.fullName && (
                <p className="mt-1 text-xs text-destructive">{errors.fullName.message}</p>
              )}
            </div>

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
                  placeholder={t("Min 6 characters", "٦ أحرف على الأقل")}
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

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {t("Phone (optional)", "الهاتف (اختياري)")}
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="tel"
                  {...register("phone")}
                  className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-4 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder={t("+20 1XX XXX XXXX", "+20 1XX XXX XXXX")}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {t("City (optional)", "المدينة (اختياري)")}
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  {...register("city")}
                  className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-4 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder={t("Cairo", "القاهرة")}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading
                ? t("Creating account...", "جاري إنشاء الحساب...")
                : t("Create Account", "إنشاء الحساب")}
            </button>
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
            onClick={handleGoogleSignUp}
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {t("Sign up with Google", "التسجيل بـ Google")}
          </button>

          <button
            onClick={() => setStep("role")}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {t("Back to role selection", "العودة لاختيار الدور")}
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("Already have an account?", "لديك حساب بالفعل؟")}{" "}
          <Link to="/login" className="font-medium text-primary hover:text-primary/80">
            {t("Sign in", "تسجيل الدخول")}
          </Link>
        </p>
      </div>
    </div>
  );
}
