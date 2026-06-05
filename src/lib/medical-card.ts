/**
 * Medical Card — patient-controlled health snippet shown on /u/{slug}.
 *
 * Stored as JSONB in profiles.medical_card. Each field has a value
 * and a public flag, so the owner can keep data private and opt-in
 * to publishing individual fields.
 */

export const MEDICAL_FIELDS = [
  "blood_type",
  "allergies",
  "chronic_conditions",
  "medications",
  "emergency_name",
  "emergency_phone",
  "preferred_language",
] as const;

export type MedicalFieldKey = (typeof MEDICAL_FIELDS)[number];

export interface MedicalFieldEntry {
  value: string;
  /** When true, the field renders on the public /u/{slug} page. */
  public: boolean;
}

export type MedicalCard = Partial<Record<MedicalFieldKey, MedicalFieldEntry>>;

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

/** Returns the trimmed value if the field is set and marked public. */
export function publicValue(card: MedicalCard | null | undefined, key: MedicalFieldKey): string | null {
  const f = card?.[key];
  if (!f || !f.public) return null;
  const v = (f.value ?? "").trim();
  return v.length > 0 ? v : null;
}

/** Returns the raw owner-only value (used in the dashboard editor). */
export function ownerValue(card: MedicalCard | null | undefined, key: MedicalFieldKey): string {
  return card?.[key]?.value ?? "";
}

export function isFieldPublic(card: MedicalCard | null | undefined, key: MedicalFieldKey): boolean {
  return Boolean(card?.[key]?.public);
}

/** Build an updated card by merging a single field change. */
export function withField(
  card: MedicalCard | null | undefined,
  key: MedicalFieldKey,
  patch: Partial<MedicalFieldEntry>,
): MedicalCard {
  const base = card ?? {};
  const prev = base[key] ?? { value: "", public: false };
  return { ...base, [key]: { ...prev, ...patch } };
}

/** Human-readable labels (en/ar). */
export const FIELD_LABELS: Record<MedicalFieldKey, { en: string; ar: string }> = {
  blood_type: { en: "Blood type", ar: "فصيلة الدم" },
  allergies: { en: "Allergies", ar: "الحساسية" },
  chronic_conditions: { en: "Chronic conditions", ar: "الأمراض المزمنة" },
  medications: { en: "Current medications", ar: "الأدوية الحالية" },
  emergency_name: { en: "Emergency contact name", ar: "اسم جهة الطوارئ" },
  emergency_phone: { en: "Emergency contact phone", ar: "هاتف جهة الطوارئ" },
  preferred_language: { en: "Preferred language", ar: "اللغة المفضلة" },
};
