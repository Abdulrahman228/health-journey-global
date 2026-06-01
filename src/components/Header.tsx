import { Link } from "@tanstack/react-router";
import { HeartPulse, Menu, X, Globe, Check, ChevronDown, User, LogOut, Calendar, LayoutDashboard, ShieldCheck, BadgeCheck, Receipt } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLanguage, LANGUAGES, type Language } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";

const navLinks = {
  en: [
    { label: "Home", to: "/" },
    { label: "Doctors", to: "/doctors" },
    { label: "Community", to: "/feed" },
    { label: "Missing Drugs", to: "/missing-drugs" },
    { label: "Pricing", to: "/pricing" },
    { label: "How It Works", to: "/how-it-works" },
    { label: "About", to: "/about" },
  ],
  ar: [
    { label: "الرئيسية", to: "/" },
    { label: "الأطباء", to: "/doctors" },
    { label: "المجتمع", to: "/feed" },
    { label: "الأدوية الناقصة", to: "/missing-drugs" },
    { label: "الأسعار", to: "/pricing" },
    { label: "كيف يعمل", to: "/how-it-works" },
    { label: "من نحن", to: "/about" },
  ],
};

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  const { user, role, isAuthenticated, signOut } = useAuth();

  const links = (navLinks as Record<string, typeof navLinks.en>)[language] ?? navLinks.en;
  const currentLang = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[1];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2" aria-label="طبيبي - Tabibi">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/75 shadow-md shadow-primary/25 ring-1 ring-primary/10">
            <HeartPulse className="h-[22px] w-[22px] text-white" strokeWidth={2.4} />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-xl font-bold text-foreground">
              {language === "ar" ? "طبيبي" : "Tabibi"}
            </span>
            <span className="mt-0.5 hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:inline">
              {language === "ar" ? "صحتك بين يديك" : "Your Health, Connected"}
            </span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              activeProps={{ className: "text-primary bg-primary/10" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="hidden md:flex items-center gap-2">
          <LanguageDropdown
            language={language}
            setLanguage={setLanguage}
            currentLabel={currentLang.nativeLabel}
            open={langOpen}
            setOpen={setLangOpen}
          />

          {isAuthenticated ? (
            <UserMenu user={user} role={role} signOut={signOut} t={t} />
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {t("Sign In", "تسجيل الدخول")}
              </Link>
              <Link
                to="/signup"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t("Get Started", "ابدأ الآن")}
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="inline-flex md:hidden items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-accent"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background px-4 py-4">
          <nav className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            <div className="grid grid-cols-2 gap-1 max-h-64 overflow-y-auto rounded-lg border border-border p-1">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    setLanguage(l.code);
                    setMobileOpen(false);
                  }}
                  className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    l.code === language
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <span>{l.nativeLabel}</span>
                  {l.code === language && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>

            {isAuthenticated ? (
              <>
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {user?.email}
                  </span>
                </div>
                <button
                  onClick={() => {
                    signOut();
                    setMobileOpen(false);
                  }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                  {t("Sign Out", "تسجيل الخروج")}
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-4 py-2 text-center text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
                >
                  {t("Sign In", "تسجيل الدخول")}
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t("Get Started", "ابدأ الآن")}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function LanguageDropdown({
  language,
  setLanguage,
  currentLabel,
  open,
  setOpen,
}: {
  language: Language;
  setLanguage: (l: Language) => void;
  currentLabel: string;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, setOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Globe className="h-4 w-4" />
        <span>{currentLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute end-0 mt-2 w-56 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg z-50">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLanguage(l.code);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                l.code === language
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-accent"
              }`}
            >
              <span className="flex flex-col items-start">
                <span>{l.nativeLabel}</span>
                <span className="text-xs text-muted-foreground">{l.label}</span>
              </span>
              {l.code === language && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({
  user,
  role,
  signOut,
  t,
}: {
  user: { email?: string } | null;
  role: "admin" | "doctor" | "patient" | "pharmacy" | null;
  signOut: () => Promise<void>;
  t: (en: string, ar: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
          <User className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="max-w-[120px] truncate">{user?.email}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute end-0 mt-2 w-48 rounded-xl border border-border bg-popover p-1 shadow-lg z-50">
          {role === "doctor" && (
            <>
              <Link
                to="/dashboard"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <LayoutDashboard className="h-4 w-4" />
                {t("Dashboard", "لوحة التحكم")}
              </Link>
              <Link
                to="/doctor/verification"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <BadgeCheck className="h-4 w-4" />
                {t("Verification", "التوثيق")}
              </Link>
            </>
          )}
          {role === "admin" && (
            <Link
              to="/admin"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <ShieldCheck className="h-4 w-4" />
              {t("Admin", "لوحة الأدمن")}
            </Link>
          )}
          {role === "pharmacy" && (
            <Link
              to="/pharmacy/dashboard"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <LayoutDashboard className="h-4 w-4" />
              {t("Pharmacy Dashboard", "لوحة الصيدلية")}
            </Link>
          )}
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
          >
            <User className="h-4 w-4" />
            {t("Profile", "الملف الشخصي")}
          </Link>
          <Link
            to="/appointments"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
          >
            <Calendar className="h-4 w-4" />
            {t("My Appointments", "مواعيدي")}
          </Link>
          <Link
            to="/billing"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
          >
            <Receipt className="h-4 w-4" />
            {t("Billing", "الفواتير")}
          </Link>
          <button
            onClick={() => {
              signOut();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            {t("Sign Out", "تسجيل الخروج")}
          </button>
        </div>
      )}
    </div>
  );
}
