/**
 * Server functions for SEO data loading.
 *
 * These run on the server (during SSR) so route `loader`s can feed
 * real, dynamic data into `head()` for proper meta tags, Open Graph,
 * and JSON-LD before the HTML is sent to the crawler.
 */
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface DoctorSeoData {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  city: string | null;
  specialty: string | null;
  bio: string | null;
  rating: number | null;
  reviewCount: number;
  yearsExperience: number | null;
  consultationFee: number | null;
  currency: string | null;
  isVerified: boolean;
  telemedicineEnabled: boolean;
  languages: string[];
  primaryClinic: {
    name: string | null;
    address: string | null;
    city: string | null;
    phone: string | null;
  } | null;
  clinics: Array<{
    id: string;
    name: string | null;
    address: string | null;
    city: string | null;
    phone: string | null;
    lat: number | null;
    lng: number | null;
  }>;
  reviews: Array<{
    id: string;
    rating: number;
    comment: string | null;
    authorName: string | null;
    createdAt: string;
  }>;
  updatedAt: string | null;
}

/**
 * Load a single doctor's public SEO data (name, specialty, rating, etc.).
 * Returns null if doctor missing or not verified — page should 404 or redirect.
 */
export const loadDoctorForSeo = createServerFn({ method: "GET" })
  .inputValidator((id: unknown): string => {
    if (typeof id !== "string" || !id) throw new Error("doctor id required");
    return id;
  })
  .handler(async ({ data: id }): Promise<DoctorSeoData | null> => {
    const { data: d, error } = await supabaseAdmin
      .from("doctor_details")
      .select(
        "id, profile_id, specialty, bio, consultation_fee, currency, years_experience, rating, is_verified, telemedicine_enabled, languages, updated_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (error || !d) return null;

    const [{ data: p }, { data: clinics }, { count: reviewCount }, { data: latestReviews }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("full_name, city, avatar_url")
        .eq("id", d.profile_id)
        .maybeSingle(),
      supabaseAdmin
        .from("clinics")
        .select("id, name, address, city, phone, lat, lng, is_primary")
        .eq("doctor_id", id)
        .order("is_primary", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("doctor_id", id)
        .eq("status", "approved")
        .eq("is_published_by_doctor", true),
      // Latest 10 reviews with comments — used for individual Review
      // schema items (rich star snippets in SERP).
      supabaseAdmin
        .from("reviews")
        .select("id, rating, comment, patient_id, created_at")
        .eq("doctor_id", id)
        .eq("status", "approved")
        .eq("is_published_by_doctor", true)
        .not("comment", "is", null)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    // Hydrate reviewer display names from profiles (best-effort).
    const reviewerIds = [...new Set((latestReviews ?? []).map((r) => r.patient_id).filter(Boolean))];
    const reviewerById = new Map<string, string | null>();
    if (reviewerIds.length > 0) {
      const { data: rp } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", reviewerIds);
      (rp ?? []).forEach((p) => reviewerById.set(p.id, p.full_name));
    }

    const primary = clinics?.[0] ?? null;
    return {
      id: d.id,
      name: p?.full_name ?? null,
      avatarUrl: p?.avatar_url ?? null,
      city: p?.city ?? primary?.city ?? null,
      specialty: d.specialty,
      bio: d.bio,
      rating: typeof d.rating === "number" ? d.rating : null,
      reviewCount: reviewCount ?? 0,
      yearsExperience: d.years_experience,
      consultationFee: d.consultation_fee,
      currency: d.currency,
      isVerified: Boolean(d.is_verified),
      telemedicineEnabled: Boolean(d.telemedicine_enabled),
      languages: Array.isArray(d.languages) && d.languages.length > 0 ? d.languages : ["Arabic", "English"],
      primaryClinic: primary
        ? { name: primary.name, address: primary.address, city: primary.city, phone: primary.phone }
        : null,
      clinics: (clinics ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        address: c.address,
        city: c.city,
        phone: c.phone,
        lat: typeof c.lat === "number" ? c.lat : null,
        lng: typeof c.lng === "number" ? c.lng : null,
      })),
      reviews: (latestReviews ?? []).map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        authorName: reviewerById.get(r.patient_id) ?? null,
        createdAt: r.created_at,
      })),
      updatedAt: d.updated_at,
    };
  });

export interface SpecialtySeoData {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  icon: string | null;
  doctorCount: number;
  topDoctors: Array<{
    id: string;
    name: string | null;
    rating: number | null;
    city: string | null;
    avatarUrl: string | null;
    yearsExperience: number | null;
    consultationFee: number | null;
    currency: string | null;
  }>;
}

