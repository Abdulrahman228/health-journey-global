/**
 * Doctor accounting — expenses & monthly P&L (Premium/Gold feature).
 *
 * Endpoints:
 *   listMyExpenses({userId, year?, month?})
 *   addMyExpense({userId, ...fields})
 *   deleteMyExpense({userId, id})
 *   getMyMonthlyPnL({userId, year, month}) → totals + CSV string
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertSelf } from "./_authz";

export const EXPENSE_CATEGORIES = [
  "rent",
  "utilities",
  "staff",
  "equipment",
  "supplies",
  "marketing",
  "tax",
  "software",
  "training",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** doctor_expenses.category is free text (mobile writes its own labels) → bucket unknown ones as "other". */
function toCategory(raw: string | null | undefined): ExpenseCategory {
  return EXPENSE_CATEGORIES.find((c) => c === raw) ?? "other";
}

const NOT_A_DOCTOR = "لم يتم العثور على ملف الطبيب لهذا الحساب";

export interface DoctorExpense {
  id: string;
  expenseDate: string; // YYYY-MM-DD
  category: ExpenseCategory;
  amount: number;
  currency: string;
  vendor: string | null;
  description: string | null;
  receiptUrl: string | null;
  createdAt: string;
}

export interface MonthlyPnL {
  year: number;
  month: number;
  grossRevenue: number;
  platformFees: number;
  netRevenue: number;
  totalExpenses: number;
  bookingsCount: number;
  netProfit: number;
  currency: string;
  expensesByCategory: Record<ExpenseCategory, number>;
  csv: string;
}

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

