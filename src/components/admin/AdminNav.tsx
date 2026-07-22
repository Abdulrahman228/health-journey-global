import { Link, useLocation } from "@tanstack/react-router";
import {
  AlertTriangle,
  Archive,
  BedDouble,
  CreditCard,
  ClipboardCheck,
  FileCheck,
  FileText,
  HeadphonesIcon,
  LayoutDashboard,
  Package,
  ReceiptText,
  ShieldCheck,
  Star,
  UploadCloud,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";

type LinkItem = {
  kind?: "link";
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

type SectionItem = {
  kind: "section";
  label: string;
};

type NavItem = LinkItem | SectionItem;

const items: NavItem[] = [
  { to: "/admin", label: "لوحة القيادة", icon: LayoutDashboard, exact: true },
  { to: "/admin/doctors", label: "الأطباء", icon: Users },
  { to: "/admin/seed-directory", label: "استيراد الدليل", icon: UploadCloud },
  { to: "/admin/patients", label: "المرضى", icon: UserRound },
  { to: "/admin/subscriptions", label: "الاشتراكات", icon: CreditCard },
  { to: "/admin/subscription-requests", label: "طلبات الاشتراك", icon: ClipboardCheck },
  { to: "/admin/verifications", label: "التوثيق", icon: ShieldCheck },
  { to: "/admin/documents", label: "المستندات", icon: FileCheck },
  { to: "/admin/withdrawals", label: "السحوبات", icon: Wallet },
  { to: "/admin/reviews", label: "التقييمات", icon: Star },
  { to: "/admin/articles", label: "المقالات", icon: FileText },
  { to: "/admin/support-tickets", label: "الدعم", icon: HeadphonesIcon },
  { to: "/admin/errors", label: "الأخطاء", icon: AlertTriangle },

  { kind: "section", label: "وحدات المستشفى" },
  { to: "/admin/admissions", label: "الإدخال والأسرة", icon: BedDouble },
  { to: "/admin/billing", label: "التأمين والفواتير", icon: ReceiptText },
  { to: "/admin/emr", label: "السجل الطبي المركزي", icon: Archive },
  { to: "/admin/inventory", label: "الصيدلية والمخزون", icon: Package },
];

export function AdminNav() {
  const { pathname } = useLocation();
  return (
    <aside className="rounded-xl border border-border bg-card p-3 shadow-sm lg:sticky lg:top-6 lg:self-start">
      <div className="mb-3 border-b border-border px-2 pb-3">
        <p className="text-xs font-semibold text-muted-foreground">Super Admin</p>
        <h2 className="mt-1 text-lg font-bold text-foreground">طبيبي</h2>
      </div>
      <nav className="grid gap-0.5" aria-label="قائمة لوحة الأدمن">
        {items.map((item, idx) => {
          if (item.kind === "section") {
            return (
              <div key={`section-${idx}`} className="mb-1 mt-3 px-2">
                <div className="border-t border-border pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {item.label}
                  </p>
                </div>
              </div>
            );
          }

          const { to, label, icon: Icon, exact } = item;
          const active = exact
            ? pathname === to || pathname === to + "/"
            : pathname.startsWith(to);

          return (
            <Link
              key={to}
              to={to}
              className={`flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" dir="rtl">
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <AdminNav />
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
