/**
 * HeroHierarchicalSearch — replaces the flat city dropdown in the homepage
 * Hero with a 4-level cascading region picker (Country → Governorate →
 * City → District), plus a one-click "Near me" geolocation shortcut.
 *
 * Each level is a Combobox: the user can either click the chevron and pick
 * from the list, OR start typing the region/specialty name (Arabic or
 * English) and the suggestions filter as they type.
 *
 * Submission strategy (keeps existing SEO landing pages intact):
 *   • specialty + city slug    →  /specialty/{spec}/{city-slug}
 *   • specialty only           →  /specialty/{spec}
 *   • district selected        →  /doctors?spec=&district={slug}
 *   • governorate selected     →  /doctors?spec=&gov={slug}
 *   • country only / nothing   →  /doctors?spec=&country={code}
 *   • Near-me                  →  /nearby?lat=&lng=&max_km=15
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Search,
  MapPin,
  Stethoscope,
  Loader2,
  Navigation,
  ChevronDown,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CITIES } from "@/lib/cities";

// Slugs that have a dedicated /specialty/$slug/$city SEO landing page.
// Anything else (sub-cities like "heliopolis", districts, etc.) must fall
// back to /doctors?... with a city filter — otherwise we land on a 404.
const SEO_CITY_SLUGS = new Set(CITIES.map((c) => c.slug));

interface RegionRow {
  id: string;
  parent_id: string | null;
  type: "country" | "governorate" | "city" | "district";
  name_ar: string;
  name_en: string;
  slug: string;
}

interface SpecialtyRow {
  slug: string;
  name_ar: string;
  name_en: string;
}

// ---------------------------------------------------------------------------
// Combobox primitive (input + filterable list). Self-contained so the Hero
// stays a single component without pulling extra deps.
// ---------------------------------------------------------------------------
interface ComboboxOption {
  id: string;
  label: string;
  altLabel?: string;
}
interface ComboboxProps {
  value: string;
  onChange: (id: string) => void;
  options: ComboboxOption[];
  placeholder: string;
  emptyText: string;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  isRTL: boolean;
  ariaLabel: string;
  clearAriaLabel: string;
}

function Combobox({
  value,
  onChange,
  options,
  placeholder,
  emptyText,
  disabled,
  loading,
  icon,
  isRTL,
  ariaLabel,
  clearAriaLabel,
}: ComboboxProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  // Reflect external value changes (e.g. cascade reset) in the input
  useEffect(() => {
    if (!value) {
      setQuery("");
      return;
    }
    const sel = options.find((o) => o.id === value);
    if (sel) setQuery(sel.label);
  }, [value, options]);

  // Click outside → close
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.altLabel ?? "").toLowerCase().includes(q),
    );
  }, [query, options]);

  // Keep activeIdx in range after filter
  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(0);
  }, [filtered, activeIdx]);

  function commitId(id: string) {
    onChange(id);
    const sel = options.find((o) => o.id === id);
    setQuery(sel?.label ?? "");
    setOpen(false);
    inputRef.current?.blur();
  }

  function clear() {
    onChange("");
    setQuery("");
    inputRef.current?.focus();
    setOpen(true);
  }

  return (
    <div ref={wrapperRef} className="relative">
      {icon && (
        <span
          className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
          style={isRTL ? { right: "0.75rem" } : { left: "0.75rem" }}
        >
          {icon}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
          if (value) onChange(""); // typing invalidates previous selection
        }}
        onFocus={() => !disabled && setOpen(true)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) setOpen(true);
            setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            if (open && filtered[activeIdx]) {
              e.preventDefault();
              commitId(filtered[activeIdx].id);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full appearance-none rounded-xl border border-border bg-background py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60 disabled:cursor-not-allowed ${
          icon ? (isRTL ? "pl-9 pr-10" : "pl-10 pr-9") : "px-3 pr-9"
        }`}
        autoComplete="off"
      />

      {/* Clear / chevron */}
      <span
        className="absolute top-1/2 -translate-y-1/2 flex items-center"
        style={isRTL ? { left: "0.5rem" } : { right: "0.5rem" }}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : value ? (
          <button
            type="button"
            onClick={clear}
            aria-label={clearAriaLabel}
            className="p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              if (disabled) return;
              setOpen((v) => !v);
              inputRef.current?.focus();
            }}
            className="p-1 text-muted-foreground hover:text-foreground"
            aria-label={ariaLabel}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </span>

      {open && !disabled && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-popover shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={o.id}
                role="option"
                aria-selected={value === o.id}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commitId(o.id);
                }}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  i === activeIdx
                    ? "bg-primary/10 text-foreground"
                    : "text-foreground hover:bg-muted"
                } ${value === o.id ? "font-semibold" : ""}`}
              >
                {o.label}
                {o.altLabel ? (
                  <span className="ms-2 text-xs text-muted-foreground">
                    {o.altLabel}
                  </span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function HeroHierarchicalSearch({
  language,
  isRTL,
  t,
}: {
  language: string;
  isRTL: boolean;
  t: (en: string, ar: string) => string;
}) {
  const navigate = useNavigate();
  const [specialty, setSpecialty] = useState("");
  const [countryId, setCountryId] = useState("");
  const [governorateId, setGovernorateId] = useState("");
  const [cityId, setCityId] = useState("");
  const [districtId, setDistrictId] = useState("");

  const [specialties, setSpecialties] = useState<SpecialtyRow[]>([]);
  const [countries, setCountries] = useState<RegionRow[]>([]);
  const [governorates, setGovernorates] = useState<RegionRow[]>([]);
  const [cities, setCities] = useState<RegionRow[]>([]);
  const [districts, setDistricts] = useState<RegionRow[]>([]);

  const [loadingLevel, setLoadingLevel] = useState<number | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const fetchChildren = async (
    parentId: string | null,
    type: RegionRow["type"],
  ): Promise<RegionRow[]> => {
    let q = supabase
      .from("regions")
      .select("id,parent_id,type,name_ar,name_en,slug")
      .eq("type", type)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name_ar", { ascending: true });
    q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
    const { data, error } = await q;
    if (error) return [];
    return (data ?? []) as RegionRow[];
  };

  // Initial: specialties + countries
  useEffect(() => {
    (async () => {
      const [{ data: spec }, ctry] = await Promise.all([
        supabase.from("specialties").select("slug,name_ar,name_en").order("name_ar"),
        fetchChildren(null, "country"),
      ]);
      setSpecialties((spec as SpecialtyRow[]) ?? []);
      setCountries(ctry);
    })();
  }, []);

  // Cascade: country → governorates
  useEffect(() => {
    setGovernorates([]);
    setCities([]);
    setDistricts([]);
    setGovernorateId("");
    setCityId("");
    setDistrictId("");
    if (!countryId) return;
    setLoadingLevel(1);
    fetchChildren(countryId, "governorate")
      .then(setGovernorates)
      .finally(() => setLoadingLevel(null));
  }, [countryId]);

  // Cascade: governorate → cities
  useEffect(() => {
    setCities([]);
    setDistricts([]);
    setCityId("");
    setDistrictId("");
    if (!governorateId) return;
    setLoadingLevel(2);
    fetchChildren(governorateId, "city")
      .then(setCities)
      .finally(() => setLoadingLevel(null));
  }, [governorateId]);

  // Cascade: city → districts
  useEffect(() => {
    setDistricts([]);
    setDistrictId("");
    if (!cityId) return;
    setLoadingLevel(3);
    fetchChildren(cityId, "district")
      .then(setDistricts)
      .finally(() => setLoadingLevel(null));
  }, [cityId]);

  const primary = (r: { name_ar: string; name_en: string }) =>
    language === "ar" ? r.name_ar : r.name_en;
  const alt = (r: { name_ar: string; name_en: string }) =>
    language === "ar" ? r.name_en : r.name_ar;

  // Sorted specialties: keep "general" near top
  const specialtyOptions: ComboboxOption[] = useMemo(() => {
    const list = [...specialties];
    list.sort((a, b) => {
      if (a.slug === "general") return -1;
      if (b.slug === "general") return 1;
      return primary(a).localeCompare(primary(b), language === "ar" ? "ar" : "en");
    });
    return list.map((s) => ({
      id: s.slug,
      label: primary(s),
      altLabel: alt(s),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialties, language]);

  const toComboOptions = (rows: RegionRow[]): ComboboxOption[] =>
    rows.map((r) => ({ id: r.id, label: primary(r), altLabel: alt(r) }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cityObj = cities.find((c) => c.id === cityId);
    const districtObj = districts.find((d) => d.id === districtId);
    const govObj = governorates.find((g) => g.id === governorateId);
    const countryObj = countries.find((c) => c.id === countryId);

    // Only redirect to the SEO landing page when:
    //  - a specialty IS picked,
    //  - a city IS picked,
    //  - NO district is picked (district = more specific than city, deserves filter page),
    //  - the city slug is in our hardcoded CITIES list (the only ones with SEO pages).
    // Otherwise fall through to /doctors?... so the user actually sees results
    // instead of a 404.
    if (
      specialty &&
      cityObj &&
      !districtObj &&
      SEO_CITY_SLUGS.has(cityObj.slug)
    ) {
      navigate({
        to: "/specialty/$slug/$city",
        params: { slug: specialty, city: cityObj.slug },
      });
      return;
    }
    if (specialty && !countryId && !governorateId && !cityId && !districtId) {
      navigate({ to: "/specialty/$slug", params: { slug: specialty } });
      return;
    }

    const params = new URLSearchParams();
    if (specialty) params.set("specialty", specialty);
    if (districtObj) params.set("district", districtObj.slug);
    else if (cityObj) params.set("city", cityObj.slug);
    else if (govObj) params.set("gov", govObj.slug);
    else if (countryObj) params.set("country", countryObj.slug);

    const qs = params.toString();
    window.location.href = qs ? `/doctors?${qs}` : "/doctors";
  };

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      setGeoError(t("Geolocation not supported", "خاصية الموقع غير مدعومة"));
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false);
        const params = new URLSearchParams();
        if (specialty) params.set("specialty", specialty);
        params.set("lat", pos.coords.latitude.toFixed(6));
        params.set("lng", pos.coords.longitude.toFixed(6));
        params.set("max_km", "15");
        window.location.href = `/nearby?${params.toString()}`;
      },
      () => {
        setGeoLoading(false);
        setGeoError(t("Permission denied", "تم رفض إذن الموقع"));
      },
      { timeout: 8000, enableHighAccuracy: false },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 rounded-2xl border border-border bg-card p-4 shadow-lg shadow-primary/5"
      dir={isRTL ? "rtl" : "ltr"}
      aria-label={t("Doctor search", "البحث عن طبيب")}
    >
      {/* Row 1: specialty + country */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Combobox
          value={specialty}
          onChange={setSpecialty}
          options={specialtyOptions}
          placeholder={t("Specialty (e.g. Cardiology)", "التخصص (مثال: قلب)")}
          emptyText={t("No matching specialty", "لا يوجد تخصص مطابق")}
          icon={<Stethoscope className="h-5 w-5" />}
          isRTL={isRTL}
          ariaLabel={t("Specialty", "التخصص")}
          clearAriaLabel={t("Clear specialty", "مسح التخصص")}
        />
        <Combobox
          value={countryId}
          onChange={setCountryId}
          options={toComboOptions(countries)}
          placeholder={t("Country (type to search)", "الدولة (اكتب للبحث)")}
          emptyText={t("No matching country", "لا توجد دولة مطابقة")}
          icon={<MapPin className="h-5 w-5" />}
          isRTL={isRTL}
          ariaLabel={t("Country", "الدولة")}
          clearAriaLabel={t("Clear country", "مسح الدولة")}
        />
      </div>

      {/* Row 2: governorate + city + district (cascading) */}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Combobox
          value={governorateId}
          onChange={setGovernorateId}
          options={toComboOptions(governorates)}
          disabled={!countryId}
          loading={loadingLevel === 1}
          placeholder={
            !countryId
              ? t("Select country first", "اختر الدولة أولاً")
              : t("Governorate (type to search)", "المحافظة (اكتب للبحث)")
          }
          emptyText={t("No matching governorate", "لا توجد محافظة مطابقة")}
          isRTL={isRTL}
          ariaLabel={t("Governorate", "المحافظة")}
          clearAriaLabel={t("Clear governorate", "مسح المحافظة")}
        />

        <Combobox
          value={cityId}
          onChange={setCityId}
          options={toComboOptions(cities)}
          disabled={!governorateId}
          loading={loadingLevel === 2}
          placeholder={
            !governorateId
              ? t("Select governorate first", "اختر المحافظة أولاً")
              : t("City (type to search)", "المدينة (اكتب للبحث)")
          }
          emptyText={t("No matching city", "لا توجد مدينة مطابقة")}
          isRTL={isRTL}
          ariaLabel={t("City", "المدينة")}
          clearAriaLabel={t("Clear city", "مسح المدينة")}
        />

        <Combobox
          value={districtId}
          onChange={setDistrictId}
          options={toComboOptions(districts)}
          disabled={!cityId}
          loading={loadingLevel === 3}
          placeholder={
            !cityId
              ? t("Select city first", "اختر المدينة أولاً")
              : t("District (type to search)", "الحي (اكتب للبحث)")
          }
          emptyText={t("No matching district", "لا يوجد حي مطابق")}
          isRTL={isRTL}
          ariaLabel={t("District", "الحي")}
          clearAriaLabel={t("Clear district", "مسح الحي")}
        />
      </div>

      {/* Action row */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <button
          type="submit"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow transition hover:bg-primary/90"
        >
          <Search className="h-4 w-4" />
          {t("Search", "ابحث")}
        </button>

        <button
          type="button"
          onClick={handleNearMe}
          disabled={geoLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted disabled:opacity-60"
        >
          {geoLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Navigation className="h-4 w-4" />
          )}
          {t("Near me", "بالقرب مني")}
        </button>
      </div>

      {geoError && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {geoError}
        </p>
      )}
    </form>
  );
}
