/**
 * POST /api/public/auth/signup — e-mail sign-up for the Android / iOS apps.
 *
 * Same implementation as the web's `signUpUser` server function (service role,
 * our own Arabic confirmation mail via Resend, or auto-confirm when e-mail is not
 * configured). The apps used to call supabase.auth.signUp() directly, which sent
 * the confirmation through Supabase's built-in SMTP and failed with
 * `over_email_send_rate_limit` after a couple of sign-ups per hour.
 *
 * Body:     { email, password, fullName, role: "patient" | "doctor" }
 * Response: { ok: true, requiresEmailConfirmation } | { ok: false, error, message? }
 */
import { createFileRoute } from "@tanstack/react-router";
import { emailSignUpSchema } from "@/lib/auth.signup.schema";
import { performEmailSignUp } from "@/lib/auth.signup.server";
import { enforceRequestLimit } from "@/lib/rate-limit-request.server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/public/auth/signup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Shares the "signup" bucket with the web server function: 5 / hour / IP.
          enforceRequestLimit(request, "signup", 5, 60 * 60 * 1000);
        } catch {
          return json({ ok: false, error: "rate_limited" }, 429);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "bad_json" }, 400);
        }

        const parsed = emailSignUpSchema.safeParse(body);
        if (!parsed.success) {
          const fields = parsed.error.issues.map((i) => i.path.join("."));
          return json({ ok: false, error: "invalid_input", fields }, 400);
        }

        try {
          const result = await performEmailSignUp(parsed.data);
          return json({ ok: true, requiresEmailConfirmation: result.requiresEmailConfirmation });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          if (/already (been )?registered|already exists/i.test(message)) {
            return json({ ok: false, error: "email_taken" }, 409);
          }
          if (/invalid/i.test(message) && /email/i.test(message)) {
            return json({ ok: false, error: "email_invalid" }, 400);
          }
          if (message === "confirmation_email_failed") {
            // Account was rolled back — the app can simply retry later.
            return json({ ok: false, error: "email_send_failed" }, 503);
          }
          console.error("[api/public/auth/signup]", message);
          return json({ ok: false, error: "signup_failed" }, 500);
        }
      },
    },
  },
});
