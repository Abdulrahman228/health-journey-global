import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import { useLeaflet, OSM_TILE_URL, OSM_ATTRIBUTION } from "@/hooks/useLeaflet";
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

const CAIRO = { lat: 30.0444, lng: 31.2357 };

/** OpenStreetMap map (Leaflet). Same props as the former Google Maps version. */
export function ClinicMap({
  markers,
  center,
  zoom = 13,
  className,
  onClick,
  draggable,
  onMarkerDragEnd,
}: ClinicMapProps) {
  const { L, ready, error } = useLeaflet();
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRefs = useRef<LeafletMarker[]>([]);
  const onClickRef = useRef(onClick);
  const onDragRef = useRef(onMarkerDragEnd);
  const [initFailed, setInitFailed] = useState(false);
  onClickRef.current = onClick;
  onDragRef.current = onMarkerDragEnd;

  // Init map once Leaflet is loaded
  useEffect(() => {
    if (!L || !elRef.current || mapRef.current) return;
    const start = center ?? markers[0] ?? CAIRO;
    try {
      const map = L.map(elRef.current, { attributionControl: true, zoomControl: true }).setView(
        [start.lat, start.lng],
        zoom,
      );
      L.tileLayer(OSM_TILE_URL, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map);
      map.on("click", (e) => onClickRef.current?.(e.latlng.lat, e.latlng.lng));
      mapRef.current = map;
      // The container is often laid out after mount (tabs, dialogs): re-measure.
      window.setTimeout(() => map.invalidateSize(), 0);
    } catch (e) {
      console.error("map init failed", e);
      setInitFailed(true);
    }
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRefs.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L]);

  // Sync markers + view
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map) return;
    markerRefs.current.forEach((m) => m.remove());
    markerRefs.current = markers.map((m, i) => {
      const isDraggable = !!draggable && markers.length === 1 && i === 0;
      const marker = L.marker([m.lat, m.lng], { title: m.title, draggable: isDraggable }).addTo(map);
      if (m.title) marker.bindPopup(m.title);
      if (isDraggable) {
        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          onDragRef.current?.(pos.lat, pos.lng);
        });
      }
      return marker;
    });
    if (markers.length > 0) {
      const c = center ?? markers[0];
      // Zoom in to the pin when the map is still zoomed out (e.g. right after
      // "My location" or filling the address). Keeps a closer user-set zoom.
      map.setView([c.lat, c.lng], map.getZoom() < 13 ? 16 : map.getZoom());
    } else if (center) {
      map.setView([center.lat, center.lng]);
    }
  }, [L, ready, markers, center, draggable]);

  if (error || initFailed) {
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

  return (
    <div
      ref={elRef}
      dir="ltr"
      className={`rounded-lg overflow-hidden ${className ?? "h-48"} bg-muted z-0`}
    />
  );
}
