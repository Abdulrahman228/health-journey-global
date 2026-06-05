/**
 * /d/{slug}/contact.vcf — vCard (RFC 6350) download for a public doctor page.
 *
 * Lets patients save the doctor as a phone contact in one tap after
 * scanning the QR code on a printed card or social bio.
 */
import { createFileRoute, notFound } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { siteConfig } from "@/lib/seo";

/** Escape special chars per RFC 6350 §3.4 */
function vEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

async function buildVCard(slug: string): Promise<string | null> {
  const { data: p } = await supabaseAdmin
    .from("profiles")
    .select(
      "id, slug, full_name, avatar_url, city, country, public_bio, profile_visibility, user_id",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!p || p.profile_visibility === "private") return null;

  // Confirm role = doctor
  const { data: r } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", p.user_id)
    .maybeSingle();
  if (r?.role !== "doctor") return null;

  const { data: d } = await supabaseAdmin
    .from("doctor_details")
    .select("id, specialty")
    .eq("profile_id", p.id)
    .maybeSingle();
  if (!d) return null;

  // Primary clinic for address + phone
  const { data: clinic } = await supabaseAdmin
    .from("clinics")
    .select("name, address, city, phone")
    .eq("doctor_id", d.id)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  const name = p.full_name ?? "Doctor";
  const drName = name.startsWith("د.") || name.startsWith("Dr") ? name : `د. ${name}`;
  const url = `${siteConfig.url}/d/${p.slug}`;
  const lines: string[] = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `PRODID:-//Tabibi//Doctor vCard//EN`,
    `FN:${vEscape(drName)}`,
    `N:${vEscape(drName)};;;;`,
    `TITLE:${vEscape(d.specialty ?? "Physician")}`,
    `ORG:${vEscape(clinic?.name ?? "Tabibi — طبيبي")}`,
    `URL:${vEscape(url)}`,
    `CATEGORIES:Doctor,Healthcare,Tabibi`,
  ];
  if (clinic?.phone) lines.push(`TEL;TYPE=WORK,VOICE:${vEscape(clinic.phone)}`);
  if (clinic?.address || clinic?.city || p.city) {
    const street = clinic?.address ?? "";
    const city = clinic?.city ?? p.city ?? "";
    const country = p.country ?? "";
    lines.push(`ADR;TYPE=WORK:;;${vEscape(street)};${vEscape(city)};;;${vEscape(country)}`);
  }
  if (p.public_bio) lines.push(`NOTE:${vEscape(p.public_bio).slice(0, 500)}`);
  if (p.avatar_url) lines.push(`PHOTO;VALUE=URI:${vEscape(p.avatar_url)}`);
  lines.push(`REV:${new Date().toISOString()}`);
  lines.push("END:VCARD");

  // vCard line endings are CRLF
  return lines.join("\r\n") + "\r\n";
}

export const Route = createFileRoute("/d/$slug/contact.vcf")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const body = await buildVCard(params.slug);
        if (!body) throw notFound();
        const filename = `tabibi-${params.slug}.vcf`;
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "text/vcard; charset=utf-8",
            "content-disposition": `attachment; filename="${filename}"`,
            "cache-control": "public, max-age=300, s-maxage=3600",
          },
        });
      },
    },
  },
});
