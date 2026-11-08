// Arabic spelling helpers for place search.
//
// OpenStreetMap names use the formal spelling (مستشفى، القاهرة، أسيوط) while
// people type casually (مستشفي، القاهره، اسيوط). Photon matches letters as
// typed, so one query is run per likely spelling and the results are merged.

/** Same normalization as the web app's `normalizeArabicText` (src/lib/arabic.ts). */
export function normalizeAr(text: string): string {
  if (!text) return "";
  return text
    .replace(/[ً-ْٰـ]/g, "") // tashkeel, superscript alif, tatweel
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const FORMAL = (w: string) =>
  w
    .replace(/ي$/, "ى")
    .replace(/ه$/, "ة")
    .replace(/^ا(?!ل)/, "أ"); // leading alif gets a hamza, except the article ال

const CASUAL = (w: string) =>
  w
    .replace(/ى$/, "ي")
    .replace(/ة$/, "ه")
    .replace(/[أإآ]/g, "ا");

const SWAP = (w: string) =>
  w
    .replace(/ي$/, "\u0000") // placeholder so ي→ى and ى→ي do not cancel out
    .replace(/ى$/, "ي")
    .replace(/\u0000/, "ى")
    .replace(/ه$/, "\u0001")
    .replace(/ة$/, "ه")
    .replace(/\u0001/, "ة")
    .replace(/^ا(?!ل)/, "\u0002")
    .replace(/^[أإآ]/, "ا")
    .replace(/\u0002/, "أ");

/**
 * Up to four distinct spellings of the query, most likely first:
 * as typed, each word's ending/leading letters swapped, the formal form and
 * the casual form. Non-Arabic input returns just the query itself.
 */
export function spellingVariants(query: string): string[] {
  const q = query.replace(/\s+/g, " ").trim();
  if (!/[؀-ۿ]/.test(q)) return [q];
  const words = q.split(" ");
  const forms = [
    q,
    words.map(SWAP).join(" "),
    words.map(FORMAL).join(" "),
    words.map(CASUAL).join(" "),
  ];
  return Array.from(new Set(forms.filter(Boolean)));
}

export interface Ranked {
  placeId: string;
  main: string;
  description: string;
}

/**
 * Merge per-variant result lists (each already ranked by the provider):
 * names that START with what was typed come first, then names that contain
 * it, then the rest; within a group the first variant's order wins.
 */
export function mergeRanked<T extends Ranked>(query: string, lists: T[][]): T[] {
  const q = normalizeAr(query);
  const seen = new Set<string>();
  const merged: { item: T; group: number; order: number }[] = [];
  let order = 0;
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const item = list[i];
      if (!item || seen.has(item.placeId)) continue;
      seen.add(item.placeId);
      const name = normalizeAr(item.main || item.description);
      const group = name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2;
      merged.push({ item, group, order: order++ });
    }
  }
  merged.sort((a, b) => a.group - b.group || a.order - b.order);
  return merged.map((m) => m.item);
}
