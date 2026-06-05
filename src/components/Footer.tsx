import { Link } from "@tanstack/react-router";
import { HeartPulse } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { BrandName } from "@/components/BrandName";

const footerContent = {
  en: {
    tagline: "Your Health, Connected",
    description: "Connecting patients with trusted doctors across the Arab world. Book appointments, consult online, and manage your health.",
    patients: "For Patients",
    patientsLinks: [
      { label: "Find a Doctor", to: "/doctors" },
      { label: "Book Appointment", to: "/doctors" },
      { label: "Online Consultation", to: "/online" },
      { label: "Medical Records", to: "/records" },
      { label: "Manual Payment", to: "/pay" },
    ],
    doctors: "For Doctors",
    doctorsLinks: [
      { label: "Join as Doctor", to: "/join-doctor" },
      { label: "Doctor Dashboard", to: "/doctor-dashboard" },
      { label: "Pricing", to: "/pricing" },
    ],
    company: "Company",
    companyLinks: [
      { label: "About Us", to: "/about" },
      { label: "How It Works", to: "/how-it-works" },
      { label: "Contact", to: "/contact" },
    ],
    legal: "Legal",
    legalLinks: [
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms of Service", to: "/terms" },
    ],
    copyright: "© 2026 Tabibi (طبيبي). All rights reserved.",
  },
  ar: {
    tagline: "صحتك، متصلة",
    description: "نربط المرضى بأطباء موثوق بهم في جميع أنحاء العالم العربي. احجز مواعيد، استشر أونلاين، وادارء صحتك.",
    patients: "للمرضى",
    patientsLinks: [
      { label: "ابحث عن طبيب", to: "/doctors" },
      { label: "احجز موعد", to: "/doctors" },
      { label: "استشارة أونلاين", to: "/online" },
      { label: "السجل الطبي", to: "/records" },
      { label: "ادفع يدوياً", to: "/pay" },
    ],
    doctors: "للأطباء",
    doctorsLinks: [
      { label: "انضم كطبيب", to: "/join-doctor" },
      { label: "لوحة تحكم الطبيب", to: "/doctor-dashboard" },
      { label: "الأسعار", to: "/pricing" },
    ],
    company: "الشركة",
    companyLinks: [
      { label: "من نحن", to: "/about" },
      { label: "كيف يعمل", to: "/how-it-works" },
      { label: "تواصل معنا", to: "/contact" },
    ],
    legal: "قانوني",
    legalLinks: [
      { label: "سياسة الخصوصية", to: "/privacy" },
      { label: "شروط الخدمة", to: "/terms" },
    ],
    copyright: "© 2026 طبيبي (Tabibi). جميع الحقوق محفوظة.",
  },
};

export function Footer() {
  const { language } = useLanguage();
  const content = (footerContent as Record<string, typeof footerContent.en>)[language] ?? footerContent.en;
  const isRTL = language === "ar";

  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center gap-2" aria-label="طبيبي - Tabibi">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-primary to-primary/75 shadow-sm shadow-primary/20 ring-1 ring-primary/10">
                <HeartPulse className="h-5 w-5 text-white" strokeWidth={2.4} />
              </div>
              <BrandName
                variant="wordmark"
                primary={isRTL ? "ar" : "en"}
                className="text-xl text-foreground"
              />
            </Link>
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              {content.description}
            </p>
          </div>

          {/* Links */}
          <div>
            <h2 className="text-sm font-semibold text-foreground">{content.patients}</h2>
            <ul className="mt-4 space-y-2">
              {content.patientsLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground">{content.company}</h2>
            <ul className="mt-4 space-y-2">
              {content.companyLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              {content.legalLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground">{content.doctors}</h2>
            <ul className="mt-4 space-y-2">
              {content.doctorsLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-8">
          <p className="text-center text-sm text-muted-foreground">
            {content.copyright}
          </p>
        </div>
      </div>
    </footer>
  );
}
