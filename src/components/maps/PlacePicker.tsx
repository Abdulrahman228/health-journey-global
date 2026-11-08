import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { placesAutocomplete, placeDetails, type GeoPlace, type GeoSuggestion } from "@/lib/geo";

interface PlacePickerProps {
  value?: string;
  placeholder?: string;
  onPick: (place: GeoPlace) => void;
  className?: string;
}

/**
 * Address autocomplete on OpenStreetMap data (via the places-search function).
 * Calls onPick with a normalized place once a suggestion is chosen.
 */
export function PlacePicker({ value, placeholder, onPick, className }: PlacePickerProps) {
  const [input, setInput] = useState(value ?? "");
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    setInput(value ?? "");
  }, [value]);

  useEffect(() => {
    if (!input || input.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    // Suggest from the first two letters; spelling variants (ى/ي, ة/ه, أ/ا)
    // are handled by the server.
    debounceRef.current = window.setTimeout(async () => {
      const id = ++requestRef.current;
      setLoading(true);
      const result = await placesAutocomplete(input);
      if (id !== requestRef.current) return; // a newer keystroke won
      setLoading(false);
      if (result === null) {
        setSuggestions([]);
        setLookupFailed(true);
        return;
      }
      setSuggestions(result);
      setOpen(true);
      setLookupFailed(false);
    }, 250);
  }, [input]);

  async function selectSuggestion(s: GeoSuggestion) {
    setLoading(true);
    const place = await placeDetails(s.placeId);
    setLoading(false);
    if (!place) {
      setLookupFailed(true);
      return;
    }
    onPick({ ...place, address: place.address || s.description, name: place.name || s.main });
    setInput(place.address || s.description);
    setOpen(false);
    setSuggestions([]);
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
      {lookupFailed && (
        <p className="mt-1 text-xs text-muted-foreground">
          تعذّر البحث عن العنوان الآن — أدخِل عنوان العيادة يدويًا في الحقول بالأسفل.
        </p>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSuggestion(s);
                }}
                className="w-full text-start px-3 py-2 text-sm hover:bg-accent"
              >
                <span className="block">{s.main || s.description}</span>
                {s.secondary && (
                  <span className="block text-xs text-muted-foreground">{s.secondary}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
