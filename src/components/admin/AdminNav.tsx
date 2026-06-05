import { Link, useLocation } from "@tanstack/react-router";
import { ShieldCheck, Users, Wallet, Star, FileText, LayoutDashboard, FileCheck, HeadphonesIcon, AlertTriangle } from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const items: NavItem[] = [
  { to: "/admin", label: "نظرة عامة", icon: LayoutDashboard, exact: true },
  { to: "/admin/verifications", label: "التوثيق", icon: ShieldCheck },
  { to: "/admin/documents", label: "المستندات", icon: FileCheck },
  { to: "/admin/doctors", label: "الأطباء", icon: Users },
  { to: "/admin/withdrawals", label: "السحوبات", icon: Wallet },
  { to: "/admin/reviews", label: "التقييمات", icon: Star },
  { to: "/admin/articles", label: "المقالات", icon: FileText },
  { to: "/admin/support-tickets", label: "الدعم", icon: HeadphonesIcon },
  { to: "/admin/errors", label: "الأخطاء", icon: AlertTriangle },
];

export function AdminNav() {
  const { pathname } = useLocation();
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
      {items.map(({ to, label, icon: Icon, exact }) => {
        const active = exact ? pathname === to || pathname === to + "/" : pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-accent"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
