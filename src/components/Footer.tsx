import { Link } from "@tanstack/react-router";
import { HeartPulse } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { BrandName } from "@/components/BrandName";
import { siteConfig } from "@/lib/seo";

type FooterLink = { label: string; to: string };
type Column = { title: string; links: FooterLink[] };

const footerContent: Record<"en" | "ar", { description: string; columns: Column[]; copyright: string; made: string }> = {
  en: {
    description: "Egyptian platform for booking verified doctors — in the clinic or by video, with a medical record that stays with you.",
    columns: [
      {
        title: "For patients",
        links: [
          { label: "Find a doctor", to: "/doctors" },
          { label: "Doctors near me", to: "/nearby" },
          { label: "Medical record", to: "/profile/medical-history" },
          { label: "Community", to: "/feed" },
          { label: "Rare medications", to: "/missing-drugs" },
        ],
      },
      {
        title: "For doctors",
        links: [
          { label: "Join as a doctor", to: "/join-doctor" },
          { label: "Plans and pricing", to: "/pricing" },
          { label: "Doctor dashboard", to: "/dashboard" },
          { label: "How it works", to: "/how-it-works" },
        ],
      },
      {
        title: "Tebana",
        links: [
          { label: "About", to: "/about" },
          { label: "Articles", to: "/articles" },
          { label: "Contact", to: "/contact" },
          { label: "Privacy policy", to: "/privacy" },
          { label: "Terms of service", to: "/terms" },
        ],
      },
    ],
    copyright: `© 2026 ${siteConfig.organization.legalNameEn} (${siteConfig.brand.ar}). All rights reserved.`,
    made: "Made in Egypt",
  },
  ar: {
    description: "منصة مصرية لحجز الأطباء الموثّقين — في العيادة أو بالفيديو، وسجل طبي يبقى معك.",
    columns: [
      {
        title: "للمرضى",
        links: [
          { label: "ابحث عن طبيب", to: "/doctors" },
          { label: "الأطباء الأقرب لي", to: "/nearby" },
          { label: "السجل الطبي", to: "/profile/medical-history" },
          { label: "المجتمع", to: "/feed" },
          { label: "الأدوية نادرة التوفر", to: "/missing-drugs" },
        ],
      },
      {
        title: "للأطباء",
        links: [
          { label: "انضم كطبيب", to: "/join-doctor" },
          { label: "الباقات والأسعار", to: "/pricing" },
          { label: "لوحة الطبيب", to: "/dashboard" },
          { label: "كيف تعمل المنصة", to: "/how-it-works" },
        ],
      },
      {
        title: "طبانا",
        links: [
          { label: "من نحن", to: "/about" },
          { label: "المقالات", to: "/articles" },
          { label: "تواصل معنا", to: "/contact" },
          { label: "سياسة الخصوصية", to: "/privacy" },
          { label: "شروط الخدمة", to: "/terms" },
        ],
      },
    ],
    copyright: `© 2026 ${siteConfig.organization.legalName} (${siteConfig.brand.en}). جميع الحقوق محفوظة.`,
    made: "صُنع في مصر",
  },
};

export function Footer() {
  const { language } = useLanguage();
  const content = footerContent[language === "ar" ? "ar" : "en"];
  const isRTL = language === "ar";

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Link to="/" className="inline-flex items-center gap-3" aria-label={`${siteConfig.brand.ar} - ${siteConfig.brand.en}`}>
              <img
                src="/logo-mark.png"
                alt={`${siteConfig.brand.ar} ${siteConfig.brand.en}`}
                width={48}
                height={48}
                className="h-12 w-12 object-contain"
              />
              <BrandName variant="wordmark" primary={isRTL ? "ar" : "en"} className="text-2xl text-foreground" />
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">{content.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-8">
            {content.columns.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h2 className="text-sm font-bold text-foreground">{col.title}</h2>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((link, i) => (
                    <li key={`${link.to}-${i}`}>
                      <Link to={link.to} className="text-sm text-muted-foreground transition-colors hover:text-primary">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>{content.copyright}</p>
          <p className="inline-flex items-center gap-1.5">
            <HeartPulse className="h-3.5 w-3.5 text-coral" />
            {content.made}
          </p>
        </div>
      </div>
    </footer>
  );
}
