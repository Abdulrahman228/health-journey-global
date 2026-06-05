import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import {
  MapPin,
  HeartPulse,
  AlertTriangle,
  Phone,
  IdCard,
  Eye,
  EyeOff,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { buildMeta, buildSeoLinks, truncate } from "@/lib/seo";
import { jsonLdString, breadcrumbSchema } from "@/lib/schema";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ShareProfileButton } from "@/components/ShareProfileButton";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { loadProfileBySlug } from "@/lib/profile.functions";
import { FIELD_LABELS, publicValue, type MedicalFieldKey } from "@/lib/medical-card";

export const Route = createFileRoute("/u/$slug")({
  loader: async ({ params }) => {
    const profile = await loadProfileBySlug({ data: params.slug });
    if (!profile) throw notFound();
    // /u/ is intended for non-doctor users. Doctors should be on /d/.
    if (profile.role === "doctor") {
      throw notFound();
    }
    return { profile };
  },
  head: ({ params, loaderData }) => {
    const p = loaderData?.profile;
    const name = p?.fullName ?? "ملف";
    const title = `${name} — طبيبي Tabibi`;
    const description = p?.bio
      ? truncate(p.bio, 160)
      : `${name} — ملف شخصي على منصة طبيبي (Tabibi).`;
    const path = `/u/${params.slug}`;

    return {
      // Patient pages default to noindex unless the user explicitly opts in.
      meta: [
        ...(p?.visibility === "public"
          ? []
          : [{ name: "robots", content: "noindex, nofollow" }]),
        ...buildMeta({
          title,
          description,
          path,
          image: p?.avatarUrl ?? undefined,
          type: "profile",
        }),
      ],
      links: buildSeoLinks(path),
      scripts: p
        ? [
            {
              type: "application/ld+json",
              children: jsonLdString(
                breadcrumbSchema([{ name, path }]),
              ),
            },
          ]
        : [],
    };
  },
  component: PatientPublicPage,
});

