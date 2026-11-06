import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { Mail, MessageCircle, LifeBuoy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { siteConfig } from "@/lib/seo";
import { fileSupportTicket } from "@/lib/support.functions";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Tebana" },
      {
        name: "description",
        content: "Contact the Tebana team: support e-mail and in-app support tickets.",
      },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { t } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const email = siteConfig.organization.email;
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (subject.trim().length < 3 || body.trim().length < 10) {
      toast.error(
        t("Please write a subject and a longer message.", "اكتب عنواناً ورسالة أطول من فضلك."),
      );
      return;
    }
    setSending(true);
    try {
      await fileSupportTicket({
        data: { userId: user.id, subject: subject.trim(), body: body.trim(), category: "general" },
      });
      setSent(true);
      toast.success(t("Message sent. We'll reply soon.", "تم الإرسال. سنرد عليك قريباً."));
    } catch (err) {
      console.error("[contact] fileSupportTicket failed:", err);
      toast.error(
        t(
          "Failed to send — try again or e-mail us.",
          "تعذّر إرسال الرسالة — حاول مرة أخرى أو راسلنا بالبريد.",
        ),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <MessageCircle className="h-8 w-8 text-primary" />
        </div>
        <h1 className="mt-6 text-3xl font-bold text-foreground">{t("Contact Us", "تواصل معنا")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("We usually reply within one business day.", "نرد عادةً خلال يوم عمل واحد.")}
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <a
          href={`mailto:${email}`}
          className="rounded-2xl border border-border bg-card p-6 transition hover:border-primary/40"
        >
          <Mail className="h-6 w-6 text-primary" />
          <h2 className="mt-3 font-semibold text-foreground">{t("E-mail", "البريد الإلكتروني")}</h2>
          <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
            {email}
          </p>
        </a>
        <div className="rounded-2xl border border-border bg-card p-6">
          <LifeBuoy className="h-6 w-6 text-primary" />
          <h2 className="mt-3 font-semibold text-foreground">{t("Support ticket", "تذكرة دعم")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Send us a message from your account and track the reply.",
              "أرسل لنا رسالة من حسابك وتابع الرد.",
            )}
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6">
        {!isAuthenticated ? (
          <p className="text-sm text-muted-foreground">
            {t(
              "Sign in to send us a message from your account, or e-mail us directly.",
              "سجّل الدخول لإرسال رسالة من حسابك، أو راسلنا بالبريد مباشرة.",
            )}
          </p>
        ) : sent ? (
          <p className="text-sm text-foreground">
            {t("Thanks! Your message was received.", "شكراً لك! وصلتنا رسالتك.")}
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder={t("Subject", "الموضوع")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
              rows={5}
              placeholder={t("How can we help?", "كيف يمكننا مساعدتك؟")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("Send", "إرسال")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
