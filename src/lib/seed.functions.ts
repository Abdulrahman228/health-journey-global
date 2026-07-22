import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./admin/_kit";

/**
 * Compliant seed importer for the unclaimed directory (`scraped_doctors`).
 *
 * This is a NEUTRAL bulk-insert tool — the compliance lives in WHERE the admin
 * sources the rows (Egyptian Medical Syndicate export, peer referrals, a clinic's
 * own public business listing) and in the opt-out kill-switch already baked into
 * the schema + the outreach sender. It deliberately does NOT scrape anything.
 *
 * Safety guarantees:
 *   • Admin-only.
 *   • INSERT-NEW-ONLY (ignoreDuplicates) → an opted-out or already-imported row is
 *     NEVER overwritten or resurrected.
 *   • Dedupe key = (source, source_ref); when no source_ref is given we fall back
 *     to the normalized phone, so re-imports don't create duplicate listings.
 */
const SeedRow = z.object({
  full_name: z.string().trim().min(2),
  specialty: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  governorate: z.string().trim().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  external_rating: z.number().optional(),
  external_review_cnt: z.number().int().optional(),
  // Only lawful sources — no social-platform scraping.
  source: z.enum(["syndicate", "referral", "public_listing"]).default("public_listing"),
  source_ref: z.string().trim().optional(),
});

export const importSeededDoctors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ rows: z.array(SeedRow).min(1).max(5000) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const rows = data.rows.map((r) => {
      const phone = r.phone ? r.phone.replace(/\s+/g, "") : null;
      return {
        full_name: r.full_name,
        specialty: r.specialty ?? null,
        phone,
        address: r.address ?? null,
        city: r.city ?? null,
        governorate: r.governorate ?? null,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        external_rating: r.external_rating ?? null,
        external_review_cnt: r.external_review_cnt ?? null,
        source: r.source,
        // Stable dedupe key: explicit ref, else the phone, else null (always inserts).
        source_ref: r.source_ref ?? phone ?? null,
      };
    });

    // Insert-new-only: on (source, source_ref) conflict, do nothing (never touch
    // an existing/opted-out row). The returned rows are exactly the NEW inserts.
    const { data: inserted, error } = await supabaseAdmin
      .from("scraped_doctors")
      .upsert(rows, { onConflict: "source,source_ref", ignoreDuplicates: true })
      .select("id");

    if (error) throw new Error(error.message);

    const insertedCount = inserted?.length ?? 0;
    return {
      received: data.rows.length,
      inserted: insertedCount,
      skipped: data.rows.length - insertedCount,
    };
  });

/** Mask a phone for display: keep the last 3 digits. */
function maskPhone(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `••••${digits.slice(-3)}`;
}

/**
 * Admin listing of the seeded directory — lets the admin see who was imported,
 * who ACTIVATED (claimed 🎉), and who DECLINED (suppressed) + the reason.
 * Admin-only; reads the RLS-locked table via supabaseAdmin. Phone is masked.
 */
export const adminListSeededDoctors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        status: z.enum(["all", "unclaimed", "claimed", "suppressed"]).default("all"),
        search: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    let q = supabaseAdmin
      .from("scraped_doctors")
      .select(
        "id, full_name, specialty, city, governorate, phone, source, listing_status, is_claimed, opted_out, opted_out_reason, imported_at, claimed_at, opted_out_at",
      )
      .order("imported_at", { ascending: false })
      .limit(data.limit);

    if (data.status === "claimed") q = q.eq("is_claimed", true);
    else if (data.status === "suppressed") q = q.eq("opted_out", true);
    else if (data.status === "unclaimed") q = q.eq("is_claimed", false).eq("opted_out", false);

    if (data.search) q = q.ilike("full_name", `%${data.search}%`);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    return {
      rows: (rows ?? []).map((r) => ({
        id: r.id,
        fullName: r.full_name,
        specialty: r.specialty,
        city: [r.city, r.governorate].filter(Boolean).join(" · ") || null,
        phoneHint: maskPhone(r.phone),
        source: r.source,
        status: r.is_claimed ? "claimed" : r.opted_out ? "suppressed" : "unclaimed",
        listingStatus: r.listing_status,
        reason: r.opted_out_reason,
        importedAt: r.imported_at,
        claimedAt: r.claimed_at,
        optedOutAt: r.opted_out_at,
      })),
    };
  });
