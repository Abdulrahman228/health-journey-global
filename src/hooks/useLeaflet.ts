import { useEffect, useState } from "react";
import type * as Leaflet from "leaflet";

export type LeafletModule = typeof Leaflet;

// Leaflet touches `window` on import, so it is loaded on the client only, once.
let loading: Promise<LeafletModule> | null = null;

function loadLeaflet(): Promise<LeafletModule> {
  if (loading) return loading;
  loading = (async () => {
    const [mod, , icon, icon2x, shadow] = await Promise.all([
      import("leaflet"),
      import("leaflet/dist/leaflet.css"),
      import("leaflet/dist/images/marker-icon.png"),
      import("leaflet/dist/images/marker-icon-2x.png"),
      import("leaflet/dist/images/marker-shadow.png"),
    ]);
    const L = ((mod as { default?: LeafletModule }).default ?? mod) as LeafletModule;
    // Vite rewrites asset URLs, so Leaflet's default icon paths must be set explicitly.
    L.Icon.Default.mergeOptions({
      iconUrl: icon.default,
      iconRetinaUrl: icon2x.default,
      shadowUrl: shadow.default,
    });
    return L;
  })();
  loading.catch(() => {
    loading = null; // allow a retry after a failed network load
  });
  return loading;
}

/** OpenStreetMap tiles — free, attribution required (rendered by Leaflet). */
export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

export function useLeaflet() {
  const [L, setL] = useState<LeafletModule | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((mod) => {
        if (!cancelled) setL(mod);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || "Failed to load map");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { L, ready: L !== null, error };
}
