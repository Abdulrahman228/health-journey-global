/**
 * Support tickets — server functions for users (file/list) and admins (respond/list-all).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertSelf } from "./_authz";

async function isAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"])
    // limit(1): admin + super_admin on one user made maybeSingle() error → false.
    .limit(1)
    .maybeSingle();
  return !!data;
}

export type TicketPriority = "normal" | "high" | "urgent";
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  body: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  adminResponse: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  userName?: string | null;
  userEmail?: string | null;
}

export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ userId: z.string().uuid() }).parse(x))
  .handler(async ({ data, context }): Promise<SupportTicket[]> => {
    assertSelf(context.userId, data.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("support_tickets")
      .select("*")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("تعذّر تحميل التذاكر: " + error.message);
    return (rows ?? []).map(mapRow);
  });

export const fileSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        subject: z.string().min(3).max(200),
        body: z.string().min(10).max(5000),
        category: z
          .enum(["general", "billing", "technical", "account", "complaint", "feature"])
          .default("general"),
      })
      .parse(x),
  )
  .handler(async ({ data, context }): Promise<SupportTicket> => {
    assertSelf(context.userId, data.userId);
    const { data: row, error } = await supabaseAdmin
      .from("support_tickets")
      .insert({
        user_id: data.userId,
        subject: data.subject,
        body: data.body,
        category: data.category,
      })
      .select("*")
      .single();
    // Throw a real Error (a raw PostgrestError has no Error prototype → the UI showed "error").
    if (error) throw new Error("تعذّر إرسال التذكرة: " + error.message);
    return mapRow(row);
  });

export const listAllTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
      })
      .parse(x),
  )
  .handler(async ({ data, context }): Promise<SupportTicket[]> => {
    assertSelf(context.userId, data.userId);
    if (!(await isAdmin(data.userId))) return [];
    let q = supabaseAdmin
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rowsRaw, error: listErr } = await q;
    if (listErr) throw new Error("تعذّر تحميل التذاكر: " + listErr.message);
    const rank: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
    const rows = (rowsRaw ?? [])
      .slice()
      .sort((a, b) => (rank[a.priority as string] ?? 9) - (rank[b.priority as string] ?? 9));
    if (!rows || rows.length === 0) return [];

    const userIds = Array.from(new Set(rows.map((r) => r.user_id as string)));
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", userIds);
    const nameMap = new Map(
      (profs ?? []).map((p) => [p.user_id as string, p.full_name as string | null]),
    );
    return rows.map((r) => ({
      ...mapRow(r),
      userName: nameMap.get(r.user_id as string) ?? null,
    }));
  });

export const respondToTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        ticketId: z.string().uuid(),
        response: z.string().min(1).max(5000),
        status: z.enum(["in_progress", "resolved", "closed"]).default("resolved"),
      })
      .parse(x),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    assertSelf(context.userId, data.userId);
    if (!(await isAdmin(data.userId))) throw new Error("غير مصرح: هذه العملية للمشرفين فقط");
    const { data: updated, error } = await supabaseAdmin
      .from("support_tickets")
      .update({
        admin_response: data.response,
        responded_by: data.userId,
        responded_at: new Date().toISOString(),
        status: data.status,
      })
      .eq("id", data.ticketId)
      .select("id");
    if (error) throw new Error("تعذّر حفظ الرد: " + error.message);
    if (!updated || updated.length === 0) throw new Error("التذكرة غير موجودة");
    return { ok: true };
  });

function mapRow(r: Record<string, unknown>): SupportTicket {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    subject: r.subject as string,
    body: r.body as string,
    category: (r.category as string) ?? "general",
    priority: (r.priority as TicketPriority) ?? "normal",
    status: (r.status as TicketStatus) ?? "open",
    adminResponse: (r.admin_response as string | null) ?? null,
    respondedAt: (r.responded_at as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}
