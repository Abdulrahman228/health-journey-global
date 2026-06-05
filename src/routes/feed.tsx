import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Search, Megaphone, AlertTriangle, Pill, Layers } from "lucide-react";
import { PostCard } from "@/components/feed/PostCard";
import { listPosts, getUserReactions, type FeedPost, type PostType } from "@/lib/feed";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "المجتمع الطبي — Tabibi" },
      { name: "description", content: "شبكة تواصل طبية: نصائح من الأطباء، استفسارات المرضى، والبحث عن الأدوية الناقصة." },
      { property: "og:title", content: "المجتمع الطبي — Tabibi" },
      { property: "og:description", content: "نصائح من أطباء موثّقين، أسئلة المرضى، والبحث عن أدوية ناقصة." },
    ],
  }),
  component: FeedPage,
});

const filterTabs: { key: PostType | "all"; labelEn: string; labelAr: string; icon: typeof Layers }[] = [
  { key: "all", labelEn: "All", labelAr: "الكل", icon: Layers },
  { key: "awareness", labelEn: "Awareness", labelAr: "توعية", icon: Megaphone },
  { key: "question", labelEn: "Questions", labelAr: "استفسارات", icon: AlertTriangle },
  { key: "missing_drug", labelEn: "Missing Drugs", labelAr: "أدوية ناقصة", icon: Pill },
];

function FeedPage() {
  const { t, language } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [reactedIds, setReactedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<PostType | "all">("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPosts({ type, search: search || undefined })
      .then(async (data) => {
        if (cancelled) return;
        setPosts(data);
        if (user) {
          const reacted = await getUserReactions(user.id, data.map((p) => p.id));
          if (!cancelled) setReactedIds(reacted);
        }
      })
      .catch(() => {
        if (!cancelled) setPosts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type, search, user]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        {/* Hero */}
        <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t("Medical Community", "المجتمع الطبي")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Awareness from verified doctors, patient questions, and missing-drug alerts.",
                "نصائح من أطباء موثّقين، استفسارات المرضى، وتنبيهات الأدوية الناقصة."
              )}
            </p>
          </div>
          <Link
            to="/feed/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t("New post", "بوست جديد")}
          </Link>
        </div>

        {/* Search */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
          className="relative mb-4"
        >
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("Search posts...", "ابحث في البوستات...")}
            className="w-full rounded-xl border border-border bg-card ps-10 pe-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </form>

        {/* Filter tabs */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
          {filterTabs.map((tab) => {
            const Icon = tab.icon;
            const active = type === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setType(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {language === "ar" ? tab.labelAr : tab.labelEn}
              </button>
            );
          })}
        </div>

        {/* Posts */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">{t("No posts yet. Be the first!", "لا توجد بوستات. كن أول من ينشر!")}</p>
            {isAuthenticated && (
              <Link
                to="/feed/new"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                {t("Create post", "أنشئ بوست")}
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} initiallyLiked={reactedIds.has(p.id)} />
            ))}
          </div>
        )}
    </div>
  );
}
