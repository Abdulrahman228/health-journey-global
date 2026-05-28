import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { breadcrumbSchema, jsonLdString, type BreadcrumbItem } from "@/lib/schema";

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Show the home icon as the first item (default: true) */
  showHome?: boolean;
  className?: string;
}

/**
 * Visible breadcrumb trail + BreadcrumbList JSON-LD.
 *
 * Last item is rendered as plain text (current page, not linked).
 * Direction-aware separator (ChevronLeft for RTL, ChevronRight for LTR).
 *
 * Usage:
 * ```tsx
 * <Breadcrumbs items={[
 *   { name: t("Doctors", "الأطباء"), path: "/doctors" },
 *   { name: doctor.name, path: `/doctor/${doctor.id}` },
 * ]} />
 * ```
 */
export function Breadcrumbs({ items, showHome = true, className }: BreadcrumbsProps) {
  const { language, t } = useLanguage();
  const isRTL = language === "ar";
  const Sep = isRTL ? ChevronLeft : ChevronRight;

  const fullItems: BreadcrumbItem[] = showHome
    ? [{ name: t("Home", "الرئيسية"), path: "/" }, ...items]
    : items;

  return (
    <>
      <nav
        aria-label={t("Breadcrumb", "مسار التنقل")}
        className={
          className ??
          "mx-auto flex max-w-7xl items-center gap-1.5 px-4 py-3 text-sm text-muted-foreground sm:px-6 lg:px-8"
        }
      >
        <ol className="flex flex-wrap items-center gap-1.5">
          {fullItems.map((item, idx) => {
            const isLast = idx === fullItems.length - 1;
            const isHome = showHome && idx === 0;
            return (
              <li key={`${item.path}-${idx}`} className="flex items-center gap-1.5">
                {idx > 0 && <Sep className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />}
                {isLast ? (
                  <span aria-current="page" className="font-medium text-foreground">
                    {isHome && <Home className="inline h-3.5 w-3.5" aria-hidden />}
                    {!isHome && item.name}
                  </span>
                ) : (
                  <Link
                    to={item.path}
                    className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                  >
                    {isHome ? (
                      <>
                        <Home className="h-3.5 w-3.5" aria-hidden />
                        <span className="sr-only">{item.name}</span>
                      </>
                    ) : (
                      item.name
                    )}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbSchema(fullItems)) }}
      />
    </>
  );
}
