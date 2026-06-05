import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ClinicMap } from "@/components/maps/ClinicMap";
import { buildMeta, buildSeoLinks } from "@/lib/seo";
import {
  Loader2,
  MapPin,
  Navigation,
  Stethoscope,
  Star,
  BadgeCheck,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/nearby")({
  head: () => ({
    meta: buildMeta({
      title: "أطباء قريبون منك — البحث الجغرافي | طبيبي",
      description:
        "اعثر على أقرب الأطباء الموثّقين حولك في الخليج ومصر. خريطة حيّة، ترتيب حسب المسافة، وحجز فوري.",
      path: "/nearby",
      keywords: [
        "طبيب قريب مني",
        "أقرب طبيب",
        "بحث جغرافي عن الأطباء",
        "خريطة الأطباء",
      ],
    }),
    links: buildSeoLinks("/nearby"),
  }),
  component: NearbyDoctorsPage,
});

type NearbyRow = {
  doctor_id: string;
  full_name: string | null;
  specialty: string | null;
  consultation_fee: number | null;
  rating: number | null;
  clinic_id: string;
  clinic_name: string | null;
  clinic_lat: number;
  clinic_lng: number;
  city: string | null;
  distance_km: number;
};

type Specialty = { id: string; name_ar: string; name_en: string; slug: string };

const RADIUS_OPTIONS = [5, 10, 15, 25, 50, 100];

