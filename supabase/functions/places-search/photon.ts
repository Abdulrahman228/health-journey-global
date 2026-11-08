// Photon (komoot) autocomplete over OpenStreetMap data, tuned for Egypt.
//
// Photon matches letters as typed, so misspelled Arabic (مستشفي، اسيوط) misses
// the formal OSM spelling. Strategy, cheapest first:
//   1. query the text as typed; if enough names start with it, done;
//   2. otherwise query the other likely spellings in parallel and merge.
// A short in-memory cache absorbs repeated keystrokes (Photon's public server
// throttles bursts).
import { mergeRanked, normalizeAr, spellingVariants } from "./arabic.ts";

const PHOTON = "https://photon.komoot.io/api/";
// Egypt bounding box (minLon,minLat,maxLon,maxLat) — keeps suggestions local.
const EGYPT_BBOX = "24.6,21.9,37.1,31.8";
const LIMIT = 7;
const ENOUGH_PREFIX_MATCHES = 4;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 500;

export interface Suggestion {
  placeId: string;
  description: string;
  main: string;
  secondary: string;
}

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | number | undefined>;
};

const cache = new Map<string, { at: number; items: Suggestion[] }>();

function osmPlaceId(type: string | undefined, id: number | string | undefined): string {
  const t = (type ?? "").toString().charAt(0).toUpperCase(); // node/way/relation → N/W/R
  return `osm:${t || "N"}:${id ?? ""}`;
}

function toSuggestions(features: PhotonFeature[]): Suggestion[] {
  return features.flatMap((f) => {
    const p = f.properties ?? {};
    if (!p.osm_id) return [];
    // The bounding box also covers Gaza / the Negev: keep Egypt only.
    if (p.countrycode && String(p.countrycode).toUpperCase() !== "EG") return [];
    const placeId = osmPlaceId(String(p.osm_type ?? "N"), p.osm_id as number | undefined);
    const street = [p.street, p.housenumber].filter(Boolean).join(" ");
    const main = String(p.name ?? street ?? "");
    const secondary = [p.name ? street : null, p.district, p.city ?? p.county, p.state]
      .filter((v) => v && v !== main)
      .join("، ");
    return [{ placeId, description: [main, secondary].filter(Boolean).join("، "), main, secondary }];
  });
}

/** One Photon call. `null` when Photon is unavailable (throttled, down). */
async function photonQuery(q: string, bias: Record<string, string>, userAgent: string): Promise<Suggestion[] | null> {
  const qs = new URLSearchParams({ q, limit: String(LIMIT), bbox: EGYPT_BBOX, ...bias });
  try {
    const res = await fetch(`${PHOTON}?${qs}`, { headers: { "User-Agent": userAgent } });
    if (!res.ok) {
      console.error("photon error", res.status, q);
      return null;
    }
    const data = (await res.json()) as { features?: PhotonFeature[] };
    return toSuggestions(data.features ?? []);
  } catch (e) {
    console.error("photon failed", q, e);
    return null;
  }
}

function prefixMatches(input: string, items: Suggestion[]): number {
  const q = normalizeAr(input);
  return items.filter((s) => normalizeAr(s.main || s.description).startsWith(q)).length;
}

/**
 * Suggestions for what the user typed. `null` only when Photon answered
 * nothing at all (so the caller can report a lookup failure).
 */
export async function photonAutocomplete(
  input: string,
  bias: Record<string, string>,
  userAgent: string,
): Promise<Suggestion[] | null> {
  const key = `${normalizeAr(input)}|${bias.lat ?? ""},${bias.lon ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;

  const variants = spellingVariants(input);
  const first = await photonQuery(variants[0], bias, userAgent);
  let lists: Suggestion[][];
  if (first && (variants.length === 1 || prefixMatches(input, first) >= ENOUGH_PREFIX_MATCHES)) {
    lists = [first];
  } else {
    const rest = await Promise.all(variants.slice(1).map((v) => photonQuery(v, bias, userAgent)));
    lists = [first, ...rest].filter((l): l is Suggestion[] => l !== null);
    if (lists.length === 0) return null;
  }
  const items = mergeRanked(input, lists).slice(0, 8);

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), items });
  return items;
}
