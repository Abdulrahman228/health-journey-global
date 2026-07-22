import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BadgeCheck,
  Building2,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  Stethoscope,
  UserCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { getClaimableListing, claimDoctorProfile } from "@/lib/claim.functions";

export const Route = createFileRoute("/claim/$token")({
  head: () => ({
    meta: [
      { title: "فعّل ملفك على طبيبي — Claim your profile" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ClaimPage,
});

function ClaimPage() {
  const { token } = Route.useParams();
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const claim = useServerFn(claimDoctorProfile);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [nameSeeded, setNameSeeded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["claimable", token],
    queryFn: async () => {
      const res = await getClaimableListing({ data: { token } });
      if (res.found && !res.alreadyClaimed && res.listing && !nameSeeded) {
        setFullName(res.listing.fullName);
        setNameSeeded(true);
      }
      return res;
    },
  });

  const submit = async () => {
    setBusy(true);
    try {
      await claim({ data: { token, email: email.trim(), password, fullName: fullName.trim(), phone: phone.trim() } });
      // Establish the session so the doctor lands authenticated on verification.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      toast.success(t("Profile claimed! Let's verify your license.", "تم تفعيل ملفك! لنؤكد ترخيصك الآن."));
      if (signInErr) {
        navigate({ to: "/login" });
      } else {
        navigate({ to: "/doctor/verification" });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Invalid / expired token.
  if (!data || !data.found) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center" dir="rtl">
        <Stethoscope className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-bold">{t("Invalid claim link", "رابط غير صالح")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "This claim link is invalid or has expired. If you're a doctor, you can join directly.",
            "رابط المطالبة غير صالح أو منتهي الصلاحية. إذا كنت طبيباً يمكنك الانضمام مباشرةً.",
          )}
        </p>
        <Link
          to="/join-doctor"
          className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {t("Join as a doctor", "انضم كطبيب")}
        </Link>
      </div>
    );
  }

  // Already claimed by someone.
  if (data.alreadyClaimed) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center" dir="rtl">
        <BadgeCheck className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-4 text-xl font-bold">{t("Already claimed", "تم التفعيل مسبقاً")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("This profile has already been claimed. Please log in.", "تم تفعيل هذا الملف بالفعل. يرجى تسجيل الدخول.")}
        </p>
        <Link
          to="/login"
          className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {t("Log in", "تسجيل الدخول")}
        </Link>
      </div>
    );
  }

  const listing = data.listing!;

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6" dir={isRTL ? "rtl" : "ltr"}>
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <UserCheck className="h-3.5 w-3.5" /> {t("Claim your profile", "فعّل ملفك المجاني")}
        </span>
        <h1 className="mt-3 text-2xl font-bold text-foreground">
          {t("Is this you, doctor?", "هل هذا ملفك يا دكتور؟")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Claim your free Tabibi profile to manage your clinic queue and bookings.",
            "فعّل ملفك المجاني على طبيبي لإدارة طابور عيادتك وحجوزاتك.",
          )}
        </p>
      </div>

      {/* The seeded listing card */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold text-foreground">{listing.fullName}</h2>
        {listing.specialty && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Stethoscope className="h-4 w-4" /> {listing.specialty}
          </p>
        )}
        {(listing.city || listing.address) && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" /> {[listing.city, listing.address].filter(Boolean).join(" · ")}
          </p>
        )}
        {listing.phoneHint && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground" dir="ltr">
            <Phone className="h-4 w-4" /> {listing.phoneHint}
          </p>
        )}
      </div>

      {/* Claim form */}
      <div className="mt-5 space-y-3 rounded-2xl border border-border bg-card p-5">
        <Field label={t("Full name", "الاسم بالكامل")}>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </Field>

        {listing.hasPhone && (
          <Field
            label={t("Confirm your clinic phone", "أكّد رقم هاتف العيادة")}
            hint={t("Enter the number this profile is listed under.", "أدخل الرقم المسجّل لهذا الملف للتحقق من هويتك.")}
          >
            <input
              inputMode="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01xxxxxxxxx"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
        )}
        {!listing.hasPhone && (
          <Field label={t("Clinic phone", "رقم هاتف العيادة")}>
            <input
              inputMode="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01xxxxxxxxx"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
        )}

        <Field label={t("Email", "البريد الإلكتروني")}>
          <input
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </Field>

        <Field label={t("Password", "كلمة المرور")} hint={t("At least 10 characters, with a letter and a number.", "10 أحرف على الأقل، تحتوي على حرف ورقم.")}>
          <input
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </Field>

        <button
          type="button"
          onClick={submit}
          disabled={busy || !email || !password || !fullName || !phone}
          className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {t("Claim my profile", "تفعيل ملفي")}
        </button>

        <p className="flex items-start gap-1.5 pt-1 text-xs text-muted-foreground">
          <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t(
            "After claiming, upload your medical license to unlock online bookings.",
            "بعد التفعيل، ارفع ترخيص مزاولة المهنة لتفعيل الحجوزات الإلكترونية.",
          )}
        </p>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
