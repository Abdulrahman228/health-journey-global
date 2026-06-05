import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapOAuthUser } from "@/lib/auth.functions";
import { useLanguage } from "@/hooks/useLanguage";

const OAUTH_ROLE_KEY = "tabibi-oauth-role";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [{ title: "OAuth Callback — Tabibi" }],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const { t } = useLanguage();
  const bootstrap = useServerFn(bootstrapOAuthUser);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        if (hash.get("error_description")) {
          throw new Error(hash.get("error_description") ?? "OAuth failed");
        }

        let session = (await supabase.auth.getSession()).data.session;
        for (let i = 0; i < 10 && !session; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          session = (await supabase.auth.getSession()).data.session;
        }

        if (!session?.user) {
          throw new Error("Unable to complete OAuth session");
        }

        const rawRole = localStorage.getItem(OAUTH_ROLE_KEY);
        localStorage.removeItem(OAUTH_ROLE_KEY);
        const role = rawRole === "doctor" || rawRole === "patient" ? rawRole : undefined;

        const metadataName =
          typeof session.user.user_metadata?.full_name === "string"
            ? session.user.user_metadata.full_name
            : typeof session.user.user_metadata?.name === "string"
              ? session.user.user_metadata.name
              : undefined;

        await bootstrap({
          data: {
            userId: session.user.id,
            role,
            email: session.user.email,
            fullName: metadataName,
          },
        });

        if (!cancelled) {
          window.location.replace("/");
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "OAuth failed");
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [bootstrap]);

  if (!error) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 text-sm text-foreground shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>{t("Completing sign-in...", "جار استكمال تسجيل الدخول...")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">
          {t("Google sign-in failed", "فشل تسجيل الدخول بجوجل")}
        </h1>
        <p className="mt-2 text-sm text-destructive">{error}</p>
        <Link to="/login" className="mt-5 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          {t("Back to sign in", "العودة لتسجيل الدخول")}
        </Link>
      </div>
    </div>
  );
}
