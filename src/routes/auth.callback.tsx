import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapOAuthUser } from "@/lib/auth.functions";
import { useLanguage } from "@/hooks/useLanguage";
import { homePathForRoles } from "@/hooks/useAuth";

const OAUTH_ROLE_KEY = "tabibi-oauth-role";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [{ title: "OAuth Callback — Tebana" }],
  }),
  component: AuthCallbackPage,
});

/**
 * Session from an implicit-grant fragment (#access_token=…&refresh_token=…).
 * The browser client runs PKCE and refuses such URLs on its own, but e-mail
 * confirmation links sent before 2026-11-06 still land here that way.
 */
async function sessionFromHash(hash: URLSearchParams): Promise<Session | null> {
  const access_token = hash.get("access_token");
  const refresh_token = hash.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  return error ? null : data.session;
}

function AuthCallbackPage() {
  const { t } = useLanguage();
  const bootstrap = useServerFn(bootstrapOAuthUser);
  const [error, setError] = useState<string | null>(null);
  const [isEmailLink, setIsEmailLink] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        // Provider errors can arrive in the query (PKCE) or the hash.
        const query = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const providerError = query.get("error_description") ?? hash.get("error_description");
        if (providerError) throw new Error(providerError);

        let session: Session | null = null;

        // 1) E-mail confirmation link (token_hash) built by the sign-up server fn.
        const tokenHash = query.get("token_hash");
        const linkType = query.get("type");
        if (tokenHash) {
          setIsEmailLink(true);
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: linkType === "email" ? "email" : "signup",
          });
          if (error) throw error;
          session = data.session;
        }

        // 2) PKCE: exchange THIS request's code for a session — deterministic, so a
        // pre-existing/stale session can never win. If the client's
        // detectSessionInUrl already consumed the code, the explicit exchange
        // errors and we fall back to the session it just established. Either way
        // we end up with the freshly-authenticated user, never a stale one.
        const code = query.get("code");
        if (!session && code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) session = data.session;
        }
        // 3) Legacy implicit fragment (older confirmation e-mails).
        if (!session && hash.get("access_token")) {
          setIsEmailLink(true);
          session = await sessionFromHash(hash);
        }
        if (!session) {
          session = (await supabase.auth.getSession()).data.session;
        }
        if (!session?.user) {
          throw new Error("no_session");
        }
        // Tokens must not linger in the address bar / history.
        window.history.replaceState(null, "", window.location.pathname);

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

        const res = await bootstrap({
          data: {
            userId: session.user.id,
            role,
            email: session.user.email,
            fullName: metadataName,
          },
        });

        if (!cancelled) window.location.replace(homePathForRoles(res.roles));
      } catch (e) {
        if (cancelled) return;
        // Stay on this page and SHOW the reason (it used to redirect to /login
        // instantly, so the message was never seen).
        setError(e instanceof Error ? e.message : String(e));
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

  const m = error.toLowerCase();
  const friendly =
    m.includes("expired") || m.includes("invalid") || m.includes("no_session")
      ? isEmailLink
        ? t(
            "This link is invalid or has expired. If you already confirmed your e-mail, just sign in.",
            "الرابط غير صالح أو انتهت صلاحيته. لو أكّدت بريدك من قبل، سجّل الدخول مباشرة.",
          )
        : t(
            "We couldn't complete the sign-in. Please try again.",
            "تعذّر استكمال تسجيل الدخول. حاول مرة أخرى.",
          )
      : m.includes("access_denied") || m.includes("cancel")
        ? t("Sign-in was cancelled.", "تم إلغاء تسجيل الدخول.")
        : t(error, "تعذّر استكمال تسجيل الدخول. حاول مرة أخرى.");

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">
          {isEmailLink
            ? t("E-mail confirmation failed", "تعذّر تأكيد البريد الإلكتروني")
            : t("Sign-in failed", "فشل تسجيل الدخول")}
        </h1>
        <p className="mt-2 text-sm text-destructive">{friendly}</p>
        <Link
          to="/login"
          className="mt-5 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t("Back to sign in", "العودة لتسجيل الدخول")}
        </Link>
      </div>
    </div>
  );
}
