/**
 * Support tickets — server functions for users (file/list) and admins (respond/list-all).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function isAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
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
  .inputValidator((x: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(x),
  )
  .handler(async ({ data }): Promise<SupportTicket[]> => {
    const { data: rows } = await supabaseAdmin
      .from("support_tickets")
      .select("*")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return (rows ?? []).map(mapRow);
  });

export const fileSupportTicket = createServerFn({ method: "POST" })
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
  .handler(async ({ data }): Promise<SupportTicket> => {
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
    if (error || !row) throw error ?? new Error("insert failed");
    return mapRow(row);
  });

export const listAllTickets = createServerFn({ method: "GET" })
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
      })
      .parse(x),
  )
  .handler(async ({ data }): Promise<SupportTicket[]> => {
    if (!(await isAdmin(data.userId))) return [];
    let q = supabaseAdmin
      .from("support_tickets")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows } = await q;
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
  .handler(async ({ data }): Promise<{ ok: true }> => {
    if (!(await isAdmin(data.userId))) throw new Error("forbidden");
    const { error } = await supabaseAdmin
      .from("support_tickets")
      .update({
        admin_response: data.response,
        responded_by: data.userId,
        responded_at: new Date().toISOString(),
        status: data.status,
      })
      .eq("id", data.ticketId);
    if (error) throw error;
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
