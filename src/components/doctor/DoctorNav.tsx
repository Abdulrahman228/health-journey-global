/**
 * Doctor app shell (redesign phase 1).
 *
 * One consistent, collapsible, keyboard-friendly shell for every doctor route:
 *   • shadcn Sidebar (icon-collapsible on desktop, Sheet on mobile, RTL-aware)
 *   • top bar: page title, ⌘K command palette, notifications, theme, account
 *   • bottom tab bar on phones
 *
 * `DoctorShell` keeps the same signature as before, so every route that
 * already wraps itself in <DoctorShell> picks the new design up automatically.
 */
import { Link, useLocation } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import {
  BarChart3,
  CalendarDays,
  CreditCard,
  Crown,
  FilePlus2,
  FileSignature,
  FlaskConical,
  Globe,
  LayoutDashboard,
  LifeBuoy,
  Lock,
  Megaphone,
  MonitorSmartphone,
  ReceiptText,
  Repeat,
  ShieldCheck,
  Star,
  Stethoscope,
  Users,
  Wallet,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { DoctorTopbar } from "./DoctorTopbar";
import { DoctorMobileTabBar } from "./DoctorMobileTabBar";

export type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
  /** short keyword list for the command palette */
  keywords?: string;
};
export type NavGroup = { label: string; items: NavItem[] };

export const DOCTOR_NAV: NavGroup[] = [
  {
    label: "العمل اليومي",
    items: [
      {
        to: "/dashboard",
        label: "نظرة عامة",
        icon: LayoutDashboard,
        exact: true,
        keywords: "home الرئيسية",
      },
      {
        to: "/dashboard/appointments",
        label: "المواعيد",
        icon: CalendarDays,
        keywords: "appointments حجز",
      },
      {
        to: "/dashboard/waiting-room",
        label: "صالة الانتظار",
        icon: MonitorSmartphone,
        keywords: "queue طابور",
      },
      {
        to: "/dashboard/visit/new",
        label: "زيارة جديدة",
        icon: FilePlus2,
        keywords: "visit كشف وصفة",
      },
      { to: "/dashboard/patients", label: "المرضى", icon: Users, keywords: "patients ملفات" },
    ],
  },
  {
    label: "المالية",
    items: [
      {
        to: "/dashboard/earnings",
        label: "الإيرادات والمحفظة",
        icon: Wallet,
        keywords: "earnings wallet أرباح",
      },
      { to: "/dashboard/expenses", label: "المصروفات", icon: ReceiptText, keywords: "expenses" },
      {
        to: "/dashboard/analytics",
        label: "التحليلات",
        icon: BarChart3,
        keywords: "analytics تقارير",
      },
      {
        to: "/dashboard/settings/billing",
        label: "طرق الدفع",
        icon: CreditCard,
        keywords: "billing payment",
      },
    ],
  },
  {
    label: "المرضى والتفاعل",
    items: [
      { to: "/dashboard/reviews", label: "التقييمات", icon: Star, keywords: "reviews" },
      { to: "/doctor/feedback", label: "الملاحظات الخاصة", icon: Lock, keywords: "feedback" },
      {
        to: "/doctor/lab-results",
        label: "نتائج المعمل",
        icon: FlaskConical,
        keywords: "lab تحاليل أشعة",
      },
    ],
  },
  {
    label: "الإعدادات",
    items: [
      {
        to: "/dashboard/profile",
        label: "ملف العيادة",
        icon: Stethoscope,
        keywords: "profile clinic",
      },
      {
        to: "/doctor/verification",
        label: "التوثيق",
        icon: ShieldCheck,
        keywords: "verification ترخيص",
      },
      {
        to: "/dashboard/settings/signature",
        label: "التوقيع والختم",
        icon: FileSignature,
        keywords: "signature stamp",
      },
      { to: "/doctor/solo", label: "الصفحة الخاصة", icon: Globe, keywords: "solo page website" },
      {
        to: "/dashboard/settings/followup",
        label: "سياسة المتابعة",
        icon: Repeat,
        keywords: "followup إعادة",
      },
      {
        to: "/doctor/sponsorship",
        label: "الإعلانات الممولة",
        icon: Megaphone,
        keywords: "ads sponsored",
      },
      { to: "/billing", label: "الاشتراك", icon: Crown, keywords: "subscription gold" },
      { to: "/dashboard/support", label: "الدعم", icon: LifeBuoy, keywords: "support help مساعدة" },
    ],
  },
];

export function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.to || pathname === item.to + "/";
  return pathname === item.to || pathname.startsWith(item.to + "/");
}

/** Best-matching nav item for the current path (longest prefix wins). */
export function findNavItem(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const g of DOCTOR_NAV) {
    for (const it of g.items) {
      if (isNavActive(pathname, it) && (!best || it.to.length > best.to.length)) best = it;
    }
  }
  return best;
}

function initials(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "د";
  return n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}

/* ───────────────────────────── Sidebar ───────────────────────────── */
export function DoctorSidebar({ side }: { side: "left" | "right" }) {
  const { pathname } = useLocation();
  const { user, profile } = useAuth();
  const name = profile?.full_name ?? user?.email ?? "الطبيب";

  return (
    <Sidebar side={side} collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/dashboard" className="flex items-center gap-2.5 rounded-md px-1 py-1.5">
          <img src="/logo-mark.png" alt="" className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-bold leading-tight text-sidebar-foreground">
              طبانا
            </p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">نظام إدارة العيادة</p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {DOCTOR_NAV.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isNavActive(pathname, item);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link to={item.to}>
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <Link
          to="/dashboard/profile"
          className="flex items-center gap-2.5 rounded-md px-1 py-1 hover:bg-sidebar-accent"
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
              {initials(profile?.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">{name}</p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">{user?.email ?? ""}</p>
          </div>
        </Link>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** Kept for backwards compatibility (old pages imported it directly). */
export function DoctorNav() {
  const { isRTL } = useLanguage();
  return <DoctorSidebar side={isRTL ? "right" : "left"} />;
}

/* ───────────────────────────── Shell ───────────────────────────── */
export function DoctorShell({ children }: { children: ReactNode }) {
  const { isRTL } = useLanguage();
  const dir = isRTL ? "rtl" : "ltr";
  return (
    <SidebarProvider defaultOpen className="doctor-shell bg-surface text-foreground" dir={dir}>
      <DoctorSidebar side={isRTL ? "right" : "left"} />
      <SidebarInset className="min-w-0 bg-surface">
        <DoctorTopbar />
        <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-8 lg:px-8">
          {children}
        </div>
        <DoctorMobileTabBar />
      </SidebarInset>
    </SidebarProvider>
  );
}
