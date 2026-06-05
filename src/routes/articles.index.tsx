import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, ArrowLeft, ArrowRight } from "lucide-react";
import { listPublishedArticles, type ArticleListItem } from "@/lib/articles.functions";
import { useLanguage } from "@/hooks/useLanguage";
import { buildMeta, buildSeoLinks, canonicalUrl } from "@/lib/seo";
import { breadcrumbSchema, itemListSchema, jsonLdString } from "@/lib/schema";

export const Route = createFileRoute("/articles/")({
  loader: async () => {
    const articles = await listPublishedArticles({ data: { limit: 30 } });
    return { articles };
  },
  head: ({ loaderData }) => {
    const articles = loaderData?.articles ?? [];
    const scripts: Array<{ type: string; children: string }> = [
      {
        type: "application/ld+json",
        children: jsonLdString(
          breadcrumbSchema([{ name: "المقالات", path: "/articles" }]),
        ),
      },
    ];
    if (articles.length > 0) {
      scripts.push({
        type: "application/ld+json",
        children: jsonLdString(
          itemListSchema({
            name: "مكتبة المحتوى الطبي",
            url: canonicalUrl("/articles"),
            items: articles.map((a) => ({
              name: a.title,
              url: canonicalUrl(`/articles/${a.slug}`),
              image: a.coverImage,
            })),
          }),
        ),
      });
    }
    return {
      meta: buildMeta({
        title: "مقالات طبية موثوقة من أطباء معتمدين | طبيبي",
        description:
          "مكتبة طبيبي للمحتوى الطبي: أعراض الأمراض، نصائح علاجية، وإرشادات صحية يكتبها أطباء موثّقون لخدمة المرضى في الوطن العربي.",
        path: "/articles",
      }),
      links: buildSeoLinks("/articles"),
      scripts,
    };
  },
  component: ArticlesIndexPage,
});

function ArticlesIndexPage() {
  const { articles } = Route.useLoaderData() as { articles: ArticleListItem[] };
  const { isRTL } = useLanguage();
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          مكتبة المحتوى الطبي
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          مقالات يكتبها أطباء موثّقون لمساعدتك على فهم الأعراض، ومعرفة متى تستشير الطبيب.
        </p>
      </header>

      {articles.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">
          سيتم نشر أول المقالات قريبًا.
        </p>
      ) : (
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
            <Link
              key={a.slug}
              to="/articles/$slug"
              params={{ slug: a.slug }}
              className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-lg"
            >
              {a.coverImage ? (
                <img
                  src={a.coverImage}
                  alt={a.title}
                  loading="lazy"
                  className="aspect-video w-full object-cover"
                />
              ) : (
                <div className="aspect-video w-full bg-linear-to-br from-primary/20 to-primary/5" />
              )}
              <div className="flex flex-1 flex-col p-5">
                <h2 className="text-lg font-bold group-hover:text-primary">{a.title}</h2>
                {a.excerpt ? (
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{a.excerpt}</p>
                ) : null}
                <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {a.readingMinutes} دقائق
                  </span>
                  <Arrow className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
