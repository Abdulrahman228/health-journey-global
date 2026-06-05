import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getDoctorIdAndTier(
  userId: string,
): Promise<{ doctorId: string; tier: "free" | "premium" | "gold" }> {
  const { data: dd, error } = await supabaseAdmin
    .from("doctor_details")
    .select("id, profiles!inner(user_id)")
    .eq("profiles.user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!dd) throw new Error("Not a doctor");

  const { data: tierRow } = await supabaseAdmin.rpc("doctor_active_tier", {
    doctor_details_id: dd.id,
  });
  const tier = (tierRow as "free" | "premium" | "gold" | null) ?? "free";
  return { doctorId: dd.id as string, tier };
}

// ---------------------------------------------------------------------------
// List own slots (any tier — read-only) + analytics summary
// ---------------------------------------------------------------------------
export const listMySlots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { doctorId, tier } = await getDoctorIdAndTier(context.userId);

    const { data: slots, error } = await supabaseAdmin
      .from("sponsored_slots")
      .select(`
        id, status, monthly_budget_cents, daily_cap_cents, cpc_bid_cents,
        spent_total_cents, spent_today_cents, starts_at, ends_at, created_at,
        governorate_id, city_id, specialty,
        governorate:governorate_id (name_ar, name_en),
        city:city_id (name_ar, name_en)
      `)
      .eq("doctor_id", doctorId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Last-30d analytics
    const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    const { data: events } = await supabaseAdmin
      .from("sponsored_impressions")
      .select("event_type, cost_cents")
      .eq("doctor_id", doctorId)
      .gte("occurred_at", since);

    const stats = (events ?? []).reduce(
      (acc, e: { event_type: string; cost_cents: number }) => {
        if (e.event_type === "impression") acc.impressions++;
        if (e.event_type === "click") {
          acc.clicks++;
          acc.spent_cents += e.cost_cents ?? 0;
        }
        if (e.event_type === "book") acc.bookings++;
        return acc;
      },
      { impressions: 0, clicks: 0, bookings: 0, spent_cents: 0 },
    );

    return { tier, slots: slots ?? [], stats };
  });

// ---------------------------------------------------------------------------
// Create or update slot — Gold tier only
// ---------------------------------------------------------------------------
export const upsertSponsoredSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      slotId?: string;
      governorateId?: string | null;
      cityId?: string | null;
      specialty?: string | null;
      monthlyBudgetCents: number;
      dailyCapCents?: number | null;
      cpcBidCents: number;
      endsAt?: string | null;
    }) => {
      if (data.monthlyBudgetCents < 10000) {
        throw new Error("الميزانية الشهرية الدنيا 100 جنيه");
      }
      if (data.cpcBidCents < 50) {
        throw new Error("سعر النقرة الأدنى 0.5 جنيه");
      }
      if (data.dailyCapCents != null && data.dailyCapCents < 1000) {
        throw new Error("سقف يومي يجب أن يكون 10 جنيه أو أكثر");
      }
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const { doctorId, tier } = await getDoctorIdAndTier(context.userId);
    if (tier !== "gold") {
      throw new Error("الإعلانات الممولة متاحة فقط لاشتراكات Gold");
    }

    const payload = {
      doctor_id: doctorId,
      governorate_id: data.governorateId ?? null,
      city_id: data.cityId ?? null,
      specialty: data.specialty ?? null,
      monthly_budget_cents: data.monthlyBudgetCents,
      daily_cap_cents: data.dailyCapCents ?? null,
      cpc_bid_cents: data.cpcBidCents,
      ends_at: data.endsAt ?? null,
      status: "active",
    };

    if (data.slotId) {
      const { error } = await supabaseAdmin
        .from("sponsored_slots")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", data.slotId)
        .eq("doctor_id", doctorId);
      if (error) throw new Error(error.message);
      return { ok: true, slotId: data.slotId };
    }

    const { data: row, error } = await supabaseAdmin
      .from("sponsored_slots")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, slotId: row.id };
  });

// ---------------------------------------------------------------------------
// Pause / resume / cancel slot
// ---------------------------------------------------------------------------
export const setSlotStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { slotId: string; status: "active" | "paused" | "cancelled" }) => {
      if (!data.slotId) throw new Error("slotId required");
      if (!["active", "paused", "cancelled"].includes(data.status)) {
        throw new Error("Invalid status");
      }
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const { doctorId } = await getDoctorIdAndTier(context.userId);
    const { error } = await supabaseAdmin
      .from("sponsored_slots")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.slotId)
      .eq("doctor_id", doctorId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Public: track impression / click. Server-side enforces budget cap.
// ---------------------------------------------------------------------------
export const trackSponsoredEvent = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      slotId: string;
      eventType: "impression" | "click" | "book";
      position?: number;
      sessionHash?: string;
    }) => {
      if (!data.slotId) throw new Error("slotId required");
      if (!["impression", "click", "book"].includes(data.eventType)) {
        throw new Error("Invalid event");
      }
      return data;
    },
  )
  .handler(async ({ data }) => {
    const { data: slot, error } = await supabaseAdmin
      .from("sponsored_slots")
      .select("id, doctor_id, status, cpc_bid_cents, monthly_budget_cents, daily_cap_cents, spent_total_cents, spent_today_cents, spent_today_date")
      .eq("id", data.slotId)
      .maybeSingle();
    if (error || !slot) return { ok: false };
    if (slot.status !== "active") return { ok: false };

    const cost =
      data.eventType === "click" || data.eventType === "book"
        ? slot.cpc_bid_cents
        : 0;

    // Reset daily counter if needed
    const today = new Date().toISOString().slice(0, 10);
    let todayCents = slot.spent_today_cents;
    let todayDate = slot.spent_today_date;
    if (todayDate !== today) {
      todayCents = 0;
      todayDate = today;
    }

    const wouldExceedMonthly = slot.spent_total_cents + cost > slot.monthly_budget_cents;
    const wouldExceedDaily =
      slot.daily_cap_cents != null && todayCents + cost > slot.daily_cap_cents;

    if (wouldExceedMonthly || wouldExceedDaily) {
      // Auto-mark exhausted on monthly overflow
      if (wouldExceedMonthly) {
        await supabaseAdmin
          .from("sponsored_slots")
          .update({ status: "exhausted" })
          .eq("id", slot.id);
      }
      return { ok: false, reason: "budget_exceeded" };
    }

    await supabaseAdmin.from("sponsored_impressions").insert({
      slot_id: slot.id,
      doctor_id: slot.doctor_id,
      event_type: data.eventType,
      position: data.position ?? null,
      cost_cents: cost,
      session_hash: data.sessionHash ?? null,
    });

    if (cost > 0) {
      await supabaseAdmin
        .from("sponsored_slots")
        .update({
          spent_total_cents: slot.spent_total_cents + cost,
          spent_today_cents: todayCents + cost,
          spent_today_date: todayDate,
        })
        .eq("id", slot.id);
    }

    return { ok: true };
  });