/**
 * Load specialty pillar data: name + verified doctor count + top doctors.
 * Used by /specialty/$slug pillar pages (Silo structure).
 */
export const loadSpecialtyForSeo = createServerFn({ method: "GET" })
  .inputValidator((slug: unknown): string => {
    if (typeof slug !== "string" || !slug) throw new Error("specialty slug required");
    return slug;
  })
  .handler(async ({ data: slug }): Promise<SpecialtySeoData | null> => {
    const { data: spec, error } = await supabaseAdmin
      .from("specialties")
      .select("id, slug, name_ar, name_en, icon")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !spec) return null;

    // Match by specialty name (either Arabic or English) since doctor_details.specialty
    // is a free-text string today, not a foreign key.
    const { data: doctors, count } = await supabaseAdmin
      .from("doctor_details")
      .select(
        "id, profile_id, rating, years_experience, consultation_fee, currency, is_verified",
        { count: "exact" },
      )
      .or(`specialty.eq.${spec.name_ar},specialty.eq.${spec.name_en}`)
      .eq("is_verified", true)
      .order("rating", { ascending: false })
      .limit(12);

    const ids = (doctors ?? []).map((d) => d.profile_id);
    const profilesById = new Map<string, { full_name: string | null; city: string | null; avatar_url: string | null }>();
    if (ids.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, city, avatar_url")
        .in("id", ids);
      (profs ?? []).forEach((p) => profilesById.set(p.id, p));
    }

    return {
      id: spec.id,
      slug: spec.slug,
      nameAr: spec.name_ar,
      nameEn: spec.name_en,
      icon: spec.icon,
      doctorCount: count ?? 0,
      topDoctors: (doctors ?? []).map((d) => {
        const p = profilesById.get(d.profile_id);
        return {
          id: d.id,
          name: p?.full_name ?? null,
          rating: typeof d.rating === "number" ? d.rating : null,
          city: p?.city ?? null,
          avatarUrl: p?.avatar_url ?? null,
          yearsExperience: d.years_experience,
          consultationFee: d.consultation_fee,
          currency: d.currency,
        };
      }),
    };
  });

/**
 * List all specialties — used by sitemap.xml to enumerate pillar URLs.
 */
export const listAllSpecialties = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("specialties")
    .select("slug, name_ar, name_en")
    .order("name_en");
  if (error || !data) return [];
  return data;
});

export interface FeaturedDoctor {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  specialty: string | null;
  city: string | null;
  rating: number | null;
  yearsExperience: number | null;
  consultationFee: number | null;
  currency: string | null;
  telemedicineEnabled: boolean;
}

/**
 * Top verified doctors for the homepage "Featured" carousel.
 * SSR-rendered, so they appear in the initial HTML for both crawlers
 * and impatient users (zero JS hydration delay).
 */
export const listFeaturedDoctors = createServerFn({ method: "GET" }).handler(
  async (): Promise<FeaturedDoctor[]> => {
    const { data: doctors } = await supabaseAdmin
      .from("doctor_details")
      .select(
        "id, profile_id, specialty, rating, years_experience, consultation_fee, currency, telemedicine_enabled",
      )
      .eq("is_verified", true)
      .order("rating", { ascending: false })
      .limit(8);
    if (!doctors || doctors.length === 0) return [];
    const ids = doctors.map((d) => d.profile_id);
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, city, avatar_url")
      .in("id", ids);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return doctors.map((d) => {
      const p = byId.get(d.profile_id);
      return {
        id: d.id,
        name: p?.full_name ?? null,
        avatarUrl: p?.avatar_url ?? null,
        specialty: d.specialty,
        city: p?.city ?? null,
        rating: typeof d.rating === "number" ? d.rating : null,
        yearsExperience: d.years_experience,
        consultationFee: d.consultation_fee,
        currency: d.currency,
        telemedicineEnabled: Boolean(d.telemedicine_enabled),
      };
    });
  },
);

export interface SpecialtyCitySeoData {
  specialty: { id: string; slug: string; nameAr: string; nameEn: string };
  city: { slug: string; nameAr: string; nameEn: string; countryCode: string };
  doctorCount: number;
  topDoctors: Array<{
    id: string;
    name: string | null;
    rating: number | null;
    avatarUrl: string | null;
    yearsExperience: number | null;
    consultationFee: number | null;
    currency: string | null;
    telemedicineEnabled: boolean;
  }>;
}

