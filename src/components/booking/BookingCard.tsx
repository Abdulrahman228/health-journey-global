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

type DaySlot = {
  slot_time: string; // HH:MM:SS
  slot_start_at: string; // ISO timestamp
  is_taken: boolean;
  is_past: boolean;
};

// Next `count` calendar days (local) as YYYY-MM-DD.
function nextDays(count: number): string[] {
  const out: string[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const x = new Date(base.getTime() + i * 86400000);
    out.push(
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`,
    );
  }
  return out;
}

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
  const days = useMemo(() => nextDays(14), []);
  const [selectedDate, setSelectedDate] = useState<string>(() => nextDays(1)[0]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  // Clinic visits let the patient choose to pay online or at the clinic; online
  // consults are always paid online.
  const [payMethod, setPayMethod] = useState<"clinic" | "online">("clinic");

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

  // Availability source clinic: the selected clinic (or the doctor's first).
  const effectiveClinicId = selectedClinicId ?? clinics?.[0]?.id ?? null;

  // === Fixed time-slot grid for the chosen clinic + date ===
  const { data: daySlots = [], isLoading: slotsLoading, refetch: refetchSlots } = useQuery({
    queryKey: ["day-slots", doctorId, effectiveClinicId, selectedDate],
    enabled:
      Boolean(effectiveClinicId) &&
      (appointmentType === "clinic" || (isVerified && telemedicineEnabled)),
    refetchInterval: 30_000,
    queryFn: async (): Promise<DaySlot[]> => {
      const { data, error } = await supabase.rpc("get_clinic_day_slots", {
        p_doctor_id: doctorId,
        p_clinic_id: effectiveClinicId,
        p_date: selectedDate,
      });
      if (error) throw error;
      return (data ?? []) as DaySlot[];
    },
  });

  // Drop a stale slot pick when the date/clinic/type changes.
  useEffect(() => {
    setSelectedSlot(null);
  }, [selectedDate, effectiveClinicId, appointmentType]);

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
    queryKey: ["visit-pricing", doctorId, user?.id, selectedDate],
    enabled: Boolean(user && requiresPayment && selectedDate),
    queryFn: () =>
      previewVisitPricing({ data: { doctorId, scheduledAt: selectedDate } }),
  });

  const bookMutation = useMutation({
    mutationFn: async (consents?: {
      telemedicine_consent: boolean;
      data_processing_consent: boolean;
      recording_consent: boolean;
    }) => {
      if (!user || !profile) throw new Error("Login required");
      if (!selectedSlot || !effectiveClinicId) throw new Error("اختر وقتًا متاحًا أولاً");

      if (appointmentType === "online") {
        if (!isVerified || !telemedicineEnabled) {
          throw new Error("هذا الطبيب لم يفعّل الكشف أون لاين");
        }
        if (!consents?.telemedicine_consent || !consents?.data_processing_consent) {
          throw new Error("الموافقة مطلوبة لإتمام الحجز");
        }
      }

      // Book the exact chosen time slot (clinic + online share the RPC).
      const { data, error } = await supabase.rpc("book_slot_appointment", {
        p_doctor_id: doctorId,
        p_clinic_id: effectiveClinicId,
        p_appointment_date: selectedDate,
        p_slot_time: selectedSlot,
        p_appointment_type: appointmentType,
        p_notes: notes || undefined,
      });
      if (error) throw error;

      const result = data as { id: string };

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
      setSelectedSlot(null);
      queryClient.invalidateQueries({ queryKey: ["day-slots", doctorId] });
      queryClient.invalidateQueries({ queryKey: ["my-appointments"] });

      // Online consults are always paid online; clinic visits only when the
      // patient chose "pay online". Otherwise it's a confirmed booking to be
      // paid at the clinic (or free).
      const shouldCheckout =
        requiresPayment && (appointmentType === "online" || payMethod === "online");

      if (shouldCheckout && result?.id) {
        // Local manual transfer (InstaPay / Vodafone Cash) — no card gateway
        // needed. The /pay page shows the receiving details + amount + reference;
        // the doctor confirms the transfer.
        setIsRedirecting(true);
        toast.success(t("Booked. Complete the transfer to confirm.", "تم الحجز. أكمل التحويل لتأكيد الدفع."));
        window.location.href = `/pay?amount=${Math.round(consultationFee)}&ref=${result.id}`;
        return;
      } else if (requiresPayment) {
        toast.success(t("Booked — pay at the clinic", "تم الحجز — الدفع في العيادة"));
      } else {
        toast.success(t("Appointment booked", "تم الحجز بنجاح"));
      }

      navigate({ to: "/appointments" });
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

  const isBookDisabled =
    bookMutation.isPending ||
    isRedirecting ||
    !selectedSlot ||
    (appointmentType === "online" && (!isVerified || !telemedicineEnabled));

  // Will this booking redirect to online payment (vs. confirm to pay at clinic)?
  const willCheckout =
    requiresPayment && (appointmentType === "online" || payMethod === "online");

  return (
    <div className="bg-card border border-border rounded-2xl p-6 lg:sticky lg:top-4">
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

          {/* ── Day strip ── */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              {t("Choose a day", "اختر اليوم")}
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {days.map((d) => {
                const active = d === selectedDate;
                const dd = new Date(d + "T00:00:00");
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDate(d)}
                    className={`shrink-0 rounded-lg border px-3 py-1.5 text-center transition ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <div className="text-[11px]">{ARABIC_WEEKDAYS[dd.getDay()]}</div>
                    <div className="text-sm font-bold">
                      {dd.getDate()}/{dd.getMonth() + 1}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Time-slot grid (taken/past shown locked) ── */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                {t("Choose a time", "اختر الوقت")}
              </label>
              <button
                type="button"
                onClick={() => refetchSlots()}
                className="text-xs text-muted-foreground hover:text-primary"
              >
                {t("Refresh", "تحديث")}
              </button>
            </div>
            {slotsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : daySlots.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
                <AlertCircle className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {clinics && clinics.length === 0
                    ? t(
                        "No clinic schedule configured yet.",
                        "لم يحدد الطبيب جدول عياداته بعد، تواصل معه مباشرة.",
                      )
                    : t("No times available on this day.", "لا مواعيد متاحة في هذا اليوم.")}
                </p>
                {!(clinics && clinics.length === 0) && (
                  <p className="mt-1 text-xs font-medium text-primary">
                    {t("Pick another day from the strip above ↑", "اختر يومًا آخر من الشريط بالأعلى ↑")}
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {daySlots.map((s) => {
                    const disabled = s.is_taken || s.is_past;
                    const selected = selectedSlot === s.slot_time;
                    return (
                      <button
                        key={s.slot_time}
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelectedSlot(s.slot_time)}
                        title={
                          s.is_taken
                            ? t("Booked", "محجوز")
                            : s.is_past
                              ? t("Passed", "انتهى")
                              : undefined
                        }
                        className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : disabled
                              ? "cursor-not-allowed border-border bg-muted/50 text-muted-foreground/50 line-through"
                              : "border-border bg-background text-foreground hover:border-primary hover:bg-primary/5"
                        }`}
                      >
                        {formatTime(s.slot_time)}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t(
                    "Greyed-out times are already booked or have passed.",
                    "الأوقات الرمادية محجوزة أو انتهى وقتها.",
                  )}
                </p>
              </>
            )}
          </div>

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

          {/* ── Payment method — clinic visits let the patient choose ── */}
          {requiresPayment && appointmentType === "clinic" && selectedSlot && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                {t("Payment method", "طريقة الدفع")}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPayMethod("clinic")}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    payMethod === "clinic"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {t("Pay at clinic", "الدفع في العيادة")}
                </button>
                <button
                  type="button"
                  onClick={() => setPayMethod("online")}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    payMethod === "online"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {t("Transfer (InstaPay / wallet)", "تحويل (InstaPay/محفظة)")}
                </button>
              </div>
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
            ) : selectedSlot ? (
              willCheckout
                ? t("Reserve & pay", `احجز وادفع — ${formatTime(selectedSlot)}`)
                : t("Reserve my spot", `احجز موعدي — ${formatTime(selectedSlot)}`)
            ) : (
              t("Pick a time above", "اختر وقتًا بالأعلى")
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