function NearbyDoctorsPage() {
  const { t, language } = useLanguage();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [coordsError, setCoordsError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [radiusKm, setRadiusKm] = useState<number>(15);
  const [specialty, setSpecialty] = useState<string>("");

  // Hydrate from URL: ?lat=&lng=&max_km=&specialty=
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const lat = p.get("lat");
    const lng = p.get("lng");
    const km = p.get("max_km");
    const sp = p.get("specialty");
    if (lat && lng) {
      const la = Number(lat);
      const ln = Number(lng);
      if (Number.isFinite(la) && Number.isFinite(ln)) setCoords({ lat: la, lng: ln });
    }
    if (km) {
      const k = Number(km);
      if (Number.isFinite(k) && k > 0) setRadiusKm(k);
    }
    if (sp) setSpecialty(sp);
  }, []);

  function requestLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setCoordsError(t("Geolocation not supported", "متصفحك لا يدعم تحديد الموقع"));
      return;
    }
    setRequesting(true);
    setCoordsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setRequesting(false);
      },
      (err) => {
        setRequesting(false);
        setCoordsError(
          err.code === err.PERMISSION_DENIED
            ? t("Location permission denied", "تم رفض إذن الموقع")
            : t("Could not determine your location", "تعذّر تحديد موقعك"),
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // Auto-request once on mount if we don't have coords from URL
  useEffect(() => {
    if (!coords && !coordsError) requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: specialties = [] } = useQuery<Specialty[]>({
    queryKey: ["specialties-nearby"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialties")
        .select("id,name_ar,name_en,slug")
        .order("name_en");
      if (error) throw error;
      return data as Specialty[];
    },
  });

  const { data: rows = [], isLoading, error: rpcError } = useQuery<NearbyRow[]>({
    queryKey: ["nearby", coords?.lat, coords?.lng, radiusKm, specialty],
    enabled: !!coords,
    queryFn: async () => {
      if (!coords) return [];
      // The RPC isn't in the generated supabase types yet, so we cast through unknown.
      const { data, error } = await ((supabase.rpc as unknown) as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: NearbyRow[] | null; error: unknown }>)(
        "search_doctors_nearby",
        {
          p_lat: coords.lat,
          p_lng: coords.lng,
          p_radius_km: radiusKm,
          p_specialty: specialty || null,
        },
      );
      if (error) {
        const msg =
          error && typeof error === "object" && "message" in error
            ? String((error as { message: unknown }).message)
            : "RPC error";
        throw new Error(msg);
      }
      return data ?? [];
    },
  });

  const markers = useMemo(
    () =>
      rows.map((r) => ({
        lat: r.clinic_lat,
        lng: r.clinic_lng,
        title: r.full_name ?? "",
      })),
    [rows],
  );

  const isRTL = language === "ar";

  return (
    <div className="min-h-screen bg-background">
      <Breadcrumbs
        items={[{ name: t("Nearby doctors", "أطباء قريبون منك"), path: "/nearby" }]}
      />

      <div className="bg-linear-to-br from-primary/10 via-background to-teal/10 border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t("Doctors near you", "أطباء قريبون منك")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Verified doctors sorted by real driving distance from your current location.",
              "أطباء موثّقون مرتّبون حسب المسافة الفعلية من موقعك الحالي.",
            )}
          </p>

          {/* Controls */}
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div>
              <label htmlFor="nearby-specialty" className="block text-xs font-medium mb-1 text-muted-foreground">
                {t("Specialty", "التخصص")}
              </label>
              <div className="relative">
                <Stethoscope className="pointer-events-none absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground rtl:right-3 ltr:left-3" />
                <select
                  id="nearby-specialty"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-border bg-card px-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">{t("All specialties", "كل التخصصات")}</option>
                  {specialties.map((s) => (
                    <option key={s.id} value={s.slug}>
                      {isRTL ? s.name_ar : s.name_en}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="nearby-radius" className="block text-xs font-medium mb-1 text-muted-foreground">
                {t("Radius (km)", "نطاق البحث (كم)")}
              </label>
              <select
                id="nearby-radius"
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className="w-full appearance-none rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {RADIUS_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r} {t("km", "كم")}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={requestLocation}
                disabled={requesting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              >
                {requesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Navigation className="h-4 w-4" />
                )}
                {t("Use my current location", "استخدم موقعي الحالي")}
              </button>
            </div>
          </div>

          {coordsError && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {coordsError}
            </div>
          )}
          {coords && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Searching from:", "نبحث انطلاقًا من:")}{" "}
              <span className="font-mono">
                {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Map + results */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <ClinicMap
              markers={markers}
              center={coords ?? undefined}
              zoom={11}
              className="h-[420px] w-full rounded-xl border border-border"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {markers.length}{" "}
              {t(
                markers.length === 1 ? "clinic on the map" : "clinics on the map",
                "عيادة على الخريطة",
              )}
            </p>
          </div>

          <div>
            {!coords && !coordsError && (
              <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                {t(
                  "Allow location access to find doctors near you.",
                  "اسمح للمتصفح بالوصول لموقعك لعرض الأطباء حولك.",
                )}
              </div>
            )}

            {isLoading && coords && (
              <div className="flex items-center justify-center rounded-xl border border-border bg-card p-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {rpcError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {(rpcError as Error).message}
              </div>
            )}

            {!isLoading && coords && rows.length === 0 && !rpcError && (
              <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                {t(
                  "No doctors found within this radius. Try a larger radius or different specialty.",
                  "لا يوجد أطباء ضمن هذا النطاق. جرّب نطاقًا أوسع أو تخصصًا مختلفًا.",
                )}
              </div>
            )}

            {!isLoading && rows.length > 0 && (
              <ul className="space-y-3">
                {rows.map((r) => (
                  <li
                    key={`${r.doctor_id}-${r.clinic_id}`}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-foreground truncate">
                          {r.full_name ?? t("Doctor", "طبيب")}
                          <BadgeCheck className="inline-block h-4 w-4 text-primary ms-1" />
                        </h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {r.specialty ?? "—"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {r.clinic_name ?? "—"}
                          {r.city ? <span className="opacity-70">· {r.city}</span> : null}
                        </p>
                      </div>
                      <div className="shrink-0 text-right rtl:text-left">
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          <Navigation className="h-3 w-3" />
                          {r.distance_km.toFixed(1)} {t("km", "كم")}
                        </span>
                        {r.rating != null && (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {Number(r.rating).toFixed(1)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {r.consultation_fee != null
                          ? `${r.consultation_fee} ${t("EGP", "ج.م")}`
                          : ""}
                      </span>
                      <Link
                        to="/doctor/$id"
                        params={{ id: r.doctor_id }}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {t("View profile →", "عرض الملف ←")}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
