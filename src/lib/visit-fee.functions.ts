/**
 * Visit-fee detection server fn.
 *
 * Decides whether the next visit between (patientProfileId, doctorDetailsId)
 * is billed as a new consultation or qualifies as a free/discounted
 * follow-up — based on:
 *   - doctor_followup_settings.free_followup_days  (window)
 *   - doctor_followup_settings.max_free_followups  (count cap)
 *   - doctor_details.consultation_fee              (full fee)
 *   - doctor_followup_settings.followup_fee        (reduced fee, 0 = free)
 *
 * Returns a stable decision the booking flow can show to the patient
 * BEFORE Stripe checkout — so they see the actual amount up-front.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface VisitFeeDecision {
  visitType: "first_visit" | "follow_up";
  fee: number;
  currency: string;
  reason: string;
  remainingFreeFollowups: number;
  lastVisitDaysAgo: number | null;
  freeFollowupWindowDays: number;
}

interface FollowupSettings {
  freeFollowupDays: number;
  followupFee: number;
  maxFreeFollowups: number;
}

const DEFAULT_SETTINGS: FollowupSettings = {
  freeFollowupDays: 14,
  followupFee: 0,
  maxFreeFollowups: 2,
};

async function getDoctorFollowupSettings(
  doctorDetailsId: string,
): Promise<FollowupSettings> {
  const { data } = await supabaseAdmin
    .from("doctor_followup_settings")
    .select("free_followup_days, followup_fee, max_free_followups")
    .eq("doctor_details_id", doctorDetailsId)
    .maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    freeFollowupDays: (data.free_followup_days as number) ?? DEFAULT_SETTINGS.freeFollowupDays,
    followupFee: Number(data.followup_fee ?? 0),
    maxFreeFollowups: (data.max_free_followups as number) ?? DEFAULT_SETTINGS.maxFreeFollowups,
  };
}

export const determineVisitFee = createServerFn({ method: "GET" })
  .inputValidator((x: unknown) =>
    z
      .object({
        patientProfileId: z.string().uuid(),
        doctorDetailsId: z.string().uuid(),
      })
      .parse(x),
  )
  .handler(async ({ data }): Promise<VisitFeeDecision> => {
    // 1) Fetch doctor base fee + profile id
    const { data: dd } = await supabaseAdmin
      .from("doctor_details")
      .select("id, profile_id, consultation_fee")
      .eq("id", data.doctorDetailsId)
      .maybeSingle();

    const baseFee = Number(dd?.consultation_fee ?? 0);
    const doctorProfileId = (dd?.profile_id as string | undefined) ?? "";
    const currency = "EGP";

    if (!doctorProfileId) {
      return {
        visitType: "first_visit",
        fee: baseFee,
        currency,
        reason: "بيانات الطبيب غير متاحة",
        remainingFreeFollowups: 0,
        lastVisitDaysAgo: null,
        freeFollowupWindowDays: DEFAULT_SETTINGS.freeFollowupDays,
      };
    }

    const settings = await getDoctorFollowupSettings(data.doctorDetailsId);

    // 2) Most recent visit between this pair
    const { data: lastVisit } = await supabaseAdmin
      .from("medical_records")
      .select("id, visit_date, visit_type")
      .eq("patient_profile_id", data.patientProfileId)
      .eq("doctor_profile_id", doctorProfileId)
      .order("visit_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastVisit) {
      return {
        visitType: "first_visit",
        fee: baseFee,
        currency,
        reason: "لا توجد زيارة سابقة لهذا الطبيب",
        remainingFreeFollowups: settings.maxFreeFollowups,
        lastVisitDaysAgo: null,
        freeFollowupWindowDays: settings.freeFollowupDays,
      };
    }

    const visitDate = new Date(lastVisit.visit_date as string);
    const daysSince = Math.floor((Date.now() - visitDate.getTime()) / 86400_000);

    // 3) Find the most recent FIRST_VISIT anchor and count follow_ups since
    const { data: lastFirst } = await supabaseAdmin
      .from("medical_records")
      .select("visit_date")
      .eq("patient_profile_id", data.patientProfileId)
      .eq("doctor_profile_id", doctorProfileId)
      .eq("visit_type", "first_visit")
      .order("visit_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const anchorDate = (lastFirst?.visit_date as string | undefined) ?? lastVisit.visit_date;

    const { count: followupsSoFar } = await supabaseAdmin
      .from("medical_records")
      .select("id", { count: "exact", head: true })
      .eq("patient_profile_id", data.patientProfileId)
      .eq("doctor_profile_id", doctorProfileId)
      .eq("visit_type", "follow_up")
      .gte("visit_date", anchorDate as string);

    const followupsCount = followupsSoFar ?? 0;
    const remaining = Math.max(0, settings.maxFreeFollowups - followupsCount);

    // 4) Inside the window?
    if (daysSince <= settings.freeFollowupDays) {
      if (remaining <= 0) {
        return {
          visitType: "first_visit",
          fee: baseFee,
          currency,
          reason: `تم استنفاد ${settings.maxFreeFollowups} متابعات بعد آخر كشف`,
          remainingFreeFollowups: 0,
          lastVisitDaysAgo: daysSince,
          freeFollowupWindowDays: settings.freeFollowupDays,
        };
      }
      return {
        visitType: "follow_up",
        fee: settings.followupFee,
        currency,
        reason: `متابعة (${daysSince} يوم من آخر زيارة، الحد ${settings.freeFollowupDays})`,
        remainingFreeFollowups: remaining - 1,
        lastVisitDaysAgo: daysSince,
        freeFollowupWindowDays: settings.freeFollowupDays,
      };
    }

    // 5) Out of window — full consultation
    return {
      visitType: "first_visit",
      fee: baseFee,
      currency,
      reason: `مضى ${daysSince} يوم، تجاوز فترة المتابعة المجانية (${settings.freeFollowupDays})`,
      remainingFreeFollowups: settings.maxFreeFollowups,
      lastVisitDaysAgo: daysSince,
      freeFollowupWindowDays: settings.freeFollowupDays,
    };
  });

// ============================================================
// Doctor settings CRUD
// ============================================================
export const getMyFollowupSettings = createServerFn({ method: "GET" })
  .inputValidator((x: unknown) => z.object({ userId: z.string().uuid() }).parse(x))
  .handler(async ({ data }) => {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!prof) return null;
    const { data: dd } = await supabaseAdmin
      .from("doctor_details")
      .select("id, consultation_fee")
      .eq("profile_id", prof.id)
      .maybeSingle();
    if (!dd) return null;
    const { data: s } = await supabaseAdmin
      .from("doctor_followup_settings")
      .select("*")
      .eq("doctor_details_id", dd.id)
      .maybeSingle();
    return {
      doctorDetailsId: dd.id as string,
      consultationFee: Number(dd.consultation_fee ?? 0),
      freeFollowupDays: Number(s?.free_followup_days ?? DEFAULT_SETTINGS.freeFollowupDays),
      followupFee: Number(s?.followup_fee ?? DEFAULT_SETTINGS.followupFee),
      maxFreeFollowups: Number(s?.max_free_followups ?? DEFAULT_SETTINGS.maxFreeFollowups),
    };
  });

export const updateMyFollowupSettings = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        freeFollowupDays: z.number().int().min(0).max(365),
        followupFee: z.number().min(0),
        maxFreeFollowups: z.number().int().min(0).max(10),
      })
      .parse(x),
  )
  .handler(async ({ data }) => {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!prof) return { ok: false as const, error: "no_profile" };
    const { data: dd } = await supabaseAdmin
      .from("doctor_details")
      .select("id")
      .eq("profile_id", prof.id)
      .maybeSingle();
    if (!dd) return { ok: false as const, error: "not_a_doctor" };
    const { error } = await supabaseAdmin
      .from("doctor_followup_settings")
      .upsert(
        {
          doctor_details_id: dd.id,
          free_followup_days: data.freeFollowupDays,
          followup_fee: data.followupFee,
          max_free_followups: data.maxFreeFollowups,
        },
        { onConflict: "doctor_details_id" },
      );
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
