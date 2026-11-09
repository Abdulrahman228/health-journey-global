import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import appCss from "../styles.css?url";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SoloShell } from "@/components/SoloShell";
import { useSoloMode } from "@/hooks/useSoloMode";
import { buildMeta, buildSeoLinks, siteConfig } from "@/lib/seo";
import { organizationSchema, websiteSchema, jsonLdString } from "@/lib/schema";
import { WebVitalsReporter } from "@/lib/web-vitals";
import { installClientErrorHandlers } from "@/lib/error-reporter";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الصفحة التي تبحث عنها غير موجودة أو تم نقلها. · Page not found.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">تعذّر تحميل الصفحة</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          حدث خطأ من جهتنا. جرّب إعادة المحاولة أو ارجع للرئيسية. · Something went wrong.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            حاول مرة أخرى
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0f7f7c" },
      { name: "color-scheme", content: "light" },
      { name: "format-detection", content: "telephone=no" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      {
        name: "apple-mobile-web-app-title",
        content: `${siteConfig.brand.ar} ${siteConfig.brand.en}`,
      },
      { name: "author", content: `${siteConfig.brand.en} — ${siteConfig.brand.ar}` },
      { name: "application-name", content: `${siteConfig.brand.en} — ${siteConfig.brand.ar}` },
      { httpEquiv: "x-ua-compatible", content: "IE=edge" },
      // Google Search Console ownership (URL-prefix property https://mytabibi.com/),
      // issued by the Site Verification API for the owner's Google account.
      { name: "google-site-verification", content: "5-Dw-kCaPLRRbC6rmbD59AiksD-UpTdP4agrn2IHvRo" },
      // Fallback title/description only. Every indexable route sets its own
      // buildMeta() + buildSeoLinks(); emitting a full homepage meta set here
      // duplicated og:url/canonical on every page (2026-11 audit).
      { title: `${siteConfig.brand.ar} ${siteConfig.brand.en} | ${siteConfig.tagline.ar}` },
      { name: "description", content: siteConfig.defaultDescription.ar },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      // Fonts are injected asynchronously by the inline script below to avoid
      // render-blocking. Canonical links come from each route's head().
    ],
    scripts: [
      {
        // Apply the stored colour theme before first paint (class-based dark
        // mode, toggled from the doctor shell). Default stays light.
        children:
          "(function(){try{if(localStorage.getItem('tabibi-theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})();",
      },
      {
        // Inject Google Fonts non-blockingly. Body has system-ui fallback so
        // text renders immediately, then swaps to the web fonts on load.
        // IBM Plex Sans Arabic = the doctor system UI family (see styles.css).
        children:
          "(function(){var h='https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;600;700&display=swap';var l=document.createElement('link');l.rel='stylesheet';l.href=h;l.media='print';l.onload=function(){this.media='all';this.onload=null};(document.head||document.documentElement).appendChild(l);})();",
      },
      {
        // Register service worker for offline-first PWA experience.
        children:
          "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){});});}",
      },
      {
        type: "application/ld+json",
        children: jsonLdString(organizationSchema()),
      },
      {
        type: "application/ld+json",
        children: jsonLdString(websiteSchema()),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState("ar");
  const [dir, setDir] = useState("rtl");

  useEffect(() => {
    const stored = localStorage.getItem("tabibi-lang");
    if (stored) {
      setLang(stored);
      setDir(stored === "ar" ? "rtl" : "ltr");
    }
  }, []);

  return (
    <html lang={lang} dir={dir} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Doctor "system" routes render inside their own app shell (sidebar + top bar)
// without the marketing header/footer. `/doctor/$id` (public doctor profile) is
// deliberately NOT in this list.
const DOCTOR_APP_PREFIXES = [
  "/dashboard",
  "/billing",
  "/doctor/feedback",
  "/doctor/lab-results",
  "/doctor/solo",
  "/doctor/sponsorship",
  "/doctor/verification",
];

function isDoctorAppPath(pathname: string): boolean {
  return DOCTOR_APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const solo = useSoloMode();
  const { pathname } = useLocation();

  useEffect(() => {
    installClientErrorHandlers();
  }, []);

  // Admin pages bring their own shell (AdminShell: top bar + grouped sidebar);
  // the public header/footer would only add noise. Tokens stay .site-public.
  if (!solo.isSolo && (pathname === "/admin" || pathname.startsWith("/admin/"))) {
    return (
      <QueryClientProvider client={queryClient}>
        <div className="site-public">
          <Outlet />
        </div>
        <WebVitalsReporter />
        <Toaster richColors closeButton position="top-center" />
      </QueryClientProvider>
    );
  }

  if (!solo.isSolo && isDoctorAppPath(pathname)) {
    return (
      <QueryClientProvider client={queryClient}>
        <Outlet />
        <WebVitalsReporter />
        <Toaster richColors closeButton position="top-center" />
      </QueryClientProvider>
    );
  }

  if (solo.isSolo) {
    return (
      <QueryClientProvider client={queryClient}>
        <SoloShell ctx={solo}>
          <Outlet />
          <WebVitalsReporter />
        </SoloShell>
        <Toaster richColors closeButton position="top-center" />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      {/* .site-public scopes the marketing identity tokens (styles.css) to the
          public pages; the doctor system and patient screens keep theirs. */}
      <div className="site-public flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
        <WebVitalsReporter />
      </div>
      {/* Every toast.success / toast.error in the app renders here — no
          <Toaster /> was mounted before, so all of them were invisible. */}
      <Toaster richColors closeButton position="top-center" />
    </QueryClientProvider>
  );
}
