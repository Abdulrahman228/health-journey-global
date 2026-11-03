import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronDown, FilePlus2, Globe, LogOut, Search, UserPlus, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DOCTOR_NAV, findNavItem } from "./DoctorNav";

const QUICK_ACTIONS = [
  { to: "/dashboard/visit/new", label: "بدء كشف فوري", icon: Zap, keywords: "visit new instant" },
  { to: "/dashboard/visit/new", label: "وصفة جديدة", icon: FilePlus2, keywords: "prescription rx" },
  { to: "/dashboard/patients", label: "إضافة مريض", icon: UserPlus, keywords: "patient add" },
];

export function DoctorTopbar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  // ⌘K / Ctrl+K opens the command palette anywhere in the doctor area.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const title = useMemo(() => findNavItem(pathname)?.label ?? "لوحة الطبيب", [pathname]);

  const { data: unread = 0 } = useQuery({
    queryKey: ["unread_notifications_count", user?.id],
    enabled: Boolean(user?.id),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc("unread_notifications_count" as never);
      const n = Number(data ?? 0);
      return Number.isFinite(n) ? n : 0;
    },
  });

  const go = (to: string) => {
    setOpen(false);
    void navigate({ to } as never);
  };

  const name = profile?.full_name ?? user?.email ?? "الطبيب";
  const initials =
    (profile?.full_name ?? "د")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("") || "د";

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
        <SidebarTrigger className="-ms-1 text-muted-foreground" aria-label="القائمة" />
        <Separator orientation="vertical" className="h-5" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-foreground sm:text-base">{title}</h1>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden h-9 gap-2 text-muted-foreground sm:inline-flex"
          onClick={() => setOpen(true)}
        >
          <Search className="h-4 w-4" />
          <span className="text-xs">بحث سريع</span>
          <kbd className="pointer-events-none rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="sm:hidden"
          onClick={() => setOpen(true)}
          aria-label="بحث"
        >
          <Search className="h-4 w-4" />
        </Button>

        <Button asChild variant="ghost" size="icon" className="relative" aria-label="الإشعارات">
          <Link to="/notifications">
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        </Button>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" className="h-9 gap-2 px-1.5 sm:px-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
                <AvatarFallback className="bg-primary/10 text-[11px] font-bold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[10rem] truncate text-sm font-medium md:inline">
                {name}
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground md:inline" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => go("/dashboard/profile")}>
              ملف العيادة
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => go("/doctor/solo")}>الصفحة الخاصة</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => go("/billing")}>الاشتراك</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => go("/dashboard/support")}>الدعم</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => go("/")}>
              <Globe className="h-4 w-4" />
              الموقع العام
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={async () => {
                await signOut();
                void navigate({ to: "/login" });
              }}
            >
              <LogOut className="h-4 w-4" />
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="اكتب للتنقل أو لتنفيذ إجراء…" />
        <CommandList>
          <CommandEmpty>لا توجد نتائج</CommandEmpty>
          <CommandGroup heading="إجراءات سريعة">
            {QUICK_ACTIONS.map((a) => (
              <CommandItem
                key={a.label}
                value={`${a.label} ${a.keywords}`}
                onSelect={() => go(a.to)}
              >
                <a.icon className="h-4 w-4" />
                <span>{a.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          {DOCTOR_NAV.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.to}
                  value={`${item.label} ${item.keywords ?? ""}`}
                  onSelect={() => go(item.to)}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
