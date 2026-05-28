import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { supabase } from "@/integrations/supabase/client";
import { ClinicMap } from "@/components/maps/ClinicMap";
import { Star, MapPin, Calendar, Clock, ArrowLeft, Loader2, MessageSquare, Video, Building2, Phone } from "lucide-react";
import { toast } from "sonner";
import { PatientConsentModal, CONSENT_TEXT_VERSION } from "@/components/PatientConsentModal";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { buildMeta, buildSeoLinks, truncate } from "@/lib/seo";
import { physicianSchema, jsonLdString } from "@/lib/schema";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const Route = createFileRoute("/doctor/$id")({
  head: ({ params }) => ({
    meta: buildMeta({
      title: `ملف الطبيب — احجز موعدك الآن | طبيبي`,
      description:
        "تعرّف على خبرات الطبيب وتقييمات المرضى وأسعار الكشف، واحجز موعدك حضورياً أو عبر فيديو في دقائق على منصة طبيبي.",
      path: `/doctor/${params.id}`,
      type: "profile",
    }),
    links: buildSeoLinks(`/doctor/${params.id}`),
  }),
  component: DoctorDetailPage,
});

function DoctorDetailPage() {
  const { id } = Route.useParams();
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatPrice } = useCurrency();
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [appointmentType, setAppointmentType] = useState<"in_person" | "video">("in_person");
  const [notes, setNotes] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [consentOpen, setConsentOpen] = useState(false);

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
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

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

  const bookMutation = useMutation({
    mutationFn: async (consents?: {
      telemedicine_consent: boolean;
      data_processing_consent: boolean;
      recording_consent: boolean;
    }) => {
      if (!user || !profile) throw new Error("Login required");
      if (!selectedDate || !selectedTime) throw new Error("Pick date & time");
      if (appointmentType === "video") {
        if (!doctor?.is_verified || !doctor?.telemedicine_enabled) {
          throw new Error("هذا الطبيب لم يفعّل الكشف أون لاين");
        }
        if (!consents?.telemedicine_consent || !consents?.data_processing_consent) {
          throw new Error("الموافقة مطلوبة لإتمام الحجز");
        }
      }
      const scheduled = new Date(`${selectedDate}T${selectedTime}`).toISOString();
      const { data: appt, error } = await supabase.from("appointments").insert({
        patient_id: profile.id,
        doctor_id: id,
        scheduled_at: scheduled,
        appointment_type: appointmentType,
        fee: doctor?.consultation_fee ?? 0,
        notes: notes || null,
        patient_consent_accepted: appointmentType === "video",
      }).select("id").single();
      if (error) throw error;

      if (appointmentType === "video" && appt && consents) {
        await supabase.from("patient_appointment_consent").insert({
          appointment_id: appt.id,
          patient_id: profile.id,
          doctor_id: id,
          telemedicine_consent: consents.telemedicine_consent,
          data_processing_consent: consents.data_processing_consent,
          recording_consent: consents.recording_consent,
          consent_text_version: CONSENT_TEXT_VERSION,
          user_agent: navigator.userAgent,
        });
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          action: "telemedicine_consent_given",
          resource_type: "appointment",
          resource_id: appt.id,
          metadata: { doctor_id: id, version: CONSENT_TEXT_VERSION },
        });
      }
    },
    onSuccess: () => {
      toast.success(t("Appointment booked successfully", "تم حجز الموعد بنجاح"));
      setSelectedDate("");
      setSelectedTime("");
      setNotes("");
      setConsentOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleBook = () => {
    if (appointmentType === "video") {
      if (!doctor?.is_verified || !doctor?.telemedicine_enabled) {
        toast.error(t("Doctor not enabled for video consults", "هذا الطبيب لم يفعّل الكشف أون لاين"));
        return;
      }
      setConsentOpen(true);
      return;
    }
    bookMutation.mutate(undefined);
  };

  const reviewMutation = useMutation({
    mutationFn: async () => {
      if (!user || !profile) throw new Error("Login required");
      const { error } = await supabase.from("reviews").insert({
        doctor_id: id,
        patient_id: profile.id,
        rating: reviewRating,
        comment: reviewText || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Review submitted", "تم إرسال التقييم"));
      setReviewText("");
      queryClient.invalidateQueries({ queryKey: ["reviews", id] });
    },
    onError: (e: Error) => toast.error(e.message),
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

  // Aggregate rating from reviews
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum: number, r: any) => sum + (r.rating ?? 0), 0) / reviews.length
      : null;
  const primaryClinic = clinics[0];
  const docSchema = physicianSchema({
    id,
    name,
    specialty: doctor.specialty,
    description: doctor.bio ? truncate(doctor.bio, 300) : null,
    image: (doctor.profile as any)?.avatar_url ?? null,
    telephone: primaryClinic?.phone ?? null,
    city: primaryClinic?.city ?? null,
    country: "EG",
    consultationFee: doctor.consultation_fee ?? primaryClinic?.consultation_fee ?? null,
    currency: doctor.currency ?? primaryClinic?.currency ?? "EGP",
    ratingValue: avgRating,
    reviewCount: reviews.length,
    acceptsVideo: Boolean((doctor as any).telemedicine_enabled),
    languages: ["Arabic", "English"],
  });

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLdString(docSchema) }}
      />
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
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-teal flex items-center justify-center text-primary-foreground text-3xl font-semibold shrink-0">
                  {name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-foreground">{name}</h1>
                    <VerifiedBadge verified={!!doctor.is_verified} />
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
                      {c.clinic_schedules.length > 0 && (
                        <ul className="text-sm space-y-0.5">
                          {c.clinic_schedules
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
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <MessageSquare className="h-5 w-5" /> {t("Reviews", "التقييمات")}
              </h2>

              {user && profile && (
                <div className="mb-6 p-4 bg-muted/30 rounded-lg">
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
                    disabled={reviewMutation.isPending}
                    className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {reviewMutation.isPending ? t("Sending...", "جارٍ الإرسال...") : t("Submit review", "إرسال التقييم")}
                  </button>
                </div>
              )}

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
                      <p className="mt-1 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Booking column */}
          <div className="lg:col-span-1">
            <div className="bg-card border border-border rounded-2xl p-6 sticky top-4">
              <div className="text-center pb-4 border-b border-border">
                <p className="text-sm text-muted-foreground">{t("Consultation fee", "رسوم الكشف")}</p>
                <p className="text-2xl font-bold text-primary mt-1">
                  {formatPrice(Number(doctor.consultation_fee ?? 0), doctor.currency ?? "EGP")}
                </p>
              </div>

              {!user ? (
                <div className="mt-4 text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    {t("Login to book an appointment", "سجّل الدخول لحجز موعد")}
                  </p>
                  <button
                    onClick={() => navigate({ to: "/login" })}
                    className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90"
                  >
                    {t("Login", "تسجيل الدخول")}
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">
                      {t("Consultation type", "نوع الاستشارة")}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAppointmentType("in_person")}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                          appointmentType === "in_person"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        <Building2 className="h-4 w-4" />
                        {t("In-person", "في العيادة")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAppointmentType("video")}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                          appointmentType === "video"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        <Video className="h-4 w-4" />
                        {t("Video", "فيديو")}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground flex items-center gap-1 mb-1">
                      <Calendar className="h-4 w-4" /> {t("Date", "التاريخ")}
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground flex items-center gap-1 mb-1">
                      <Clock className="h-4 w-4" /> {t("Time", "الوقت")}
                    </label>
                    <input
                      type="time"
                      value={selectedTime}
                      onChange={(e) => setSelectedTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">
                      {t("Notes (optional)", "ملاحظات (اختياري)")}
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  {appointmentType === "video" && (!doctor.is_verified || !doctor.telemedicine_enabled) && (
                    <p className="text-xs text-amber-600">
                      {t("This doctor hasn't enabled video consults yet.", "هذا الطبيب لم يفعّل الكشف أون لاين بعد.")}
                    </p>
                  )}
                  <button
                    onClick={handleBook}
                    disabled={bookMutation.isPending || !selectedDate || !selectedTime || (appointmentType === "video" && (!doctor.is_verified || !doctor.telemedicine_enabled))}
                    className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {bookMutation.isPending ? t("Booking...", "جارٍ الحجز...") : t("Book appointment", "احجز موعداً")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <PatientConsentModal
        open={consentOpen}
        doctorName={name}
        onCancel={() => setConsentOpen(false)}
        onConfirm={(consents) => bookMutation.mutate(consents)}
        isSubmitting={bookMutation.isPending}
      />
    </div>
  );
}
