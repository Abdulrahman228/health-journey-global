// places-search — clinic address lookup for all three clients, on OpenStreetMap.
//
// 2026-11-08: Google Places was replaced by OpenStreetMap data so the platform
// needs no Google Cloud billing. Same request/response contract as before, so
// the Android and iOS apps keep working unchanged.
//
//   autocomplete  text → suggestions           Photon (komoot) — built for typing
//   details       placeId → confirmed place    Nominatim /lookup
//   geocode       address → lat/lng (+ parts)  Nominatim /search   (web clinic form)
//   reverse       lat/lng → address (+ parts)  Nominatim /reverse  (map click, "near me")
//
// Nominatim usage policy: max 1 request/second, identify the app in User-Agent,
// no autocomplete (that is why typing goes to Photon). Calls are serialized here.
//
// placeId format: "osm:<N|W|R>:<id>" (OpenStreetMap node / way / relation).
// mapsUri stays a Google Maps *link* (free deep link, no API) because patients
// use it to navigate to the clinic.

import { photonAutocomplete } from "./photon.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NOMINATIM = "https://nominatim.openstreetmap.org";
const USER_AGENT = "Tabibi-Tebana/1.0 (+https://mytabibi.com)";

type Body = {
  action?: "autocomplete" | "details" | "geocode" | "reverse";
  input?: string;
  placeId?: string;
  address?: string;
  lat?: number;
  lng?: number;
  // Kept for compatibility with the mobile clients; unused by OSM.
  sessionToken?: string;
};

type Place = {
  placeId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  mapsUri: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  governorate: string | null;
  district: string | null;
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Confirm the caller is a signed-in Supabase user. Returns the user id, or null.
async function authenticatedUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anon) return null;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: anon },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string };
    return typeof user.id === "string" ? user.id : null;
  } catch {
    return null;
  }
}

// Best-effort per-caller limit (per function instance).
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const calls = new Map<string, { start: number; count: number }>();
function allow(key: string, limit = RATE_LIMIT): boolean {
  const now = Date.now();
  const entry = calls.get(key);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    calls.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

// Nominatim allows one request per second: serialize and space the calls.
let nominatimChain: Promise<unknown> = Promise.resolve();
let lastNominatimAt = 0;
function nominatim(path: string, params: Record<string, string>): Promise<unknown> {
  const run = async () => {
    const wait = lastNominatimAt + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatimAt = Date.now();
    const qs = new URLSearchParams({ format: "jsonv2", addressdetails: "1", "accept-language": "ar", ...params });
    const res = await fetch(`${NOMINATIM}${path}?${qs}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`nominatim ${path} ${res.status}`);
    return res.json();
  };
  const next = nominatimChain.then(run, run);
  nominatimChain = next.catch(() => undefined);
  return next;
}

type NominatimRow = {
  osm_type?: string;
  osm_id?: number | string;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
  extratags?: Record<string, string>;
};

function osmPlaceId(type: string | undefined, id: number | string | undefined): string {
  const t = (type ?? "").toString().charAt(0).toUpperCase(); // node/way/relation → N/W/R
  return `osm:${t || "N"}:${id ?? ""}`;
}

function mapsLink(lat: number | null, lng: number | null): string | null {
  return lat != null && lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : null;
}

function toPlace(row: NominatimRow, fallbackId?: string): Place {
  const a = row.address ?? {};
  const lat = row.lat != null ? Number(row.lat) : null;
  const lng = row.lon != null ? Number(row.lon) : null;
  const name = row.name || a.amenity || a.healthcare || a.building || "";
  return {
    placeId: fallbackId ?? osmPlaceId(row.osm_type, row.osm_id),
    name,
    address: row.display_name ?? "",
    lat: Number.isFinite(lat as number) ? lat : null,
    lng: Number.isFinite(lng as number) ? lng : null,
    mapsUri: mapsLink(lat, lng),
    phone: row.extratags?.phone ?? row.extratags?.["contact:phone"] ?? null,
    city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null,
    country: a.country ?? null,
    countryCode: a.country_code ? a.country_code.toUpperCase() : null,
    governorate: a.state ?? null,
    district: a.suburb ?? a.city_district ?? a.neighbourhood ?? a.quarter ?? a.district ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  // Everything except `reverse` is for signed-in users (doctors editing their
  // clinic). `reverse` also serves visitors ("near me" → city), per IP.
  const userId = await authenticatedUserId(req.headers.get("Authorization"));
  if (!userId && body.action !== "reverse") return jsonResponse({ error: "unauthorized" }, 401);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limitKey = userId ?? `ip:${ip}`;
  if (!allow(limitKey, userId ? RATE_LIMIT : 20)) return jsonResponse({ error: "rate_limited" }, 429);

  try {
    // --- Autocomplete: typing → suggestions (Photon, Egypt; Arabic spelling
    //     variants ى/ي, ة/ه, أ/ا handled in photon.ts) ----------------------------
    if (body.action === "autocomplete") {
      const input = (body.input ?? "").trim();
      if (input.length < 2) return jsonResponse({ suggestions: [] });
      const bias: Record<string, string> =
        typeof body.lat === "number" && typeof body.lng === "number"
          ? { lat: String(body.lat), lon: String(body.lng) }
          : {};
      const suggestions = await photonAutocomplete(input, bias, USER_AGENT);
      if (suggestions === null) return jsonResponse({ error: "places_error", status: 502 }, 502);
      return jsonResponse({ suggestions });
    }

    // --- Details: placeId → confirmed place (Nominatim lookup) ------------------
    if (body.action === "details") {
      const m = /^osm:([NWR]):(\d+)$/.exec((body.placeId ?? "").trim());
      if (!m) return jsonResponse({ error: "place_id_required" }, 400);
      const rows = (await nominatim("/lookup", {
        osm_ids: `${m[1]}${m[2]}`,
        extratags: "1",
      })) as NominatimRow[];
      if (!rows?.[0]) return jsonResponse({ error: "place_not_found" }, 404);
      return jsonResponse({ place: toPlace(rows[0], `osm:${m[1]}:${m[2]}`) });
    }

    // --- Geocode: typed address → one place (Nominatim search, Egypt) -----------
    if (body.action === "geocode") {
      const q = (body.address ?? "").trim();
      if (q.length < 3) return jsonResponse({ error: "address_required" }, 400);
      const rows = (await nominatim("/search", { q, limit: "1", countrycodes: "eg" })) as NominatimRow[];
      return jsonResponse({ place: rows?.[0] ? toPlace(rows[0]) : null });
    }

    // --- Reverse: lat/lng → address (Nominatim reverse) --------------------------
    if (body.action === "reverse") {
      if (typeof body.lat !== "number" || typeof body.lng !== "number") {
        return jsonResponse({ error: "lat_lng_required" }, 400);
      }
      const row = (await nominatim("/reverse", {
        lat: String(body.lat),
        lon: String(body.lng),
        zoom: "18",
      })) as NominatimRow & { error?: string };
      if (!row || row.error) return jsonResponse({ place: null });
      return jsonResponse({ place: toPlace(row) });
    }

    return jsonResponse({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("places-search failed", e);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
