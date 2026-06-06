import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { supabase } from "@/integrations/supabase/client";
import { ClinicMap } from "@/components/maps/ClinicMap";
import { PrivateFeedbackButton } from "@/components/PrivateFeedbackButton";
import { Star, MapPin, ArrowLeft, Loader2, MessageSquare, Phone, Sparkles, Video, Building2, Crown } from "lucide-react";
import { toast } from "sonner";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { TierBadge } from "@/components/TierBadge";
import { BookingCard } from "@/components/booking/BookingCard";
import { buildMeta, buildSeoLinks, truncate } from "@/lib/seo";
import { physicianSchema, breadcrumbSchema, medicalClinicSchema, reviewSchema, jsonLdString } from "@/lib/schema";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { loadDoctorForSeo, type DoctorSeoData } from "@/lib/seo.functions";
import { determineVisitFee } from "@/lib/visit-fee.functions";
import { listEligibleAppointments, submitReview, type EligibleAppointment } from "@/lib/reviews.functions";

/**
 * Build the SEO title for a doctor page following Rank Math rules:
 *   keyword (احجز/طبيب + specialty) + name + city + brand, ≤ 60 chars.
 */
function buildDoctorTitle(d: DoctorSeoData | null): string {
  if (!d || !d.name) return "ملف الطبيب — احجز موعدك الآن | طبيبي";
  const drName = d.name.startsWith("د.") || d.name.startsWith("Dr") ? d.name : `د. ${d.name}`;
  const spec = d.specialty ? ` ${d.specialty}` : "";
  const city = d.city ? ` — ${d.city}` : "";
  return `${drName}${spec}${city} | احجز موعد | طبيبي`;
}

function buildDoctorDescription(d: DoctorSeoData | null): string {
  if (!d || !d.name) {
    return "تعرّف على خبرات الطبيب وتقييمات المرضى وأسعار الكشف، واحجز موعدك حضورياً أو عبر فيديو في دقائق على منصة طبيبي.";
  }
  const drName = d.name.startsWith("د.") || d.name.startsWith("Dr") ? d.name : `د. ${d.name}`;
  const exp = d.yearsExperience ? `${d.yearsExperience}+ سنة خبرة` : "طبيب موثّق";
  const spec = d.specialty ? `، تخصص ${d.specialty}` : "";
  const city = d.city ? ` في ${d.city}` : "";
  const video = d.telemedicineEnabled ? " — متاح كشف فيديو أونلاين" : "";
  const rating =
    typeof d.rating === "number" && d.reviewCount > 0
      ? ` تقييم ${d.rating.toFixed(1)}/5 من ${d.reviewCount} مراجعة.`
      : "";
  return `${drName}${spec}${city} — ${exp}.${rating}${video} احجز موعدك الآن على طبيبي.`;
}

