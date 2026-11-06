import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { trackingRateLimit } from "./_rate-limit";

const SESSION_HASH_RE = /^[A-Za-z0-9_-]{8,64}$/;

async function getDoctorIdAndTier(
  userId: string,
): Promise<{ doctorId: string; tier: "free" | "premium" | "gold" }> {
  const { data: dd, error } = await supabaseAdmin
    .from("doctor_details")
    .select("id, profiles!inner(user_id)")
    .eq("profiles.user_id", userId)
    .maybeSingle();
  if (error) throw new Error("تعذّر تحميل بيانات الطبيب: " + error.message);
  if (!dd) throw new Error("هذه الصفحة للأطباء فقط");

  const { data: tierRow } = await supabaseAdmin.rpc("doctor_active_tier", {
    doctor_details_id: dd.id,
  });
  const tier: "free" | "premium" | "gold" =
    tierRow === "gold" || tierRow === "premium" ? tierRow : "free";
  return { doctorId: dd.id, tier };
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
      .select(
        `
        id, status, monthly_budget_cents, daily_cap_cents, cpc_bid_cents,
        spent_total_cents, spent_today_cents, starts_at, ends_at, created_at,
        governorate_id, city_id, specialty,
        governorate:regions!sponsored_slots_governorate_id_fkey (name_ar, name_en),
        city:regions!sponsored_slots_city_id_fkey (name_ar, name_en)
      `,
      )
      .eq("doctor_id", doctorId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("تعذّر تحميل الحملات: " + error.message);

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
      const { data: updated, error } = await supabaseAdmin
        .from("sponsored_slots")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", data.slotId)
        .eq("doctor_id", doctorId)
        .select("id");
      if (error) throw new Error("تعذّر حفظ الحملة: " + error.message);
      if (!updated || updated.length === 0) throw new Error("الحملة غير موجودة");
      return { ok: true, slotId: data.slotId };
    }

    const { data: row, error } = await supabaseAdmin
      .from("sponsored_slots")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error("تعذّر حفظ الحملة: " + error.message);
    return { ok: true, slotId: row.id };
  });

// ---------------------------------------------------------------------------
// Pause / resume / cancel slot
// ---------------------------------------------------------------------------
export const setSlotStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { slotId: string; status: "active" | "paused" | "cancelled" }) => {
    if (!data.slotId) throw new Error("slotId required");
    if (!["active", "paused", "cancelled"].includes(data.status)) {
      throw new Error("Invalid status");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { doctorId, tier } = await getDoctorIdAndTier(context.userId);
    // Re-activating spends budget → same Gold gate as creating a campaign.
    if (data.status === "active" && tier !== "gold") {
      throw new Error("الإعلانات الممولة متاحة فقط لاشتراكات Gold");
    }
    const { data: updated, error } = await supabaseAdmin
      .from("sponsored_slots")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.slotId)
      .eq("doctor_id", doctorId)
      .select("id");
    if (error) throw new Error("تعذّر تحديث حالة الحملة: " + error.message);
    if (!updated || updated.length === 0) throw new Error("الحملة غير موجودة");
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Public: track impression / click. Server-side enforces budget cap.
// ---------------------------------------------------------------------------
export const trackSponsoredEvent = createServerFn({ method: "POST" })
  .middleware([trackingRateLimit])
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
      .select(
        "id, doctor_id, status, starts_at, ends_at, cpc_bid_cents, monthly_budget_cents, daily_cap_cents, spent_total_cents, spent_today_cents, spent_today_date",
      )
      .eq("id", data.slotId)
      .maybeSingle();
    if (error || !slot) return { ok: false };
    if (slot.status !== "active") return { ok: false };
    // Outside the campaign window → not billable (SponsoredDoctorsRow hides
    // these, but this endpoint is public).
    const nowMs = Date.now();
    if (slot.starts_at && Date.parse(slot.starts_at) > nowMs) return { ok: false };
    if (slot.ends_at && Date.parse(slot.ends_at) < nowMs) return { ok: false };

    let cost = data.eventType === "click" || data.eventType === "book" ? slot.cpc_bid_cents : 0;

    // Billing guard (2026-11-02 audit): this endpoint is public, so a script
    // could drain a sponsor's budget with fake clicks. A click/book is billable
    // only when it carries a well-formed session hash AND that session has not
    // already been billed for this slot today. Everything else is still
    // recorded, just at zero cost.
    if (cost > 0) {
      const sessionHash = data.sessionHash ?? "";
      if (!SESSION_HASH_RE.test(sessionHash)) {
        cost = 0;
      } else {
        const dayStart = new Date();
        dayStart.setUTCHours(0, 0, 0, 0);
        const { count } = await supabaseAdmin
          .from("sponsored_impressions")
          .select("id", { count: "exact", head: true })
          .eq("slot_id", slot.id)
          .eq("session_hash", sessionHash)
          .gt("cost_cents", 0)
          .gte("occurred_at", dayStart.toISOString());
        if ((count ?? 0) > 0) cost = 0;
      }
    }

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
