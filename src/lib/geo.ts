// Address lookup for the web, through the `places-search` edge function
// (OpenStreetMap data — no Google key or billing). One shape for every lookup
// so PlacePicker, the clinic form and the feed share it.
import { supabase } from "@/integrations/supabase/client";

export interface GeoPlace {
  address: string;
  lat: number;
  lng: number;
  city?: string;
  country?: string;
  countryCode?: string;
  governorate?: string;
  district?: string;
  placeId?: string;
  name?: string;
  phone?: string;
  mapsUri?: string;
}

export interface GeoSuggestion {
  placeId: string;
  description: string;
  main: string;
  secondary: string;
}

type ServerPlace = {
  placeId?: string | null;
  name?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  mapsUri?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  countryCode?: string | null;
  governorate?: string | null;
  district?: string | null;
};

async function call<T>(body: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await supabase.functions.invoke<T>("places-search", { body });
  if (error) {
    console.error("places-search", body.action, error);
    return null;
  }
  return data ?? null;
}

function toGeoPlace(p: ServerPlace | null | undefined): GeoPlace | null {
  if (!p || typeof p.lat !== "number" || typeof p.lng !== "number") return null;
  const opt = (v: string | null | undefined) => (v ? v : undefined);
  return {
    address: p.address || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
    lat: p.lat,
    lng: p.lng,
    city: opt(p.city),
    country: opt(p.country),
    countryCode: opt(p.countryCode),
    governorate: opt(p.governorate),
    district: opt(p.district),
    placeId: opt(p.placeId),
    name: opt(p.name),
    phone: opt(p.phone),
    mapsUri: opt(p.mapsUri),
  };
}

/** Typing → suggestions. Empty list on short input or failure. */
export async function placesAutocomplete(input: string): Promise<GeoSuggestion[] | null> {
  const q = input.trim();
  if (q.length < 2) return [];
  const res = await call<{ suggestions?: GeoSuggestion[] }>({ action: "autocomplete", input: q });
  return res ? (res.suggestions ?? []) : null;
}

/** A chosen suggestion → confirmed place with coordinates and address parts. */
export async function placeDetails(placeId: string): Promise<GeoPlace | null> {
  const res = await call<{ place?: ServerPlace }>({ action: "details", placeId });
  return toGeoPlace(res?.place);
}

/** Free-text address → best match inside Egypt. */
export async function geocodeAddress(address: string): Promise<GeoPlace | null> {
  const res = await call<{ place?: ServerPlace | null }>({ action: "geocode", address });
  return toGeoPlace(res?.place);
}

/** Coordinates → nearest address. Works for visitors too (used by "near me"). */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoPlace | null> {
  const res = await call<{ place?: ServerPlace | null }>({ action: "reverse", lat, lng });
  return toGeoPlace(res?.place);
}
