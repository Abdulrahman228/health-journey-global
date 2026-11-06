/**
 * Lab result reads — payment/consent gated (RBAC Phase 2).
 *
 * Signed URLs are issued only after re-checking the gate server-side, so the
 * generic listAttachments path (which trusts "patient" unconditionally) can
 * never leak an UNPAID lab result. Authorization:
 *   • lab owner of the order  → always (they delivered it)
 *   • patient of the order    → only when payment_status = 'paid'
 *   • authorized doctor       → only when patient_authorized AND paid
 *   • admin                   → always (audit)
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertSelf } from "./_authz";

const BUCKET = "medical-attachments";
const SIGNED_URL_TTL = 60 * 60; // 1 hour

export interface LabResultFile {
  id: string;
  type: string;
  fileName: string;
  notes: string | null;
  createdAt: string;
  signedUrl?: string;
}

async function myProfileId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

export const getLabOrderResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z.object({ userId: z.string().uuid(), orderId: z.string().uuid() }).parse(x),
  )
  .handler(async ({ data, context }): Promise<LabResultFile[]> => {
    assertSelf(context.userId, data.userId);

    const { data: order } = await supabaseAdmin
      .from("lab_orders")
      .select(
        "id, patient_profile_id, lab_id, authorized_doctor_profile_id, patient_authorized, payment_status",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return [];

    const paid = order.payment_status === "paid";
    const me = await myProfileId(data.userId);

    // admin? (admin + super_admin users have two rows → limit(1), not maybeSingle)
    const { data: adminRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId)
      .in("role", ["admin", "super_admin"])
      .limit(1);
    const isAdminUser = (adminRows ?? []).length > 0;

    // lab owner?
    const { data: fac } = await supabaseAdmin
      .from("lab_facilities")
      .select("owner_user_id")
      .eq("id", order.lab_id)
      .maybeSingle();
    const isLabOwner = fac?.owner_user_id === data.userId;

    const isPatient = me != null && me === order.patient_profile_id;
    const isAuthorizedDoctor =
      me != null && order.patient_authorized === true && me === order.authorized_doctor_profile_id;

    const allowed = isAdminUser || isLabOwner || (isPatient && paid) || (isAuthorizedDoctor && paid);
    if (!allowed) return [];

    const { data: rows } = await supabaseAdmin
      .from("medical_attachments")
      .select("id, type, file_name, file_url, notes, created_at")
      .eq("lab_order_id", data.orderId)
      .order("created_at", { ascending: false });
    if (!rows) return [];

    return Promise.all(
      rows.map(async (r) => {
        const { data: signed } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(r.file_url, SIGNED_URL_TTL);
        return {
          id: r.id,
          type: r.type,
          fileName: r.file_name ?? "file",
          notes: r.notes ?? null,
          createdAt: r.created_at,
          signedUrl: signed?.signedUrl,
        } satisfies LabResultFile;
      }),
    );
  });
