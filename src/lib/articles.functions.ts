/**
 * Server functions for the SEO content engine (/articles/$slug).
 *
 * Articles target informational (TOFU) and consideration (MOFU)
 * queries — e.g. "ما هي أعراض ضغط الدم"، "متى يجب زيارة طبيب نفسي".
 * They internally link down the Silo to specialty pillar pages and
 * out to verified doctor profiles, so traffic monetizes via bookings.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// The generated Supabase Database types don't yet include the `articles`
// table — regenerate via `supabase gen types` after applying the
// 20260528000000_articles.sql migration to refresh them. Until then we
// cast through a relaxed shape so the server functions compile. RLS on
// the table still enforces admin-only writes / public read of published.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabaseAdmin as unknown as { from: (t: string) => any };

export interface ArticleSeoData {
  id: string;
  slug: string;
  language: "ar" | "en";
  title: string;
  excerpt: string | null;
  bodyMd: string;
  coverImage: string | null;
  specialtySlug: string | null;
  authorName: string | null;
  readingMinutes: number;
  publishedAt: string | null;
  updatedAt: string;
}

export const loadArticleForSeo = createServerFn({ method: "GET" })
  .inputValidator((slug: unknown): string => {
    if (typeof slug !== "string" || !slug) throw new Error("slug required");
    return slug;
  })
  .handler(async ({ data: slug }): Promise<ArticleSeoData | null> => {
    const { data, error } = await sb
      .from("articles")
      .select(
        "id, slug, language, title, excerpt, body_md, cover_image, specialty_slug, author_name, reading_minutes, published_at, updated_at, is_published",
      )
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      slug: data.slug,
      language: (data.language === "en" ? "en" : "ar") as "ar" | "en",
      title: data.title,
      excerpt: data.excerpt,
      bodyMd: data.body_md,
      coverImage: data.cover_image,
      specialtySlug: data.specialty_slug,
      authorName: data.author_name,
      readingMinutes: data.reading_minutes ?? 5,
      publishedAt: data.published_at,
      updatedAt: data.updated_at,
    };
  });

export interface ArticleListItem {
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  language: "ar" | "en";
  publishedAt: string | null;
  readingMinutes: number;
  specialtySlug: string | null;
}

export const listPublishedArticles = createServerFn({ method: "GET" })
  .inputValidator((raw) =>
    z
      .object({
        language: z.enum(["ar", "en"]).optional(),
        specialtySlug: z.string().optional(),
        limit: z.number().int().positive().max(50).optional(),
      })
      .optional()
      .parse(raw),
  )
  .handler(async ({ data }): Promise<ArticleListItem[]> => {
    let q = sb
      .from("articles")
      .select("slug, title, excerpt, cover_image, language, published_at, reading_minutes, specialty_slug")
      .eq("is_published", true)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(data?.limit ?? 20);
    if (data?.language) q = q.eq("language", data.language);
    if (data?.specialtySlug) q = q.eq("specialty_slug", data.specialtySlug);
    const { data: rows } = await q;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map((r) => ({
      slug: r.slug,
      title: r.title,
      excerpt: r.excerpt,
      coverImage: r.cover_image,
      language: (r.language === "en" ? "en" : "ar") as "ar" | "en",
      publishedAt: r.published_at,
      readingMinutes: r.reading_minutes ?? 5,
      specialtySlug: r.specialty_slug,
    }));
  });

export const listAllArticleSlugs = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await sb
    .from("articles")
    .select("slug, updated_at, language")
    .eq("is_published", true);
  return data ?? [];
});
