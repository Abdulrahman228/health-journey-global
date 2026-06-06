/**
 * Accounting server functions — doctor earnings, withdrawals, billing.
 *
 * Public balance calculation:
 *   available = sum(net_amount where type IN ('consultation','adjustment','bonus') and status='completed')
 *             - sum(amount of withdrawals where status IN ('approved','processing','paid'))
 *             - sum(net_amount of refunds/chargebacks)
 *
 * Lifetime earnings = sum of all positive net_amount completed.
 * Pending = appointments confirmed but not yet completed × (1 - fee_pct).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertSelf } from "./_authz";

// ---- Types ----
export interface DoctorBalance {
  available: number;
  pending: number;
  lifetimeEarnings: number;
  totalWithdrawn: number;
  currency: string;
  platformFeePct: number;
  minimumPayout: number;
}

export interface DoctorTransaction {
  id: string;
  type: "consultation" | "refund" | "adjustment" | "withdrawal" | "bonus" | "chargeback";
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  currency: string;
  status: "pending" | "completed" | "reversed" | "cancelled";
  description: string | null;
  appointmentId: string | null;
  createdAt: string;
}

export interface DoctorWithdrawal {
  id: string;
  amount: number;
  currency: string;
  method: string;
  status: "requested" | "approved" | "processing" | "paid" | "rejected" | "cancelled";
  reference: string | null;
  doctorNote: string | null;
  adminNote: string | null;
  requestedAt: string;
  processedAt: string | null;
}

export interface BillingSettings {
  payoutMethod: "bank" | "instapay" | "vodafone_cash" | "wise" | "manual";
  accountHolder: string | null;
  bankName: string | null;
  ibanOrAccount: string | null;
  swift: string | null;
  vodafoneNumber: string | null;
  instapayHandle: string | null;
  taxId: string | null;
  vatRegistered: boolean;
  platformFeePct: number;
  minimumPayout: number;
}

const DEFAULT_FEE_PCT = 15;
const DEFAULT_MIN_PAYOUT = 500;

// ============================================================
// Helpers
// ============================================================
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
    .eq("profile_id", prof.id as string)
    .maybeSingle();
  return (dd?.id as string | null) ?? null;
}

async function isAdminUser(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

// ============================================================
// Doctor balance summary
// ============================================================
export const getDoctorBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(x),
  )
  .handler(async ({ data, context }): Promise<DoctorBalance | null> => {
    assertSelf(context.userId, data.userId);
    const ddId = await getDoctorDetailsIdForUser(data.userId);
    if (!ddId) return null;

    const [
      { data: settings },
      { data: txs },
      { data: wds },
      { data: pendingAppts },
      { data: tierRow },
    ] = await Promise.all([
      supabaseAdmin
        .from("doctor_billing_settings")
        .select("platform_fee_pct, minimum_payout")
        .eq("doctor_details_id", ddId)
        .maybeSingle(),
      supabaseAdmin
        .from("doctor_transactions")
        .select("type, net_amount, status, currency")
        .eq("doctor_details_id", ddId),
      supabaseAdmin
        .from("doctor_withdrawals")
        .select("amount, status")
        .eq("doctor_details_id", ddId),
      supabaseAdmin
        .from("appointments")
        .select("fee, appointment_type")
        .eq("doctor_id", ddId)
        .in("status", ["confirmed", "in_progress"]),
      supabaseAdmin.rpc("doctor_active_tier", { doctor_details_id: ddId }),
    ]);

    // Resolve tier-based commission for the *online* portion of pending earnings.
    const tier = (tierRow as string | null) ?? "free";
    const tierPctMap: Record<string, number> = { free: 15, premium: 12, gold: 10 };
    const tierPct = tierPctMap[tier] ?? 15;

    // doctor_billing_settings can override (admin VIP / partnership deals).
    const settingsPct = settings?.platform_fee_pct as number | null;
    const onlineFeePct =
      settingsPct != null && settingsPct < tierPct ? Number(settingsPct) : tierPct;
    const minPayout = (settings?.minimum_payout as number | null) ?? DEFAULT_MIN_PAYOUT;
    const currency =
      ((txs?.[0]?.currency as string | null) ?? "EGP") || "EGP";

    let lifetime = 0;
    let available = 0;
    for (const t of txs ?? []) {
      const net = Number(t.net_amount ?? 0);
      const status = t.status as DoctorTransaction["status"];
      const type = t.type as DoctorTransaction["type"];
      if (status !== "completed") continue;
      if (type === "consultation" || type === "adjustment" || type === "bonus") {
        lifetime += net;
        available += net;
      } else if (type === "refund" || type === "chargeback") {
        available -= Math.abs(net);
      }
    }

    let totalWithdrawn = 0;
    for (const w of wds ?? []) {
      const amt = Number(w.amount ?? 0);
      const st = w.status as DoctorWithdrawal["status"];
      if (st === "paid") totalWithdrawn += amt;
      // hold reserved against available
      if (st === "approved" || st === "processing" || st === "paid") {
        available -= amt;
      }
    }

    // Pending preview: in-person visits → 0% commission; online → tier rate.
    let pending = 0;
    for (const a of pendingAppts ?? []) {
      const gross = Number(a.fee ?? 0);
      const t = (a.appointment_type as string | null) ?? "in_person";
      const fee = t === "in_person" ? 0 : onlineFeePct;
      pending += gross * (1 - fee / 100);
    }

    return {
      available: Math.max(0, Math.round(available * 100) / 100),
      pending: Math.round(pending * 100) / 100,
      lifetimeEarnings: Math.round(lifetime * 100) / 100,
      totalWithdrawn: Math.round(totalWithdrawn * 100) / 100,
      currency,
      platformFeePct: Number(onlineFeePct),
      minimumPayout: Number(minPayout),
    };
  });

// ============================================================
// Doctor transactions list
// ============================================================
export const getDoctorTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(x),
  )
  .handler(async ({ data, context }): Promise<DoctorTransaction[]> => {
    assertSelf(context.userId, data.userId);
    const ddId = await getDoctorDetailsIdForUser(data.userId);
    if (!ddId) return [];
    const { data: txs } = await supabaseAdmin
      .from("doctor_transactions")
      .select(
        "id, type, gross_amount, platform_fee, net_amount, currency, status, description, appointment_id, created_at",
      )
      .eq("doctor_details_id", ddId)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    return (txs ?? []).map((t) => ({
      id: t.id as string,
      type: t.type as DoctorTransaction["type"],
      grossAmount: Number(t.gross_amount ?? 0),
      platformFee: Number(t.platform_fee ?? 0),
      netAmount: Number(t.net_amount ?? 0),
      currency: (t.currency as string) ?? "EGP",
      status: t.status as DoctorTransaction["status"],
      description: (t.description as string | null) ?? null,
      appointmentId: (t.appointment_id as string | null) ?? null,
      createdAt: t.created_at as string,
    }));
  });

// ============================================================
// Doctor withdrawals list
// ============================================================
export const getDoctorWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(x),
  )
  .handler(async ({ data, context }): Promise<DoctorWithdrawal[]> => {
    assertSelf(context.userId, data.userId);
    const ddId = await getDoctorDetailsIdForUser(data.userId);
    if (!ddId) return [];
    const { data: wds } = await supabaseAdmin
      .from("doctor_withdrawals")
      .select(
        "id, amount, currency, method, status, reference, doctor_note, admin_note, requested_at, processed_at",
      )
      .eq("doctor_details_id", ddId)
      .order("created_at", { ascending: false });
    return (wds ?? []).map(mapWd);
  });

function mapWd(w: Record<string, unknown>): DoctorWithdrawal {
  return {
    id: w.id as string,
    amount: Number(w.amount ?? 0),
    currency: (w.currency as string) ?? "EGP",
    method: (w.method as string) ?? "bank",
    status: w.status as DoctorWithdrawal["status"],
    reference: (w.reference as string | null) ?? null,
    doctorNote: (w.doctor_note as string | null) ?? null,
    adminNote: (w.admin_note as string | null) ?? null,
    requestedAt: w.requested_at as string,
    processedAt: (w.processed_at as string | null) ?? null,
  };
}

// ============================================================
// Request a withdrawal
// ============================================================
export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        amount: z.number().positive(),
        doctorNote: z.string().max(500).optional(),
      })
      .parse(x),
  )
  .handler(async ({ data, context }) => {
    assertSelf(context.userId, data.userId);
    const ddId = await getDoctorDetailsIdForUser(data.userId);
    if (!ddId) return { ok: false as const, error: "Not a doctor" };

    // Check balance
    const balance = await getDoctorBalance({ data: { userId: data.userId } });
    if (!balance) return { ok: false as const, error: "Balance unavailable" };
    if (data.amount > balance.available) {
      return { ok: false as const, error: "المبلغ يتجاوز الرصيد المتاح" };
    }
    if (data.amount < balance.minimumPayout) {
      return {
        ok: false as const,
        error: `الحد الأدنى للسحب ${balance.minimumPayout} ${balance.currency}`,
      };
    }

    // Snapshot payout details
    const { data: settings } = await supabaseAdmin
      .from("doctor_billing_settings")
      .select(
        "payout_method, account_holder, bank_name, iban_or_account, swift, vodafone_number, instapay_handle",
      )
      .eq("doctor_details_id", ddId)
      .maybeSingle();

    if (!settings || !settings.payout_method) {
      return {
        ok: false as const,
        error: "أكمل بيانات السحب أولاً في الإعدادات",
      };
    }

    const { data: ins, error } = await supabaseAdmin
      .from("doctor_withdrawals")
      .insert({
        doctor_details_id: ddId,
        amount: data.amount,
        currency: balance.currency,
        method: settings.payout_method as string,
        payout_details_snapshot: settings,
        status: "requested",
        doctor_note: data.doctorNote ?? null,
      })
      .select("id")
      .single();

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, withdrawalId: ins?.id as string };
  });

// ============================================================
// Cancel pending withdrawal (doctor)
// ============================================================
export const cancelMyWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        withdrawalId: z.string().uuid(),
      })
      .parse(x),
  )
  .handler(async ({ data, context }) => {
    assertSelf(context.userId, data.userId);
    const ddId = await getDoctorDetailsIdForUser(data.userId);
    if (!ddId) return { ok: false as const, error: "Not a doctor" };
    const { error } = await supabaseAdmin
      .from("doctor_withdrawals")
      .update({ status: "cancelled" })
      .eq("id", data.withdrawalId)
      .eq("doctor_details_id", ddId)
      .eq("status", "requested");
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// ============================================================
// Billing settings — get/upsert
// ============================================================
export const getMyBillingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(x),
  )
  .handler(async ({ data, context }): Promise<BillingSettings | null> => {
    assertSelf(context.userId, data.userId);
    const ddId = await getDoctorDetailsIdForUser(data.userId);
    if (!ddId) return null;
    const { data: row } = await supabaseAdmin
      .from("doctor_billing_settings")
      .select("*")
      .eq("doctor_details_id", ddId)
      .maybeSingle();
    if (!row) {
      return {
        payoutMethod: "bank",
        accountHolder: null,
        bankName: null,
        ibanOrAccount: null,
        swift: null,
        vodafoneNumber: null,
        instapayHandle: null,
        taxId: null,
        vatRegistered: false,
        platformFeePct: DEFAULT_FEE_PCT,
        minimumPayout: DEFAULT_MIN_PAYOUT,
      };
    }
    return {
      payoutMethod: row.payout_method as BillingSettings["payoutMethod"],
      accountHolder: (row.account_holder as string | null) ?? null,
      bankName: (row.bank_name as string | null) ?? null,
      ibanOrAccount: (row.iban_or_account as string | null) ?? null,
      swift: (row.swift as string | null) ?? null,
      vodafoneNumber: (row.vodafone_number as string | null) ?? null,
      instapayHandle: (row.instapay_handle as string | null) ?? null,
      taxId: (row.tax_id as string | null) ?? null,
      vatRegistered: Boolean(row.vat_registered),
      platformFeePct: Number(row.platform_fee_pct ?? DEFAULT_FEE_PCT),
      minimumPayout: Number(row.minimum_payout ?? DEFAULT_MIN_PAYOUT),
    };
  });

export const upsertMyBillingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        payoutMethod: z.enum(["bank", "instapay", "vodafone_cash", "wise", "manual"]),
        accountHolder: z.string().nullable(),
        bankName: z.string().nullable(),
        ibanOrAccount: z.string().nullable(),
        swift: z.string().nullable(),
        vodafoneNumber: z.string().nullable(),
        instapayHandle: z.string().nullable(),
        taxId: z.string().nullable(),
        vatRegistered: z.boolean(),
      })
      .parse(x),
  )
  .handler(async ({ data, context }) => {
    assertSelf(context.userId, data.userId);
    const ddId = await getDoctorDetailsIdForUser(data.userId);
    if (!ddId) return { ok: false as const, error: "Not a doctor" };
    const { error } = await supabaseAdmin.from("doctor_billing_settings").upsert(
      {
        doctor_details_id: ddId,
        payout_method: data.payoutMethod,
        account_holder: data.accountHolder,
        bank_name: data.bankName,
        iban_or_account: data.ibanOrAccount,
        swift: data.swift,
        vodafone_number: data.vodafoneNumber,
        instapay_handle: data.instapayHandle,
        tax_id: data.taxId,
        vat_registered: data.vatRegistered,
      },
      { onConflict: "doctor_details_id" },
    );
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// ============================================================
// ADMIN: pending withdrawals list
// ============================================================
export interface AdminWithdrawalRow extends DoctorWithdrawal {
  doctorName: string | null;
  doctorSpecialty: string | null;
  payoutDetails: Record<string, string | number | boolean | null> | null;
}

export const adminListWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        status: z
          .enum(["requested", "approved", "processing", "paid", "rejected", "cancelled", "all"])
          .default("requested"),
      })
      .parse(x),
  )
  .handler(async ({ data, context }): Promise<AdminWithdrawalRow[]> => {
    assertSelf(context.userId, data.userId);
    if (!(await isAdminUser(data.userId))) return [];
    let q = supabaseAdmin
      .from("doctor_withdrawals")
      .select(
        "id, doctor_details_id, amount, currency, method, status, reference, doctor_note, admin_note, requested_at, processed_at, payout_details_snapshot",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: wds } = await q;
    if (!wds || wds.length === 0) return [];

    const ddIds = Array.from(new Set(wds.map((w) => w.doctor_details_id as string)));
    const { data: details } = await supabaseAdmin
      .from("doctor_details")
      .select("id, profile_id, specialty")
      .in("id", ddIds);
    const profileIds = (details ?? []).map((d) => d.profile_id as string);
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);

    const ddMap = new Map(
      (details ?? []).map((d) => [d.id as string, d as Record<string, unknown>]),
    );
    const profMap = new Map(
      (profs ?? []).map((p) => [p.id as string, p as Record<string, unknown>]),
    );

    return wds.map((w) => {
      const dd = ddMap.get(w.doctor_details_id as string);
      const prof = dd ? profMap.get(dd.profile_id as string) : undefined;
      return {
        ...mapWd(w),
        doctorName: ((prof?.full_name as string | null) ?? null) || null,
        doctorSpecialty: (dd?.specialty as string | null) ?? null,
        payoutDetails:
          (w.payout_details_snapshot as Record<string, string | number | boolean | null> | null) ?? null,
      };
    });
  });

// ============================================================
// ADMIN: update withdrawal status
// ============================================================
export const adminUpdateWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        withdrawalId: z.string().uuid(),
        status: z.enum(["approved", "processing", "paid", "rejected"]),
        reference: z.string().max(120).optional(),
        adminNote: z.string().max(500).optional(),
      })
      .parse(x),
  )
  .handler(async ({ data, context }) => {
    assertSelf(context.userId, data.userId);
    if (!(await isAdminUser(data.userId))) {
      return { ok: false as const, error: "Unauthorized" };
    }
    const update: {
      status: string;
      processed_at: string;
      processed_by: string;
      reference?: string;
      admin_note?: string;
    } = {
      status: data.status,
      processed_at: new Date().toISOString(),
      processed_by: data.userId,
    };
    if (data.reference) update.reference = data.reference;
    if (data.adminNote) update.admin_note = data.adminNote;

    const { error } = await supabaseAdmin
      .from("doctor_withdrawals")
      .update(update)
      .eq("id", data.withdrawalId);
    if (error) return { ok: false as const, error: error.message };

    // When marked paid, record a withdrawal transaction (negative net)
    if (data.status === "paid") {
      const { data: wd } = await supabaseAdmin
        .from("doctor_withdrawals")
        .select("doctor_details_id, amount, currency")
        .eq("id", data.withdrawalId)
        .maybeSingle();
      if (wd) {
        await supabaseAdmin.from("doctor_transactions").insert({
          doctor_details_id: wd.doctor_details_id as string,
          type: "withdrawal",
          gross_amount: 0,
          platform_fee: 0,
          net_amount: -Number(wd.amount ?? 0),
          currency: (wd.currency as string) ?? "EGP",
          status: "completed",
          description: `Withdrawal paid (#${data.reference ?? data.withdrawalId.slice(0, 8)})`,
        });
      }
    }
    return { ok: true as const };
  });