async function requireTier(
  ddId: string,
  required: "premium" | "gold",
): Promise<boolean> {
  const { data } = await supabaseAdmin.rpc("doctor_active_tier", {
    doctor_details_id: ddId,
  });
  const tier = (data as string | null) ?? "free";
  if (required === "premium") return tier === "premium" || tier === "gold";
  return tier === "gold";
}

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------
export const listMyExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        year: z.number().int().min(2020).max(2100).optional(),
        month: z.number().int().min(1).max(12).optional(),
      })
      .parse(x),
  )
  .handler(async ({ data, context }): Promise<DoctorExpense[]> => {
    assertSelf(context.userId, data.userId);
    const ddId = await getDoctorDetailsIdForUser(data.userId);
    if (!ddId) return [];

    let q = supabaseAdmin
      .from("doctor_expenses")
      .select("id, expense_date, category, amount, currency, vendor, description, receipt_url, created_at")
      .eq("doctor_details_id", ddId)
      .order("expense_date", { ascending: false });

    if (data.year && data.month) {
      const from = `${data.year}-${String(data.month).padStart(2, "0")}-01`;
      const next = new Date(data.year, data.month, 1);
      const to = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
      q = q.gte("expense_date", from).lt("expense_date", to);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error("تعذّر تحميل المصاريف: " + error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      // expense_date is mirrored from spent_at by trg_sync_doctor_expense_cols.
      expenseDate: r.expense_date ?? "",
      category: toCategory(r.category),
      amount: Number(r.amount),
      currency: r.currency,
      vendor: r.vendor,
      description: r.description,
      receiptUrl: r.receipt_url,
      createdAt: r.created_at,
    }));
  });

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------
export const addMyExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        category: z.enum(EXPENSE_CATEGORIES),
        amount: z.number().positive().max(10_000_000),
        currency: z.string().min(2).max(8).default("EGP"),
        vendor: z.string().max(120).optional(),
        description: z.string().max(500).optional(),
        receiptUrl: z.string().url().max(500).optional(),
      })
      .parse(x),
  )
  .handler(async ({ data, context }) => {
    assertSelf(context.userId, data.userId);
    const ddId = await getDoctorDetailsIdForUser(data.userId);
    if (!ddId) throw new Error(NOT_A_DOCTOR);
    const ok = await requireTier(ddId, "premium");
    if (!ok) throw new Error("PREMIUM_REQUIRED");

    const { data: row, error } = await supabaseAdmin
      .from("doctor_expenses")
      .insert({
        // doctor_id / spent_at are the NOT NULL columns (mobile names);
        // trg_sync_doctor_expense_cols mirrors them into the web names.
        doctor_id: ddId,
        doctor_details_id: ddId,
        spent_at: data.expenseDate,
        expense_date: data.expenseDate,
        category: data.category,
        amount: data.amount,
        currency: data.currency,
        vendor: data.vendor ?? null,
        description: data.description ?? null,
        receipt_url: data.receiptUrl ?? null,
        created_by: data.userId,
      })
      .select("id")
      .single();

    if (error) throw new Error("تعذّر حفظ المصروف: " + error.message);
    return { id: row.id };
  });

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------
export const deleteMyExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z.object({ userId: z.string().uuid(), id: z.string().uuid() }).parse(x),
  )
  .handler(async ({ data, context }) => {
    assertSelf(context.userId, data.userId);
    const ddId = await getDoctorDetailsIdForUser(data.userId);
    if (!ddId) throw new Error(NOT_A_DOCTOR);

    const { error } = await supabaseAdmin
      .from("doctor_expenses")
      .delete()
      .eq("id", data.id)
      .eq("doctor_details_id", ddId);

    if (error) throw new Error("تعذّر حذف المصروف: " + error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// MONTHLY P&L (with CSV)
// ---------------------------------------------------------------------------
export const getMyMonthlyPnL = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        year: z.number().int().min(2020).max(2100),
        month: z.number().int().min(1).max(12),
      })
      .parse(x),
  )
  .handler(async ({ data, context }): Promise<MonthlyPnL | null> => {
    assertSelf(context.userId, data.userId);
    const ddId = await getDoctorDetailsIdForUser(data.userId);
    if (!ddId) return null;
    const ok = await requireTier(ddId, "premium");
    if (!ok) return null;

    const { data: pnlRow, error: pnlErr } = await supabaseAdmin.rpc("doctor_monthly_pnl", {
      _doctor_details_id: ddId,
      _year: data.year,
      _month: data.month,
    });
    if (pnlErr) throw new Error("تعذّر حساب تقرير الأرباح والخسائر: " + pnlErr.message);

    const r = (pnlRow ?? [])[0];

    const grossRevenue = Number(r?.gross_revenue ?? 0);
    const platformFees = Number(r?.platform_fees ?? 0);
    const netRevenue = Number(r?.net_revenue ?? 0);
    const totalExpenses = Number(r?.total_expenses ?? 0);
    const bookingsCount = Number(r?.bookings_count ?? 0);
    const netProfit = Number(r?.net_profit ?? 0);
    const currency = r?.currency ?? "EGP";

    // Detail expense breakdown for the month.
    const from = `${data.year}-${String(data.month).padStart(2, "0")}-01`;
    const next = new Date(data.year, data.month, 1);
    const to = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
    const { data: expRows, error: expErr } = await supabaseAdmin
      .from("doctor_expenses")
      .select("category, amount, expense_date, vendor, description")
      .eq("doctor_details_id", ddId)
      .gte("expense_date", from)
      .lt("expense_date", to)
      .order("expense_date", { ascending: true });
    if (expErr) throw new Error("تعذّر تحميل المصاريف: " + expErr.message);

    const byCat = {} as Record<ExpenseCategory, number>;
    for (const c of EXPENSE_CATEGORIES) byCat[c] = 0;
    for (const e of expRows ?? []) {
      // Unknown (mobile free-text) categories go to "other" so the CSV
      // breakdown always adds up to the total.
      const cat = toCategory(e.category);
      byCat[cat] += Number(e.amount);
    }

    // Build CSV (UTF-8 with BOM so Excel opens Arabic correctly).
    const csvLines: string[] = [];
    csvLines.push("Section,Field,Value");
    csvLines.push(`Header,Year,${data.year}`);
    csvLines.push(`Header,Month,${data.month}`);
    csvLines.push(`Header,Currency,${currency}`);
    csvLines.push(`Revenue,Gross,${grossRevenue.toFixed(2)}`);
    csvLines.push(`Revenue,Platform Fee,${platformFees.toFixed(2)}`);
    csvLines.push(`Revenue,Net,${netRevenue.toFixed(2)}`);
    csvLines.push(`Revenue,Bookings,${bookingsCount}`);
    csvLines.push(`Expenses,Total,${totalExpenses.toFixed(2)}`);
    for (const c of EXPENSE_CATEGORIES) {
      csvLines.push(`Expenses,${c},${byCat[c].toFixed(2)}`);
    }
    csvLines.push(`Profit,Net Profit,${netProfit.toFixed(2)}`);
    csvLines.push("");
    csvLines.push("Date,Category,Vendor,Description,Amount");
    for (const e of (expRows ?? []) as Array<{
      expense_date: string;
      category: string;
      vendor: string | null;
      description: string | null;
      amount: number;
    }>) {
      const fields = [
        e.expense_date,
        e.category,
        (e.vendor ?? "").replace(/[",\n]/g, " "),
        (e.description ?? "").replace(/[",\n]/g, " "),
        Number(e.amount).toFixed(2),
      ];
      csvLines.push(fields.join(","));
    }
    const csv = "\uFEFF" + csvLines.join("\r\n");

    return {
      year: data.year,
      month: data.month,
      grossRevenue: Math.round(grossRevenue * 100) / 100,
      platformFees: Math.round(platformFees * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      bookingsCount,
      netProfit: Math.round(netProfit * 100) / 100,
      currency,
      expensesByCategory: byCat,
      csv,
    };
  });
