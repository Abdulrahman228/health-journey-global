import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import type { Session } from "@supabase/supabase-js";
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
        // Provider errors can arrive in the query (PKCE) or the hash.
        const query = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const providerError = query.get("error_description") ?? hash.get("error_description");
        if (providerError) throw new Error(providerError);

        // PKCE: exchange THIS request's code for a session — deterministic, so a
        // pre-existing/stale session can never win. If the client's
        // detectSessionInUrl already consumed the code, the explicit exchange
        // errors and we fall back to the session it just established. Either way
        // we end up with the freshly-authenticated user, never a stale one.
        const code = query.get("code");
        let session: Session | null = null;
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) session = data.session;
        }
        if (!session) {
          session = (await supabase.auth.getSession()).data.session;
        }
        if (!session?.user) {
          throw new Error("Unable to complete OAuth session");
        }

        // First-time OAuth users need their profile/role/details bootstrapped.
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
          window.location.replace("/dashboard");
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "OAuth failed");
        window.location.replace("/login");
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
