import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useCurrency } from "@/hooks/useCurrency";
import {
  Calendar,
  Clock,
  Loader2,
  Users,
  MapPin,
  Building2,
  Video,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Tag,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { PatientConsentModal, CONSENT_TEXT_VERSION } from "@/components/PatientConsentModal";
import { createAppointmentCheckout } from "@/lib/payments.functions";
import { validateCoupon, type CouponValidationResult } from "@/lib/coupons.functions";
import { syncVisitType, previewVisitPricing } from "@/lib/clinical.classification";
import { handleEmergencyBooking } from "@/lib/emergency.booking";

type AvailableSlot = {
  clinic_id: string;
  clinic_name: string;
  clinic_city: string | null;
  schedule_date: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  avg_minutes: number;
  max_patients: number;
  booked_count: number;
  slots_remaining: number;
  queue_position_if_book_now: number;
  estimated_start_at: string;
};

type ClinicOption = {
  id: string;
  name: string;
  city: string | null;
};

type AppointmentType = "clinic" | "online";

const ARABIC_WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function formatArabicDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return "اليوم";
  if (diffDays === 1) return "غداً";
  return `${ARABIC_WEEKDAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function formatWait(minutes: number): string {
  if (minutes < 1) return "بدون انتظار";
  if (minutes < 60) return `${Math.round(minutes)} دقيقة`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m === 0 ? `${h} ساعة` : `${h}س ${m}د`;
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "م" : "ص";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")}${period}`;
}

interface Props {
  doctorId: string;
  doctorName: string;
  consultationFee: number;
  currency: string;
  isVerified: boolean;
  telemedicineEnabled: boolean;
}