/**
 * Load specialty × city combo data — powers /specialty/$slug/$city pages.
 * Highest-intent BOFU-flavoured pages ("best cardiologist in Riyadh").
 */
export const loadSpecialtyCityForSeo = createServerFn({ method: "GET" })
  .inputValidator((data: unknown): { slug: string; city: string } => {
    if (
      !data ||
      typeof data !== "object" ||
      typeof (data as Record<string, unknown>).slug !== "string" ||
      typeof (data as Record<string, unknown>).city !== "string"
    ) {
      throw new Error("slug & city required");
    }
    return data as { slug: string; city: string };
  })
  .handler(async ({ data }): Promise<SpecialtyCitySeoData | null> => {
    const { getCityBySlug, cityMatchTerms } = await import("@/lib/cities");

    const city = getCityBySlug(data.city);
    if (!city) return null;

    const { data: spec } = await supabaseAdmin
      .from("specialties")
      .select("id, slug, name_ar, name_en")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!spec) return null;

    const cityTerms = cityMatchTerms(city);
    // Find profile IDs whose `city` matches any term (Ar/En/aliases)
    const cityFilter = cityTerms.map((t) => `city.eq.${t.replace(/,/g, " ")}`).join(",");
    const { data: cityProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, city, avatar_url")
      .or(cityFilter)
      .limit(500);
    const profileIds = (cityProfiles ?? []).map((p) => p.id);
    if (profileIds.length === 0) {
      return {
        specialty: { id: spec.id, slug: spec.slug, nameAr: spec.name_ar, nameEn: spec.name_en },
        city: { slug: city.slug, nameAr: city.nameAr, nameEn: city.nameEn, countryCode: city.countryCode },
        doctorCount: 0,
        topDoctors: [],
      };
    }

    const { data: doctors, count } = await supabaseAdmin
      .from("doctor_details")
      .select(
        "id, profile_id, rating, years_experience, consultation_fee, currency, telemedicine_enabled, is_verified",
        { count: "exact" },
      )
      .in("profile_id", profileIds)
      .or(`specialty.eq.${spec.name_ar},specialty.eq.${spec.name_en}`)
      .eq("is_verified", true)
      .order("rating", { ascending: false })
      .limit(12);

    const profileById = new Map((cityProfiles ?? []).map((p) => [p.id, p]));

    return {
      specialty: { id: spec.id, slug: spec.slug, nameAr: spec.name_ar, nameEn: spec.name_en },
      city: { slug: city.slug, nameAr: city.nameAr, nameEn: city.nameEn, countryCode: city.countryCode },
      doctorCount: count ?? 0,
      topDoctors: (doctors ?? []).map((d) => {
        const p = profileById.get(d.profile_id);
        return {
          id: d.id,
          name: p?.full_name ?? null,
          rating: typeof d.rating === "number" ? d.rating : null,
          avatarUrl: p?.avatar_url ?? null,
          yearsExperience: d.years_experience,
          consultationFee: d.consultation_fee,
          currency: d.currency,
          telemedicineEnabled: Boolean(d.telemedicine_enabled),
        };
      }),
    };
  });

/**
 * For sitemap: enumerate which specialty×city combos actually have ≥1
 * verified doctor (avoid generating thousands of empty pages = thin content trap).
 */
export const listSpecialtyCityCombos = createServerFn({ method: "GET" }).handler(
  async (): Promise<Array<{ slug: string; city: string }>> => {
    const { CITIES, cityMatchTerms } = await import("@/lib/cities");

    const [{ data: specs }, { data: doctors }, { data: profiles }] = await Promise.all([
      supabaseAdmin.from("specialties").select("slug, name_ar, name_en"),
      supabaseAdmin
        .from("doctor_details")
        .select("profile_id, specialty")
        .eq("is_verified", true)
        .limit(5000),
      supabaseAdmin.from("profiles").select("id, city").limit(10000),
    ]);

    if (!specs || !doctors || !profiles) return [];
    const cityByProfile = new Map(profiles.map((p) => [p.id, (p.city ?? "").trim()]));

    const seen = new Set<string>();
    for (const d of doctors) {
      const docCity = cityByProfile.get(d.profile_id);
      if (!docCity) continue;
      for (const spec of specs) {
        if (d.specialty !== spec.name_ar && d.specialty !== spec.name_en) continue;
        for (const city of CITIES) {
          if (cityMatchTerms(city).includes(docCity)) {
            seen.add(`${spec.slug}|${city.slug}`);
          }
        }
      }
    }
    return [...seen].map((k) => {
      const [slug, city] = k.split("|");
      return { slug, city };
    });
  },
);
