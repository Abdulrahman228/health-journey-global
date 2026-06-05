import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pill, Search, MapPin, Plus, Loader2, Filter, Building2 } from "lucide-react";
import { PostCard } from "@/components/feed/PostCard";
import { ListingCard } from "@/components/pharmacy/ListingCard";
import { useLanguage } from "@/hooks/useLanguage";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { listPosts, reverseGeocodeCity } from "@/lib/feed";
import { listDrugListings } from "@/lib/pharmacy";
import { toast } from "sonner";

export const Route = createFileRoute("/missing-drugs")({
  component: MissingDrugsPage,
  head: () => ({
    meta: [
      { title: "Missing Medications | Tabibi | الأدوية الناقصة" },
      {
        name: "description",
        content:
          "Search for missing medications in your city, find alternatives suggested by verified doctors and pharmacists. ابحث عن الأدوية الناقصة في مدينتك وتعرّف على البدائل.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="p-8 text-center text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Not found</div>,
});

function MissingDrugsPage() {
  const { t, language } = useLanguage();
  const { ready: mapsReady } = useGoogleMaps();

  const [drugName, setDrugName] = useState("");
  const [city, setCity] = useState("");
  const [resolved, setResolved] = useState<"all" | "open" | "resolved">("open");
  const [locating, setLocating] = useState(false);

  const { data: posts, isLoading } = useQuery({
    queryKey: ["missing-drugs", { drugName, city, resolved }],
    queryFn: () =>
      listPosts({
        type: "missing_drug",
        drugName: drugName.trim() || undefined,
        city: city.trim() || undefined,
        resolved,
        limit: 80,
      }),
  });

  const { data: pharmacyListings } = useQuery({
    queryKey: ["pharmacy-listings", { drugName, city }],
    queryFn: () =>
      listDrugListings({
        drugName: drugName.trim() || undefined,
        city: city.trim() || undefined,
        limit: 30,
      }),
  });

  async function handleNearMe() {
    if (!("geolocation" in navigator)) {
      toast.error(t("Geolocation not supported", "تحديد الموقع غير مدعوم"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { city: foundCity } = await reverseGeocodeCity(
            pos.coords.latitude,
            pos.coords.longitude,
          );
          if (foundCity) {
            setCity(foundCity);
            toast.success(t(`Filtered by ${foundCity}`, `تم الفلترة حسب ${foundCity}`));
          } else {
            toast.error(t("Couldn't detect your city", "تعذّر تحديد مدينتك"));
          }
        } catch {
          toast.error(t("Location lookup failed", "فشل تحديد الموقع"));
        } finally {
          setLocating(false);
        }
      },
      () => {
        toast.error(t("Permission denied", "تم رفض الإذن"));
        setLocating(false);
      },
      { timeout: 10000 },
    );
  }

  return (
    <div>
        {/* Hero */}
        <section className="border-b border-border bg-linear-to-br from-rose-500/10 via-background to-background">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-600">
                <Pill className="h-7 w-7" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  {t("Missing Medications", "الأدوية الناقصة")}
                </h1>
                <p className="mt-2 text-muted-foreground max-w-2xl">
                  {t(
                    "Report a medication you can't find, search what others reported, and let verified doctors or pharmacists suggest alternatives in your city.",
                    "أبلِغ عن دواء لم تجده، ابحث في ما أبلغ به الآخرون، ودع الأطباء والصيادلة الموثّقين يقترحون البدائل في مدينتك.",
                  )}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to="/feed/new"
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
                  >
                    <Plus className="h-4 w-4" />
                    {t("Report missing drug", "أبلِغ عن دواء ناقص")}
                  </Link>
                  <Link
                    to="/feed"
                    className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    {t("Back to community", "العودة للمجتمع")}
                  </Link>
                  <Link
                    to="/pharmacy/register"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-teal/30 bg-teal/10 px-4 py-2 text-sm font-medium text-teal transition-colors hover:bg-teal/15"
                  >
                    <Building2 className="h-4 w-4" />
                    {t("Are you a pharmacy?", "هل تمتلك صيدلية؟")}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="border-b border-border bg-card/50">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-5">
            <div className="grid gap-3 md:grid-cols-12">
              <div className="md:col-span-5 relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={drugName}
                  onChange={(e) => setDrugName(e.target.value)}
                  placeholder={t("Drug name (e.g. Augmentin)", "اسم الدواء (مثل أوجمنتين)")}
                  className="w-full rounded-xl border border-border bg-background ps-9 pe-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="md:col-span-4 relative">
                <MapPin className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={t("City", "المدينة")}
                  className="w-full rounded-xl border border-border bg-background ps-9 pe-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <button
                onClick={handleNearMe}
                disabled={!mapsReady || locating}
                className="md:col-span-3 inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
              >
                {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                {t("Near me", "قريب مني")}
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2 text-sm">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {(["open", "all", "resolved"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setResolved(opt)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    resolved === opt
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {opt === "open"
                    ? t("Open", "قائم")
                    : opt === "resolved"
                      ? t("Resolved", "تم الحل")
                      : t("All", "الكل")}
                </button>
              ))}
              {(drugName || city) && (
                <button
                  onClick={() => {
                    setDrugName("");
                    setCity("");
                  }}
                  className="ms-auto text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  {t("Clear filters", "مسح الفلاتر")}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Results */}
        <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          {pharmacyListings && pharmacyListings.length > 0 && (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-teal" />
                <h2 className="text-lg font-bold text-foreground">
                  {t("Available now at verified pharmacies", "متوفر الآن في صيدليات موثّقة")}
                </h2>
                <span className="rounded-full bg-teal/15 px-2 py-0.5 text-xs font-semibold text-teal">
                  {pharmacyListings.length}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {pharmacyListings.map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </div>
            </div>
          )}

          <div>
            {(pharmacyListings?.length ?? 0) > 0 && (
              <h2 className="mb-4 text-lg font-bold text-foreground">
                {t("Community reports", "بلاغات المجتمع")}
              </h2>
            )}
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : !posts || posts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/30 p-12 text-center">
                <Pill className="mx-auto h-10 w-10 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  {t("No missing-drug reports match", "لا توجد بلاغات أدوية تطابق البحث")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("Try widening your filters or be the first to report.", "جرّب توسيع الفلاتر أو كن أول من يُبلِغ.")}
                </p>
                <Link to="/feed/new" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">
                  <Plus className="h-4 w-4" />
                  {t("Report a drug", "أبلِغ عن دواء")}
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-4 text-sm text-muted-foreground">
                  {language === "ar" ? `${posts.length} نتيجة` : `${posts.length} result${posts.length === 1 ? "" : "s"}`}
                </div>
                <div className="space-y-4">
                  {posts.map((p) => <PostCard key={p.id} post={p} />)}
                </div>
              </>
            )}
          </div>
        </section>
    </div>
  );
}
