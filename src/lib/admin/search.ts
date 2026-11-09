// Global admin search: one box → users (auth), profiles, doctors, appointments.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveAdmin } from "./_kit";

export interface SearchHit {
  kind: "user" | "profile" | "doctor" | "appointment";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const adminGlobalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ q: z.string().min(2).max(120) }).parse(raw))
  .handler(async ({ data, context }) => {
    await resolveAdmin(context.userId, "admin");
    const q = data.q.trim();
    const like = `%${q.replace(/[%,()]/g, " ")}%`;
    const hits: SearchHit[] = [];

    // Exact id → the row itself, whatever table it lives in.
    if (UUID_RE.test(q)) {
      const [{ data: appt }, { data: prof }, { data: doc }] = await Promise.all([
        supabaseAdmin.from("appointments").select("id, status, scheduled_at").eq("id", q).maybeSingle(),
        supabaseAdmin.from("profiles").select("id, full_name, city").eq("id", q).maybeSingle(),
        supabaseAdmin.from("doctor_details").select("id, specialty").eq("id", q).maybeSingle(),
      ]);
      if (appt) hits.push({ kind: "appointment", id: appt.id, title: `موعد ${appt.status ?? ""}`, subtitle: appt.scheduled_at ?? "", href: `/admin/data/appointments?id=${appt.id}` });
      if (prof) hits.push({ kind: "profile", id: prof.id, title: prof.full_name ?? "ملف", subtitle: prof.city ?? "", href: `/admin/data/profiles?id=${prof.id}` });
      if (doc) hits.push({ kind: "doctor", id: doc.id, title: `طبيب — ${doc.specialty ?? ""}`, subtitle: doc.id, href: `/admin/data/doctor_details?id=${doc.id}` });
    }

    const [profiles, users] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, user_id, full_name, phone, city")
        .or(`full_name.ilike.${like},phone.ilike.${like},city.ilike.${like}`)
        .limit(10),
      // Auth users by e-mail (GoTrue has no server-side search; page through the first 1000).
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    for (const p of profiles.data ?? []) {
      hits.push({
        kind: "profile",
        id: p.id,
        title: p.full_name ?? "بدون اسم",
        subtitle: [p.phone, p.city].filter(Boolean).join(" · "),
        href: `/admin/data/profiles?id=${p.id}`,
      });
    }
    const lower = q.toLowerCase();
    for (const u of users.data?.users ?? []) {
      if (u.email?.toLowerCase().includes(lower) || u.phone?.includes(q)) {
        hits.push({ kind: "user", id: u.id, title: u.email ?? u.phone ?? u.id, subtitle: `مستخدم · ${u.created_at?.slice(0, 10) ?? ""}`, href: `/admin/data/profiles?user_id=${u.id}` });
        if (hits.length > 30) break;
      }
    }
    // Doctors by specialty text.
    const { data: docs } = await supabaseAdmin
      .from("doctor_details")
      .select("id, specialty, profile_id, is_verified")
      .ilike("specialty", like)
      .limit(10);
    for (const d of docs ?? []) {
      hits.push({ kind: "doctor", id: d.id, title: `طبيب — ${d.specialty ?? ""}`, subtitle: d.is_verified ? "موثّق" : "غير موثّق", href: `/admin/data/doctor_details?id=${d.id}` });
    }
    return { hits: hits.slice(0, 40) };
  });
