import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/useLanguage";
import { useCurrency } from "@/hooks/useCurrency";
import { supabase } from "@/integrations/supabase/client";
import { haversineKm } from "@/lib/distance";
import { Search, MapPin, Star, Stethoscope, BadgeCheck, Loader2, SlidersHorizontal, Navigation } from "lucide-react";
import { buildMeta, buildSeoLinks } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SponsoredDoctorsRow } from "@/components/doctors/SponsoredDoctorsRow";
import { TierBadge, type DoctorTier } from "@/components/TierBadge";

export const Route = createFileRoute("/doctors")({
  head: () => ({
    meta: buildMeta({
      title: "ابحث عن طبيب أونلاين — 2,500+ طبيب موثّق | طبيبي",
      description:
        "تصفّح أفضل الأطباء حسب التخصص والمدينة والتقييم. احجز موعدك حضورياً أو عبر فيديو خلال دقائق على منصة طبيبي.",
      path: "/doctors",
      keywords: [
        "ابحث عن طبيب",
        "أطباء معتمدون",
        "طبيب قريب مني",
        "حجز موعد طبيب أونلاين",
        "أفضل طبيب",
      ],
    }),
    links: buildSeoLinks("/doctors"),
    // Note: BreadcrumbList JSON-LD is emitted by the <Breadcrumbs /> component
    // below, so we don't duplicate it here.
  }),
  component: DoctorsPage,
});

type Specialty = { id: string; name_ar: string; name_en: string; slug: string };

type Clinic = {
  id: string;
  doctor_id: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
  consultation_fee: number | null;
  currency: string | null;
  clinic_schedules: Array<{ day_of_week: number }>;
};

type DoctorRow = {
  id: string;
  specialty: string | null;
  bio: string | null;
  clinic_name: string | null;
  clinic_address: string | null;
  consultation_fee: number | null;
  currency: string | null;
  years_experience: number | null;
  rating: number | null;
  is_verified: boolean | null;
  profile_id: string;
  profiles: { id: string; full_name: string | null; city: string | null; avatar_url: string | null } | null;
  clinics?: Clinic[];
};

type SortKey = "rating" | "price_asc" | "distance";

