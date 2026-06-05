import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
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

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
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
      { name: "theme-color", content: "#1d4ed8" },
      { name: "color-scheme", content: "light" },
      { name: "format-detection", content: "telephone=no" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "طبيبي Tabibi" },
      { name: "author", content: `${siteConfig.brand.en} — ${siteConfig.brand.ar}` },
      { name: "application-name", content: `${siteConfig.brand.en} — ${siteConfig.brand.ar}` },
      { httpEquiv: "x-ua-compatible", content: "IE=edge" },
      ...buildMeta({
        title: `طبيبي Tabibi | ${siteConfig.tagline.ar} — حجز طبيب أونلاين`,
        description: siteConfig.defaultDescription.ar,
        path: "/",
        keywords: [...siteConfig.defaultKeywords],
      }),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/icon-192.svg" },
      { rel: "mask-icon", href: "/favicon.svg", color: "#1d4ed8" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      // Fonts are injected asynchronously by the inline script below to avoid
      // render-blocking. <noscript> fallback added via scripts array.
      ...buildSeoLinks("/"),
    ],
    scripts: [
      {
        // Inject Google Fonts non-blockingly. Body has system-ui fallback so
        // text renders immediately, then swaps to Cairo/Inter on load.
        children:
          "(function(){var h='https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Inter:wght@400;600;700&family=Tajawal:wght@500;700;800&display=swap';var l=document.createElement('link');l.rel='stylesheet';l.href=h;l.media='print';l.onload=function(){this.media='all';this.onload=null};(document.head||document.documentElement).appendChild(l);})();",
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
    <html lang={lang} dir={dir}>
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const solo = useSoloMode();

  useEffect(() => {
    installClientErrorHandlers();
  }, []);

  if (solo.isSolo) {
    return (
      <QueryClientProvider client={queryClient}>
        <SoloShell ctx={solo}>
          <Outlet />
          <WebVitalsReporter />
        </SoloShell>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
        <WebVitalsReporter />
      </div>
    </QueryClientProvider>
  );
}
