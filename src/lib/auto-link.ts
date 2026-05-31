// Auto internal-linking for article HTML.
//
// Boosts internal silo strength (a Rank Math best practice): when an article
// mentions a known specialty term in Arabic, wrap the FIRST mention only with
// a link to the corresponding /specialty/$slug hub page. We skip the article's
// own specialty (already linked via the CTA aside) to avoid self-loops.
//
// Implementation notes:
// - Pure server-safe string transformation (no DOM, no external deps).
// - Only rewrites text inside ">...<" gaps, so we never touch tag attributes,
//   nor anchor inner text, nor heading text (we exclude inside <h*> below).
// - At most ONE link per specialty per article to keep links editorially clean.

const SPECIALTY_TERMS: Record<string, string[]> = {
  cardiology: ["أمراض القلب", "طبيب قلب", "استشاري قلب"],
  dermatology: ["أمراض الجلد", "طبيب جلدية", "الأمراض الجلدية"],
  pediatrics: ["طبيب أطفال", "استشاري أطفال", "صحة الطفل"],
  psychiatry: ["طبيب نفسي", "الطب النفسي", "استشاري نفسي"],
  orthopedics: ["طبيب عظام", "جراحة العظام", "استشاري عظام"],
  gynecology: ["طبيب نساء وتوليد", "أمراض النساء", "نساء وتوليد"],
  internal: ["باطنة", "أمراض الباطنة", "طبيب باطنة"],
  dentistry: ["طبيب أسنان", "طب الأسنان", "استشاري أسنان"],
  ophthalmology: ["طبيب عيون", "أمراض العيون", "استشاري عيون"],
  ent: ["أنف وأذن وحنجرة", "طبيب أنف وأذن", "أمراض الأذن"],
  neurology: ["طبيب أعصاب", "أمراض الأعصاب", "استشاري أعصاب"],
  general: ["طبيب عام", "ممارس عام"],
};

export function autoLinkSpecialties(html: string, excludeSlug?: string | null): string {
  const used = new Set<string>();
  if (excludeSlug) used.add(excludeSlug);

  // Skip text inside headings & anchors entirely. Split on those, process the
  // outside parts only, then re-join.
  const SKIP_RE = /<(a|h1|h2|h3|h4|h5|h6)\b[^>]*>[\s\S]*?<\/\1>/gi;

  const parts: string[] = [];
  let last = 0;
  for (const m of html.matchAll(SKIP_RE)) {
    parts.push(html.slice(last, m.index));
    parts.push(m[0]); // keep skipped block untouched
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(html.slice(last));

  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = injectLinks(parts[i], used);
  }
  return parts.join("");
}

function injectLinks(segment: string, used: Set<string>): string {
  // Walk text chunks between tags only.
  return segment.replace(/>([^<]+)</g, (_match, text: string) => {
    let out = text;
    for (const [slug, terms] of Object.entries(SPECIALTY_TERMS)) {
      if (used.has(slug)) continue;
      for (const term of terms) {
        const idx = out.indexOf(term);
        if (idx >= 0) {
          out =
            out.slice(0, idx) +
            `<a href="/specialty/${slug}" class="text-primary font-medium underline underline-offset-2 decoration-primary/40 hover:decoration-primary">${term}</a>` +
            out.slice(idx + term.length);
          used.add(slug);
          break;
        }
      }
    }
    return ">" + out + "<";
  });
}
