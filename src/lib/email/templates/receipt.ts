/**
 * Email template for the appointment receipt.
 *
 * Self-contained HTML (inline styles) so it renders consistently across
 * Gmail, Outlook, Apple Mail, and Yahoo. Arabic-first (RTL) with English
 * fallback for keys.
 */

import type { AppointmentReceipt } from "@/lib/payments.functions";

const SITE_URL = "https://mytabibi.com";

function fmtMoney(n: number, currency: string): string {
  // Server-safe — don't depend on Intl locale data
  const fixed = (Math.round(n * 100) / 100).toFixed(2);
  return `${fixed} ${currency}`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // YYYY-MM-DD HH:MM (UTC) — keep server-safe
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  );
}

const STATUS_LABELS_AR: Record<AppointmentReceipt["status"], string> = {
  paid: "مدفوع",
  refunded: "تم استرداد المبلغ",
  partially_refunded: "استرداد جزئي",
  pending: "قيد الدفع",
  failed: "فشل الدفع",
};

export type ReceiptEmailPayload = {
  receipt: AppointmentReceipt;
  /** Used in the greeting if patientName is missing on the receipt itself. */
  patientFallback?: string;
};

export function buildReceiptEmail(p: ReceiptEmailPayload): { subject: string; html: string } {
  const r = p.receipt;
  const patient = r.patientName ?? p.patientFallback ?? "عميلنا الكريم";
  const subject = `إيصال زيارتك — ${r.receiptNumber}`;

  const refundRow =
    r.refundedAmount > 0
      ? `<tr>
          <td style="padding:8px 0;color:#6b7280;">المبلغ المسترد</td>
          <td style="padding:8px 0;text-align:left;color:#dc2626;font-weight:600;">
            -${fmtMoney(r.refundedAmount, r.currency)}
          </td>
        </tr>`
      : "";

  const couponRow =
    r.couponDiscount > 0 && r.couponCode
      ? `<tr>
          <td style="padding:8px 0;color:#6b7280;">خصم كود ${escapeHtml(r.couponCode)}</td>
          <td style="padding:8px 0;text-align:left;color:#059669;font-weight:600;">
            -${fmtMoney(r.couponDiscount, r.currency)}
          </td>
        </tr>`
      : "";

  const sandboxBanner =
    r.environment === "sandbox"
      ? `<div style="background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px;
                    text-align:center;font-size:13px;margin-bottom:16px;">
          ⚠️ معاملة تجريبية (Sandbox) — ليست عملية دفع حقيقية
        </div>`
      : "";

  const referenceRow = r.paymentReference
    ? `<tr>
        <td style="padding:6px 0;color:#6b7280;font-size:13px;">مرجع الدفع</td>
        <td style="padding:6px 0;text-align:left;font-family:monospace;font-size:13px;">
          ${escapeHtml(r.paymentReference)}
        </td>
      </tr>`
    : "";

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

        ${sandboxBanner}

        <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;">
          <div style="color:#6b7280;font-size:13px;">رقم الإيصال</div>
          <div style="font-family:monospace;font-size:18px;font-weight:600;margin-top:4px;">
            ${escapeHtml(r.receiptNumber)}
          </div>
          <div style="margin-top:8px;display:inline-block;background:#d1fae5;color:#065f46;
                       padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;">
            ${STATUS_LABELS_AR[r.status]}
          </div>
        </div>

        <p style="margin:0 0 8px 0;font-size:15px;">السلام عليكم ${escapeHtml(patient)}،</p>
        <p style="margin:0 0 24px 0;font-size:15px;color:#4b5563;line-height:1.6;">
          هذا إيصال زيارتك على منصة طبيبي. احتفظ بهذا البريد كإثبات للدفع.
        </p>

        <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:8px 0;color:#6b7280;">الطبيب</td>
            <td style="padding:8px 0;text-align:left;font-weight:600;">
              ${escapeHtml(r.doctorName ?? "—")}
              ${r.doctorSpecialty ? `<br><span style="font-weight:400;color:#6b7280;font-size:13px;">${escapeHtml(r.doctorSpecialty)}</span>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;">موعد الزيارة</td>
            <td style="padding:8px 0;text-align:left;">${fmtDateTime(r.scheduledAt)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;">نوع الزيارة</td>
            <td style="padding:8px 0;text-align:left;">
              ${r.appointmentType === "telehealth" ? "استشارة عن بُعد" : "زيارة في العيادة"}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;">تاريخ الدفع</td>
            <td style="padding:8px 0;text-align:left;">${fmtDateTime(r.paidAt)}</td>
          </tr>
          ${referenceRow}
        </table>

        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">

        <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:8px 0;color:#6b7280;">قيمة الكشف</td>
            <td style="padding:8px 0;text-align:left;">${fmtMoney(r.fee + r.couponDiscount, r.currency)}</td>
          </tr>
          ${couponRow}
          ${refundRow}
          <tr>
            <td style="padding:12px 0;font-weight:700;font-size:16px;border-top:1px solid #e5e7eb;">
              الصافي المدفوع
            </td>
            <td style="padding:12px 0;text-align:left;font-weight:700;font-size:18px;color:#0d9488;border-top:1px solid #e5e7eb;">
              ${fmtMoney(r.netPaid, r.currency)}
            </td>
          </tr>
        </table>

        <div style="text-align:center;margin-top:32px;">
          <a href="${SITE_URL}/receipt/${encodeURIComponent(r.appointmentId)}"
             style="display:inline-block;background:#0d9488;color:#ffffff;
                    padding:12px 24px;border-radius:8px;text-decoration:none;
                    font-weight:600;font-size:14px;">
            عرض الإيصال على الموقع
          </a>
        </div>

        <p style="margin:32px 0 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
          لأي استفسار يخص الفاتورة، تواصل معنا على
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
