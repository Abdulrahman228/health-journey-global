/**
 * Doctor analytics server functions — Premium/Gold tier feature.
 *
 * Aggregates the data needed by /dashboard/analytics:
 *   - Daily profile views (last 30 days)
 *   - Daily bookings (last 30 days)
 *   - View → booking conversion rate
 *   - Revenue trend (last 90 days, weekly)
 *   - Booking-by-type & top patient cities
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertSelf } from "./_authz";

// --- Types --------------------------------------------------------------

export interface DoctorAnalyticsSeriesPoint {
  date: string; // YYYY-MM-DD
  views: number;
  bookings: number;
  revenue: number;
}

export interface DoctorAnalytics {
  tier: "free" | "premium" | "gold";
  hasAccess: boolean; // false → user is free-tier; gate the UI
  range: { from: string; to: string };
  totals: {
    views: number;
    bookings: number;
    revenue: number;
    conversionPct: number; // bookings / views * 100
  };
  series: DoctorAnalyticsSeriesPoint[]; // 30 entries, oldest → newest
  byType: { online: number; in_person: number };
  topCities: { city: string; bookings: number }[]; // up to 5
  topSpecialtyTerms: { term: string; count: number }[]; // up to 5
}

// --- Helpers ------------------------------------------------------------

async function getDoctorDetailsIdForUser(userId: string): Promise<string | null> {
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!prof) return null;
  const { data: dd } = await supabaseAdmin
    .from("doctor_details")
    .select("id")
    .eq("profile_id", prof.id)
    .maybeSingle();
  return (dd?.id as string | undefined) ?? null;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function emptySeries(days: number): DoctorAnalyticsSeriesPoint[] {
  const out: DoctorAnalyticsSeriesPoint[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    out.push({ date: fmtDate(d), views: 0, bookings: 0, revenue: 0 });
  }
  return out;
}

// --- Public RPC ---------------------------------------------------------

export const getDoctorAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(x),
  )
  .handler(async ({ data, context }): Promise<DoctorAnalytics | null> => {
    assertSelf(context.userId, data.userId);
    const ddId = await getDoctorDetailsIdForUser(data.userId);
    if (!ddId) return null;

    // Resolve tier first to gate access.
    const { data: tierRow } = await supabaseAdmin.rpc("doctor_active_tier", {
      doctor_details_id: ddId,
    });
    const tier = ((tierRow as string | null) ?? "free") as
      | "free"
      | "premium"
      | "gold";
    const hasAccess = tier === "premium" || tier === "gold";

    // Date range: last 30 days inclusive.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const from = new Date(today);
    from.setUTCDate(today.getUTCDate() - 29);
    const fromStr = fmtDate(from);
    const toStr = fmtDate(today);

    // If user is free-tier, return a stub so the UI can show an upsell.
    if (!hasAccess) {
      return {
        tier,
        hasAccess: false,
        range: { from: fromStr, to: toStr },
        totals: { views: 0, bookings: 0, revenue: 0, conversionPct: 0 },
        series: emptySeries(30),
        byType: { online: 0, in_person: 0 },
        topCities: [],
        topSpecialtyTerms: [],
      };
    }

    // Pull views + appointments in parallel.
    const [{ data: views }, { data: appts }] = await Promise.all([
      supabaseAdmin
        .from("doctor_profile_views")
        .select("viewed_on, views")
        .eq("doctor_details_id", ddId)
        .gte("viewed_on", fromStr)
        .lte("viewed_on", toStr),
      supabaseAdmin
        .from("appointments")
        // Bucket by `scheduled_at` (always set), NOT the nullable
        // `appointment_date` — otherwise rows without an appointment_date are
        // dropped from the revenue/booking series.
        .select(
          "fee, appointment_type, status, scheduled_at, patient_id",
        )
        .eq("doctor_id", ddId)
        .gte("scheduled_at", `${fromStr}T00:00:00Z`)
        .lte("scheduled_at", `${toStr}T23:59:59.999Z`),
    ]);

    // Build series skeleton, then merge.
    const series = emptySeries(30);
    const idxByDate = new Map(series.map((p, i) => [p.date, i] as const));

    for (const v of (views ?? []) as Array<{ viewed_on: string; views: number }>) {
      const i = idxByDate.get(v.viewed_on);
      if (i !== undefined) series[i].views += Number(v.views ?? 0);
    }

    let totalBookings = 0;
    let totalRevenue = 0;
    let online = 0;
    let inPerson = 0;
    const patientIds = new Set<string>();

    for (const a of (appts ?? []) as Array<{
      fee: number | null;
      appointment_type: string | null;
      status: string | null;
      scheduled_at: string;
      patient_id: string;
    }>) {
      // Count only confirmed/completed/in-progress as booked.
      const st = (a.status ?? "").toLowerCase();
      if (st === "cancelled" || st === "no_show") continue;

      const i = idxByDate.get(String(a.scheduled_at).slice(0, 10));
      if (i === undefined) continue;

      const fee = Number(a.fee ?? 0);
      const type = (a.appointment_type as string) ?? "in_person";

      series[i].bookings += 1;
      series[i].revenue += fee;
      totalBookings += 1;
      totalRevenue += fee;
      if (type === "online" || type === "video_consultation") online += 1;
      else inPerson += 1;

      if (a.patient_id) patientIds.add(a.patient_id);
    }

    // Top patient cities — derive from profiles in a follow-up query.
    let topCities: { city: string; bookings: number }[] = [];
    if (patientIds.size > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("user_id, city")
        .in("user_id", Array.from(patientIds));
      const cityCounts = new Map<string, number>();
      for (const p of (profs ?? []) as Array<{ user_id: string; city: string | null }>) {
        const city = (p.city ?? "").trim();
        if (!city) continue;
        cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
      }
      topCities = Array.from(cityCounts.entries())
        .map(([city, bookings]) => ({ city, bookings }))
        .sort((a, b) => b.bookings - a.bookings)
        .slice(0, 5);
    }

    const totalViews = series.reduce((s, p) => s + p.views, 0);
    const conversionPct =
      totalViews > 0 ? (totalBookings / totalViews) * 100 : 0;

    return {
      tier,
      hasAccess: true,
      range: { from: fromStr, to: toStr },
      totals: {
        views: totalViews,
        bookings: totalBookings,
        revenue: Math.round(totalRevenue * 100) / 100,
        conversionPct: Math.round(conversionPct * 100) / 100,
      },
      series,
      byType: { online, in_person: inPerson },
      topCities,
      topSpecialtyTerms: [],
    };
  });
