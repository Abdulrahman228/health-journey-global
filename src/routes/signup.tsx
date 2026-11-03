import { createFileRoute, Link } from "@tanstack/react-router";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import {
  Mail,
  Lock,
  User,
  Phone,
  MapPin,
  Stethoscope,
  UserRound,
  Eye,
  EyeOff,
  HeartPulse,
  ShieldCheck,
  MailCheck,
} from "lucide-react";
import { signUpUser } from "@/lib/auth.functions";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { siteConfig } from "@/lib/seo";
import { PhoneOtpForm, type PhoneBootstrapResult } from "@/components/auth/PhoneOtpForm";
import { GoogleButton } from "@/components/auth/GoogleButton";

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
type Role = "doctor" | "patient";
type Method = "phone" | "email";
const OAUTH_CALLBACK_PATH = "/auth/callback";
const OAUTH_ROLE_KEY = "tabibi-oauth-role";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign Up — Tebana" },
      {
        name: "description",
        content: "Create your Tebana account and connect with trusted doctors.",
      },
    ],
  }),
  component: SignupPage,
});

function safeRedirect(): string | null {
  if (typeof window === "undefined") return null;
  const rp = new URLSearchParams(window.location.search).get("redirect");
  return rp && rp.startsWith("/") && !rp.startsWith("//") ? rp : null;
}

const inputClass =
  "w-full rounded-lg border border-input bg-background py-2.5 pe-4 ps-10 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