function PatientPublicPage() {
  const { profile } = Route.useLoaderData();
  const { t, language } = useLanguage();
  const [revealEmergency, setRevealEmergency] = useState(false);

  const name = profile.fullName ?? t("User", "مستخدم");
  const path = `/u/${profile.slug}`;
  const patientFileId = `TBB-${profile.id.slice(0, 8).toUpperCase()}`;

  return (
    <div className="bg-secondary/20">
      <Breadcrumbs items={[{ name, path }]} />

      <article className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
        {/* Header card */}
        <header className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="h-20 bg-linear-to-br from-primary/70 to-primary" aria-hidden />
          <div className="-mt-10 px-5 pb-5 sm:-mt-12 sm:px-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                <div className="h-20 w-20 overflow-hidden rounded-2xl border-4 border-card bg-muted shadow-sm sm:h-24 sm:w-24">
                  {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt={name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground">
                      {name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="pb-1">
                  <h1 className="arabic-display text-2xl font-bold text-foreground sm:text-3xl">
                    {name}
                  </h1>
                  {profile.city && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      <MapPin className="me-1 inline h-3.5 w-3.5" /> {profile.city}
                    </p>
                  )}
                </div>
              </div>

              <ShareProfileButton
                profileId={profile.id}
                targetPath={path}
                displayName={name}
                variant="ghost"
              />
            </div>
          </div>
        </header>

        {/* Tabs: Medical Card | Social */}
        <Tabs defaultValue="medical" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="medical">
              <IdCard className="me-2 h-4 w-4" />
              {t("Medical card", "البطاقة الطبية")}
            </TabsTrigger>
            <TabsTrigger value="social">
              <HeartPulse className="me-2 h-4 w-4" />
              {t("Activity", "النشاط")}
            </TabsTrigger>
          </TabsList>

          {/* Medical Card */}
          <TabsContent value="medical" className="mt-4 space-y-4">
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {t("Medical file ID", "رقم الملف الطبي")}
                  </div>
                  <div className="mt-1 font-mono text-lg font-semibold text-foreground">
                    {patientFileId}
                  </div>
                </div>
                <div className="rounded-xl bg-primary/10 px-3 py-2 text-center">
                  <HeartPulse className="mx-auto h-5 w-5 text-primary" />
                  <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-primary">
                    {t("Tabibi ID", "هوية طبيبي")}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                {(() => {
                  const card = profile.medicalCard;
                  const renderableFields: MedicalFieldKey[] = [
                    "blood_type",
                    "allergies",
                    "chronic_conditions",
                    "medications",
                    "preferred_language",
                  ];
                  const visible = renderableFields
                    .map((k) => ({ key: k, value: publicValue(card, k) }))
                    .filter((f) => f.value !== null);
                  if (visible.length === 0) {
                    return (
                      <div className="col-span-2 rounded-xl border border-dashed border-border bg-secondary/30 px-3 py-4 text-center text-xs text-muted-foreground">
                        {t(
                          "No public health fields shared.",
                          "لم يشارك المستخدم أي حقول صحية بشكل عام.",
                        )}
                      </div>
                    );
                  }
                  return visible.map((f) => (
                    <InfoChip
                      key={f.key}
                      label={FIELD_LABELS[f.key][language === "ar" ? "ar" : "en"]}
                      value={f.value!}
                      span={f.key === "allergies" || f.key === "chronic_conditions" || f.key === "medications"}
                    />
                  ));
                })()}
              </div>

              <div className="mt-5 rounded-xl border border-dashed border-border bg-secondary/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {t("Emergency contact", "اتصال طوارئ")}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {t("Visible to emergency responders only.", "يظهر للمسعفين فقط.")}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRevealEmergency((v) => !v)}
                    aria-label={t("Toggle emergency contact", "إظهار/إخفاء جهة الاتصال")}
                  >
                    {revealEmergency ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {revealEmergency && (() => {
                  const emName = publicValue(profile.medicalCard, "emergency_name");
                  const emPhone = publicValue(profile.medicalCard, "emergency_phone");
                  if (!emName && !emPhone) {
                    return (
                      <div className="mt-3 rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
                        {t("Not set", "لم يُضبط بعد")}
                      </div>
                    );
                  }
                  return (
                    <div className="mt-3 space-y-1.5 rounded-lg bg-background px-3 py-2 text-sm">
                      {emName && (
                        <div className="font-medium text-foreground">{emName}</div>
                      )}
                      {emPhone && (
                        <a
                          href={`tel:${emPhone.replace(/[^0-9+]/g, "")}`}
                          className="flex items-center gap-2 font-mono text-primary hover:underline"
                        >
                          <Phone className="h-4 w-4" />
                          {emPhone}
                        </a>
                      )}
                    </div>
                  );
                })()}
              </div>

              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                {t(
                  "The medical card only shows fields the user has chosen to make public. Full medical records require authorised access.",
                  "البطاقة الطبية تعرض الحقول التي وافق المستخدم على إظهارها فقط. الاطلاع على السجل الطبي الكامل يتطلب صلاحية مسبقة.",
                )}
              </p>
            </section>
          </TabsContent>

          {/* Social / activity */}
          <TabsContent value="social" className="mt-4">
            <section className="rounded-2xl border border-border bg-card p-8 text-center">
              <HeartPulse className="mx-auto h-10 w-10 text-primary/40" />
              <h2 className="mt-3 text-lg font-semibold text-foreground">
                {t("No public activity yet", "لا يوجد نشاط عام بعد")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(
                  `${name} hasn't shared any posts or reviews publicly.`,
                  `${name} لم يشارك منشورات أو تقييمات بشكل عام بعد.`,
                )}
              </p>
            </section>
          </TabsContent>
        </Tabs>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          {t(
            "Powered by Tabibi (طبيبي) — sharable health identity.",
            "هوية صحية قابلة للمشاركة — مدعومة بمنصة طبيبي (Tabibi).",
          )}
        </p>
      </article>
    </div>
  );
}

function InfoChip({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={`rounded-xl border border-border bg-background px-3 py-2 ${span ? "col-span-2" : ""}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 whitespace-pre-line text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
