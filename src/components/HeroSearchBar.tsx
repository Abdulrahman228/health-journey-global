/**
 * Hero search bar — sits inside the homepage Hero and lets users jump
 * straight to a specialty Pillar or specialty×city Combo page.
 *
 * Why this matters: those pages are SSR'd with full SEO + dense doctor
 * lists, so we capture the visitor's intent and send them to a
 * high-converting page rather than the generic /doctors filter UI.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, MapPin, Stethoscope } from "lucide-react";
import { CITIES } from "@/lib/cities";

interface SpecialtyOption {
  slug: string;
  labelAr: string;
  labelEn: string;
}

// Mirrors the seeded `specialties` table — keep in sync (67 specialties).
const SPECIALTY_OPTIONS: SpecialtyOption[] = [
  // أساسية
  { slug: "general", labelAr: "طب عام", labelEn: "General Practice" },
  { slug: "family-medicine", labelAr: "طب الأسرة", labelEn: "Family Medicine" },
  { slug: "internal", labelAr: "باطنة", labelEn: "Internal Medicine" },
  { slug: "pediatrics", labelAr: "أطفال", labelEn: "Pediatrics" },
  // قلب وأوعية وصدر
  { slug: "cardiology", labelAr: "أمراض القلب", labelEn: "Cardiology" },
  { slug: "interventional-cardiology", labelAr: "القسطرة القلبية", labelEn: "Interventional Cardiology" },
  { slug: "pulmonology", labelAr: "الصدر والجهاز التنفسي", labelEn: "Pulmonology" },
  // باطنة فرعية
  { slug: "gastroenterology", labelAr: "الجهاز الهضمي والكبد", labelEn: "Gastroenterology" },
  { slug: "nephrology", labelAr: "أمراض الكلى", labelEn: "Nephrology" },
  { slug: "endocrinology", labelAr: "الغدد الصماء والسكر", labelEn: "Endocrinology" },
  { slug: "hematology", labelAr: "أمراض الدم", labelEn: "Hematology" },
  { slug: "medical-oncology", labelAr: "الأورام (الباطني)", labelEn: "Medical Oncology" },
  { slug: "rheumatology", labelAr: "الروماتيزم والمناعة", labelEn: "Rheumatology" },
  { slug: "infectious-diseases", labelAr: "الأمراض المعدية", labelEn: "Infectious Diseases" },
  { slug: "allergy-immunology", labelAr: "الحساسية والمناعة", labelEn: "Allergy & Immunology" },
  { slug: "geriatrics", labelAr: "طب المسنين", labelEn: "Geriatrics" },
  // أطفال فرعية
  { slug: "neonatology", labelAr: "حديثي الولادة", labelEn: "Neonatology" },
  { slug: "pediatric-cardiology", labelAr: "قلب الأطفال", labelEn: "Pediatric Cardiology" },
  { slug: "pediatric-surgery", labelAr: "جراحة الأطفال", labelEn: "Pediatric Surgery" },
  // جراحة
  { slug: "general-surgery", labelAr: "الجراحة العامة", labelEn: "General Surgery" },
  { slug: "orthopedics", labelAr: "عظام", labelEn: "Orthopedics" },
  { slug: "neurosurgery", labelAr: "جراحة المخ والأعصاب", labelEn: "Neurosurgery" },
  { slug: "cardiothoracic-surgery", labelAr: "جراحة القلب والصدر", labelEn: "Cardiothoracic Surgery" },
  { slug: "vascular-surgery", labelAr: "جراحة الأوعية الدموية", labelEn: "Vascular Surgery" },
  { slug: "plastic-surgery", labelAr: "جراحة التجميل والحروق", labelEn: "Plastic Surgery" },
  { slug: "urology", labelAr: "المسالك البولية", labelEn: "Urology" },
  { slug: "surgical-oncology", labelAr: "جراحة الأورام", labelEn: "Surgical Oncology" },
  { slug: "hepatobiliary-surgery", labelAr: "جراحة الكبد والبنكرياس", labelEn: "Hepatobiliary Surgery" },
  { slug: "transplant-surgery", labelAr: "زراعة الأعضاء", labelEn: "Transplant Surgery" },
  // أعصاب ونفسي
  { slug: "neurology", labelAr: "مخ وأعصاب", labelEn: "Neurology" },
  { slug: "interventional-neurology", labelAr: "أعصاب تداخلي", labelEn: "Interventional Neurology" },
  { slug: "psychiatry", labelAr: "نفسية", labelEn: "Psychiatry" },
  { slug: "child-psychiatry", labelAr: "نفسية أطفال ومراهقين", labelEn: "Child & Adolescent Psychiatry" },
  { slug: "clinical-psychology", labelAr: "علم النفس الإكلينيكي", labelEn: "Clinical Psychology" },
  // حواس
  { slug: "ophthalmology", labelAr: "عيون", labelEn: "Ophthalmology" },
  { slug: "ent", labelAr: "أنف وأذن وحنجرة", labelEn: "ENT" },
  { slug: "dentistry", labelAr: "أسنان", labelEn: "Dentistry" },
  { slug: "dermatology", labelAr: "جلدية", labelEn: "Dermatology" },
  // نساء وإنجاب
  { slug: "gynecology", labelAr: "نساء وتوليد", labelEn: "Gynecology" },
  { slug: "reproductive-medicine", labelAr: "العقم والإخصاب", labelEn: "Reproductive Medicine / IVF" },
  { slug: "gynecologic-oncology", labelAr: "أورام النساء", labelEn: "Gynecologic Oncology" },
  // طوارئ وعناية
  { slug: "emergency-medicine", labelAr: "طب الطوارئ", labelEn: "Emergency Medicine" },
  { slug: "anesthesiology", labelAr: "التخدير", labelEn: "Anesthesiology" },
  { slug: "critical-care", labelAr: "العناية المركزة", labelEn: "Critical Care" },
  { slug: "pain-management", labelAr: "علاج الألم", labelEn: "Pain Management" },
  // تشخيص ومعامل
  { slug: "radiology", labelAr: "الأشعة التشخيصية", labelEn: "Diagnostic Radiology" },
  { slug: "interventional-radiology", labelAr: "الأشعة التداخلية", labelEn: "Interventional Radiology" },
  { slug: "nuclear-medicine", labelAr: "الطب النووي", labelEn: "Nuclear Medicine" },
  { slug: "pathology", labelAr: "الباثولوجي", labelEn: "Pathology" },
  { slug: "laboratory-medicine", labelAr: "التحاليل الطبية", labelEn: "Laboratory Medicine" },
  { slug: "microbiology", labelAr: "الميكروبيولوجي والمناعة", labelEn: "Microbiology" },
  { slug: "medical-genetics", labelAr: "الوراثة الطبية", labelEn: "Medical Genetics" },
  { slug: "radiation-oncology", labelAr: "علاج الأورام بالأشعة", labelEn: "Radiation Oncology" },
  // تأهيل ووقاية
  { slug: "physical-therapy", labelAr: "العلاج الطبيعي والتأهيل", labelEn: "Physical Therapy" },
  { slug: "occupational-therapy", labelAr: "العلاج الوظيفي", labelEn: "Occupational Therapy" },
  { slug: "speech-therapy", labelAr: "التخاطب والنطق", labelEn: "Speech Therapy" },
  { slug: "clinical-nutrition", labelAr: "التغذية العلاجية", labelEn: "Clinical Nutrition" },
  { slug: "sports-medicine", labelAr: "طب الرياضة", labelEn: "Sports Medicine" },
  { slug: "public-health", labelAr: "الصحة العامة", labelEn: "Public Health" },
  { slug: "occupational-medicine", labelAr: "الطب المهني", labelEn: "Occupational Medicine" },
  { slug: "travel-medicine", labelAr: "طب السفر", labelEn: "Travel Medicine" },
  { slug: "preventive-medicine", labelAr: "الطب الوقائي", labelEn: "Preventive Medicine" },
  // متفرقات حديثة
  { slug: "sleep-medicine", labelAr: "اضطرابات النوم", labelEn: "Sleep Medicine" },
  { slug: "andrology", labelAr: "الذكورة والصحة الجنسية", labelEn: "Andrology" },
  { slug: "palliative-care", labelAr: "الطب التلطيفي", labelEn: "Palliative Care" },
  { slug: "forensic-medicine", labelAr: "الطب الشرعي", labelEn: "Forensic Medicine" },
  { slug: "integrative-medicine", labelAr: "الطب التكاملي", labelEn: "Integrative Medicine" },
];

export function HeroSearchBar({
  language,
  isRTL,
  t,
}: {
  language: string;
  isRTL: boolean;
  t: (en: string, ar: string) => string;
}) {
  const navigate = useNavigate();
  const [specialty, setSpecialty] = useState<string>("");
  const [city, setCity] = useState<string>("");

  // Sort cities by Arabic name for native UX.
  const cityOptions = useMemo(
    () =>
      [...CITIES].sort((a, b) =>
        language === "ar" ? a.nameAr.localeCompare(b.nameAr) : a.nameEn.localeCompare(b.nameEn),
      ),
    [language],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (specialty && city) {
      navigate({ to: "/specialty/$slug/$city", params: { slug: specialty, city } });
    } else if (specialty) {
      navigate({ to: "/specialty/$slug", params: { slug: specialty } });
    } else {
      navigate({ to: "/doctors" });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 grid gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur sm:grid-cols-[1fr_1fr_auto] sm:gap-2 sm:p-2"
      dir={isRTL ? "rtl" : "ltr"}
      aria-label={t("Doctor search", "البحث عن طبيب")}
    >
      <div className="relative">
        <Stethoscope
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          style={isRTL ? { right: "0.75rem" } : { left: "0.75rem" }}
        />
        <select
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          className={`w-full rounded-xl border border-border bg-background py-3 ${
            isRTL ? "pl-3 pr-9" : "pl-9 pr-3"
          } text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20`}
          aria-label={t("Specialty", "التخصص")}
        >
          <option value="">{t("All specialties", "كل التخصصات")}</option>
          {SPECIALTY_OPTIONS.map((s) => (
            <option key={s.slug} value={s.slug}>
              {language === "ar" ? s.labelAr : s.labelEn}
            </option>
          ))}
        </select>
      </div>

      <div className="relative">
        <MapPin
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          style={isRTL ? { right: "0.75rem" } : { left: "0.75rem" }}
        />
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className={`w-full rounded-xl border border-border bg-background py-3 ${
            isRTL ? "pl-3 pr-9" : "pl-9 pr-3"
          } text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20`}
          aria-label={t("City", "المدينة")}
        >
          <option value="">{t("All cities", "كل المدن")}</option>
          {cityOptions.map((c) => (
            <option key={c.slug} value={c.slug}>
              {language === "ar" ? c.nameAr : c.nameEn}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30"
      >
        <Search className="h-4 w-4" />
        {t("Search", "ابحث")}
      </button>
    </form>
  );
}
