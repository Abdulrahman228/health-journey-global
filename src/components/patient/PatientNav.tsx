import { Link, useLocation } from "@tanstack/react-router";
import { User, HeartPulse, Calendar, FlaskConical, Bell, Receipt, LayoutGrid, CalendarPlus } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

type Item = { to: string; label: string; icon: typeof User; exact?: boolean };

const items: Item[] = [
  { to: "/profile", label: "ملفي الشخصي", icon: User, exact: true },
  { to: "/profile/medical-history", label: "ملفي الطبي", icon: HeartPulse },
  { to: "/appointments", label: "مواعيدي", icon: Calendar },
  { to: "/lab-orders", label: "تحاليلي وأشعتي", icon: FlaskConical },
  { to: "/notifications", label: "الإشعارات", icon: Bell },
  { to: "/billing", label: "الفواتير والإيصالات", icon: Receipt },
];

export function PatientNav() {
  const { pathname } = useLocation();
  const { profile } = useAuth();
  return (
    <aside className="rounded-xl border border-border bg-card p-3 shadow-sm lg:sticky lg:top-6 lg:self-start">
      <div className="mb-3 flex items-center gap-2 border-b border-border px-2 pb-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <LayoutGrid className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground">حسابي</p>
          <h2 className="truncate text-sm font-bold text-foreground">{profile?.full_name ?? "المريض"}</h2>
        </div>
      </div>
      <Link
        to="/doctors"
        className="mb-2 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>احجز موعد جديد</span>
      </Link>
      <nav className="grid gap-0.5" aria-label="قائمة حسابي">
        {items.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? pathname === to || pathname === to + "/" : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-muted"
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

/**
 * Account shell for patient pages — an admin-style sticky sidebar on the side,
 * content in the main column. Wrap a patient page's content with this to give
 * the whole "my account" area consistent navigation.
 */
export function PatientShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6" dir="rtl">
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <PatientNav />
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
