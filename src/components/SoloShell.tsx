import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import type { SoloContext } from "@/hooks/useSoloMode";

interface Props {
  ctx: SoloContext;
  children: React.ReactNode;
}

/**
 * Minimal white-label shell for doctor solo subdomains. No marketplace
 * navigation, no Tabibi-wide cross-promotion. Branded with doctor's color.
 */
export function SoloShell({ ctx, children }: Props) {
  const d = ctx.doctor;
  const brand = d?.solo_brand_color || "#1d4ed8";
  const clinicName = d?.solo_clinic_name || d?.full_name || "العيادة";

  // Inject brand color as CSS var
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("--solo-brand", brand);
    }
  }, [brand]);

  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="border-b border-border bg-card"
        style={{ borderTopColor: brand, borderTopWidth: 3 }}
      >
        <div className="mx-auto max-w-5xl px-4 py-3 sm:px-6 flex items-center justify-between gap-4">
          <Link
            to="/"
            className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            aria-label={clinicName}
          >
            {d?.solo_logo_url ? (
              <img
                src={d.solo_logo_url}
                alt={clinicName}
                width={36}
                height={36}
                className="h-9 w-9 rounded-full object-cover"
                loading="eager"
              />
            ) : (
              <div
                className="h-9 w-9 rounded-full flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: brand }}
                aria-hidden="true"
              >
                {(d?.full_name ?? "د").charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-bold text-sm text-foreground truncate">{clinicName}</p>
              {d?.specialty && <p className="text-xs text-muted-foreground truncate">{d.specialty}</p>}
            </div>
          </Link>
          {ctx.slug && (
            <Link
              to="/d/$slug"
              params={{ slug: ctx.slug }}
              search={{ book: 1 }}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ backgroundColor: brand }}
            >
              احجز موعد
            </Link>
          )}
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 text-xs text-muted-foreground text-center">
          <p>
            © {new Date().getFullYear()} {clinicName} — جميع الحقوق محفوظة
          </p>
          <p className="mt-1 opacity-70">
            مدعوم بمنصة{" "}
            <a
              href="https://mytabibi.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              طبيبي
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
