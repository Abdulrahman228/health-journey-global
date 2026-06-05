import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  MapPin,
  Star,
  Video,
  Languages,
  Building2,
  BadgeCheck,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useCurrency } from "@/hooks/useCurrency";
import { supabase } from "@/integrations/supabase/client";
import { buildMeta, buildSeoLinks, siteConfig, truncate } from "@/lib/seo";
import {
  physicianSchema,
  breadcrumbSchema,
  jsonLdString,
} from "@/lib/schema";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ShareProfileButton } from "@/components/ShareProfileButton";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { Button } from "@/components/ui/button";
import { loadProfileBySlug } from "@/lib/profile.functions";
import RequestConsultationModal from "@/components/RequestConsultationModal";

export const Route = createFileRoute("/d/$slug")({
  loader: async ({ params }) => {
    const profile = await loadProfileBySlug({ data: params.slug });
    if (!profile || profile.role !== "doctor" || !profile.doctor) throw notFound();
    return { profile };
  },
  head: ({ params, loaderData }) => {
    const p = loaderData?.profile;
    if (!p || !p.doctor) {
      return {
        meta: buildMeta({
          title: "طبيب — طبيبي Tabibi",
          description: "صفحة طبيب على منصة طبيبي.",
          path: `/d/${params.slug}`,
        }),
      };
    }
    const name = p.fullName ?? "طبيب";
    const drName = name.startsWith("د.") || name.startsWith("Dr") ? name : `د. ${name}`;
    const title = `${drName}${p.doctor.specialty ? " " + p.doctor.specialty : ""}${p.city ? " — " + p.city : ""} | احجز موعد | طبيبي`;
    const description = `${drName}${p.doctor.specialty ? "، تخصص " + p.doctor.specialty : ""}${p.city ? " في " + p.city : ""}. ${p.doctor.telemedicineEnabled ? "كشف فيديو متاح. " : ""}احجز موعدك الآن على طبيبي (Tabibi).`;
    const path = `/d/${params.slug}`;

    return {
      meta: [
        // unlisted profiles must not be indexed
        ...(p.visibility === "unlisted"
          ? [{ name: "robots", content: "noindex, nofollow" }]
          : []),
        ...buildMeta({
          title,
          description: truncate(description, 160),
          path,
          image: p.avatarUrl ?? undefined,
          type: "profile",
          keywords: [
            drName,
            p.doctor.specialty ?? "",
            p.city ?? "",
            "حجز موعد",
            "Tabibi",
            "طبيبي",
          ].filter(Boolean),
        }),
      ],
      links: buildSeoLinks(path),
      scripts: [
        {
          type: "application/ld+json",
          children: jsonLdString(
            physicianSchema({
              id: p.doctor.id,
              name,
              specialty: p.doctor.specialty,
              description: p.bio ? truncate(p.bio, 300) : null,
              image: p.avatarUrl,
              city: p.city,
              country: p.country ?? "EG",
              consultationFee: p.doctor.consultationFee,
              currency: p.doctor.currency ?? "EGP",
              ratingValue: p.doctor.rating,
              reviewCount: p.doctor.reviewCount,
              acceptsVideo: p.doctor.telemedicineEnabled,
              languages: ["Arabic", "English"],
            }),
          ),
        },
        {
          type: "application/ld+json",
          children: jsonLdString(
            breadcrumbSchema([
              { name: "الأطباء", path: "/doctors" },
              ...(p.doctor.specialty
                ? [{ name: p.doctor.specialty, path: `/doctors?specialty=${encodeURIComponent(p.doctor.specialty)}` }]
                : []),
              { name: name, path },
            ]),
          ),
        },
      ],
    };
  },
  component: DoctorPublicPage,
});

