/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { Loader2 } from "lucide-react";

interface PlacePickerProps {
  value?: string;
  placeholder?: string;
  onPick: (place: {
    address: string;
    lat: number;
    lng: number;
    city?: string;
    country?: string;
    countryCode?: string;
    governorate?: string;
    district?: string;
    // Business-listing fields (present when the picked place is a real Google
    // Maps listing) — used to mark a clinic as "verified from Google Maps".
    placeId?: string;
    name?: string;
    phone?: string;
    mapsUri?: string;
  }) => void;
  className?: string;
}

interface Suggestion {
  placePrediction: {
    placeId: string;
    text: { text: string };
  };
}

/**
 * Address autocomplete using Places API (New) AutocompleteSuggestion.
 * Calls onPick with a normalized place once a suggestion is chosen.
 */
export function PlacePicker({ value, placeholder, onPick, className }: PlacePickerProps) {
  const { ready, error } = useGoogleMaps();
  const [input, setInput] = useState(value ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    setInput(value ?? "");
  }, [value]);

  useEffect(() => {
    if (!ready || !input || input.length < 3) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        setLoading(true);
        const { AutocompleteSuggestion, AutocompleteSessionToken } = (await google.maps.importLibrary(
          "places",
        )) as google.maps.PlacesLibrary;
        if (!sessionRef.current) sessionRef.current = new AutocompleteSessionToken();
        const { suggestions: result } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          sessionToken: sessionRef.current,
        });
        setSuggestions(
          result.flatMap((r) =>
            r.placePrediction
              ? [
                  {
                    placePrediction: {
                      placeId: r.placePrediction.placeId,
                      text: { text: r.placePrediction.text.text },
                    },
                  },
                ]
              : [],
          ),
        );
        setOpen(true);
        setLookupFailed(false);
      } catch (e) {
        console.error("autocomplete error", e);
        setSuggestions([]);
        setLookupFailed(true);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [ready, input]);

  async function selectSuggestion(s: Suggestion) {
    try {
      setLoading(true);
      const { Place } = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
      const place = new Place({ id: s.placePrediction.placeId });
      await place.fetchFields({
        fields: [
          "location",
          "formattedAddress",
          "addressComponents",
          "displayName",
          "internationalPhoneNumber",
          "googleMapsURI",
        ],
      });
      const loc = place.location;
      if (!loc) return;
      const components = place.addressComponents ?? [];
      const cityComp = components.find((c) =>
        c.types.includes("locality") || c.types.includes("administrative_area_level_2"),
      );
      const countryComp = components.find((c) => c.types.includes("country"));
      const govComp = components.find((c) => c.types.includes("administrative_area_level_1"));
      const districtComp = components.find((c) =>
        c.types.includes("sublocality_level_1") ||
        c.types.includes("sublocality") ||
        c.types.includes("neighborhood") ||
        c.types.includes("administrative_area_level_3"),
      );
      onPick({
        address: place.formattedAddress ?? s.placePrediction.text.text,
        lat: loc.lat(),
        lng: loc.lng(),
        city: cityComp?.longText ?? undefined,
        country: countryComp?.longText ?? undefined,
        countryCode: countryComp?.shortText ?? undefined,
        governorate: govComp?.longText ?? undefined,
        district: districtComp?.longText ?? undefined,
        placeId: s.placePrediction.placeId,
        name: place.displayName ?? undefined,
        phone: place.internationalPhoneNumber ?? undefined,
        mapsUri: place.googleMapsURI ?? undefined,
      });
      setInput(place.formattedAddress ?? s.placePrediction.text.text);
      setOpen(false);
      setSuggestions([]);
      sessionRef.current = null;
    } catch (e) {
      console.error("place details error", e);
      setLookupFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {loading && (
        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
      )}
      {error && (
        <p className="mt-1 text-xs text-muted-foreground">
          بحث Google غير مفعّل حاليًا — أدخِل عنوان العيادة يدويًا في الحقول بالأسفل.
        </p>
      )}
      {!error && lookupFailed && (
        <p className="mt-1 text-xs text-muted-foreground">
          تعذّر البحث في خرائط جوجل الآن — أدخِل عنوان العيادة يدويًا في الحقول بالأسفل.
        </p>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {suggestions.map((s) => (
            <li key={s.placePrediction.placeId}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSuggestion(s);
                }}
                className="w-full text-start px-3 py-2 text-sm hover:bg-accent"
              >
                {s.placePrediction.text.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