export function BookingCard({
  doctorId,
  doctorName,
  consultationFee,
  currency,
  isVerified,
  telemedicineEnabled,
}: Props) {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatPrice } = useCurrency();

  const [appointmentType, setAppointmentType] = useState<AppointmentType>("clinic");
  const [notes, setNotes] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
  const [showClinicList, setShowClinicList] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Coupon state
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<CouponValidationResult | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);

  // === Fetch active clinics for this doctor ===
  const { data: clinics } = useQuery({
    queryKey: ["doctor-clinics", doctorId],
    queryFn: async (): Promise<ClinicOption[]> => {
      const { data, error } = await supabase
        .from("clinics")
        .select("id, name, city, clinic_schedules!inner(is_active)")
        .eq("doctor_id", doctorId)
        .eq("clinic_schedules.is_active", true);
      if (error) throw error;
      const seen = new Set<string>();
      return (data ?? [])
        .filter((c) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        })
        .map((c) => ({ id: c.id, name: c.name, city: c.city }));
    },
  });

  // === Unified queue slot lookup — runs for both clinic and online ===
  const { data: slot, isLoading: slotLoading, refetch: refetchSlot } = useQuery({
    queryKey: ["next-slot", doctorId, selectedClinicId, appointmentType],
    // For online we never filter by a specific clinic — find any available slot.
    enabled: appointmentType === "clinic" || (isVerified && telemedicineEnabled),
    refetchInterval: 30_000,
    queryFn: async (): Promise<AvailableSlot | null> => {
      const { data, error } = await supabase.rpc("get_next_available_slot", {
        p_doctor_id: doctorId,
        p_clinic_id: appointmentType === "clinic" ? (selectedClinicId ?? undefined) : undefined,
        p_days_ahead: 30,
      });
      if (error) throw error;
      const rows = (data ?? []) as AvailableSlot[];
      return rows[0] ?? null;
    },
  });

  useEffect(() => {
    if (clinics && clinics.length === 1 && !selectedClinicId) {
      setSelectedClinicId(clinics[0].id);
    }
  }, [clinics, selectedClinicId]);

  const multipleClinic = (clinics?.length ?? 0) > 1;
  const requiresPayment = consultationFee > 0;

  // Predicted visit type + fee for the pre-payment label (consultation vs first
  // visit). createAppointmentCheckout recomputes the fee authoritatively.
  const { data: pricing } = useQuery({
    queryKey: ["visit-pricing", doctorId, user?.id, slot?.schedule_date],
    enabled: Boolean(user && requiresPayment && slot?.schedule_date),
    queryFn: () =>
      previewVisitPricing({ data: { doctorId, scheduledAt: slot?.schedule_date } }),
  });

  const bookMutation = useMutation({
    mutationFn: async (consents?: {
      telemedicine_consent: boolean;
      data_processing_consent: boolean;
      recording_consent: boolean;
    }) => {
      if (!user || !profile) throw new Error("Login required");
      if (!slot) throw new Error("لا توجد مواعيد متاحة");

      if (appointmentType === "online") {
        if (!isVerified || !telemedicineEnabled) {
          throw new Error("هذا الطبيب لم يفعّل الكشف أون لاين");
        }
        if (!consents?.telemedicine_consent || !consents?.data_processing_consent) {
          throw new Error("الموافقة مطلوبة لإتمام الحجز");
        }
      }

      // Both clinic and online go through the identical queue booking RPC.
      const { data, error } = await supabase.rpc("book_queue_appointment", {
        p_doctor_id: doctorId,
        p_clinic_id: slot.clinic_id,
        p_appointment_date: slot.schedule_date,
        p_appointment_type: appointmentType,
        p_notes: notes || undefined,
      });
      if (error) throw error;

      const result = data as { id: string; queue_number: number };

      // Non-blocking: classify the visit (consultation vs initial checkup) and
      // notify the doctor on a follow-up. Wrapped so classification failures can
      // never break the booking flow.
      try {
        await syncVisitType({ data: { appointmentId: result.id } });
      } catch (e) {
        console.warn("[booking] visit-type classification failed", e);
      }

      // Non-blocking: emergency triage — flag the booking + red-alert the doctor.
      try {
        await handleEmergencyBooking({ data: { appointmentId: result.id, isEmergency } });
      } catch (e) {
        console.warn("[booking] emergency triage failed", e);
      }

      // Record telemedicine consent for online appointments.
      if (appointmentType === "online" && consents) {
        await supabase.from("patient_appointment_consent").insert({
          appointment_id: result.id,
          patient_id: profile.id,
          doctor_id: doctorId,
          telemedicine_consent: consents.telemedicine_consent,
          data_processing_consent: consents.data_processing_consent,
          recording_consent: consents.recording_consent,
          consent_text_version: CONSENT_TEXT_VERSION,
          user_agent: navigator.userAgent,
        });
      }

      return result;
    },
    onSuccess: async (result) => {
      setNotes("");
      setIsEmergency(false);
      setConsentOpen(false);
      queryClient.invalidateQueries({ queryKey: ["next-slot", doctorId] });
      queryClient.invalidateQueries({ queryKey: ["my-appointments"] });

      if (requiresPayment && result?.id) {
        try {
          setIsRedirecting(true);
          toast.success(t("Reserved. Redirecting to payment…", "تم الحجز. جارٍ تحويلك للدفع…"));
          const returnUrl = `${window.location.origin}/my-queue/${result.id}?paid=1`;
          const url = await createAppointmentCheckout({
            data: {
              appointmentId: result.id,
              amount: Math.round(consultationFee * 100),
              currency: currency.toLowerCase(),
              doctorName,
              returnUrl,
              cancelUrl: window.location.href,
              customerEmail: user?.email ?? undefined,
              userId: user?.id,
              ...(coupon?.valid && coupon.code ? { couponCode: coupon.code } : {}),
              appointmentType: appointmentType === "online" ? "video" : "in_person",
              doctorId,
            },
          });
          if (url) {
            window.location.href = url;
            return;
          }
        } catch (e) {
          console.error("checkout error", e);
          toast.error(
            t(
              "Could not start payment. Try the manual payment options at /pay.",
              "تعذّر بدء الدفع. جرّب خيارات الدفع اليدوي على /pay.",
            ),
          );
        } finally {
          setIsRedirecting(false);
        }
      } else {
        toast.success(t("Appointment booked", "تم الحجز بنجاح"));
      }

      navigate({ to: "/my-queue/$appointmentId", params: { appointmentId: result.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleBook = () => {
    if (appointmentType === "online") {
      setConsentOpen(true);
      return;
    }
    bookMutation.mutate(undefined);
  };

  const selectedClinic = useMemo(
    () => clinics?.find((c) => c.id === selectedClinicId) ?? null,
    [clinics, selectedClinicId],
  );

  const waitMinutes = slot ? slot.booked_count * slot.avg_minutes : 0;

  const isBookDisabled =
    bookMutation.isPending ||
    isRedirecting ||
    !slot ||
    (appointmentType === "online" && (!isVerified || !telemedicineEnabled));

  return (
    <div className="bg-card border border-border rounded-2xl p-6 sticky top-4">
      <div className="text-center pb-4 border-b border-border">
        <p className="text-sm text-muted-foreground">{t("Consultation fee", "رسوم الكشف")}</p>
        <p className="text-2xl font-bold text-primary mt-1">
          {consultationFee === 0
            ? t("Free", "مجاناً")
            : formatPrice(consultationFee, currency)}
        </p>
        {requiresPayment && (
          <p className="text-[11px] text-muted-foreground mt-1">
            {t("Pay online to confirm your spot", "ادفع أونلاين لتأكيد دورك")}
          </p>
        )}
        {pricing && requiresPayment && (
          <p className="mt-2 text-sm">
            <span className="font-semibold text-foreground">
              {t("Booking type", "نوع الحجز")}:{" "}
            </span>
            <span className={pricing.visitType === "follow_up" ? "text-emerald-600" : "text-primary"}>
              {pricing.visitType === "follow_up"
                ? t("Consultation", "استشارة")
                : t("First visit", "كشف أول")}
            </span>
            <span className="text-muted-foreground"> — {formatPrice(pricing.fee, currency)}</span>
          </p>
        )}
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
          {/* ── Type selector ── */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              {t("Consultation type", "نوع الاستشارة")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAppointmentType("clinic")}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                  appointmentType === "clinic"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-accent"
                }`}
              >
                <Building2 className="h-4 w-4" />
                {t("In-person", "في العيادة")}
              </button>
              <button
                type="button"
                onClick={() => setAppointmentType("online")}
                disabled={!isVerified || !telemedicineEnabled}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${
                  appointmentType === "online"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-accent"
                }`}
              >
                <Video className="h-4 w-4" />
                {t("Online", "أونلاين")}
              </button>
            </div>
          </div>

          {/* ── Online unavailable notice ── */}
          {appointmentType === "online" && (!isVerified || !telemedicineEnabled) && (
            <p className="text-xs text-amber-600">
              {t(
                "This doctor hasn't enabled video consults yet.",
                "هذا الطبيب لم يفعّل الكشف أون لاين بعد.",
              )}
            </p>
          )}

          {/* ── Clinic picker — only for clinic type with multiple clinics ── */}
          {appointmentType === "clinic" && multipleClinic && (
            <div>
              <button
                type="button"
                onClick={() => setShowClinicList((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-background text-sm hover:bg-accent"
              >
                <span className="flex items-center gap-1.5 text-foreground">
                  <Building2 className="h-4 w-4" />
                  {selectedClinic ? selectedClinic.name : t("Any clinic", "أي عيادة")}
                </span>
                {showClinicList ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              {showClinicList && (
                <div className="mt-1 border border-border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClinicId(null);
                      setShowClinicList(false);
                    }}
                    className={`w-full text-right px-3 py-2 text-sm hover:bg-accent ${
                      selectedClinicId === null ? "bg-primary/10 text-primary" : ""
                    }`}
                  >
                    {t("Any clinic (auto-pick)", "أقرب موعد في أي عيادة")}
                  </button>
                  {clinics?.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedClinicId(c.id);
                        setShowClinicList(false);
                      }}
                      className={`w-full text-right px-3 py-2 text-sm border-t border-border hover:bg-accent ${
                        selectedClinicId === c.id ? "bg-primary/10 text-primary" : ""
                      }`}
                    >
                      <div className="font-medium">{c.name}</div>
                      {c.city && (
                        <div className="text-xs text-muted-foreground">{c.city}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Unified slot card ── */}
          {slotLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !slot ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
              <AlertCircle className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {clinics && clinics.length === 0
                  ? t(
                      "No clinic schedule configured yet.",
                      "لم يحدد الطبيب جدول عياداته بعد، تواصل معه مباشرة.",
                    )
                  : t(
                      "No available slots in the next 30 days.",
                      "لا توجد مواعيد متاحة خلال 30 يوماً.",
                    )}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2 text-sm">
              {/* Visual badge — the only UI difference between clinic and online */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-primary">
                  {appointmentType === "clinic" ? (
                    <>
                      <Building2 className="h-4 w-4" />
                      <span>{slot.clinic_name}</span>
                    </>
                  ) : (
                    <>
                      <Video className="h-4 w-4" />
                      <span>{t("Online consultation", "كشف أونلاين")}</span>
                    </>
                  )}
                </div>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    appointmentType === "online"
                      ? "bg-violet-100 text-violet-700"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {appointmentType === "online"
                    ? t("Online", "أونلاين")
                    : t("Clinic", "عيادة")}
                </span>
              </div>

              {appointmentType === "clinic" && slot.clinic_city && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{slot.clinic_city}</span>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="font-medium">{formatArabicDate(slot.schedule_date)}</span>
                <span className="text-muted-foreground">
                  ({formatTime(slot.start_time)} - {formatTime(slot.end_time)})
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-primary/20">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">دورك</div>
                  <div className="text-lg font-bold text-primary">
                    #{slot.queue_position_if_book_now}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">انتظار تقريبي</div>
                  <div className="text-lg font-bold text-foreground flex items-center justify-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatWait(waitMinutes)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">متبقي</div>
                  <div className="text-lg font-bold text-emerald-600 flex items-center justify-center gap-1">
                    <Users className="h-4 w-4" />
                    {slot.slots_remaining}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => refetchSlot()}
                className="w-full text-xs text-muted-foreground hover:text-primary pt-1"
              >
                {t("Refresh", "تحديث الحالة")}
              </button>
            </div>
          )}

          {/* ── Notes ── */}
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

          {/* ── Emergency triage ── */}
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <input
              type="checkbox"
              checked={isEmergency}
              onChange={(e) => setIsEmergency(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-destructive"
            />
            <span className="text-sm">
              <span className="font-semibold text-destructive">
                {t("Emergency?", "حالة طارئة؟")}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t(
                  "Flag this booking as urgent — the doctor is alerted immediately.",
                  "صنّف هذا الحجز كحالة عاجلة — يتم تنبيه الطبيب فوراً.",
                )}
              </span>
            </span>
          </label>

          {/* ── Coupon ── */}
          {requiresPayment && (
            <div>
              <label className="text-sm font-medium text-foreground mb-1 flex items-center gap-1">
                <Tag className="h-3.5 w-3.5" />
                {t("Coupon code (optional)", "كود خصم (اختياري)")}
              </label>
              {coupon?.valid ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm">
                  <div className="flex items-center gap-2 text-emerald-900">
                    <CheckCircle2 className="h-4 w-4" />
                    <div>
                      <div className="font-semibold">{coupon.code}</div>
                      <div className="text-xs">
                        {t("Discount applied", "خصم مطبّق")} −{" "}
                        {formatPrice(coupon.discountAmount, currency)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCoupon(null);
                      setCouponInput("");
                    }}
                    className="text-xs text-emerald-900 underline"
                  >
                    {t("Remove", "إلغاء")}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder={t("Enter code", "أدخل الكود")}
                    className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-primary"
                    maxLength={64}
                  />
                  <button
                    type="button"
                    disabled={!couponInput.trim() || couponChecking}
                    onClick={async () => {
                      setCouponChecking(true);
                      try {
                        const r = await validateCoupon({
                          data: {
                            code: couponInput,
                            amount: consultationFee,
                            currency,
                            appointmentType,
                            doctorId,
                            userId: user?.id ?? null,
                          },
                        });
                        if (r.valid) {
                          setCoupon(r);
                          toast.success(t("Coupon applied", "تم تطبيق الكود"));
                        } else {
                          setCoupon(null);
                          toast.error(r.message || t("Invalid coupon", "الكود غير صالح"));
                        }
                      } catch (err) {
                        console.error("validateCoupon", err);
                        toast.error(t("Could not check coupon", "تعذّر التحقّق من الكود"));
                      } finally {
                        setCouponChecking(false);
                      }
                    }}
                    className="px-4 py-2 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                  >
                    {couponChecking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t("Apply", "تطبيق")
                    )}
                  </button>
                </div>
              )}
              {coupon?.valid && (
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("Total after discount", "الإجمالي بعد الخصم")}
                  </span>
                  <span className="font-semibold text-foreground">
                    {formatPrice(coupon.finalAmount, currency)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Book button ── */}
          <button
            onClick={handleBook}
            disabled={isBookDisabled}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          >
            {bookMutation.isPending || isRedirecting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isRedirecting
                  ? t("Redirecting…", "جارٍ التحويل…")
                  : t("Booking…", "جارٍ الحجز…")}
              </span>
            ) : slot ? (
              requiresPayment
                ? t("Reserve & pay", `احجز وادفع (دورك #${slot.queue_position_if_book_now})`)
                : t("Reserve my spot", `احجز دوري (#${slot.queue_position_if_book_now})`)
            ) : (
              t("Book appointment", "احجز موعداً")
            )}
          </button>

          {requiresPayment && (
            <a
              href={`/pay?amount=${Math.round(consultationFee)}`}
              className="mt-2 block text-center text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
            >
              {t(
                "Or pay manually (InstaPay / Vodafone Cash / Bank)",
                "أو ادفع يدوياً (InstaPay / فودافون كاش / حساب بنكي)",
              )}
            </a>
          )}
        </div>
      )}

      <PatientConsentModal
        open={consentOpen}
        doctorName={doctorName}
        onCancel={() => setConsentOpen(false)}
        onConfirm={(consents) => bookMutation.mutate(consents)}
        isSubmitting={bookMutation.isPending}
      />
    </div>
  );
}
