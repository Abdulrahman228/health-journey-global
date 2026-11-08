import { Link } from "@tanstack/react-router";
import { Menu, X, Globe, Check, ChevronDown, User, LogOut, Calendar, LayoutDashboard, ShieldCheck, BadgeCheck, Receipt, FlaskConical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLanguage, LANGUAGES, type Language } from "@/hooks/useLanguage";
import { hasAdminRole, useAuth, type UserRole } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/NotificationBell";
import { siteConfig } from "@/lib/seo";

// Four links only; community, rare medications, about and how-it-works live
// in the footer so the header stays light.
const navLinks = {
  en: [
    { label: "Doctors", to: "/doctors" },
    { label: "Near me", to: "/nearby" },
    { label: "Articles", to: "/articles" },
    { label: "For doctors", to: "/join-doctor" },
  ],
  ar: [
    { label: "الأطباء", to: "/doctors" },
    { label: "الأقرب لي", to: "/nearby" },
    { label: "المقالات", to: "/articles" },
    { label: "للأطباء", to: "/join-doctor" },
  ],
};

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  const { user, roles, profile, isAuthenticated, signOut } = useAuth();
  // Phone-first accounts have no e-mail — show the name (or the number).
  const displayName = profile?.full_name || user?.email || user?.phone || t("My account", "حسابي");

  const links = (navLinks as Record<string, typeof navLinks.en>)[language] ?? navLinks.en;
  const currentLang = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[1];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5" aria-label={`${siteConfig.brand.ar} - ${siteConfig.brand.en}`}>
          <img
            src="/logo-mark-192.webp"
            alt={`${siteConfig.brand.ar} ${siteConfig.brand.en}`}
            width={40}
            height={40}
            className="h-10 w-10 object-contain"
          />
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {language === "ar" ? siteConfig.brand.ar : siteConfig.brand.en}
          </span>
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
            <>
              <NotificationBell />
              <UserMenu displayName={displayName} roles={roles} signOut={signOut} t={t} />
            </>
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
          aria-label={mobileOpen ? t("Close menu", "إغلاق القائمة") : t("Open menu", "فتح القائمة")}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          className="inline-flex md:hidden items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-accent"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div id="mobile-nav" className="md:hidden border-t border-border bg-background px-4 py-4">
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
                  <span className="truncate text-sm font-medium text-foreground">
                    {displayName}
                  </span>
                </div>
                <AccountLinks roles={roles} t={t} onNavigate={() => setMobileOpen(false)} />
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
  displayName,
  roles,
  signOut,
  t,
}: {
  displayName: string;
  roles: UserRole[];
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
        <span className="max-w-[120px] truncate">{displayName}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute end-0 mt-2 w-48 rounded-xl border border-border bg-popover p-1 shadow-lg z-50">
          <AccountLinks roles={roles} t={t} onNavigate={() => setOpen(false)} />
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

const menuLinkClass =
  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent";

/**
 * Account links for EVERY role the user holds (a doctor who is also an admin
 * sees both the dashboard and the admin panel). Shared by the desktop
 * dropdown and the mobile menu (which used to have no account links at all).
 */
function AccountLinks({
  roles,
  t,
  onNavigate,
}: {
  roles: UserRole[];
  t: (en: string, ar: string) => string;
  onNavigate: () => void;
}) {
  const isDoctor = roles.includes("doctor");
  const isPatientSide = roles.length === 0 || roles.includes("patient");
  return (
    <>
      {isDoctor && (
        <>
          <Link to="/dashboard" onClick={onNavigate} className={menuLinkClass}>
            <LayoutDashboard className="h-4 w-4" />
            {t("Dashboard", "لوحة التحكم")}
          </Link>
          <Link to="/doctor/verification" onClick={onNavigate} className={menuLinkClass}>
            <BadgeCheck className="h-4 w-4" />
            {t("Verification", "التوثيق")}
          </Link>
          <Link to="/doctor/lab-results" onClick={onNavigate} className={menuLinkClass}>
            <FlaskConical className="h-4 w-4" />
            {t("Shared results", "النتائج المُشاركة")}
          </Link>
        </>
      )}
      {roles.includes("lab") && (
        <Link to="/lab/dashboard" onClick={onNavigate} className={menuLinkClass}>
          <FlaskConical className="h-4 w-4" />
          {t("Lab Dashboard", "لوحة المعمل")}
        </Link>
      )}
      {hasAdminRole(roles) && (
        <Link to="/admin" onClick={onNavigate} className={menuLinkClass}>
          <ShieldCheck className="h-4 w-4" />
          {t("Admin", "لوحة الأدمن")}
        </Link>
      )}
      {roles.includes("pharmacy") && (
        <Link to="/pharmacy/dashboard" onClick={onNavigate} className={menuLinkClass}>
          <LayoutDashboard className="h-4 w-4" />
          {t("Pharmacy Dashboard", "لوحة الصيدلية")}
        </Link>
      )}
      <Link to="/profile" onClick={onNavigate} className={menuLinkClass}>
        <User className="h-4 w-4" />
        {t("Profile", "الملف الشخصي")}
      </Link>
      <Link to="/appointments" onClick={onNavigate} className={menuLinkClass}>
        <Calendar className="h-4 w-4" />
        {t("My Appointments", "مواعيدي")}
      </Link>
      {isPatientSide && (
        <Link to="/lab-orders" onClick={onNavigate} className={menuLinkClass}>
          <FlaskConical className="h-4 w-4" />
          {t("My tests & imaging", "تحاليلي وأشعتي")}
        </Link>
      )}
      <Link to="/billing" onClick={onNavigate} className={menuLinkClass}>
        <Receipt className="h-4 w-4" />
        {t("Billing", "الفواتير")}
      </Link>
    </>
  );
}
