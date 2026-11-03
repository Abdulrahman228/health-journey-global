/**
 * Phone helpers shared by the browser and the server.
 *
 * Mirrors public.normalize_phone() in the database (migration
 * 20261103100000) so the client, the server functions and SQL all agree on
 * ONE canonical E.164 form — e.g. "010 1234 5678" → "+201012345678".
 */

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹";

/** Canonical E.164 (+20…) or null when the input is not a usable number. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = "";
  for (const ch of String(raw)) {
    const i = AR_DIGITS.indexOf(ch);
    v += i >= 0 ? String(i % 10) : ch;
  }
  v = v.replace(/[^0-9+]/g, "");
  v = v.startsWith("+") ? "+" + v.slice(1).replace(/\+/g, "") : v.replace(/\+/g, "");
  if (!v || v === "+") return null;

  if (v.startsWith("00")) v = "+" + v.slice(2);
  else if (v.startsWith("+")) {
    /* keep */
  } else if (/^0(10|11|12|15)\d{8}$/.test(v)) v = "+20" + v.slice(1);
  else if (/^(10|11|12|15)\d{8}$/.test(v)) v = "+20" + v;
  else if (/^20(10|11|12|15)\d{8}$/.test(v)) v = "+" + v;
  else if (/^[1-9]\d{7,14}$/.test(v)) v = "+" + v;
  else return null;

  return /^\+[1-9]\d{7,14}$/.test(v) ? v : null;
}

/** True for a valid Egyptian mobile number (any input format). */
export function isEgyptianMobile(raw: string | null | undefined): boolean {
  const n = normalizePhone(raw);
  return !!n && /^\+20(10|11|12|15)\d{8}$/.test(n);
}

/** "+201012345678" → "010 1234 5678" for display; other countries unchanged. */
export function formatPhoneForDisplay(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+20(1\d)(\d{4})(\d{4})$/.exec(e164);
  if (m) return `0${m[1]} ${m[2]} ${m[3]}`;
  return e164;
}

/** Last 4 digits for "sent to …5678" style hints. */
export function phoneTail(e164: string | null | undefined): string {
  return e164 ? e164.slice(-4) : "";
}