function SignupPage() {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"role" | "form">("role");
  const [method, setMethod] = useState<Method>("phone");
  const [role, setRole] = useState<Role>("patient");

  // Phone sign-up fields (outside the OTP form so the two forms never nest).
  const [phoneName, setPhoneName] = useState("");
  const [phoneCity, setPhoneCity] = useState("");
  const [phoneNameError, setPhoneNameError] = useState("");
  const [phoneDone, setPhoneDone] = useState<PhoneBootstrapResult | null>(null);

  // E-mail sign-up: confirmation mail sent (when transactional e-mail is on).
  const [emailPending, setEmailPending] = useState<string | null>(null);

  const signUp = useServerFn(signUpUser);
  const redirectParam = safeRedirect();
  const loginHref = redirectParam
    ? `/login?redirect=${encodeURIComponent(redirectParam)}`
    : "/login";

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { role: "patient" },
  });

  // If already signed in, honor a safe relative ?redirect= (claim flow).
  useEffect(() => {
    if (isAuthenticated && redirectParam && !phoneDone) window.location.href = redirectParam;
  }, [isAuthenticated, redirectParam, phoneDone]);

  const chooseRole = (r: Role) => {
    setRole(r);
    setValue("role", r);
    setStep("form");
  };

  const landing = (result: PhoneBootstrapResult) => {
    if (redirectParam) return redirectParam;
    if (result.role === "doctor") return "/dashboard";
    return result.adopted ? "/profile/medical-history" : "/";
  };

  const onPhoneDone = async (result: PhoneBootstrapResult) => {
    setPhoneDone(result);
    const target = landing(result);
    // Give the person a moment to read the "linked to Dr X" confirmation.
    setTimeout(() => window.location.replace(target), result.adopted ? 3000 : 800);
  };

  const onSubmit = async (data: SignupForm) => {
    setIsLoading(true);
    setError("");
    try {
      const res = (await signUp({ data })) as {
        success: boolean;
        requiresEmailConfirmation?: boolean;
      };
      if (res.requiresEmailConfirmation) {
        setEmailPending(data.email);
        return;
      }
      // Legacy path (no transactional e-mail configured): account is already
      // confirmed — sign the client in so the session exists before redirect.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (signInError) throw signInError;
      window.location.href = redirectParam ?? (data.role === "doctor" ? "/dashboard" : "/");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign up failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsLoading(true);
    setError("");
    try {
      localStorage.setItem(OAUTH_ROLE_KEY, role);
      const redirectTo = `${window.location.origin}${OAUTH_CALLBACK_PATH}`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, queryParams: { prompt: "select_account" } },
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

  if (phoneDone) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-14 w-14 text-emerald-500" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">
            {t("Account created", "تم إنشاء حسابك")}
          </h1>
          {phoneDone.adopted ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Your medical file is now linked to your account", "تم ربط ملفك الطبي بحسابك")}
              {phoneDone.doctors.length > 0 && (
                <>
                  {" "}
                  — {t("registered by", "المسجَّل لدى")}{" "}
                  <span className="font-semibold text-foreground">
                    {phoneDone.doctors.map((d) => `د. ${d}`).join("، ")}
                  </span>
                </>
              )}
              .
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Taking you in…", "جارٍ الدخول…")}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (emailPending) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <MailCheck className="mx-auto h-14 w-14 text-primary" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">
            {t("Confirm your e-mail", "أكّد بريدك الإلكتروني")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("We sent a confirmation link to", "أرسلنا رابط التأكيد إلى")}{" "}
            <span className="font-semibold text-foreground" dir="ltr">
              {emailPending}
            </span>
            .{" "}
            {t(
              "Open it to activate your account, then sign in.",
              "افتحه لتفعيل حسابك ثم سجّل الدخول.",
            )}
          </p>
          <a
            href={loginHref}
            className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {t("Go to sign in", "الذهاب لتسجيل الدخول")}
          </a>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
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

  if (step === "role") {
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
              {t("Join Tebana", "انضم لطبانا")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("How would you like to join us?", "كيف تريد الانضمام إلينا؟")}
            </p>
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={() => chooseRole("patient")}
              className={`w-full rounded-2xl border-2 p-6 text-start transition-all hover:border-primary/50 hover:bg-primary/5 ${
                role === "patient" ? "border-primary bg-primary/5" : "border-border"
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
                    {t(
                      "Book appointments & manage health records",
                      "احجز مواعيد وأدِر سجلاتك الصحية",
                    )}
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => chooseRole("doctor")}
              className={`w-full rounded-2xl border-2 p-6 text-start transition-all hover:border-primary/50 hover:bg-primary/5 ${
                role === "doctor" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Stethoscope className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{t("I'm a Doctor", "أنا طبيب")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("Grow your practice & consult online", "طوّر عيادتك واستشر أونلاين")}
                  </p>
                </div>
              </div>
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t("Already have an account?", "لديك حساب بالفعل؟")}{" "}
            <a href={loginHref} className="font-medium text-primary hover:text-primary/80">
              {t("Sign in", "تسجيل الدخول")}
            </a>
          </p>
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-primary to-teal">
              <HeartPulse className="h-5 w-5 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {siteConfig.brand.en}
            </span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-foreground">
            {role === "doctor"
              ? t("Join as Doctor", "انضم كطبيب")
              : t("Join as Patient", "انضم كمريض")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Create your account in seconds", "أنشئ حسابك في ثوانٍ")}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div
            className="mb-5 flex rounded-xl bg-muted p-1"
            role="tablist"
            aria-label={t("Sign-up method", "طريقة التسجيل")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={method === "phone"}
              className={tabClass(method === "phone")}
              onClick={() => setMethod("phone")}
            >
              <Phone className="h-4 w-4" /> {t("Mobile number", "رقم الموبايل")}
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

          {method === "phone" ? (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="signup-name"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  {t("Full Name", "الاسم الكامل")}
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="signup-name"
                    type="text"
                    autoComplete="name"
                    value={phoneName}
                    onChange={(e) => {
                      setPhoneName(e.target.value);
                      if (phoneNameError) setPhoneNameError("");
                    }}
                    className={inputClass}
                    placeholder={t("Your full name", "اسمك الكامل")}
                  />
                </div>
                {phoneNameError && (
                  <p className="mt-1 text-xs text-destructive">{phoneNameError}</p>
                )}
              </div>
              <div>
                <label
                  htmlFor="signup-city"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  {t("City (optional)", "المدينة (اختياري)")}
                </label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="signup-city"
                    type="text"
                    autoComplete="address-level2"
                    value={phoneCity}
                    onChange={(e) => setPhoneCity(e.target.value)}
                    className={inputClass}
                    placeholder={t("Cairo", "القاهرة")}
                  />
                </div>
              </div>

              <PhoneOtpForm
                mode="signup"
                role={role}
                fullName={phoneName}
                city={phoneCity}
                beforeSend={() => {
                  if (phoneName.trim().length < 2) {
                    setPhoneNameError(t("Enter your full name.", "أدخل اسمك الكامل."));
                    return false;
                  }
                  return true;
                }}
                submitLabel={{ en: "Create account", ar: "إنشاء الحساب" }}
                onDone={onPhoneDone}
              />

              {role === "patient" && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t(
                    "Registered by your doctor? Use the same mobile number and your medical file will be linked automatically.",
                    "سجّلك طبيبك من قبل؟ استخدم نفس رقم الموبايل وسيُربط ملفك الطبي تلقائياً.",
                  )}
                </p>
              )}
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    {t("Full Name", "الاسم الكامل")}
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      autoComplete="name"
                      {...register("fullName")}
                      className={inputClass}
                      placeholder={t("Your full name", "اسمك الكامل")}
                    />
                  </div>
                  {errors.fullName && (
                    <p className="mt-1 text-xs text-destructive">{errors.fullName.message}</p>
                  )}
                </div>

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
                      className={inputClass}
                      placeholder={t("your@email.com", "بريدك@email.com")}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
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
                      autoComplete="new-password"
                      {...register("password")}
                      className={`${inputClass} pe-10`}
                      placeholder={t(
                        "Min 10 characters, letters & digits",
                        "١٠ أحرف على الأقل تشمل حروفاً وأرقاماً",
                      )}
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
                    <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    {t("Mobile number (optional)", "رقم الموبايل (اختياري)")}
                  </label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="tel"
                      autoComplete="tel"
                      dir="ltr"
                      {...register("phone")}
                      className={inputClass}
                      placeholder="010 1234 5678"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    {t("City (optional)", "المدينة (اختياري)")}
                  </label>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      autoComplete="address-level2"
                      {...register("city")}
                      className={inputClass}
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
            onClick={handleGoogleSignUp}
            disabled={isLoading}
            label={{ en: "Sign up with Google", ar: "التسجيل بـ Google" }}
          />

          <button
            type="button"
            onClick={() => setStep("role")}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {t("Back to role selection", "العودة لاختيار الدور")}
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("Already have an account?", "لديك حساب بالفعل؟")}{" "}
          <a href={loginHref} className="font-medium text-primary hover:text-primary/80">
            {t("Sign in", "تسجيل الدخول")}
          </a>
        </p>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          {t("By signing up you agree to our", "بإنشاء الحساب فإنك توافق على")}{" "}
          <Link to="/terms" className="underline hover:text-foreground">
            {t("Terms", "الشروط")}
          </Link>{" "}
          {t("and", "و")}{" "}
          <Link to="/privacy" className="underline hover:text-foreground">
            {t("Privacy Policy", "سياسة الخصوصية")}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
