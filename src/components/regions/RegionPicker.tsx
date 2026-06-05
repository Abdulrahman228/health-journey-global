import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export interface RegionRow {
  id: string;
  parent_id: string | null;
  type: "country" | "governorate" | "city" | "district";
  level: number;
  name_ar: string;
  name_en: string;
  slug: string;
}

export interface RegionSelection {
  countryId: string | null;
  governorateId: string | null;
  cityId: string | null;
  districtId: string | null;
}

interface Props {
  value: RegionSelection;
  onChange: (next: RegionSelection) => void;
  required?: boolean;
  language?: "ar" | "en";
  idPrefix?: string;
}

/**
 * Hierarchical region picker (Country → Governorate → City → District).
 * Lazy-loads children when a parent is selected. Public read RLS allows
 * unauthenticated fetches so the picker works on signup forms too.
 */
export function RegionPicker({
  value,
  onChange,
  required = true,
  language = "ar",
  idPrefix = "rp",
}: Props) {
  const [countries, setCountries] = useState<RegionRow[]>([]);
  const [governorates, setGovernorates] = useState<RegionRow[]>([]);
  const [cities, setCities] = useState<RegionRow[]>([]);
  const [districts, setDistricts] = useState<RegionRow[]>([]);
  const [loadingLevel, setLoadingLevel] = useState<number | null>(null);

  const fetchChildren = useCallback(
    async (parentId: string | null, type: RegionRow["type"]) => {
      let q = supabase
        .from("regions")
        .select("id,parent_id,type,level,name_ar,name_en,slug")
        .eq("type", type)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name_ar", { ascending: true });
      q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as RegionRow[];
    },
    [],
  );

  // Initial: load countries
  useEffect(() => {
    setLoadingLevel(0);
    fetchChildren(null, "country")
      .then(setCountries)
      .catch(() => setCountries([]))
      .finally(() => setLoadingLevel(null));
  }, [fetchChildren]);

  // Load governorates when country changes
  useEffect(() => {
    if (!value.countryId) {
      setGovernorates([]);
      setCities([]);
      setDistricts([]);
      return;
    }
    setLoadingLevel(1);
    fetchChildren(value.countryId, "governorate")
      .then(setGovernorates)
      .catch(() => setGovernorates([]))
      .finally(() => setLoadingLevel(null));
  }, [value.countryId, fetchChildren]);

  useEffect(() => {
    if (!value.governorateId) {
      setCities([]);
      setDistricts([]);
      return;
    }
    setLoadingLevel(2);
    fetchChildren(value.governorateId, "city")
      .then(setCities)
      .catch(() => setCities([]))
      .finally(() => setLoadingLevel(null));
  }, [value.governorateId, fetchChildren]);

  useEffect(() => {
    if (!value.cityId) {
      setDistricts([]);
      return;
    }
    setLoadingLevel(3);
    fetchChildren(value.cityId, "district")
      .then(setDistricts)
      .catch(() => setDistricts([]))
      .finally(() => setLoadingLevel(null));
  }, [value.cityId, fetchChildren]);

  const label = (r: RegionRow) => (language === "en" ? r.name_en : r.name_ar);

  const select = (level: 0 | 1 | 2 | 3, id: string) => {
    if (level === 0) onChange({ countryId: id || null, governorateId: null, cityId: null, districtId: null });
    if (level === 1) onChange({ ...value, governorateId: id || null, cityId: null, districtId: null });
    if (level === 2) onChange({ ...value, cityId: id || null, districtId: null });
    if (level === 3) onChange({ ...value, districtId: id || null });
  };

  const baseSelectClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor={`${idPrefix}-country`} className="mb-1.5 block text-sm font-medium">
          الدولة {required && <span className="text-destructive" aria-hidden="true">*</span>}
        </label>
        <div className="relative">
          <select
            id={`${idPrefix}-country`}
            value={value.countryId ?? ""}
            onChange={(e) => select(0, e.target.value)}
            required={required}
            className={baseSelectClass}
          >
            <option value="">— اختر الدولة —</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{label(c)}</option>
            ))}
          </select>
          {loadingLevel === 0 && (
            <Loader2 className="absolute inset-e-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-gov`} className="mb-1.5 block text-sm font-medium">
          المحافظة / المنطقة {required && <span className="text-destructive" aria-hidden="true">*</span>}
        </label>
        <div className="relative">
          <select
            id={`${idPrefix}-gov`}
            value={value.governorateId ?? ""}
            onChange={(e) => select(1, e.target.value)}
            disabled={!value.countryId || loadingLevel === 1}
            required={required}
            className={baseSelectClass}
          >
            <option value="">— اختر المحافظة —</option>
            {governorates.map((g) => (
              <option key={g.id} value={g.id}>{label(g)}</option>
            ))}
          </select>
          {loadingLevel === 1 && (
            <Loader2 className="absolute inset-e-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-city`} className="mb-1.5 block text-sm font-medium">
          المدينة
        </label>
        <div className="relative">
          <select
            id={`${idPrefix}-city`}
            value={value.cityId ?? ""}
            onChange={(e) => select(2, e.target.value)}
            disabled={!value.governorateId || loadingLevel === 2}
            className={baseSelectClass}
          >
            <option value="">{cities.length === 0 && value.governorateId ? "— لا توجد مدن مسجلة —" : "— اختر المدينة —"}</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>{label(c)}</option>
            ))}
          </select>
          {loadingLevel === 2 && (
            <Loader2 className="absolute inset-e-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-district`} className="mb-1.5 block text-sm font-medium">
          الحي / المنطقة الفرعية
        </label>
        <div className="relative">
          <select
            id={`${idPrefix}-district`}
            value={value.districtId ?? ""}
            onChange={(e) => select(3, e.target.value)}
            disabled={!value.cityId || loadingLevel === 3}
            className={baseSelectClass}
          >
            <option value="">{districts.length === 0 && value.cityId ? "— لا توجد أحياء مسجلة —" : "— اختر الحي —"}</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>{label(d)}</option>
            ))}
          </select>
          {loadingLevel === 3 && (
            <Loader2 className="absolute inset-e-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
}
