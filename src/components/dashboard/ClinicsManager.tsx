import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { PlacePicker } from "@/components/maps/PlacePicker";
import { ClinicMap } from "@/components/maps/ClinicMap";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { RegionPicker, type RegionSelection } from "@/components/regions/RegionPicker";
import { Building2, Plus, Trash2, Save, Loader2, Clock, CalendarOff, Navigation, MapPin } from "lucide-react";
import { toast } from "sonner";

interface Clinic {
  id: string;
  doctor_id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  consultation_fee: number | null;
  currency: string | null;
  is_primary: boolean | null;
  country_id?: string | null;
  governorate_id?: string | null;
  city_id?: string | null;
  district_id?: string | null;
  street?: string | null;
  building?: string | null;
  floor_unit?: string | null;
  landmark?: string | null;
}

interface Schedule {
  id: string;
  clinic_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  max_patients_per_day: number | null;
  avg_consultation_minutes: number;
  is_active: boolean;
}

const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function ClinicsManager({ doctorDetailsId }: { doctorDetailsId: string }) {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [addingClinic, setAddingClinic] = useState(false);

  const { data: clinics = [], isLoading } = useQuery({
    queryKey: ["clinics", doctorDetailsId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinics")
        .select("*")
        .eq("doctor_id", doctorDetailsId)
        .order("is_primary", { ascending: false });
      if (error) throw error;
      return data as Clinic[];
    },
  });

  const createClinic = useMutation({
    mutationFn: async (payload: Partial<Clinic>) => {
      const { error } = await supabase.from("clinics").insert({
        doctor_id: doctorDetailsId,
        name: payload.name ?? t("New Clinic", "عيادة جديدة"),
        address: payload.address ?? null,
        city: payload.city ?? null,
        country: payload.country ?? "Egypt",
        lat: payload.lat ?? null,
        lng: payload.lng ?? null,
        country_id: payload.country_id ?? null,
        governorate_id: payload.governorate_id ?? null,
        city_id: payload.city_id ?? null,
        district_id: payload.district_id ?? null,
        street: payload.street ?? null,
        building: payload.building ?? null,
        floor_unit: payload.floor_unit ?? null,
        landmark: payload.landmark ?? null,
        is_primary: clinics.length === 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Clinic added", "تمت إضافة العيادة"));
      setAddingClinic(false);
      queryClient.invalidateQueries({ queryKey: ["clinics", doctorDetailsId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteClinic = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clinics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Clinic deleted", "تم حذف العيادة"));
      queryClient.invalidateQueries({ queryKey: ["clinics", doctorDetailsId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="bg-card border border-border rounded-2xl p-6 mt-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold text-foreground">
            {t("Clinics & Schedules", "العيادات والمواعيد")}
          </h2>
        </div>
        <button
          onClick={() => setAddingClinic(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {t("Add clinic", "إضافة عيادة")}
        </button>
      </div>

      {addingClinic && (
        <NewClinicForm
          onCancel={() => setAddingClinic(false)}
          onSave={(p) => createClinic.mutate(p)}
          pending={createClinic.isPending}
        />
      )}

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      ) : clinics.length === 0 && !addingClinic ? (
        <p className="text-sm text-muted-foreground border border-dashed border-border rounded-xl p-6 text-center">
          {t("No clinics yet. Add your first location.", "لا توجد عيادات بعد. أضف موقعك الأول.")}
        </p>
      ) : (
        <div className="space-y-4">
          {clinics.map((c) => (
            <ClinicCard
              key={c.id}
              clinic={c}
              days={language === "ar" ? DAYS_AR : DAYS_EN}
              onDelete={() => deleteClinic.mutate(c.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function NewClinicForm({
  onCancel,
  onSave,
  pending,
}: {
  onCancel: () => void;
  onSave: (p: Partial<Clinic>) => void;
  pending: boolean;
}) {
  const { t } = useLanguage();
  const { ready: mapsReady } = useGoogleMaps();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<{
    address: string;
    lat: number;
    lng: number;
    city?: string;
    country?: string;
    countryCode?: string;
    governorate?: string;
    district?: string;
  } | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  // Reverse-geocode a (lat, lng) into our `picked` shape using Google Geocoder.
  // Used by: map click, marker drag-end, "use my current location".
  async function reverseGeocode(lat: number, lng: number) {
    if (!mapsReady) {
      setPicked({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
      return;
    }
    try {
      const geocoder = new google.maps.Geocoder();
      const res = await geocoder.geocode({ location: { lat, lng } });
      const r = res.results?.[0];
      if (!r) {
        setPicked({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
        return;
      }
      const components = r.address_components ?? [];
      const cityComp = components.find(
        (c) => c.types.includes("locality") || c.types.includes("administrative_area_level_2"),
      );
      const countryComp = components.find((c) => c.types.includes("country"));
      const govComp = components.find((c) => c.types.includes("administrative_area_level_1"));
      const districtComp = components.find(
        (c) =>
          c.types.includes("sublocality_level_1") ||
          c.types.includes("sublocality") ||
          c.types.includes("neighborhood") ||
          c.types.includes("administrative_area_level_3"),
      );
      setPicked({
        address: r.formatted_address,
        lat,
        lng,
        city: cityComp?.long_name,
        country: countryComp?.long_name,
        countryCode: countryComp?.short_name,
        governorate: govComp?.long_name,
        district: districtComp?.long_name,
      });
    } catch (e) {
      console.error("reverse geocode failed", e);
      setPicked({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error(t("Geolocation not supported", "خاصية الموقع غير مدعومة"));
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setGeoLoading(false);
      },
      (err) => {
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? t("Permission denied", "تم رفض الإذن")
            : t("Could not get location", "تعذر تحديد الموقع"),
        );
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const [region, setRegion] = useState<RegionSelection>({
    countryId: null,
    governorateId: null,
    cityId: null,
    districtId: null,
  });
  const [street, setStreet] = useState("");
  const [building, setBuilding] = useState("");
  const [floorUnit, setFloorUnit] = useState("");
  const [landmark, setLandmark] = useState("");
  const [autoResolving, setAutoResolving] = useState(false);

  // Auto-resolve region IDs from the Google-picked place by matching
  // address components against the `regions` table (case-insensitive,
  // both ar/en).
  useEffect(() => {
    if (!picked) return;
    let cancelled = false;
    (async () => {
      try {
        setAutoResolving(true);
        const result: RegionSelection = {
          countryId: null,
          governorateId: null,
          cityId: null,
          districtId: null,
        };

        async function findRegion(
          type: "country" | "governorate" | "city" | "district",
          name: string | undefined,
          parentId: string | null,
        ): Promise<{ id: string; name_ar: string; name_en: string } | null> {
          if (!name) return null;
          let q = supabase
            .from("regions")
            .select("id,name_ar,name_en")
            .eq("type", type)
            .or(`name_ar.ilike.%${name}%,name_en.ilike.%${name}%`)
            .limit(1);
          if (parentId) q = q.eq("parent_id", parentId);
          const { data } = await q;
          return data && data.length > 0 ? data[0] : null;
        }

        const country = await findRegion(
          "country",
          picked.countryCode || picked.country,
          null,
        );
        if (country) result.countryId = country.id;

        const gov = await findRegion("governorate", picked.governorate, result.countryId);
        if (gov) result.governorateId = gov.id;

        const city = await findRegion("city", picked.city, result.governorateId);
        if (city) result.cityId = city.id;

        const district = await findRegion("district", picked.district, result.cityId);
        if (district) result.districtId = district.id;

        if (!cancelled) {
          setRegion((prev) => ({
            countryId: result.countryId ?? prev.countryId,
            governorateId: result.governorateId ?? prev.governorateId,
            cityId: result.cityId ?? prev.cityId,
            districtId: result.districtId ?? prev.districtId,
          }));
        }
      } finally {
        if (!cancelled) setAutoResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [picked]);

  return (
    <div className="border border-border rounded-xl p-4 mb-4 bg-muted/20">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="clinic-name" className="block text-sm font-medium text-foreground mb-1.5">
            {t("Clinic name", "اسم العيادة")}
          </label>
          <input
            id="clinic-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("e.g. Heliopolis Branch", "مثال: فرع مصر الجديدة")}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            {t("Address (search)", "العنوان (ابحث)")}
          </label>
          <div className="flex gap-2">
            <PlacePicker
              placeholder={t("Type address...", "اكتب العنوان...")}
              onPick={setPicked}
              className="flex-1"
            />
            <button
              type="button"
              onClick={useMyLocation}
              disabled={geoLoading}
              title={t("Use my current location", "استخدم موقعي الحالي")}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-border bg-background text-sm hover:bg-accent disabled:opacity-50"
            >
              {geoLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Navigation className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {t("My location", "موقعي")}
              </span>
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t(
              "Tip: you can also click on the map below or drag the pin to fine-tune.",
              "نصيحة: يمكنك أيضاً الضغط على الخريطة بالأسفل أو سحب الدبوس لضبط الموقع بدقة.",
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-background p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">
            {t("Hierarchical location", "الموقع التفصيلي")}
          </h4>
          {autoResolving && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("Auto-filling…", "جارٍ الملء التلقائي…")}
            </span>
          )}
        </div>
        <RegionPicker value={region} onChange={setRegion} idPrefix="new-clinic" />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="clinic-street" className="block text-sm font-medium mb-1.5">
            {t("Street", "الشارع")}
          </label>
          <input id="clinic-street" type="text" value={street} onChange={(e) => setStreet(e.target.value)}
            placeholder={t("e.g. El-Tahrir St.", "مثال: شارع التحرير")}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label htmlFor="clinic-building" className="block text-sm font-medium mb-1.5">
            {t("Building", "رقم/اسم العمارة")}
          </label>
          <input id="clinic-building" type="text" value={building} onChange={(e) => setBuilding(e.target.value)}
            placeholder={t("e.g. Building 23", "مثال: عمارة 23")}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label htmlFor="clinic-floor" className="block text-sm font-medium mb-1.5">
            {t("Floor / Unit", "الدور / الشقة")}
          </label>
          <input id="clinic-floor" type="text" value={floorUnit} onChange={(e) => setFloorUnit(e.target.value)}
            placeholder={t("e.g. Floor 3, Apt 5", "مثال: الدور الثالث - شقة 5")}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label htmlFor="clinic-landmark" className="block text-sm font-medium mb-1.5">
            {t("Landmark", "علامة مميزة")}
          </label>
          <input id="clinic-landmark" type="text" value={landmark} onChange={(e) => setLandmark(e.target.value)}
            placeholder={t("e.g. Next to Carrefour", "مثال: بجوار كارفور")}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      </div>

      {/*
       * Interactive map: click anywhere to drop the pin or drag it to refine.
       * If nothing is picked yet, show the map centered on a sensible default
       * (Cairo) so the doctor can click directly to set the location.
       */}
      <div className="mt-3">
        <div className="flex items-center gap-1 mb-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          {picked
            ? t("Drag the pin to fine-tune the location", "اسحب الدبوس لضبط الموقع بدقة")
            : t(
                "Click on the map to set your clinic location",
                "اضغط على الخريطة لتحديد موقع العيادة",
              )}
        </div>
        <ClinicMap
          markers={picked ? [{ lat: picked.lat, lng: picked.lng }] : []}
          center={picked ?? { lat: 30.0444, lng: 31.2357 }}
          zoom={picked ? 15 : 11}
          className="h-56"
          draggable
          onClick={(lat, lng) => reverseGeocode(lat, lng)}
          onMarkerDragEnd={(lat, lng) => reverseGeocode(lat, lng)}
        />
        {picked && (
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium">{t("Selected:", "المحدد:")}</span>{" "}
            {picked.address}{" "}
            <span className="text-[10px] opacity-70">
              ({picked.lat.toFixed(5)}, {picked.lng.toFixed(5)})
            </span>
          </p>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() =>
            onSave({
              name: name || t("Main Clinic", "العيادة الرئيسية"),
              address: picked?.address ?? null,
              lat: picked?.lat ?? null,
              lng: picked?.lng ?? null,
              city: picked?.city ?? null,
              country: picked?.country ?? null,
              country_id: region.countryId,
              governorate_id: region.governorateId,
              city_id: region.cityId,
              district_id: region.districtId,
              street: street || null,
              building: building || null,
              floor_unit: floorUnit || null,
              landmark: landmark || null,
            })
          }
          disabled={pending || !region.countryId || !region.governorateId}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Save clinic", "حفظ العيادة")}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent"
        >
          {t("Cancel", "إلغاء")}
        </button>
      </div>
    </div>
  );
}

function ClinicCard({
  clinic,
  days,
  onDelete,
}: {
  clinic: Clinic;
  days: string[];
  onDelete: () => void;
}) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const { data: schedules = [] } = useQuery({
    queryKey: ["schedules", clinic.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_schedules")
        .select("*")
        .eq("clinic_id", clinic.id)
        .order("day_of_week");
      if (error) throw error;
      return data as Schedule[];
    },
  });

  const addSlot = useMutation({
    mutationFn: async (payload: Omit<Schedule, "id">) => {
      const { error } = await supabase.from("clinic_schedules").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules", clinic.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delSlot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clinic_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["schedules", clinic.id] }),
  });

  const [day, setDay] = useState(1);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [maxPatients, setMaxPatients] = useState(20);
  const [avgMin, setAvgMin] = useState(15);
  const [editingLocation, setEditingLocation] = useState(false);

  // Update clinic location (lat/lng/address) — used by the inline edit map.
  // We also clear the resolved city/country text fields if we cannot derive
  // them, but otherwise leave the rest of the row unchanged.
  const updateLocation = useMutation({
    mutationFn: async (p: {
      lat: number;
      lng: number;
      address?: string;
      city?: string;
      country?: string;
    }) => {
      const patch: {
        lat: number;
        lng: number;
        address?: string;
        city?: string;
        country?: string;
      } = { lat: p.lat, lng: p.lng };
      if (p.address) patch.address = p.address;
      if (p.city) patch.city = p.city;
      if (p.country) patch.country = p.country;
      const { error } = await supabase.from("clinics").update(patch).eq("id", clinic.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Location updated", "تم تحديث الموقع"));
      queryClient.invalidateQueries({ queryKey: ["clinics"] });
      setEditingLocation(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function pickAndSave(lat: number, lng: number) {
    // Best-effort reverse-geocode for human-readable address.
    let address: string | undefined;
    let city: string | undefined;
    let country: string | undefined;
    try {
      if (typeof google !== "undefined" && google.maps?.Geocoder) {
        const r = await new google.maps.Geocoder().geocode({ location: { lat, lng } });
        const top = r.results?.[0];
        if (top) {
          address = top.formatted_address;
          const cc = top.address_components ?? [];
          city = cc.find((c) => c.types.includes("locality"))?.long_name;
          country = cc.find((c) => c.types.includes("country"))?.long_name;
        }
      }
    } catch {
      // ignore — coords alone are still saved
    }
    updateLocation.mutate({ lat, lng, address, city, country });
  }

  return (
    <div className="border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">{clinic.name}</h3>
          {clinic.address && <p className="text-sm text-muted-foreground mt-0.5">{clinic.address}</p>}
        </div>
        <button
          onClick={onDelete}
          className="text-destructive hover:bg-destructive/10 p-1.5 rounded-lg"
          aria-label={t("Delete", "حذف")}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {clinic.lat != null && clinic.lng != null && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {editingLocation
                ? t("Drag the pin or click on the map to update", "اسحب الدبوس أو اضغط على الخريطة للتحديث")
                : t("Clinic location", "موقع العيادة")}
            </span>
            <button
              type="button"
              onClick={() => setEditingLocation((v) => !v)}
              className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent"
            >
              {editingLocation ? t("Done", "تم") : t("Edit location", "تعديل الموقع")}
            </button>
          </div>
          <ClinicMap
            markers={[{ lat: clinic.lat, lng: clinic.lng, title: clinic.name }]}
            className="h-36"
            draggable={editingLocation}
            onClick={editingLocation ? (lat, lng) => pickAndSave(lat, lng) : undefined}
            onMarkerDragEnd={editingLocation ? (lat, lng) => pickAndSave(lat, lng) : undefined}
          />
          {updateLocation.isPending && (
            <p className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("Saving location…", "جارٍ الحفظ…")}
            </p>
          )}
        </div>
      )}
      {(clinic.lat == null || clinic.lng == null) && (
        <div className="mt-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-3 text-xs text-amber-800">
          {t(
            "No location pinned yet. Edit and pin your clinic on the map.",
            "لم يتم تحديد موقع على الخريطة بعد. اضغط الزر أدناه لتحديد الموقع.",
          )}
          <button
            type="button"
            onClick={() => setEditingLocation(true)}
            className="ms-2 text-xs px-2 py-1 rounded-md border border-amber-300 bg-white hover:bg-amber-100"
          >
            {t("Pin location", "تحديد الموقع")}
          </button>
          {editingLocation && (
            <div className="mt-2">
              <ClinicMap
                markers={[]}
                center={{ lat: 30.0444, lng: 31.2357 }}
                zoom={11}
                className="h-40"
                onClick={(lat, lng) => pickAndSave(lat, lng)}
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-1">
          <Clock className="h-4 w-4" /> {t("Weekly schedule", "الجدول الأسبوعي")}
        </p>
        {schedules.length === 0 ? (
          <p className="text-xs text-muted-foreground mb-2">
            {t("No working hours yet.", "لم تُضف أوقات بعد.")}
          </p>
        ) : (
          <ul className="space-y-1 mb-3">
            {schedules.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm bg-muted/30 px-3 py-1.5 rounded-lg">
                <span>
                  <span className="font-medium">{days[s.day_of_week]}</span> · {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                  <span className="text-muted-foreground mr-2"> · {s.max_patients_per_day ?? "حد آلي"} مريض · {s.avg_consultation_minutes}د/كشف</span>
                </span>
                <button onClick={() => delSlot.mutate(s.id)} className="text-destructive hover:opacity-80">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <select
            value={day}
            onChange={(e) => setDay(Number(e.target.value))}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          >
            {days.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
          <div className="flex flex-col">
            <label className="text-[10px] text-muted-foreground">{t("Max patients/day", "حد أقصى للمرضى")}</label>
            <input
              type="number"
              min={1}
              max={200}
              value={maxPatients}
              onChange={(e) => setMaxPatients(Number(e.target.value))}
              className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-muted-foreground">{t("Avg min/visit", "متوسط دقائق الكشف")}</label>
            <input
              type="number"
              min={5}
              max={120}
              value={avgMin}
              onChange={(e) => setAvgMin(Number(e.target.value))}
              className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <button
            onClick={() =>
              addSlot.mutate({
                clinic_id: clinic.id,
                day_of_week: day,
                start_time: start,
                end_time: end,
                slot_duration_minutes: avgMin,
                max_patients_per_day: maxPatients > 0 ? maxPatients : null,
                avg_consultation_minutes: avgMin,
                is_active: true,
              })
            }
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> {t("Add slot", "إضافة")}
          </button>
        </div>
      </div>

      <TimeOffSection clinicId={clinic.id} />
    </div>
  );
}

interface TimeOff {
  id: string;
  clinic_id: string;
  off_date: string;
  reason: string | null;
}

function TimeOffSection({ clinicId }: { clinicId: string }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  const { data: items = [] } = useQuery({
    queryKey: ["clinic_time_off", clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_time_off")
        .select("*")
        .eq("clinic_id", clinicId)
        .gte("off_date", new Date().toISOString().slice(0, 10))
        .order("off_date");
      if (error) throw error;
      return data as TimeOff[];
    },
  });

  const addOff = useMutation({
    mutationFn: async () => {
      if (!date) throw new Error(t("Pick a date", "اختر تاريخًا"));
      const { error } = await supabase
        .from("clinic_time_off")
        .insert({ clinic_id: clinicId, off_date: date, reason: reason || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Day marked as off", "تم تحديد اليوم كإجازة"));
      setDate("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["clinic_time_off", clinicId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeOff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clinic_time_off").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clinic_time_off", clinicId] }),
  });

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-1">
        <CalendarOff className="h-4 w-4" /> {t("Days off / vacation", "أيام الإجازة / الإغلاق")}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground mb-2">
          {t("No upcoming days off.", "لا توجد أيام إجازة قادمة.")}
        </p>
      ) : (
        <ul className="space-y-1 mb-3">
          {items.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between text-sm bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-lg"
            >
              <span>
                <span className="font-medium">{o.off_date}</span>
                {o.reason && <span className="text-muted-foreground"> · {o.reason}</span>}
              </span>
              <button onClick={() => removeOff.mutate(o.id)} className="text-destructive hover:opacity-80">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <input
          type="date"
          value={date}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("Reason (optional)", "السبب (اختياري)")}
          className="flex-1 min-w-35 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        />
        <button
          onClick={() => addOff.mutate()}
          disabled={addOff.isPending || !date}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> {t("Mark off", "تحديد إجازة")}
        </button>
      </div>
    </div>
  );
}
