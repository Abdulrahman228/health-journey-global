/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { MapPin, AlertTriangle } from "lucide-react";

interface MapMarker {
  lat: number;
  lng: number;
  title?: string;
}

interface ClinicMapProps {
  markers: MapMarker[];
  center?: { lat: number; lng: number };
  zoom?: number;
  className?: string;
  onClick?: (lat: number, lng: number) => void;
  /**
   * When true and there is exactly one marker, the marker becomes draggable.
   * `onMarkerDragEnd` fires with the new lat/lng once the user releases.
   */
  draggable?: boolean;
  onMarkerDragEnd?: (lat: number, lng: number) => void;
}

// Listen for Google Maps "auth failure" so we can render a graceful fallback
// (no `Oops! Something went wrong` overlay). This fires once per page load
// when the API key is invalid / referrer not allowed / billing disabled.
declare global {
  interface Window {
    gm_authFailure?: () => void;
    __tabibiGmAuthFailed?: boolean;
  }
}
if (typeof window !== "undefined" && !window.gm_authFailure) {
  window.gm_authFailure = () => {
    window.__tabibiGmAuthFailed = true;
    window.dispatchEvent(new CustomEvent("tabibi:gm-auth-failed"));
  };
}

export function ClinicMap({
  markers,
  center,
  zoom = 13,
  className,
  onClick,
  draggable,
  onMarkerDragEnd,
}: ClinicMapProps) {
  const { ready, error } = useGoogleMaps();
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRefs = useRef<google.maps.Marker[]>([]);
  const [authFailed, setAuthFailed] = useState<boolean>(
    typeof window !== "undefined" && !!window.__tabibiGmAuthFailed,
  );

  useEffect(() => {
    function onAuthFail() {
      setAuthFailed(true);
    }
    window.addEventListener("tabibi:gm-auth-failed", onAuthFail);
    return () => window.removeEventListener("tabibi:gm-auth-failed", onAuthFail);
  }, []);

  // Init map
  useEffect(() => {
    if (!ready || authFailed || !elRef.current || mapRef.current) return;
    const fallback = center ?? markers[0] ?? { lat: 30.0444, lng: 31.2357 }; // Cairo
    try {
      mapRef.current = new google.maps.Map(elRef.current, {
        center: fallback,
        zoom,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      if (onClick) {
        mapRef.current.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (e.latLng) onClick(e.latLng.lat(), e.latLng.lng());
        });
      }
    } catch {
      setAuthFailed(true);
    }
  }, [ready, authFailed, center, zoom, markers, onClick]);

  // Sync markers
  useEffect(() => {
    if (!ready || authFailed || !mapRef.current) return;
    markerRefs.current.forEach((m) => m.setMap(null));
    markerRefs.current = markers.map((m, i) => {
      const isDraggable = !!draggable && markers.length === 1 && i === 0;
      const marker = new google.maps.Marker({
        position: { lat: m.lat, lng: m.lng },
        map: mapRef.current!,
        title: m.title,
        draggable: isDraggable,
      });
      if (isDraggable && onMarkerDragEnd) {
        marker.addListener("dragend", () => {
          const pos = marker.getPosition();
          if (pos) onMarkerDragEnd(pos.lat(), pos.lng());
        });
      }
      return marker;
    });
    if (markers.length > 0) {
      const c = center ?? markers[0];
      mapRef.current.setCenter(c);
    }
  }, [ready, authFailed, markers, center, draggable, onMarkerDragEnd]);

  if (error || authFailed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 bg-muted/40 text-xs text-muted-foreground rounded-lg p-4 ${className ?? "h-48"}`}
      >
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        <p className="text-center max-w-xs leading-relaxed">
          الخريطة غير متاحة حاليًا. النتائج معروضة بالأسفل.
        </p>
        {markers.length > 0 && (
          <div className="grid grid-cols-2 gap-1 max-h-24 overflow-auto w-full max-w-md">
            {markers.slice(0, 6).map((m, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded bg-background/80 px-2 py-1 text-[10px]"
              >
                <MapPin className="h-3 w-3 text-primary" />
                {m.title ?? `${m.lat.toFixed(3)}, ${m.lng.toFixed(3)}`}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <div ref={elRef} className={`rounded-lg overflow-hidden ${className ?? "h-48"} bg-muted`} />;
}
