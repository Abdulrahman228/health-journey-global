/// <reference types="google.maps" />
import { useEffect, useState } from "react";

declare global {
  interface Window {
    google?: typeof google;
    __tabibiInitMap?: () => void;
    __tabibiMapsLoading?: Promise<void>;
  }
}

// VITE_GOOGLE_MAPS_BROWSER_KEY is the project's own key (Google Cloud project with
// billing, HTTP-referrer restricted to mytabibi.com). The Lovable connector key is
// only a fallback: its Google project has billing disabled (BillingNotEnabledMapError).
const BROWSER_KEY = ((import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined) ||
  (import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined)) as
  | string
  | undefined;
const CHANNEL = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as
  | string
  | undefined;

function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps?.Map) return Promise.resolve();
  if (window.__tabibiMapsLoading) return window.__tabibiMapsLoading;
  if (!BROWSER_KEY) return Promise.reject(new Error("Missing Google Maps browser key"));

  window.__tabibiMapsLoading = new Promise<void>((resolve, reject) => {
    window.__tabibiInitMap = () => resolve();
    const script = document.createElement("script");
    const channel = CHANNEL ? `&channel=${encodeURIComponent(CHANNEL)}` : "";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${BROWSER_KEY}&loading=async&libraries=places&callback=__tabibiInitMap${channel}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return window.__tabibiMapsLoading;
}

export function useGoogleMaps() {
  const [ready, setReady] = useState<boolean>(
    typeof window !== "undefined" && !!window.google?.maps?.Map,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready) return;
    loadMaps()
      .then(() => setReady(true))
      .catch((e: Error) => setError(e.message));
  }, [ready]);

  return { ready, error };
}
