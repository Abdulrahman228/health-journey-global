/**
 * Email template for password reset.
 *
 * Self-contained Arabic-first HTML (RTL, inline styles) that renders
 * consistently across all major mail clients.
 */

const SITE_URL = "https://mytabibi.com";

export type PasswordResetEmailPayload = {
  resetUrl: string;
  /** Used in greeting; falls back to a generic phrase if absent. */
  recipientName?: string | null;
  /** Roughly when the link expires (e.g. "خلال ساعة"). */
  expiresInLabel?: string;
};

export function buildPasswordResetEmail(p: PasswordResetEmailPayload): {
  subject: string;
  html: string;
} {
  const subject = "إعادة تعيين كلمة المرور — طبيبي";
  const greeting = p.recipientName
    ? `السلام عليكم ${escapeHtml(p.recipientName)}،`
    : "السلام عليكم،";
  const expires = p.expiresInLabel ?? "خلال ساعة واحدة";

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,Segoe UI,Tahoma,Arial,sans-serif;color:#111827;direction:rtl;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr>
      <td style="background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${SITE_URL}" style="font-size:24px;font-weight:700;color:#0d9488;text-decoration:none;">
            طبيبي
          </a>
          <div style="color:#6b7280;font-size:14px;margin-top:4px;">mytabibi.com</div>
        </div>

        <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#111827;">
          إعادة تعيين كلمة المرور
        </h1>

        <p style="margin:0 0 12px 0;font-size:15px;">${greeting}</p>
        <p style="margin:0 0 20px 0;font-size:15px;color:#4b5563;line-height:1.7;">
          استلمنا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك على منصة طبيبي.
          اضغط على الزر التالي لإنشاء كلمة مرور جديدة:
        </p>

        <div style="text-align:center;margin:28px 0;">
          <a href="${escapeAttr(p.resetUrl)}"
             style="display:inline-block;background:#0d9488;color:#ffffff;
                    padding:14px 32px;border-radius:8px;text-decoration:none;
                    font-weight:700;font-size:15px;">
            إعادة تعيين كلمة المرور
          </a>
        </div>

        <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;line-height:1.6;">
          هذا الرابط صالح ${expires} فقط. إذا لم تطلب إعادة التعيين،
          يمكنك تجاهل هذا البريد بأمان — كلمة المرور الحالية لن تتغيّر.
        </p>

        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

        <p style="margin:0 0 8px 0;font-size:12px;color:#9ca3af;">
          إذا لم يعمل الزر، انسخ الرابط التالي والصقه في المتصفح:
        </p>
        <p style="margin:0;font-size:12px;color:#0d9488;
                  word-break:break-all;font-family:monospace;line-height:1.5;">
          ${escapeHtml(p.resetUrl)}
        </p>

        <p style="margin:32px 0 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
          إذا كنت تشك في طلب غير مصرح به، تواصل معنا فوراً على
          <a href="mailto:support@mytabibi.com" style="color:#0d9488;">support@mytabibi.com</a><br>
          منصة طبيبي · ${SITE_URL}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
