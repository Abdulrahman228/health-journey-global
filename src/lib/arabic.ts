/**
 * Normalize Arabic (and mixed-Latin) text for forgiving search / comparison.
 *
 * Makes spelling variants compare equal so search isn't restricted by strict
 * orthography:
 *   - unifies all Alif forms (آ أ إ ٱ) → bare Alif (ا)
 *   - Taa Marbuta (ة) → Haa (ه)
 *   - strips tashkeel (harakat), the superscript Alif, and tatweel/kashida
 *   - lower-cases Latin and collapses whitespace
 *
 * e.g. normalizeArabicText("د. أحمد") === normalizeArabicText("د. احمد")
 *      normalizeArabicText("عيادة")   === normalizeArabicText("عياده")
 */
export function normalizeArabicText(text: string): string {
  if (!text) return "";
  return (
    text
      // Strip tashkeel (U+064B–U+0652), superscript Alif (U+0670), tatweel (U+0640).
      .replace(/[ً-ْٰـ]/g, "")
      // Unify Alif forms: آ(U+0622) أ(U+0623) إ(U+0625) ٱ(U+0671) → ا(U+0627).
      .replace(/[آأإٱ]/g, "ا")
      // Taa Marbuta ة(U+0629) → Haa ه(U+0647).
      .replace(/ة/g, "ه")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
  );
}
