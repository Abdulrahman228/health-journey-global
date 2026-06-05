/**
 * URL-slug helpers for public profile pages.
 *
 * Doctors: `/d/dr-{name}-{city}`   e.g. /d/dr-ahmed-shatat-cairo
 * Patients: `/u/{name}`             e.g. /u/mohamed-nour
 *
 * Arabic input is transliterated to Latin so the resulting slug is
 * universally readable, copyable, and SEO-friendly (Google ranks
 * descriptive English slugs higher than UUIDs even for Arabic content).
 */

/** Strip Arabic diacritics (tashkeel) U+064B…U+0652 + tatweel U+0640. */
function stripTashkeel(s: string): string {
  return s.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "");
}

/** Arabic → Latin character map (Buckwalter-inspired, simplified). */
const AR_MAP: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "i", "آ": "a", "ٱ": "a",
  "ب": "b", "ت": "t", "ث": "th",
  "ج": "j", "ح": "h", "خ": "kh",
  "د": "d", "ذ": "dh", "ر": "r", "ز": "z",
  "س": "s", "ش": "sh", "ص": "s", "ض": "d",
  "ط": "t", "ظ": "z", "ع": "a", "غ": "gh",
  "ف": "f", "ق": "q", "ك": "k", "ل": "l",
  "م": "m", "ن": "n", "ه": "h",
  "و": "w", "ؤ": "o",
  "ي": "y", "ى": "a", "ئ": "e",
  "ة": "a", "ء": "",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

function transliterateArabic(s: string): string {
  let out = "";
  for (const ch of s) out += AR_MAP[ch] ?? ch;
  return out;
}

/**
 * Convert any input string to a safe URL slug.
 *  - Strips Arabic diacritics
 *  - Transliterates Arabic → Latin
 *  - Lowercases
 *  - Removes non-alphanumerics
 *  - Collapses hyphens
 */
export function slugify(input: string): string {
  if (!input) return "";
  const cleaned = transliterateArabic(stripTashkeel(input.trim()));
  return cleaned
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // remove combining marks
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Build the canonical slug for a doctor: `dr-{name}-{city}`. */
export function buildDoctorSlug(name: string | null | undefined, city?: string | null): string {
  const n = slugify(
    (name ?? "doctor")
      .replace(/^د\.\s*/g, "") // remove leading "د. "
      .replace(/^Dr\.?\s*/i, ""),
  );
  const c = city ? slugify(city) : "";
  const parts = ["dr", n, c].filter(Boolean);
  return parts.join("-").slice(0, 80);
}

/** Build the canonical slug for a patient/user: `{name}`. */
export function buildPatientSlug(name: string | null | undefined): string {
  return slugify(name ?? "user") || "user";
}

/**
 * Generate a short, URL-safe ID for QR shortlinks (6 chars by default).
 * Uses crypto when available, otherwise Math.random.
 */
export function generateShortId(length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    for (let i = 0; i < length; i++) out += alphabet[buf[i] % alphabet.length];
  } else {
    for (let i = 0; i < length; i++) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  }
  return out;
}
