/**
 * IndexNow client — pings Bing + Yandex + Seznam + Naver + others
 * when content changes, so new doctor profiles / specialty pages are
 * discovered within minutes instead of waiting for the next crawl.
 *
 * Per the Rank Math course (module 3.3), IndexNow + sitemap is the
 * fastest legal path to indexing.
 *
 * Config (set in Cloudflare / Lovable env):
 *   INDEXNOW_KEY        = a 32-char random hex string (required)
 *   INDEXNOW_KEY_LOC    = optional override for the key-file URL
 *                          (defaults to `${siteConfig.url}/indexnow-key.txt`)
 *
 * The site MUST expose the key at the URL returned by `getKeyLocation()`
 * with the body being exactly the key. We do this via the
 * /indexnow-key.txt server route — no manual file upload needed.
 */
import { siteConfig } from "@/lib/seo";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export function getIndexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY;
  if (!key || key.length < 8 || key.length > 128) return null;
  return key;
}

export function getKeyLocation(): string {
  const override = process.env.INDEXNOW_KEY_LOC;
  if (override) return override;
  return `${siteConfig.url}/indexnow-key.txt`;
}

/**
 * Submit one URL (cheaper endpoint — GET).
 */
export async function submitOneUrl(url: string): Promise<{ ok: boolean; status: number }> {
  const key = getIndexNowKey();
  if (!key) return { ok: false, status: 0 };
  const u = new URL(INDEXNOW_ENDPOINT);
  u.searchParams.set("url", url);
  u.searchParams.set("key", key);
  u.searchParams.set("keyLocation", getKeyLocation());
  try {
    const res = await fetch(u.toString(), { method: "GET" });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.error("[IndexNow] submit failed:", err);
    return { ok: false, status: 0 };
  }
}

/**
 * Submit a batch of URLs (max 10,000 per call per IndexNow spec).
 */
export async function submitUrls(urls: string[]): Promise<{ ok: boolean; status: number; submitted: number }> {
  const key = getIndexNowKey();
  if (!key) return { ok: false, status: 0, submitted: 0 };
  const unique = [...new Set(urls.filter((u) => /^https?:\/\//.test(u)))].slice(0, 10000);
  if (unique.length === 0) return { ok: false, status: 0, submitted: 0 };
  const host = new URL(siteConfig.url).host;
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: getKeyLocation(),
        urlList: unique,
      }),
    });
    return { ok: res.ok, status: res.status, submitted: unique.length };
  } catch (err) {
    console.error("[IndexNow] batch submit failed:", err);
    return { ok: false, status: 0, submitted: 0 };
  }
}

/**
 * Convenience: submit a doctor profile and all of their specialty/city pages.
 */
export async function submitDoctorUrls(opts: {
  doctorId: string;
  specialtySlug?: string | null;
  citySlug?: string | null;
}) {
  const urls = [`${siteConfig.url}/doctor/${opts.doctorId}`];
  if (opts.specialtySlug) {
    urls.push(`${siteConfig.url}/specialty/${opts.specialtySlug}`);
    if (opts.citySlug) {
      urls.push(`${siteConfig.url}/specialty/${opts.specialtySlug}/${opts.citySlug}`);
    }
  }
  urls.push(`${siteConfig.url}/doctors`);
  urls.push(`${siteConfig.url}/sitemap-doctors.xml`);
  return submitUrls(urls);
}

/**
 * Convenience: submit an article URL + its specialty hub + the articles index.
 * Called when an article is freshly published from the admin editor.
 */
export async function submitArticleUrls(opts: {
  slug: string;
  specialtySlug?: string | null;
}) {
  const urls = [
    `${siteConfig.url}/articles/${opts.slug}`,
    `${siteConfig.url}/articles`,
    `${siteConfig.url}/sitemap-articles.xml`,
  ];
  if (opts.specialtySlug) {
    urls.push(`${siteConfig.url}/specialty/${opts.specialtySlug}`);
  }
  return submitUrls(urls);
}
