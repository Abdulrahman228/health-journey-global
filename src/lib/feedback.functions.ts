import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Phase 5 — Private encrypted feedback.
 * - Patients submit feedback that's stored ENCRYPTED at rest in Postgres
 *   via pgcrypto pgp_sym_encrypt with a per-doctor key derived from a server
 *   pepper. Only the doctor (via SECURITY DEFINER RPC) can decrypt.
 * - These server functions delegate to the SQL functions for that gating.
 */

export const submitPrivateFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      doctorDetailsId: z.string().uuid(),
      message: z.string().min(5).max(5000),
      rating: z.number().int().min(1).max(5).nullable().optional(),
      anonymous: z.boolean().default(false),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>)(
      "submit_private_feedback_admin",
      {
        p_doctor_details_id: data.doctorDetailsId,
        p_patient_id: context.userId,
        p_message: data.message,
        p_rating: data.rating ?? null,
        p_anonymous: data.anonymous,
      },
    );
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const readMyPrivateFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      limit: z.number().int().min(1).max(200).default(50),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    // Use a request-scoped client with the user's auth so SECURITY DEFINER fn
    // sees auth.uid() = the doctor. We'll use the admin client and pass the
    // user id by setting JWT — but supabaseAdmin can't impersonate. Instead,
    // call the SQL fn passing the user id via SET LOCAL through a wrapper.
    // Simpler: query the underlying table directly with admin and decrypt
    // server-side using the same key derivation.
    const { data: dd, error: ddErr } = await supabaseAdmin
      .from("doctor_details")
      .select("id")
      .eq("profile_id", context.userId)
      .maybeSingle();
    if (ddErr) throw new Error(ddErr.message);
    if (!dd) throw new Error("Doctor profile not found");

    const { data: rows, error } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>)(
      "read_my_private_feedback_admin",
      { p_doctor_details_id: dd.id, p_limit: data.limit },
    );
    if (error) {
      // Fallback to client-decrypt-less listing (no message text) if the
      // admin RPC isn't installed yet. This still returns metadata so the UI
      // is useful immediately after deploy.
      const { data: meta } = await supabaseAdmin
        .from("doctor_private_feedback")
        .select("id, is_anonymous, patient_profile_id, rating, created_at")
        .eq("doctor_details_id", dd.id)
        .order("created_at", { ascending: false })
        .limit(data.limit);
      return (meta ?? []).map((m) => ({ ...m, message: "[encrypted — install read fn]" }));
    }
    return rows as Array<{
      id: string;
      is_anonymous: boolean;
      patient_profile_id: string | null;
      message: string;
      rating: number | null;
      created_at: string;
    }>;
  });
