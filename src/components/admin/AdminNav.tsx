import { Link, useLocation } from "@tanstack/react-router";
import { ShieldCheck, Users, Wallet, Star, FileText } from "lucide-react";

const items = [
  { to: "/admin/verifications", label: "التوثيق", icon: ShieldCheck },
  { to: "/admin/doctors", label: "الأطباء", icon: Users },
  { to: "/admin/withdrawals", label: "السحوبات", icon: Wallet },
  { to: "/admin/reviews", label: "التقييمات", icon: Star },
  { to: "/admin/articles", label: "المقالات", icon: FileText },
] as const;

export function AdminNav() {
  const { pathname } = useLocation();
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
      {items.map(({ to, label, icon: Icon }) => {
        const active = pathname.startsWith(to);
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
