import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo } from "react";
import { marked } from "marked";
import { sanitizeHtml } from "@/lib/sanitize";
import { autoLinkSpecialties } from "@/lib/auto-link";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Calendar, Clock, ArrowLeft, ArrowRight } from "lucide-react";
import { loadArticleForSeo, type ArticleSeoData } from "@/lib/articles.functions";
import { useLanguage } from "@/hooks/useLanguage";
import { buildMeta, buildSeoLinks, canonicalUrl, truncate } from "@/lib/seo";
import { articleSchema, breadcrumbSchema, jsonLdString } from "@/lib/schema";

marked.setOptions({ gfm: true, breaks: false });

export const Route = createFileRoute("/articles/$slug")({
  loader: async ({ params }) => {
    const article = await loadArticleForSeo({ data: params.slug });
    if (!article) throw notFound();
    return { article };
  },
  head: ({ params, loaderData }) => {
    const a = loaderData?.article ?? null;
    const path = `/articles/${params.slug}`;
    const title = a ? `${a.title} | طبيبي` : "مقال طبي | طبيبي";
    const description = a?.excerpt
      ? truncate(a.excerpt, 160)
      : a
        ? truncate(a.bodyMd.replace(/[#*_>\-]/g, " "), 160)
        : "محتوى طبي موثوق من أطباء طبيبي.";
    const image = a?.coverImage ?? undefined;

    const scripts: Array<{ type: string; children: string }> = [];
    if (a) {
      scripts.push({
        type: "application/ld+json",
        children: jsonLdString(
          articleSchema({
            slug: a.slug,
            title: a.title,
            description: a.excerpt,
            image: a.coverImage,
            authorName: a.authorName,
            language: a.language,
            publishedAt: a.publishedAt,
            updatedAt: a.updatedAt,
          }),
        ),
      });
      scripts.push({
        type: "application/ld+json",
        children: jsonLdString(
          breadcrumbSchema([
            { name: "المقالات", path: "/articles" },
            { name: a.title, path },
          ]),
        ),
      });
    }

    return {
      meta: buildMeta({
        title,
        description,
        path,
        image,
        type: "article",
        locale: a?.language === "en" ? "en" : "ar",
      }),
      links: buildSeoLinks(path),
      scripts,
    };
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">المقال غير موجود</h1>
      <Link to="/articles" className="mt-4 inline-block text-primary underline">
        تصفّح كل المقالات
      </Link>
    </div>
  ),
  component: ArticlePage,
});

function ArticlePage() {
  const { article } = Route.useLoaderData() as { article: ArticleSeoData };
  const { isRTL } = useLanguage();
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  // Render Markdown → sanitized HTML → auto internal-link (silo boost).
  const html = useMemo(() => {
    const raw = marked.parse(article.bodyMd) as string;
    const safe = sanitizeHtml(raw, { ADD_ATTR: ["target", "rel"] });
    return autoLinkSpecialties(safe, article.specialtySlug);
  }, [article.bodyMd, article.specialtySlug]);

  const formattedDate = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString(article.language === "ar" ? "ar-EG" : "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <nav aria-label="breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-primary">الرئيسية</Link>
        <span className="mx-2">/</span>
        <Link to="/articles" className="hover:text-primary">المقالات</Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          {article.title}
        </h1>
        {article.excerpt ? (
          <p className="mt-4 text-lg text-muted-foreground">{article.excerpt}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {article.authorName ? (
            <span>بقلم: <strong className="text-foreground">{article.authorName}</strong></span>
          ) : null}
          {formattedDate ? (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formattedDate}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {article.readingMinutes} دقائق قراءة
          </span>
        </div>
        {article.coverImage ? (
          <OptimizedImage
            src={article.coverImage}
            alt={article.title}
            className="mt-8 aspect-video w-full rounded-xl object-cover"
            priority
            width={1200}
            height={675}
            srcsetWidths={[480, 768, 1200, 1600]}
            sizes="(min-width:1024px) 1200px, 100vw"
          />
        ) : null}
      </header>

      <div
        className="prose prose-lg max-w-none rtl:prose-headings:text-right prose-headings:font-bold prose-a:text-primary prose-img:rounded-lg"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {article.specialtySlug ? (
        <aside className="mt-12 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-bold">تحتاج استشارة طبيب؟</h2>
          <p className="mt-2 text-muted-foreground">
            احجز موعدًا مع طبيب موثّق في هذا التخصص خلال دقائق.
          </p>
          <Link
            to="/specialty/$slug"
            params={{ slug: article.specialtySlug }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            تصفّح الأطباء
            <Arrow className="h-4 w-4" />
          </Link>
        </aside>
      ) : null}

      <link rel="canonical" href={canonicalUrl(`/articles/${article.slug}`)} />
    </article>
  );
}
