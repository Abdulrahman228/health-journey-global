/**
 * Email template for appointment reminders.
 *
 * Sent ~24 hours before a confirmed/paid appointment via the scheduled
 * Cloudflare cron handler. Self-contained Arabic-first HTML with a clear
 * "Add to calendar" CTA.
 */

const SITE_URL = "https://mytabibi.com";

export type AppointmentReminderPayload = {
  recipientName?: string | null;
  doctorName?: string | null;
  doctorSpecialty?: string | null;
  scheduledAt: string; // ISO
  appointmentType: string; // 'in_person' | 'telehealth' | 'online' | ...
  appointmentId: string;
  /** Optional: video call link for telehealth. */
  joinUrl?: string | null;
  /** Optional: clinic address for in-person. */
  clinicAddress?: string | null;
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildAppointmentReminderEmail(p: AppointmentReminderPayload): {
  subject: string;
  html: string;
} {
  const isTelehealth =
    p.appointmentType === "telehealth" || p.appointmentType === "online";
  const greeting = p.recipientName
    ? `السلام عليكم ${escapeHtml(p.recipientName)}،`
    : "السلام عليكم،";
  const subject = `تذكير بموعد زيارتك غداً — ${fmtDateTime(p.scheduledAt)}`;

  const ctaButton = isTelehealth && p.joinUrl
    ? `<a href="${escapeHtml(p.joinUrl)}"
          style="display:inline-block;background:#0d9488;color:#ffffff;
                 padding:14px 32px;border-radius:8px;text-decoration:none;
                 font-weight:700;font-size:15px;">
          🎥 الانضمام للاستشارة
        </a>`
    : `<a href="${SITE_URL}/appointments"
          style="display:inline-block;background:#0d9488;color:#ffffff;
                 padding:14px 32px;border-radius:8px;text-decoration:none;
                 font-weight:700;font-size:15px;">
          عرض تفاصيل الموعد
        </a>`;

  const locationRow = isTelehealth
    ? `<tr>
        <td style="padding:8px 0;color:#6b7280;">نوع الزيارة</td>
        <td style="padding:8px 0;text-align:left;font-weight:600;color:#0d9488;">
          🎥 استشارة عن بُعد
        </td>
      </tr>`
    : `<tr>
        <td style="padding:8px 0;color:#6b7280;vertical-align:top;">المكان</td>
        <td style="padding:8px 0;text-align:left;">
          ${p.clinicAddress ? escapeHtml(p.clinicAddress) : "زيارة في العيادة"}
        </td>
      </tr>`;

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
        </div>

        <div style="background:#fef3c7;color:#92400e;padding:12px;border-radius:8px;text-align:center;margin-bottom:24px;">
          ⏰ <strong>تذكير بموعدك</strong> — بعد حوالي 24 ساعة
        </div>

        <p style="margin:0 0 12px 0;font-size:15px;">${greeting}</p>
        <p style="margin:0 0 20px 0;font-size:15px;color:#4b5563;line-height:1.7;">
          هذا تذكير بموعد زيارتك على منصة طبيبي. تفاصيل الموعد:
        </p>

        <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:14px;background:#f9fafb;border-radius:8px;padding:16px;">
          <tr>
            <td style="padding:8px 16px;color:#6b7280;">الطبيب</td>
            <td style="padding:8px 16px;text-align:left;font-weight:600;">
              د. ${escapeHtml(p.doctorName ?? "—")}
              ${p.doctorSpecialty ? `<br><span style="font-weight:400;color:#6b7280;font-size:13px;">${escapeHtml(p.doctorSpecialty)}</span>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 16px;color:#6b7280;">الموعد</td>
            <td style="padding:8px 16px;text-align:left;font-weight:600;color:#0d9488;">
              ${fmtDateTime(p.scheduledAt)}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 16px;color:#6b7280;vertical-align:top;">${isTelehealth ? "نوع الزيارة" : "المكان"}</td>
            <td style="padding:8px 16px;text-align:left;">
              ${isTelehealth ? "🎥 استشارة عن بُعد" : (p.clinicAddress ? escapeHtml(p.clinicAddress) : "زيارة في العيادة")}
            </td>
          </tr>
        </table>

        <div style="text-align:center;margin:28px 0;">
          ${ctaButton}
        </div>

        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

        <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;line-height:1.7;">
          <strong>قبل الموعد:</strong>
        </p>
        <ul style="margin:0;padding-right:20px;font-size:13px;color:#6b7280;line-height:1.7;">
          ${isTelehealth
            ? `<li>تأكد من اتصال إنترنت مستقر</li>
               <li>اختر مكاناً هادئاً وذو إضاءة جيدة</li>
               <li>جهّز قائمة الأدوية الحالية إن وُجدت</li>`
            : `<li>احضر قبل الموعد بـ 10 دقائق</li>
               <li>أحضر معك أي تقارير أو فحوصات سابقة</li>
               <li>جهّز قائمة الأدوية الحالية إن وُجدت</li>`
          }
        </ul>

        <p style="margin:24px 0 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
          لإلغاء أو إعادة جدولة الموعد، تفضل بزيارة
          <a href="${SITE_URL}/appointments" style="color:#0d9488;">صفحة مواعيدي</a><br>
          منصة طبيبي · ${SITE_URL}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