export const Route = createFileRoute("/doctor/$id")({
  loader: async ({ params }) => {
    const seo = await loadDoctorForSeo({ data: params.id });
    return { seo };
  },
  head: ({ params, loaderData }) => {
    const d = loaderData?.seo ?? null;
    const title = buildDoctorTitle(d);
    const description = buildDoctorDescription(d);
    const image = d?.avatarUrl ?? undefined;
    const path = `/doctor/${params.id}`;

    const scripts: Array<{ type: string; children: string }> = [];
    if (d && d.name) {
      scripts.push({
        type: "application/ld+json",
        children: jsonLdString(
          physicianSchema({
            id: d.id,
            name: d.name,
            specialty: d.specialty,
            description: d.bio ? truncate(d.bio, 300) : null,
            image: d.avatarUrl,
            telephone: d.primaryClinic?.phone ?? null,
            city: d.city,
            country: "EG",
            consultationFee: d.consultationFee,
            currency: d.currency || "EGP",
            ratingValue: d.rating,
            reviewCount: d.reviewCount,
            acceptsVideo: d.telemedicineEnabled,
            languages: d.languages,
          }),
        ),
      });
      scripts.push({
        type: "application/ld+json",
        children: jsonLdString(
          breadcrumbSchema([
            { name: "الأطباء", path: "/doctors" },
            ...(d.specialty
              ? [{ name: d.specialty, path: `/doctors?specialty=${encodeURIComponent(d.specialty)}` }]
              : []),
            { name: d.name, path },
          ]),
        ),
      });
      // One MedicalClinic schema per practice location — helps Google
      // surface this doctor in Local Pack + "near me" queries.
      for (const c of d.clinics ?? []) {
        scripts.push({
          type: "application/ld+json",
          children: jsonLdString(
            medicalClinicSchema({
              id: c.id,
              name: c.name,
              address: c.address,
              city: c.city,
              phone: c.phone,
              lat: c.lat,
              lng: c.lng,
              doctorId: d.id,
              doctorName: d.name,
              specialty: d.specialty,
            }),
          ),
        });
      }
      // Individual Review items — unlocks star snippets + review text
      // in SERP (CTR uplift ~25–40% per the Rank Math course).
      for (const rv of d.reviews ?? []) {
        scripts.push({
          type: "application/ld+json",
          children: jsonLdString(
            reviewSchema({
              id: rv.id,
              doctorId: d.id,
              doctorName: d.name,
              rating: rv.rating,
              comment: rv.comment,
              authorName: rv.authorName,
              createdAt: rv.createdAt,
            }),
          ),
        });
      }
    }

    return {
      meta: buildMeta({
        title,
        description,
        path,
        image,
        type: "profile",
        keywords: d?.specialty
          ? [d.specialty, "حجز موعد طبيب", "طبيب أونلاين", d.city || "", "طبيبي"].filter(Boolean)
          : undefined,
      }),
      links: buildSeoLinks(path),
      scripts,
    };
  },
  component: DoctorDetailPage,
});

