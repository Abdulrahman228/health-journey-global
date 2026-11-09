import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  ClipboardCheck,
  CreditCard,
  Database,
  ExternalLink,
  FileCheck,
  FileText,
  HeadphonesIcon,
  History,
  LayoutDashboard,
  Loader2,
  ReceiptText,
  Search,
  ShieldCheck,
  Star,
  Stethoscope,
  UploadCloud,
  UserPlus,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { siteConfig } from "@/lib/seo";
import { entitiesByGroup } from "@/lib/admin/registry";
import { adminGlobalSearch, type SearchHit } from "@/lib/admin/search";

type LinkItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
type Section = { label: string; items: LinkItem[] };

// Grouped navigation: the dedicated pages first, then every table through the
// data engine (/admin/data/*).
const SECTIONS: Section[] = [
  { label: "", items: [{ to: "/admin", label: "لوحة القيادة", icon: LayoutDashboard, exact: true }] },
  {
    label: "الأطباء",
    items: [
      { to: "/admin/doctors", label: "الأطباء", icon: Stethoscope },
      { to: "/admin/verifications", label: "التوثيق", icon: ShieldCheck },
      { to: "/admin/documents", label: "المستندات", icon: FileCheck },
      { to: "/admin/onboarding", label: "تهيئة طبيب", icon: UserPlus },
      { to: "/admin/seed-directory", label: "استيراد الدليل", icon: UploadCloud },
    ],
  },
  { label: "المرضى", items: [{ to: "/admin/patients", label: "المرضى", icon: UserRound }] },
  {
    label: "المالية",
    items: [
      { to: "/admin/subscriptions", label: "الاشتراكات", icon: CreditCard },
      { to: "/admin/subscription-requests", label: "طلبات الاشتراك", icon: ClipboardCheck },
      { to: "/admin/appointment-payments", label: "مدفوعات المواعيد", icon: ReceiptText },
      { to: "/admin/withdrawals", label: "السحوبات", icon: Wallet },
      { to: "/admin/billing", label: "الفواتير", icon: ReceiptText },
    ],
  },
  {
    label: "المحتوى",
    items: [
      { to: "/admin/reviews", label: "التقييمات", icon: Star },
      { to: "/admin/articles", label: "المقالات", icon: FileText },
      { to: "/admin/ai-references", label: "مكتبة المساعد الذكي", icon: BookOpen },
    ],
  },
  { label: "التواصل", items: [{ to: "/admin/support-tickets", label: "الدعم", icon: HeadphonesIcon }] },
  {
    label: "النظام",
    items: [
      { to: "/admin/data", label: "كل البيانات", icon: Database, exact: true },
      { to: "/admin/data/audit_logs", label: "سجل التدقيق", icon: History },
      { to: "/admin/errors", label: "الأخطاء", icon: AlertTriangle },
    ],
  },
];

export function AdminNav() {
  const { pathname } = useLocation();
  const groups = entitiesByGroup();
  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to || pathname === to + "/" : pathname.startsWith(to);

  return (
    <aside className="rounded-xl border border-border bg-card p-3 shadow-sm lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
      <nav className="grid gap-0.5" aria-label="قائمة لوحة الأدمن">
        {SECTIONS.map((s, i) => (
          <div key={i}>
            {s.label && (
              <p className="mb-1 mt-3 px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{s.label}</p>
            )}
            {s.items.map(({ to, label, icon: Icon, exact }) => (
              <Link
                key={to}
                to={to}
                className={`flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive(to, exact) ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        ))}

        <p className="mb-1 mt-4 px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">كل الجداول</p>
        {groups.map((g) => (
          <details key={g.group} open={g.entities.some((e) => pathname === `/admin/data/${e.table}`)} className="px-1">
            <summary className="cursor-pointer rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
              {g.label} <span className="text-[10px]">({g.entities.length})</span>
            </summary>
            <div className="mb-1 ms-2 border-s border-border ps-2">
              {g.entities.map((e) => (
                <Link
                  key={e.table}
                  to="/admin/data/$entity"
                  params={{ entity: e.table }}
                  className={`block truncate rounded-md px-2 py-1 text-xs ${
                    pathname === `/admin/data/${e.table}` ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-muted"
                  }`}
                  title={e.table}
                >
                  {e.label}
                </Link>
              ))}
            </div>
          </details>
        ))}
      </nav>
    </aside>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await adminGlobalSearch({ data: { q: q.trim() } });
        setHits(res.hits);
        setOpen(true);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const KIND: Record<SearchHit["kind"], string> = { user: "مستخدم", profile: "ملف", doctor: "طبيب", appointment: "موعد" };

  return (
    <div ref={boxRef} className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        placeholder="بحث عام: اسم، هاتف، بريد، أو معرّف…"
        className="h-10 w-full rounded-xl border border-border bg-background ps-9 pe-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {loading && <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      {open && hits.length > 0 && (
        <ul className="absolute z-40 mt-1 max-h-96 w-full overflow-auto rounded-xl border border-border bg-popover shadow-xl">
          {hits.map((h) => (
            <li key={`${h.kind}-${h.id}`}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  navigate({ href: h.href });
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-start text-sm hover:bg-accent"
              >
                <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">{KIND[h.kind]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{h.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{h.subtitle}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
          <Link to="/admin" className="flex shrink-0 items-center gap-2">
            <img src="/logo-mark-192.webp" alt="" width={32} height={32} className="h-8 w-8" />
            <span className="font-bold text-foreground">{siteConfig.brand.ar}</span>
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">ADMIN</span>
          </Link>
          <GlobalSearch />
          <Link to="/" className="ms-auto inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-primary">
            الموقع <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <AdminNav />
          <div className="min-w-0">{children}</div>
        </div>
      </main>
    </div>
  );
}