const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function DoctorsPage() {
  const { t, language } = useLanguage();
  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState<string>("");
  const [city, setCity] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [minFee, setMinFee] = useState("");
  const [maxFee, setMaxFee] = useState("");
  const [dayFilter, setDayFilter] = useState<number | "">("");
  const [sort, setSort] = useState<SortKey>("rating");
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [maxDistanceKm, setMaxDistanceKm] = useState<string>("");

  // Hydrate filters from URL query string on mount (so the new Hero
  // hierarchical search and "Near me" button can pre-populate this page).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sp = params.get("specialty");
    const c = params.get("city");
    const d = params.get("district");
    const g = params.get("gov");
    const co = params.get("country");
    const lat = params.get("lat");
    const lng = params.get("lng");
    const km = params.get("max_km");

    if (sp) setSpecialty(sp);
    // Use any of the location slugs as a free-text city filter (matches
    // against profiles.city / clinics.city via case-insensitive includes).
    const locSlug = d || c || g || co;
    if (locSlug) setCity(locSlug.replace(/-/g, " "));

    if (lat && lng) {
      const latN = Number(lat);
      const lngN = Number(lng);
      if (Number.isFinite(latN) && Number.isFinite(lngN)) {
        setUserLoc({ lat: latN, lng: lngN });
        setSort("distance");
      }
    }
    if (km) setMaxDistanceKm(km);
  }, []);

  const days = language === "ar" ? DAYS_AR : DAYS_EN;

  const { data: specialties = [] } = useQuery({
    queryKey: ["specialties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("specialties").select("*").order("name_en");
      if (error) throw error;
      return data as Specialty[];
    },
  });

  const { data: doctors = [], isLoading } = useQuery({
    queryKey: ["doctors-with-clinics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctor_details")
        .select(
          "*, profiles!doctor_details_profile_id_fkey(id, full_name, city, avatar_url), clinics(id, doctor_id, city, lat, lng, consultation_fee, currency, clinic_schedules(day_of_week))",
        )
        .order("rating", { ascending: false })
        .limit(200);
      if (error) {
        const { data: d2, error: e2 } = await supabase.from("doctor_details").select("*").limit(200);
        if (e2) throw e2;
        const ids = (d2 || []).map((d) => d.profile_id);
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, city, avatar_url")
          .in("id", ids);
        return (d2 || []).map((d) => ({
          ...d,
          profiles: profs?.find((p) => p.id === d.profile_id) ?? null,
          clinics: [],
        })) as DoctorRow[];
      }
      return data as unknown as DoctorRow[];
    },
  });

  // Fetch tier (free/premium/gold) for all visible doctors in one round-trip.
  const { data: tierMap = {} } = useQuery<Record<string, DoctorTier>>({
    queryKey: ["doctor-tiers", doctors.map((d) => d.id).join(",")],
    enabled: doctors.length > 0,
    queryFn: async () => {
      const ids = doctors.map((d) => d.id);
      const { data, error } = await supabase.rpc("doctor_active_tiers", { _doctor_ids: ids });
      if (error) return {};
      const map: Record<string, DoctorTier> = {};
      for (const r of (data ?? []) as Array<{ doctor_id: string; tier: string }>) {
        if (r.tier === "premium" || r.tier === "gold") {
          map[r.doctor_id] = r.tier;
        }
      }
      return map;
    },
  });

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocError(t("Geolocation not supported", "خاصية الموقع غير مدعومة"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocError(null);
        if (sort === "rating") setSort("distance");
      },
      () => setLocError(t("Permission denied", "تم رفض الإذن")),
    );
  };

  // Auto-clear distance sort when no location
  useEffect(() => {
    if (sort === "distance" && !userLoc) setSort("rating");
  }, [sort, userLoc]);

  const enriched = useMemo(() => {
    return doctors.map((d) => {
      let minDist: number | null = null;
      if (userLoc && d.clinics) {
        for (const c of d.clinics) {
          if (c.lat != null && c.lng != null) {
            const km = haversineKm(userLoc.lat, userLoc.lng, c.lat, c.lng);
            if (minDist == null || km < minDist) minDist = km;
          }
        }
      }
      return { ...d, _distance: minDist };
    });
  }, [doctors, userLoc]);

  const filtered = useMemo(() => {
    const minF = minFee ? Number(minFee) : null;
    const maxF = maxFee ? Number(maxFee) : null;
    const maxDist = maxDistanceKm ? Number(maxDistanceKm) : null;
    const dayN = dayFilter === "" ? null : Number(dayFilter);

    const out = enriched.filter((d) => {
      const name = d.profiles?.full_name?.toLowerCase() ?? "";
      const matchesSearch =
        !search ||
        name.includes(search.toLowerCase()) ||
        (d.specialty ?? "").toLowerCase().includes(search.toLowerCase());
      const matchesSpec = !specialty || d.specialty === specialty;
      const matchesCity =
        !city ||
        (d.profiles?.city ?? "").toLowerCase().includes(city.toLowerCase()) ||
        (d.clinics ?? []).some((c) => (c.city ?? "").toLowerCase().includes(city.toLowerCase()));
      const fee = Number(d.consultation_fee ?? 0);
      const matchesFee = (minF == null || fee >= minF) && (maxF == null || fee <= maxF);
      const matchesDay =
        dayN == null ||
        (d.clinics ?? []).some((c) => c.clinic_schedules.some((s) => s.day_of_week === dayN));
      const matchesDist = maxDist == null || (d._distance != null && d._distance <= maxDist);
      return matchesSearch && matchesSpec && matchesCity && matchesFee && matchesDay && matchesDist;
    });

    out.sort((a, b) => {
      if (sort === "price_asc") return Number(a.consultation_fee ?? 0) - Number(b.consultation_fee ?? 0);
      if (sort === "distance") {
        const ad = a._distance ?? Infinity;
        const bd = b._distance ?? Infinity;
        return ad - bd;
      }
      return Number(b.rating ?? 0) - Number(a.rating ?? 0);
    });
    return out;
  }, [enriched, search, specialty, city, minFee, maxFee, dayFilter, sort, maxDistanceKm]);

  return (
    <div className="min-h-screen bg-background">
      <Breadcrumbs items={[{ name: t("Doctors", "الأطباء"), path: "/doctors" }]} />
      {/* Hero search */}
      <div className="bg-linear-to-br from-primary/10 via-background to-teal/10 border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            {t("Find your doctor", "ابحث عن طبيبك")}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t("Browse verified doctors and book in seconds.", "تصفح أطباء موثقين واحجز في ثوانٍ.")}
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-3 bg-card p-4 rounded-xl shadow-sm border border-border">
            <div className="relative">
              <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Doctor name or specialty", "اسم الطبيب أو التخصص")}
                className="w-full ps-10 pe-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <select
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{t("All specialties", "كل التخصصات")}</option>
              {specialties.map((s) => (
                <option key={s.id} value={language === "ar" ? s.name_ar : s.name_en}>
                  {language === "ar" ? s.name_ar : s.name_en}
                </option>
              ))}
            </select>
            <div className="relative">
              <MapPin className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-muted-foreground" />
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t("City (e.g. Cairo)", "المدينة (مثال: القاهرة)")}
                className="w-full ps-10 pe-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Advanced filters toolbar */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-sm hover:border-primary/50"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {t("Filters", "فلاتر")}
            </button>
            <button
              onClick={requestLocation}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition ${
                userLoc ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card hover:border-primary/50"
              }`}
            >
              <Navigation className="h-4 w-4" />
              {userLoc ? t("Using your location", "موقعك مفعّل") : t("Near me", "بالقرب مني")}
            </button>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="px-3 py-1.5 rounded-lg border border-border bg-card text-sm"
            >
              <option value="rating">{t("Top rated", "الأعلى تقييماً")}</option>
              <option value="price_asc">{t("Lowest price", "الأرخص")}</option>
              {userLoc && <option value="distance">{t("Closest first", "الأقرب أولاً")}</option>}
            </select>
            {locError && <span className="text-xs text-destructive">{locError}</span>}
          </div>

          {showFilters && (
            <div className="mt-3 grid gap-3 md:grid-cols-4 bg-card p-4 rounded-xl border border-border">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  {t("Min fee", "أقل سعر")}
                </label>
                <input
                  type="number"
                  min="0"
                  value={minFee}
                  onChange={(e) => setMinFee(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  {t("Max fee", "أعلى سعر")}
                </label>
                <input
                  type="number"
                  min="0"
                  value={maxFee}
                  onChange={(e) => setMaxFee(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  {t("Available on", "متاح يوم")}
                </label>
                <select
                  value={dayFilter}
                  onChange={(e) => setDayFilter(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                >
                  <option value="">{t("Any day", "أي يوم")}</option>
                  {days.map((d, i) => (
                    <option key={i} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  {t("Within (km)", "ضمن (كم)")}
                </label>
                <input
                  type="number"
                  min="0"
                  disabled={!userLoc}
                  value={maxDistanceKm}
                  onChange={(e) => setMaxDistanceKm(e.target.value)}
                  placeholder={userLoc ? "10" : t("Enable location", "فعّل الموقع")}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm disabled:opacity-50"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Specialty pillar links (Silo internal linking for SEO) */}
      {specialties.length > 0 && (
        <nav
          aria-label={t("Browse by specialty", "تصفّح حسب التخصص")}
          className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8"
        >
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t("Browse doctors by specialty", "تصفّح الأطباء حسب التخصص")}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {specialties.map((s) => {
              const label = language === "ar" ? s.name_ar : s.name_en;
              return (
                <Link
                  key={`pillar-${s.id}`}
                  to="/specialty/$slug"
                  params={{ slug: s.slug }}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition hover:border-primary/50 hover:text-primary"
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* Specialty chips */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setSpecialty("")}
            className={`px-4 py-2 rounded-full text-sm whitespace-nowrap border transition ${
              !specialty ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/50"
            }`}
          >
            {t("All", "الكل")}
          </button>
          {specialties.map((s) => {
            const label = language === "ar" ? s.name_ar : s.name_en;
            const active = specialty === label;
            return (
              <button
                key={s.id}
                onClick={() => setSpecialty(label)}
                className={`px-4 py-2 rounded-full text-sm whitespace-nowrap border transition ${
                  active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/50"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <SponsoredDoctorsRow specialty={specialty || undefined} />
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-xl">
            <Stethoscope className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">
              {t("No doctors match your search yet.", "لا يوجد أطباء يطابقون بحثك بعد.")}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((d) => (
              <DoctorCard key={d.id} doctor={d} tier={tierMap[d.id]} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DoctorCard({ doctor, tier }: { doctor: DoctorRow & { _distance?: number | null }; tier?: DoctorTier }) {
  const { t } = useLanguage();
  const { formatPrice } = useCurrency();
  const name = doctor.profiles?.full_name ?? t("Doctor", "طبيب");
  const initial = name.charAt(0).toUpperCase();
  const fee = Number(doctor.consultation_fee ?? 0);
  const ccy = doctor.currency ?? "EGP";
  const isGold = tier === "gold";
  return (
    <Link
      to="/doctor/$id"
      params={{ id: doctor.id }}
      className={`group block bg-card rounded-2xl p-5 transition ${
        isGold
          ? "border-2 border-amber-300 shadow-md hover:shadow-lg"
          : "border border-border hover:border-primary/50 hover:shadow-md"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="h-14 w-14 rounded-full bg-linear-to-br from-primary to-teal flex items-center justify-center text-primary-foreground text-xl font-semibold shrink-0">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-semibold text-foreground truncate">{name}</h3>
            {doctor.is_verified && <BadgeCheck className="h-4 w-4 text-primary shrink-0" />}
            <TierBadge tier={tier} size="sm" />
          </div>
          <p className="text-sm text-muted-foreground truncate">{doctor.specialty}</p>
          {doctor.profiles?.city && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {doctor.profiles.city}
              {doctor._distance != null && (
                <span className="ms-1">· {doctor._distance.toFixed(1)} km</span>
              )}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        <div className="flex items-center gap-1 text-foreground">
          <Star className="h-4 w-4 fill-current text-amber-500" />
          <span className="font-medium">{Number(doctor.rating ?? 0).toFixed(1)}</span>
        </div>
        <div className="text-muted-foreground">
          {fee > 0 ? formatPrice(fee, ccy) : t("Free", "مجاناً")}
        </div>
      </div>
    </Link>
  );
}
