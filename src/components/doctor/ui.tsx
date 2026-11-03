/**
 * Doctor-area design primitives (redesign phase 1).
 *
 * Every doctor screen composes these instead of hand-rolling cards, KPI tiles,
 * badges and empty states, so the whole area reads as ONE system:
 *   PageHeader   — title / eyebrow / description + action slot
 *   StatCard     — KPI tile with semantic tone + optional trend
 *   SectionCard  — titled content block
 *   EmptyState   — friendly zero-data block with a call to action
 *   StatusBadge  — appointment / payment status pill (semantic tokens only)
 */
import type { ComponentType, ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type IconType = ComponentType<{ className?: string }>;

export type Tone = "default" | "primary" | "success" | "warning" | "info" | "destructive";

const toneIcon: Record<Tone, string> = {
  default: "bg-muted text-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  destructive: "bg-destructive/10 text-destructive",
};

const tonePill: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  destructive: "bg-destructive/10 text-destructive",
};

/* ───────────────────────────── PageHeader ───────────────────────────── */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("mb-6", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-xs font-medium text-muted-foreground">{eyebrow}</p>}
          <h1 className="text-xl font-bold tracking-normal text-foreground sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/* ───────────────────────────── StatCard ───────────────────────────── */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  trend,
  tone = "default",
  loading,
  className,
}: {
  icon: IconType;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  /** percentage; positive = up */
  trend?: number;
  tone?: Tone;
  loading?: boolean;
  className?: string;
}) {
  const showTrend = typeof trend === "number" && trend !== 0;
  const up = (trend ?? 0) >= 0;
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", toneIcon[tone])}>
          <Icon className="h-4 w-4" />
        </span>
        {showTrend && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
              up ? "bg-success-soft text-success" : "bg-destructive/10 text-destructive",
            )}
          >
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {up ? "+" : ""}
            {trend}%
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-24" />
      ) : (
        <p className="mt-3 text-2xl font-bold tabular-nums leading-none text-foreground">{value}</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

/* ───────────────────────────── SectionCard ───────────────────────────── */
export function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: IconType;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)]",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && (
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h2 className="truncate text-sm font-semibold text-foreground sm:text-base">
                  {title}
                </h2>
              )}
              {description && (
                <p className="truncate text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ───────────────────────────── EmptyState ───────────────────────────── */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: IconType;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-10 text-center", className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ───────────────────────────── StatusBadge ───────────────────────────── */
const STATUS: Record<string, { tone: Tone; ar: string; en: string }> = {
  pending: { tone: "warning", ar: "بانتظار التأكيد", en: "Pending" },
  confirmed: { tone: "info", ar: "مؤكد", en: "Confirmed" },
  waiting: { tone: "info", ar: "في الانتظار", en: "Waiting" },
  called: { tone: "primary", ar: "تم النداء", en: "Called" },
  in_progress: { tone: "primary", ar: "جارٍ الكشف", en: "In progress" },
  completed: { tone: "success", ar: "مكتمل", en: "Completed" },
  cancelled: { tone: "destructive", ar: "ملغي", en: "Cancelled" },
  no_show: { tone: "destructive", ar: "لم يحضر", en: "No-show" },
  unpaid: { tone: "warning", ar: "غير مدفوع", en: "Unpaid" },
  paid: { tone: "success", ar: "مدفوع", en: "Paid" },
  refunded: { tone: "default", ar: "مسترد", en: "Refunded" },
  partially_refunded: { tone: "default", ar: "مسترد جزئياً", en: "Partially refunded" },
  failed: { tone: "destructive", ar: "فشل الدفع", en: "Failed" },
};

export function StatusBadge({
  status,
  lang = "ar",
  className,
}: {
  status: string | null | undefined;
  lang?: "ar" | "en";
  className?: string;
}) {
  const key = String(status ?? "").toLowerCase();
  const meta = STATUS[key] ?? { tone: "default" as Tone, ar: key || "—", en: key || "—" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5",
        tonePill[meta.tone],
        className,
      )}
    >
      {lang === "ar" ? meta.ar : meta.en}
    </span>
  );
}

/** Semantic pill for arbitrary labels (tier, role, …). */
export function Pill({
  tone = "default",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5",
        tonePill[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