function DoctorDetailPage() {
  const { id } = Route.useParams();
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatPrice } = useCurrency();
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const { data: doctor, isLoading } = useQuery({
    queryKey: ["doctor", id],
    queryFn: async () => {
      const { data: d, error } = await supabase.from("doctor_details").select("*").eq("id", id).single();
      if (error) throw error;
      const { data: p } = await supabase.from("profiles").select("*").eq("id", d.profile_id).single();
      return { ...d, profile: p };
    },
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("doctor_id", id)
        .eq("status", "approved")
        .eq("is_published_by_doctor", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Track profile view (analytics) — fire-and-forget, once per mount.
  // Suppressed for the doctor's own profile so they don't inflate stats.
  useEffect(() => {
    if (!id) return;
    if (doctor?.profile_id && profile?.id === doctor.profile_id) return;
    supabase.rpc("track_doctor_view", { _doctor_details_id: id }).then(
      () => {},
      () => {},
    );
  }, [id, doctor?.profile_id, profile?.id]);

  // Patient-aware fee preview (free follow-up vs new visit)
  const { data: feeDecision } = useQuery({
    queryKey: ["visit-fee", id, profile?.id],
    enabled: Boolean(user && profile?.id && id),
    queryFn: async () =>
      determineVisitFee({
        data: { patientProfileId: profile!.id, doctorDetailsId: id },
      }),
  });

  const { data: tier } = useQuery({
    queryKey: ["doctor-tier", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("doctor_active_tier", { doctor_details_id: id });
      if (error) return "free";
      return (data as string) ?? "free";
    },
  });
  const isGold = tier === "gold";

  const { data: clinics = [] } = useQuery({
    queryKey: ["doctor-clinics", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinics")
        .select("*, clinic_schedules(*)")
        .eq("doctor_id", id)
        .order("is_primary", { ascending: false });
      if (error) throw error;
      return data as Array<{
        id: string;
        name: string;
        address: string | null;
        city: string | null;
        phone: string | null;
        lat: number | null;
        lng: number | null;
        clinic_schedules: Array<{ id: string; day_of_week: number; start_time: string; end_time: string }>;
      }>;
    },
  });

  const { data: eligibleAppointments = [] } = useQuery<EligibleAppointment[]>({
    queryKey: ["eligible-appts", id, user?.id],
    enabled: Boolean(user?.id && id),
    queryFn: async () =>
      listEligibleAppointments({
        data: { userId: user!.id, doctorId: id },
      }),
  });

  const reviewableAppointments = eligibleAppointments.filter(
    (a) => !a.alreadyReviewed,
  );
  const activeAppointmentId =
    selectedAppointmentId ?? reviewableAppointments[0]?.appointmentId ?? null;
  const canReview = reviewableAppointments.length > 0;
  const reviewBlockedReason = !user
    ? t("Sign in to leave a review", "سجّل الدخول لكتابة تقييم")
    : eligibleAppointments.length === 0
      ? t(
          "Only patients with a completed paid visit can review",
          "يمكن للمرضى الذين أتمّوا زيارة مدفوعة فقط كتابة تقييم",
        )
      : !canReview
        ? t(
            "You already reviewed your visits with this doctor",
            "لقد قيّمت زياراتك مع هذا الطبيب من قبل",
          )
        : null;

  const reviewMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("login_required");
      if (!activeAppointmentId) throw new Error("no_eligible_appointment");
      const r = await submitReview({
        data: {
          userId: user.id,
          appointmentId: activeAppointmentId,
          rating: reviewRating,
          comment: reviewText || undefined,
        },
      });
      if (!r.ok) throw new Error(r.error);
      return r;
    },
    onSuccess: () => {
      toast.success(
        t(
          "Review submitted — pending admin approval",
          "تم استلام تقييمك وسيُنشر بعد المراجعة",
        ),
      );
      setReviewText("");
      setSelectedAppointmentId(null);
      queryClient.invalidateQueries({ queryKey: ["reviews", id] });
      queryClient.invalidateQueries({ queryKey: ["eligible-appts", id, user?.id] });
    },
    onError: (e: Error) => {
      const map: Record<string, string> = {
        already_reviewed: t(
          "You already reviewed this visit",
          "لقد قيّمت هذه الزيارة من قبل",
        ),
        appointment_not_completed: t(
          "Appointment must be completed first",
          "يجب اكتمال الموعد أولاً",
        ),
        appointment_unpaid: t(
          "Appointment must be paid to leave a review",
          "يجب أن يكون الموعد مدفوعاً لكتابة تقييم",
        ),
        no_eligible_appointment: t(
          "No eligible appointment found",
          "لا توجد زيارة مؤهّلة للتقييم",
        ),
        forbidden: t("Forbidden", "غير مسموح"),
        login_required: t("Sign in first", "سجّل الدخول أولاً"),
      };
      toast.error(map[e.message] ?? e.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">{t("Doctor not found", "الطبيب غير موجود")}</p>
        <Link to="/doctors" className="mt-4 inline-block text-primary hover:underline">
          {t("Back to doctors", "العودة لقائمة الأطباء")}
        </Link>
      </div>
    );
  }

  const name = doctor.profile?.full_name ?? t("Doctor", "طبيب");

  const primaryClinic = clinics[0];

  return (
    <div className="min-h-screen bg-background">
      {isGold && (
        <div className="bg-linear-to-r from-amber-400 via-amber-500 to-amber-600 py-2 text-center text-xs font-bold text-amber-950 shadow-sm">
          <span className="inline-flex items-center gap-1.5">
            <Crown className="h-3.5 w-3.5" />
            {t("Featured Gold Doctor — Verified leader in their specialty", "طبيب Gold مميّز — موثّق ورائد فى تخصصه")}
            <Crown className="h-3.5 w-3.5" />
          </span>
        </div>
      )}
      <Breadcrumbs
        items={[
          { name: t("Doctors", "الأطباء"), path: "/doctors" },
          { name, path: `/doctor/${id}` },
        ]}
      />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link to="/doctors" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t("Back to doctors", "العودة لقائمة الأطباء")}
        </Link>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Profile column */}
          <div className="lg:col-span-2 space-y-6">
            <div className={`relative overflow-hidden rounded-2xl bg-card p-6 ${isGold ? "border-2 border-amber-300 shadow-lg" : "border border-border"}`}>
              {isGold && (
                <>
                  <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-linear-to-br from-amber-200/40 to-amber-400/20 blur-2xl" />
                  <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-linear-to-tl from-amber-200/30 to-amber-400/10 blur-2xl" />
                </>
              )}
              <div className="relative flex items-start gap-4">
                <div className="relative shrink-0">
                  {isGold && <div className="absolute -inset-1 rounded-full bg-linear-to-tr from-amber-400 to-amber-600 blur-sm" />}
                  <div className={`relative h-20 w-20 rounded-full bg-linear-to-br from-primary to-teal flex items-center justify-center text-primary-foreground text-3xl font-semibold ${isGold ? "ring-4 ring-amber-400" : ""}`}>
                    {name.charAt(0).toUpperCase()}
                  </div>
                  {isGold && (
                    <div className="absolute -top-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-linear-to-br from-amber-400 to-amber-600 shadow-md ring-2 ring-background">
                      <Crown className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold text-foreground">{name}</h1>
                    <VerifiedBadge verified={!!doctor.is_verified} />
                    <TierBadge tier={tier} size="md" ar />
                    {doctor.telemedicine_enabled && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-teal/10 px-2 py-0.5 text-xs text-teal">
                        <Video className="h-3 w-3" /> كشف أون لاين
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground">{doctor.specialty}</p>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-current text-amber-500" />
                      <span className="font-medium">{Number(doctor.rating ?? 0).toFixed(1)}</span>
                      <span className="text-muted-foreground">({reviews.length})</span>
                    </div>
                    {doctor.years_experience ? (
                      <div className="text-muted-foreground">
                        {doctor.years_experience} {t("years exp.", "سنة خبرة")}
                      </div>
                    ) : null}
                    {doctor.profile?.city && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <MapPin className="h-4 w-4" /> {doctor.profile.city}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {doctor.bio && (
                <div className="mt-6 pt-6 border-t border-border">
                  <h2 className="font-semibold text-foreground mb-2">{t("About", "نبذة")}</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">{doctor.bio}</p>
                </div>
              )}

              {clinics.length > 0 && (
                <div className="mt-6 pt-6 border-t border-border space-y-5">
                  <h2 className="font-semibold text-foreground flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> {t("Clinics & schedule", "العيادات والمواعيد")}
                  </h2>
                  {clinics.map((c) => (
                    <div key={c.id} className="space-y-2">
                      <div>
                        <p className="font-medium text-foreground">{c.name}</p>
                        {c.address && <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="h-3.5 w-3.5" />{c.address}</p>}
                        {c.phone && <p className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{c.phone}</p>}
                      </div>
                      {c.lat != null && c.lng != null && (
                        <ClinicMap markers={[{ lat: c.lat, lng: c.lng, title: c.name }]} className="h-44" />
                      )}
                      {(c.clinic_schedules ?? []).length > 0 && (
                        <ul className="text-sm space-y-0.5">
                          {(c.clinic_schedules ?? [])
                            .slice()
                            .sort((a, b) => a.day_of_week - b.day_of_week)
                            .map((s) => (
                              <li key={s.id} className="text-muted-foreground">
                                <span className="font-medium text-foreground">
                                  {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][s.day_of_week]}
                                </span>{" "}
                                · {s.start_time.slice(0,5)} – {s.end_time.slice(0,5)}
                              </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {clinics.length === 0 && doctor.clinic_name && (
                <div className="mt-6 pt-6 border-t border-border">
                  <h2 className="font-semibold text-foreground mb-2">{t("Clinic", "العيادة")}</h2>
                  <p className="text-sm text-foreground">{doctor.clinic_name}</p>
                  {doctor.clinic_address && <p className="text-sm text-muted-foreground mt-1">{doctor.clinic_address}</p>}
                </div>
              )}
            </div>


            {/* Reviews */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" /> {t("Reviews", "التقييمات")}
                </h2>
                <PrivateFeedbackButton doctorDetailsId={doctor.id} doctorName={doctor.profile?.full_name ?? undefined} />
              </div>

              {canReview ? (
                <div className="mb-6 p-4 bg-muted/30 rounded-lg">
                  {reviewableAppointments.length > 1 && (
                    <div className="mb-3">
                      <label className="text-xs text-muted-foreground mb-1 block">
                        {t("Choose visit to review", "اختر الزيارة المراد تقييمها")}
                      </label>
                      <select
                        value={activeAppointmentId ?? ""}
                        onChange={(e) => setSelectedAppointmentId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
                      >
                        {reviewableAppointments.map((a) => (
                          <option key={a.appointmentId} value={a.appointmentId}>
                            {a.appointmentDate
                              ? new Date(a.appointmentDate).toLocaleDateString()
                              : a.appointmentId.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex items-center gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" onClick={() => setReviewRating(n)}>
                        <Star className={`h-6 w-6 ${n <= reviewRating ? "fill-current text-amber-500" : "text-muted-foreground"}`} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder={t("Share your experience...", "شارك تجربتك...")}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    onClick={() => reviewMutation.mutate()}
                    disabled={reviewMutation.isPending || !activeAppointmentId}
                    className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {reviewMutation.isPending ? t("Sending...", "جارٍ الإرسال...") : t("Submit review", "إرسال التقييم")}
                  </button>
                </div>
              ) : reviewBlockedReason ? (
                <div className="mb-6 p-3 bg-muted/20 border border-dashed border-border rounded-lg text-xs text-muted-foreground">
                  {reviewBlockedReason}
                </div>
              ) : null}

              {reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("No reviews yet.", "لا توجد تقييمات بعد.")}</p>
              ) : (
                <div className="space-y-4">
                  {reviews.map((r) => (
                    <div key={r.id} className="border-b border-border last:border-0 pb-4 last:pb-0">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} className={`h-4 w-4 ${n <= r.rating ? "fill-current text-amber-500" : "text-muted-foreground"}`} />
                        ))}
                      </div>
                      {r.comment && <p className="mt-2 text-sm text-foreground">{r.comment}</p>}
                      {r.doctor_response && (
                        <div className="mt-2 rounded-lg bg-muted/40 p-2.5">
                          <p className="text-[11px] font-semibold text-primary mb-0.5">
                            {t("Doctor's response", "رد الطبيب")}
                          </p>
                          <p className="text-sm text-foreground">{r.doctor_response}</p>
                        </div>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Booking column */}
          <div className="lg:col-span-1">
            <BookingCard
              doctorId={id}
              doctorName={name}
              consultationFee={Number(feeDecision?.fee ?? doctor.consultation_fee ?? 0)}
              currency={feeDecision?.currency || (doctor.currency ?? "EGP")}
              isVerified={Boolean(doctor.is_verified)}
              telemedicineEnabled={Boolean(doctor.telemedicine_enabled)}
            />
            {feeDecision?.visitType === "follow_up" && (
              <div
                className="mt-3 inline-flex items-start gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                role="status"
              >
                <Sparkles className="h-3.5 w-3.5 mt-0.5" aria-hidden="true" />
                <span>
                  {feeDecision.fee === 0
                    ? t("Free follow-up within window", "متابعة مجانية ضمن فترة الطبيب")
                    : t("Discounted follow-up", "متابعة بسعر مخفّض")}
                  {typeof feeDecision.remainingFreeFollowups === "number" && (
                    <>
                      {" "}·{" "}
                      {t(
                        `${feeDecision.remainingFreeFollowups} left`,
                        `متبقّي ${feeDecision.remainingFreeFollowups}`,
                      )}
                    </>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
