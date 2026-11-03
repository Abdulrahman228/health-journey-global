// places-search — compliant Google Places (New) proxy for clinic onboarding.
//
// Why this exists: doctors verify THEIR OWN clinic against Google Maps during
// onboarding. This is autocomplete + a single details lookup per clinic — NOT
// bulk harvesting. Google Maps Platform ToS forbid scraping / building a
// competing directory, so we only ever fetch the minimal fields a doctor needs
// to confirm their listing, and we store only what Google permits (place_id +
// the doctor-confirmed address/lat/lng of their own clinic).
//
// Security: the billed API key lives in the PLACES_API_KEY secret and never
// reaches the browser or the mobile app. Only authenticated Supabase users may
// call this function.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLACES_BASE = "https://places.googleapis.com/v1";

type Body = {
  action?: "autocomplete" | "details";
  input?: string;
  placeId?: string;
  // Client-generated UUID that groups an autocomplete session + its final
  // details call so Google bills the session once. Optional.
  sessionToken?: string;
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Confirm the caller is a real, signed-in Supabase user (protects our billed key).
async function isAuthenticated(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anon) return false;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: anon },
    });
    return res.ok;
  } catch {
    return false;
  }
}

type AddressComponent = { longText?: string; types?: string[] };

function extractCityCountry(components: AddressComponent[] = []): {
  city: string | null;
  country: string | null;
} {
  let city: string | null = null;
  let admin2: string | null = null;
  let admin1: string | null = null;
  let country: string | null = null;
  for (const c of components) {
    const t = c.types ?? [];
    if (t.includes("locality")) city = c.longText ?? city;
    else if (t.includes("administrative_area_level_2")) admin2 = c.longText ?? admin2;
    else if (t.includes("administrative_area_level_1")) admin1 = c.longText ?? admin1;
    if (t.includes("country")) country = c.longText ?? country;
  }
  return { city: city ?? admin2 ?? admin1, country };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("PLACES_API_KEY");
  if (!apiKey) return jsonResponse({ error: "places_key_not_configured" }, 500);

  if (!(await isAuthenticated(req.headers.get("Authorization")))) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken : undefined;

  try {
    // --- Autocomplete: query text -> place suggestions (Egypt-biased, Arabic) ---
    if (body.action === "autocomplete") {
      const input = (body.input ?? "").trim();
      if (input.length < 2) return jsonResponse({ suggestions: [] });

      const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
        body: JSON.stringify({
          input,
          languageCode: "ar",
          regionCode: "EG",
          includedRegionCodes: ["eg"],
          ...(sessionToken ? { sessionToken } : {}),
        }),
      });
      if (!res.ok) {
        return jsonResponse({ error: "places_error", detail: await res.text() }, 502);
      }
      const data = await res.json();
      const suggestions = (data.suggestions ?? [])
        .map((s: Record<string, any>) => s.placePrediction)
        .filter(Boolean)
        .map((p: Record<string, any>) => ({
          placeId: p.placeId as string,
          description: (p.text?.text as string) ?? "",
          main: (p.structuredFormat?.mainText?.text as string) ?? "",
          secondary: (p.structuredFormat?.secondaryText?.text as string) ?? "",
        }));
      return jsonResponse({ suggestions });
    }

    // --- Details: place_id -> minimal fields for the doctor to confirm ---
    if (body.action === "details") {
      const placeId = (body.placeId ?? "").trim();
      if (!placeId) return jsonResponse({ error: "place_id_required" }, 400);

      const params = new URLSearchParams({ languageCode: "ar", regionCode: "EG" });
      if (sessionToken) params.set("sessionToken", sessionToken);

      const res = await fetch(
        `${PLACES_BASE}/places/${encodeURIComponent(placeId)}?${params.toString()}`,
        {
          headers: {
            "X-Goog-Api-Key": apiKey,
            // Only the fields a doctor needs to confirm their own clinic.
            "X-Goog-FieldMask":
              "id,displayName,formattedAddress,location,googleMapsUri,internationalPhoneNumber,addressComponents",
          },
        },
      );
      if (!res.ok) {
        return jsonResponse({ error: "places_error", detail: await res.text() }, 502);
      }
      const d = await res.json();
      const { city, country } = extractCityCountry(d.addressComponents);
      return jsonResponse({
        place: {
          placeId: d.id as string,
          name: (d.displayName?.text as string) ?? "",
          address: (d.formattedAddress as string) ?? "",
          lat: (d.location?.latitude as number) ?? null,
          lng: (d.location?.longitude as number) ?? null,
          mapsUri: (d.googleMapsUri as string) ?? null,
          phone: (d.internationalPhoneNumber as string) ?? null,
          city,
          country,
        },
      });
    }

    return jsonResponse({ error: "unknown_action" }, 400);
  } catch (e) {
    return jsonResponse({ error: "internal_error", detail: String(e) }, 500);
  }
});
