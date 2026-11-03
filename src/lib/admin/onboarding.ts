/**
 * Admin onboarding-funnel metrics: seeded directory → claimed, doctors →
 * verified → new, and attributed peer referrals. Admin-gated; read-only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./_kit";

export interface OnboardingFunnel {
  totalDoctors: number;
  verifiedDoctors: number;
  newDoctors30: number;
  totalReferrals: number;
  seededTotal: number;
  seededClaimed: number;
  seededOptedOut: number;
}

/** Resolve a supabase count query to a plain number (0 on any error). */
async function countOf(query: PromiseLike<{ count: number | null }>): Promise<number> {
  try {
    const { count } = await query;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export const adminOnboardingFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ userId: z.string().uuid() }).parse(x))
  .handler(async ({ data, context }): Promise<OnboardingFunnel> => {
    await assertAdmin(context.userId);

    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const dd = () => supabaseAdmin.from("doctor_details").select("id", { count: "exact", head: true });
    const sd = () => supabaseAdmin.from("scraped_doctors").select("id", { count: "exact", head: true });

    const [
      totalDoctors,
      verifiedDoctors,
      newDoctors30,
      totalReferrals,
      seededTotal,
      seededClaimed,
      seededOptedOut,
    ] = await Promise.all([
      countOf(dd()),
      countOf(dd().eq("is_verified", true)),
      countOf(dd().gte("created_at", since30)),
      countOf(
        supabaseAdmin.from("doctor_referrals").select("id", { count: "exact", head: true }),
      ),
      countOf(sd()),
      countOf(sd().eq("is_claimed", true)),
      countOf(sd().eq("opted_out", true)),
    ]);

    return {
      totalDoctors,
      verifiedDoctors,
      newDoctors30,
      totalReferrals,
      seededTotal,
      seededClaimed,
      seededOptedOut,
    };
  });