function DoctorPublicPage() {
  const { profile } = Route.useLoaderData();
  const { t, language } = useLanguage();
  const { format: formatMoney } = useCurrency();

  const name = profile.fullName ?? t("Doctor", "طبيب");
  const drName = name.startsWith("د.") || name.startsWith("Dr") ? name : `د. ${name}`;
  const path = `/d/${profile.slug}`;

  // Load clinics for the location list.
  const { data: clinics = [] } = useQuery({
    queryKey: ["public-doctor-clinics", profile.doctor!.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("clinics")
        .select("id, name, address, city, phone, lat, lng, is_primary")
        .eq("doctor_id", profile.doctor!.id)
        .order("is_primary", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="bg-secondary/20">
      <Breadcrumbs items={[
        { name: t("Doctors", "الأطباء"), path: "/doctors" },
        { name: drName, path },
      ]} />

      <article className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
        {/* Hero card */}
        <header className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="h-24 bg-linear-to-br from-primary/80 to-primary sm:h-32" aria-hidden />
          <div className="-mt-12 px-5 pb-6 sm:-mt-16 sm:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                <div className="h-24 w-24 overflow-hidden rounded-2xl border-4 border-card bg-muted shadow-md sm:h-32 sm:w-32">
                  {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt={drName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground">
                      {drName.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="pb-1">
                  <h1 className="arabic-display flex flex-wrap items-center gap-2 text-2xl font-bold text-foreground sm:text-3xl">
                    {drName}
                    {profile.doctor!.isVerified && <VerifiedBadge verified={true} />}
                  </h1>
                  {profile.doctor!.specialty && (
                    <p className="mt-1 text-base font-medium text-primary">{profile.doctor!.specialty}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    {profile.city && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {profile.city}
                      </span>
                    )}
                    {typeof profile.doctor!.rating === "number" && profile.doctor!.reviewCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                        {profile.doctor!.rating.toFixed(1)} ({profile.doctor!.reviewCount})
                      </span>
                    )}
                    {profile.doctor!.yearsExperience != null && (
                      <span>
                        {profile.doctor!.yearsExperience}+ {t("years experience", "سنة خبرة")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ShareProfileButton
                  profileId={profile.id}
                  targetPath={path}
                  displayName={drName}
                  variant="ghost"
                />
              </div>
            </div>

            {/* Booking CTA */}
            <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:flex sm:items-center sm:justify-between">
              <div>
                <div className="text-sm text-muted-foreground">
                  {t("Consultation fee", "رسم الكشف")}
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {profile.doctor!.consultationFee != null
                    ? formatMoney(profile.doctor!.consultationFee, profile.doctor!.currency ?? "EGP")
                    : t("Contact for fee", "تواصل لمعرفة السعر")}
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {profile.doctor!.telemedicineEnabled && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                      <Video className="h-3 w-3" /> {t("Video available", "كشف فيديو متاح")}
                    </span>
                  )}
                  {profile.doctor!.clinicsCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5">
                      <Building2 className="h-3 w-3" />
                      {profile.doctor!.clinicsCount} {t("clinic(s)", "عيادة")}
                    </span>
                  )}
                </div>
              </div>
              <Button asChild size="lg" className="mt-4 w-full sm:mt-0 sm:w-auto">
                <Link to="/doctor/$id" params={{ id: profile.doctor!.id }}>
                  <Calendar className="me-2 h-5 w-5" />
                  {t("Book appointment", "احجز موعد الآن")}
                </Link>
              </Button>
            </div>
            {/* Online consultation request CTA */}
            {profile.doctor!.telemedicineEnabled && (
              <div className="mt-3 flex justify-end">
                <RequestConsultationModal
                  doctorDetailsId={profile.doctor!.id}
                  doctorName={drName}
                  triggerVariant="outline"
                />
              </div>
            )}
            {/* Save-as-contact (vCard) — small secondary CTA */}
            <div className="mt-3 flex justify-end">
              <a
                href={`/d/${profile.slug}/contact.vcf`}
                download
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-primary"
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                {t("Save as contact (.vcf)", "حفظ كجهة اتصال (.vcf)")}
              </a>
            </div>
          </div>
        </header>

        {/* Bio */}
        {profile.bio && (
          <section className="mt-6 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground">{t("About", "نبذة")}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {profile.bio}
            </p>
          </section>
        )}

        {/* Clinics */}
        {clinics.length > 0 && (
          <section className="mt-6 rounded-2xl border border-border bg-card p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Building2 className="h-5 w-5 text-primary" />
              {t("Clinic locations", "أماكن العيادات")}
            </h2>
            <ul className="mt-4 space-y-3">
              {clinics.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-1 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-medium text-foreground">{c.name ?? t("Clinic", "العيادة")}</div>
                    {c.address && (
                      <div className="mt-0.5 text-sm text-muted-foreground">
                        <MapPin className="me-1 inline h-3.5 w-3.5" />
                        {c.address}
                        {c.city ? `، ${c.city}` : ""}
                      </div>
                    )}
                  </div>
                  {c.lat != null && c.lng != null && (
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`https://www.google.com/maps?q=${c.lat},${c.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t("View on map", "عرض على الخريطة")}
                      </a>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Footer note */}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          {t(
            `Powered by Tabibi (طبيبي) — share this page using the button above.`,
            `صفحة على منصة طبيبي (Tabibi) — شارك هذه الصفحة باستخدام زر المشاركة أعلاه.`,
          )}
        </p>
      </article>
    </div>
  );
}
