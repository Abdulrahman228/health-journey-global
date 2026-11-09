// Platform finance overview for the admin panel (phase 3).
//
// Everything is derived from the same rows the doctor ledger uses, so the
// platform view and the doctor view never disagree:
//   doctor_transactions  → consultation GMV, platform commission, doctor net
//   subscriptions        → Gold revenue (verified, paid — comp grants excluded)
//   doctor_withdrawals   → payouts requested / paid
//   payments             → Paymob card payments (appointments + subscriptions)
// Aggregation is done in JS: at the current volume (hundreds of rows) a single
// pass is cheaper than four SQL views; move to SQL when rows pass ~50k.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveAdmin } from "./_kit";

export interface MonthPoint {
  month: string; // YYYY-MM
  online_gross: number;
  clinic_gross: number;
  commission: number;
  doctor_net: number;
  subscriptions: number;
  payouts_paid: number;
}

export interface DoctorFinanceRow {
  doctor_details_id: string;
  name: string;
  specialty: string | null;
  online_gross: number;
  clinic_gross: number;
  commission: number;
  doctor_net: number;
  payouts_paid: number;
  payouts_pending: number;
  tier: string;
}

function monthKey(iso: string | null | undefined): string {
  return (iso ?? "").slice(0, 7);
}

export const adminFinanceOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ months: z.number().int().min(3).max(36).default(12) }).parse(raw))
  .handler(async ({ data, context }) => {
    await resolveAdmin(context.userId, "admin");

    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - (data.months - 1), 1);
    since.setUTCHours(0, 0, 0, 0);
    const sinceIso = since.toISOString();

    const [tx, subs, plans, wds, pays, receipts] = await Promise.all([
      supabaseAdmin
        .from("doctor_transactions")
        .select("doctor_details_id, type, gross_amount, platform_fee, net_amount, status, metadata, created_at")
        .eq("status", "completed")
        .gte("created_at", sinceIso),
      supabaseAdmin
        .from("subscriptions")
        .select("user_id, plan_code, status, access_status, is_manual, stripe_customer_id, current_period_start, current_period_end, created_at"),
      supabaseAdmin.from("subscription_plans").select("code, tier, price_cents, name_ar"),
      supabaseAdmin
        .from("doctor_withdrawals")
        .select("doctor_details_id, amount, status, requested_at, processed_at"),
      supabaseAdmin.from("payments").select("amount_cents, status, provider, paid_at, created_at").gte("created_at", sinceIso),
      supabaseAdmin
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("access_status", "pending"),
    ]);
    for (const r of [tx, subs, plans, wds, pays]) if (r.error) throw new Error(r.error.message);

    const planPrice = new Map((plans.data ?? []).map((p) => [p.code, Number(p.price_cents ?? 0) / 100]));
    const planTier = new Map((plans.data ?? []).map((p) => [p.code, p.tier as string]));

    // ---- months skeleton ----------------------------------------------------
    const months: MonthPoint[] = [];
    for (let i = 0; i < data.months; i++) {
      const d = new Date(since);
      d.setUTCMonth(since.getUTCMonth() + i);
      months.push({ month: d.toISOString().slice(0, 7), online_gross: 0, clinic_gross: 0, commission: 0, doctor_net: 0, subscriptions: 0, payouts_paid: 0 });
    }
    const byMonth = new Map(months.map((m) => [m.month, m]));

    // ---- consultations -------------------------------------------------------
    const perDoctor = new Map<string, DoctorFinanceRow>();
    const docRow = (id: string) => {
      let r = perDoctor.get(id);
      if (!r) {
        r = { doctor_details_id: id, name: "", specialty: null, online_gross: 0, clinic_gross: 0, commission: 0, doctor_net: 0, payouts_paid: 0, payouts_pending: 0, tier: "free" };
        perDoctor.set(id, r);
      }
      return r;
    };
    let totalCommission = 0, totalOnline = 0, totalClinic = 0, totalNet = 0;
    for (const t of tx.data ?? []) {
      if (t.type !== "consultation") continue;
      const meta = (t.metadata ?? {}) as { appointment_type?: string };
      const isClinic = ["clinic", "in_person"].includes(meta.appointment_type ?? "in_person");
      const gross = Number(t.gross_amount ?? 0);
      const fee = Number(t.platform_fee ?? 0);
      const net = Number(t.net_amount ?? 0);
      const m = byMonth.get(monthKey(t.created_at));
      const d = docRow(t.doctor_details_id);
      if (isClinic) { totalClinic += gross; d.clinic_gross += gross; if (m) m.clinic_gross += gross; }
      else { totalOnline += gross; d.online_gross += gross; if (m) m.online_gross += gross; }
      totalCommission += fee; totalNet += net; d.commission += fee; d.doctor_net += net;
      if (m) { m.commission += fee; m.doctor_net += net; }
    }

    // ---- subscriptions -------------------------------------------------------
    const now = Date.now();
    let activeGold = 0, compGold = 0, subscriptionRevenue = 0, lifetimeCount = 0;
    const doctorTierByUser = new Map<string, string>();
    for (const s of subs.data ?? []) {
      const active = ["active", "trialing"].includes(s.status ?? "") && s.access_status === "verified" && (!s.current_period_end || new Date(s.current_period_end).getTime() > now);
      const tier = planTier.get(s.plan_code ?? "") ?? "free";
      if (active && tier === "gold") {
        if (s.stripe_customer_id === "comp") compGold++; else activeGold++;
        doctorTierByUser.set(s.user_id, tier);
        if (s.plan_code === "doctor_gold_lifetime") lifetimeCount++;
      }
      // Paid subscription revenue: verified, not a comp grant, recognised at period start.
      if (s.access_status === "verified" && s.stripe_customer_id !== "comp") {
        const price = planPrice.get(s.plan_code ?? "") ?? 0;
        const m = byMonth.get(monthKey(s.current_period_start ?? s.created_at));
        if (m) m.subscriptions += price;
        if ((s.current_period_start ?? s.created_at ?? "") >= sinceIso) subscriptionRevenue += price;
      }
    }

    // ---- withdrawals ---------------------------------------------------------
    let payoutsPaid = 0, payoutsPending = 0, payoutsPendingCount = 0;
    for (const w of wds.data ?? []) {
      const amt = Number(w.amount ?? 0);
      const d = docRow(w.doctor_details_id);
      if (w.status === "paid") {
        payoutsPaid += amt; d.payouts_paid += amt;
        const m = byMonth.get(monthKey(w.processed_at ?? w.requested_at));
        if (m) m.payouts_paid += amt;
      } else if (["requested", "approved", "processing"].includes(w.status ?? "")) {
        payoutsPending += amt; payoutsPendingCount++; d.payouts_pending += amt;
      }
    }

    // ---- Paymob card payments ------------------------------------------------
    let cardPaid = 0, cardCount = 0;
    for (const p of pays.data ?? []) {
      if (p.status === "paid" || p.status === "succeeded") { cardPaid += Number(p.amount_cents ?? 0) / 100; cardCount++; }
    }

    // ---- doctor names / tiers ------------------------------------------------
    const ids = [...perDoctor.keys()];
    if (ids.length) {
      const { data: docs } = await supabaseAdmin
        .from("doctor_details")
        .select("id, specialty, profile_id, profiles:profile_id (full_name, user_id)")
        .in("id", ids);
      for (const d of docs ?? []) {
        const r = perDoctor.get(d.id);
        if (!r) continue;
        const prof = d.profiles as unknown as { full_name: string | null; user_id: string | null } | null;
        r.name = prof?.full_name ?? "";
        r.specialty = d.specialty;
        r.tier = (prof?.user_id && doctorTierByUser.get(prof.user_id)) || "free";
      }
    }

    const doctors = [...perDoctor.values()].sort((a, b) => b.online_gross + b.clinic_gross - (a.online_gross + a.clinic_gross));

    return {
      since: sinceIso,
      kpis: {
        commission: totalCommission,
        online_gross: totalOnline,
        clinic_gross: totalClinic,
        doctor_net: totalNet,
        subscription_revenue: subscriptionRevenue,
        platform_revenue: totalCommission + subscriptionRevenue,
        active_gold: activeGold,
        comp_gold: compGold,
        lifetime_gold: lifetimeCount,
        payouts_paid: payoutsPaid,
        payouts_pending: payoutsPending,
        payouts_pending_count: payoutsPendingCount,
        receipts_pending: receipts.count ?? 0,
        card_paid: cardPaid,
        card_count: cardCount,
      },
      months,
      doctors,
    };
  });
