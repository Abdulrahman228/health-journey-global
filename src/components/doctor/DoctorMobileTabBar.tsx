import { Link, useLocation } from "@tanstack/react-router";
import { CalendarDays, LayoutDashboard, Menu, Plus, Users } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/dashboard", label: "الرئيسية", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/appointments", label: "المواعيد", icon: CalendarDays },
  { to: "/dashboard/visit/new", label: "زيارة", icon: Plus, primary: true },
  { to: "/dashboard/patients", label: "المرضى", icon: Users },
] as const;

/** Phone-only bottom navigation; the 5th tab opens the full menu (Sheet). */
export function DoctorMobileTabBar() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();

  return (
    <nav
      aria-label="التنقل السريع"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          const exact = "exact" in tab && tab.exact;
          const active = exact
            ? pathname === tab.to
            : pathname === tab.to || pathname.startsWith(tab.to + "/");
          const Icon = tab.icon;
          const primary = "primary" in tab && tab.primary;
          return (
            <li key={tab.to}>
              <Link
                to={tab.to}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {primary ? (
                  <span className="-mt-5 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                    <Icon className="h-5 w-5" />
                  </span>
                ) : (
                  <Icon className="h-5 w-5" />
                )}
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            className="flex h-14 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
          >
            <Menu className="h-5 w-5" />
            <span>المزيد</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
