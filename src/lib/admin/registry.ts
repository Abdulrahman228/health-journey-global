// Entity registry for the admin data engine.
//
// Every public table becomes an entity automatically (columns from
// schema.generated.ts); the overrides below add Arabic labels, grouping,
// search columns, read-only flags and the role level that may delete rows.
// The server (data.ts) validates every request against THIS registry, so the
// client can never name a table or column that is not listed here.
import { TABLE_COLUMNS, type ColumnMeta } from "./schema.generated";

export type AdminGroup =
  | "users"
  | "doctors"
  | "patients"
  | "appointments"
  | "finance"
  | "content"
  | "catalogs"
  | "comms"
  | "system"
  | "other";

export const GROUP_LABELS: Record<AdminGroup, string> = {
  users: "المستخدمون",
  doctors: "الأطباء",
  patients: "المرضى",
  appointments: "الحجوزات والسجلات",
  finance: "المالية",
  content: "المحتوى",
  catalogs: "القوائم",
  comms: "التواصل",
  system: "النظام",
  other: "أخرى",
};

export interface EntityDef {
  table: string;
  label: string;
  group: AdminGroup;
  pk: string;
  columns: ColumnMeta[];
  /** Columns shown in the list by default (others are in the row drawer). */
  listColumns: string[];
  /** ilike search targets for the search box. */
  searchColumns: string[];
  /** Never editable (ids, timestamps, computed). */
  readOnlyColumns: string[];
  /** Whole entity is read-only (logs, metrics). */
  readOnly: boolean;
  /** Role needed to delete a row. */
  deleteLevel: "admin" | "super_admin";
  /** Role needed to edit a row. */
  editLevel: "admin" | "super_admin";
  defaultSort: { column: string; dir: "asc" | "desc" };
}

/** Tables never exposed to the engine (secrets / private channels). */
export const EXCLUDED_TABLES = new Set(["doctor_finance_pins", "doctor_private_feedback"]);

const ALWAYS_READ_ONLY = new Set(["id", "created_at", "updated_at", "inserted_at"]);

type Override = Partial<
  Pick<EntityDef, "label" | "group" | "pk" | "listColumns" | "searchColumns" | "readOnly" | "deleteLevel" | "editLevel">
> & { readOnlyColumns?: string[] };

const OVERRIDES: Record<string, Override> = {
  // users
  profiles: { label: "الملفات الشخصية", group: "users", listColumns: ["full_name", "role", "phone", "city", "status", "user_id", "created_at"], searchColumns: ["full_name", "phone", "email", "city"], deleteLevel: "super_admin" },
  user_roles: { label: "الأدوار", group: "users", listColumns: ["user_id", "role", "created_at"], searchColumns: ["user_id"], editLevel: "super_admin", deleteLevel: "super_admin" },
  user_contacts: { label: "وسائل التواصل", group: "users", searchColumns: ["phone", "email"] },
  // patients
  patient_details: { label: "بيانات المرضى", group: "patients", searchColumns: ["profile_id", "user_id"] , deleteLevel: "super_admin" },
  patient_medical_profile: { label: "الملف الطبي للمريض", group: "patients", pk: "patient_profile_id", listColumns: ["patient_profile_id", "blood_type", "allergies", "chronic_conditions", "updated_at"], searchColumns: ["patient_profile_id"] },
  patient_addresses: { label: "عناوين المرضى", group: "patients", searchColumns: ["city", "address_line"] },
  emergency_contacts: { label: "جهات الطوارئ", group: "patients", searchColumns: ["name", "phone"] },
  patient_claims: { label: "طلبات ربط الملفات", group: "patients", searchColumns: ["phone"] },
  doctor_patients: { label: "مرضى الأطباء (الربط)", group: "patients", searchColumns: ["doctor_profile_id", "patient_profile_id"] },
  patient_appointment_consent: { label: "موافقات المرضى", group: "patients" },
  // doctors
  doctor_details: { label: "الأطباء", group: "doctors", listColumns: ["profile_id", "specialty", "consultation_fee", "is_verified", "telemedicine_enabled", "rating", "reviews_count", "created_at"], searchColumns: ["specialty", "bio", "profile_id"], deleteLevel: "super_admin" },
  clinics: { label: "العيادات", group: "doctors", listColumns: ["name", "doctor_id", "city", "address", "phone", "is_active", "created_at"], searchColumns: ["name", "city", "address", "phone"] },
  clinic_schedules: { label: "مواعيد العيادات", group: "doctors", searchColumns: ["clinic_id"] },
  clinic_time_off: { label: "إجازات العيادات", group: "doctors", searchColumns: ["clinic_id", "reason"] },
  doctor_documents: { label: "مستندات الأطباء", group: "doctors", searchColumns: ["doctor_id", "document_type"] },
  doctor_credentials: { label: "شهادات الأطباء", group: "doctors", searchColumns: ["doctor_id", "title"] },
  doctor_consent: { label: "موافقات الأطباء", group: "doctors" },
  doctor_billing_settings: { label: "بيانات صرف الأطباء", group: "doctors", pk: "doctor_details_id", searchColumns: ["account_holder", "bank_name", "vodafone_number", "instapay_handle"] },
  doctor_followup_settings: { label: "إعدادات المتابعة", group: "doctors", pk: "doctor_details_id" },
  sponsored_slots: { label: "الأماكن الممولة", group: "doctors", searchColumns: ["doctor_id"] },
  sponsored_impressions: { label: "ظهور الإعلانات", group: "doctors", readOnly: true },
  doctor_referrals: { label: "إحالات الأطباء", group: "doctors", searchColumns: ["code"] },
  doctor_profile_views: { label: "مشاهدات الملفات", group: "doctors", pk: "doctor_details_id", readOnly: true },
  doctor_outreach: { label: "التواصل مع أطباء الدليل", group: "doctors", searchColumns: ["phone", "name"] },
  scraped_doctors: { label: "دليل الأطباء المستورد", group: "doctors", searchColumns: ["name", "specialty", "city", "phone"] },
  profile_short_links: { label: "الروابط المختصرة", group: "doctors", searchColumns: ["short_id", "profile_id"] },
  // appointments & records
  appointments: { label: "المواعيد", group: "appointments", listColumns: ["doctor_id", "patient_id", "scheduled_at", "appointment_type", "status", "payment_status", "fee", "queue_number", "created_at"], searchColumns: ["id", "doctor_id", "patient_id", "status", "payment_status"], deleteLevel: "super_admin" },
  consultation_requests: { label: "طلبات الاستشارة", group: "appointments", searchColumns: ["status", "patient_id"] },
  masked_call_sessions: { label: "جلسات الاتصال المقنّع", group: "appointments", readOnly: true },
  coupon_redemptions: { label: "استخدامات الكوبونات", group: "finance", readOnly: true },
  ai_consultations: { label: "استشارات المساعد الذكي", group: "appointments", readOnly: true, searchColumns: ["doctor_profile_id"] },
  medical_records: { label: "السجلات الطبية", group: "appointments", searchColumns: ["patient_profile_id", "doctor_profile_id", "diagnosis"], deleteLevel: "super_admin" },
  medical_attachments: { label: "مرفقات طبية", group: "appointments", searchColumns: ["patient_profile_id", "file_name"], deleteLevel: "super_admin" },
  medical_reports: { label: "تقارير طبية", group: "appointments", searchColumns: ["patient_id", "title"] },
  prescriptions: { label: "الروشتات", group: "appointments", searchColumns: ["number", "patient_profile_id"], deleteLevel: "super_admin" },
  prescription_items: { label: "بنود الروشتات", group: "appointments", searchColumns: ["drug_name"] },
  lab_orders: { label: "طلبات التحاليل", group: "appointments", searchColumns: ["patient_profile_id", "status"] },
  lab_facilities: { label: "المعامل", group: "catalogs", searchColumns: ["name", "city", "phone"] },
  // finance
  doctor_transactions: { label: "معاملات الأطباء", group: "finance", listColumns: ["doctor_details_id", "type", "gross_amount", "platform_fee", "net_amount", "status", "description", "created_at"], searchColumns: ["doctor_details_id", "description", "type"], deleteLevel: "super_admin", editLevel: "super_admin" },
  doctor_withdrawals: { label: "طلبات السحب", group: "finance", listColumns: ["doctor_details_id", "amount", "method", "status", "reference", "requested_at", "processed_at"], searchColumns: ["doctor_details_id", "status", "reference"] },
  doctor_expenses: { label: "مصروفات الأطباء", group: "finance", searchColumns: ["category", "vendor", "description"] },
  doctor_other_income: { label: "دخل آخر للأطباء", group: "finance", searchColumns: ["source_type", "note"] },
  doctor_shift_closures: { label: "إقفالات الورديات", group: "finance", searchColumns: ["doctor_id"] },
  subscriptions: { label: "الاشتراكات", group: "finance", listColumns: ["user_id", "plan_code", "status", "access_status", "current_period_end", "is_manual", "created_at"], searchColumns: ["user_id", "plan_code", "status"], deleteLevel: "super_admin" },
  subscription_plans: { label: "الباقات", group: "finance", pk: "id", listColumns: ["code", "name_ar", "tier", "price_cents", "interval", "commission_pct", "is_active"], searchColumns: ["code", "name_ar", "name_en"], editLevel: "super_admin", deleteLevel: "super_admin" },
  invoices: { label: "الفواتير", group: "finance", searchColumns: ["number", "customer_name", "status"], deleteLevel: "super_admin" },
  payments: { label: "المدفوعات", group: "finance", searchColumns: ["provider", "provider_payment_id", "status"], deleteLevel: "super_admin", editLevel: "super_admin" },
  coupons: { label: "الكوبونات", group: "finance", listColumns: ["code", "discount_type", "discount_value", "valid_until", "times_used", "usage_limit", "is_active"], searchColumns: ["code", "description"] },
  exchange_rates: { label: "أسعار الصرف", group: "finance" },
  // content
  articles: { label: "المقالات", group: "content", listColumns: ["title", "slug", "status", "published_at", "created_at"], searchColumns: ["title", "slug"] },
  posts: { label: "منشورات المجتمع", group: "content", searchColumns: ["content", "author_profile_id"] },
  post_replies: { label: "ردود المجتمع", group: "content", searchColumns: ["content"] },
  post_reactions: { label: "تفاعلات المجتمع", group: "content", readOnly: true },
  post_reports: { label: "بلاغات المجتمع", group: "content", searchColumns: ["reason"] },
  post_drug_info: { label: "أدوية المنشورات", group: "content", searchColumns: ["drug_name"] },
  community_posts: { label: "منشورات (قديم)", group: "content", searchColumns: ["content"] },
  reviews: { label: "التقييمات", group: "content", listColumns: ["doctor_id", "patient_id", "rating", "status", "comment", "created_at"], searchColumns: ["comment", "status"] },
  missing_drugs: { label: "الأدوية نادرة التوفر", group: "content", searchColumns: ["drug_name", "city"] },
  medical_sources: { label: "مصادر المراجع الطبية", group: "content", searchColumns: ["title", "publisher"] },
  medical_chunks: { label: "مقاطع المراجع", group: "content", readOnly: true },
  medical_ingest_jobs: { label: "مهام فهرسة المراجع", group: "content", searchColumns: ["status"] },
  // catalogs
  specialties: { label: "التخصصات", group: "catalogs", listColumns: ["slug", "name_ar", "name_en"], searchColumns: ["slug", "name_ar", "name_en"] },
  regions: { label: "المناطق", group: "catalogs", listColumns: ["name_ar", "name_en", "type", "slug", "parent_id"], searchColumns: ["name_ar", "name_en", "slug"] },
  pharmacy_chains: { label: "سلاسل الصيدليات", group: "catalogs", searchColumns: ["name"] },
  pharmacy_branches: { label: "فروع الصيدليات", group: "catalogs", searchColumns: ["name", "city", "phone"] },
  pharmacy_drug_listings: { label: "أدوية الصيدليات", group: "catalogs", searchColumns: ["drug_name"] },
  pharmacy_medications: { label: "قاعدة الأدوية", group: "catalogs", searchColumns: ["name", "generic_name"] },
  // comms
  notifications: { label: "الإشعارات", group: "comms", listColumns: ["user_id", "kind", "title", "is_read", "created_at"], searchColumns: ["title", "body", "kind", "user_id"] },
  outbox_messages: { label: "صندوق الرسائل الصادرة", group: "comms", listColumns: ["channel", "to_phone", "status", "attempts", "next_attempt_at", "created_at"], searchColumns: ["to_phone", "status", "template"] },
  messaging_opt_outs: { label: "إيقاف الرسائل", group: "comms", searchColumns: ["phone"] },
  support_tickets: { label: "تذاكر الدعم", group: "comms", listColumns: ["user_id", "subject", "status", "priority", "created_at"], searchColumns: ["subject", "message", "status"] },
  // system
  audit_logs: { label: "سجل التدقيق", group: "system", readOnly: true, listColumns: ["created_at", "user_id", "action", "resource_type", "resource_id", "ip_address"], searchColumns: ["action", "resource_type", "resource_id", "user_id"] },
  error_logs: { label: "سجل الأخطاء", group: "system", readOnly: true, searchColumns: ["message", "source"] },
  web_vitals_events: { label: "مقاييس الأداء", group: "system", readOnly: true },
  app_settings: { label: "إعدادات النظام", group: "system", pk: "key", listColumns: ["key", "value", "description", "updated_at"], searchColumns: ["key", "description"], editLevel: "super_admin", deleteLevel: "super_admin" },
};

const DEFAULT_GROUP_BY_PREFIX: Array<[RegExp, AdminGroup]> = [
  [/^doctor_|^clinic|^sponsored|^scraped/, "doctors"],
  [/^patient_|^emergency/, "patients"],
  [/^appointment|^medical_|^prescription|^lab_|^consultation/, "appointments"],
  [/^post|^article|^review|^community|^missing/, "content"],
  [/^pharmacy|^special|^region/, "catalogs"],
  [/^notification|^outbox|^messaging|^support/, "comms"],
  [/^audit|^error|^web_vitals|^app_/, "system"],
];

function guessPk(cols: ColumnMeta[]): string {
  if (cols.some((c) => c.name === "id")) return "id";
  if (cols.some((c) => c.name === "key")) return "key";
  const idLike = cols.find((c) => c.name.endsWith("_id"));
  return idLike?.name ?? cols[0]?.name ?? "id";
}

function buildEntity(table: string, cols: ColumnMeta[]): EntityDef {
  const o = OVERRIDES[table] ?? {};
  const group = o.group ?? DEFAULT_GROUP_BY_PREFIX.find(([re]) => re.test(table))?.[1] ?? "other";
  const names = cols.map((c) => c.name);
  const pk = o.pk ?? guessPk(cols);
  const listColumns = (o.listColumns ?? names.filter((n) => !["metadata", "raw_payload", "eta_payload"].includes(n)).slice(0, 8)).filter((n) => names.includes(n));
  const searchColumns = (o.searchColumns ?? names.filter((n) => cols.find((c) => c.name === n)?.kind === "text").slice(0, 3)).filter((n) => names.includes(n));
  const readOnlyColumns = Array.from(new Set([...ALWAYS_READ_ONLY, pk, ...(o.readOnlyColumns ?? [])])).filter((n) => names.includes(n));
  const defaultSortCol = names.includes("created_at") ? "created_at" : pk;
  return {
    table,
    label: o.label ?? table,
    group,
    pk,
    columns: cols,
    listColumns: listColumns.length ? listColumns : names.slice(0, 6),
    searchColumns,
    readOnlyColumns,
    readOnly: o.readOnly ?? false,
    deleteLevel: o.deleteLevel ?? "admin",
    editLevel: o.editLevel ?? "admin",
    defaultSort: { column: defaultSortCol, dir: defaultSortCol === "created_at" ? "desc" : "asc" },
  };
}

export const ENTITIES: Record<string, EntityDef> = Object.fromEntries(
  Object.entries(TABLE_COLUMNS)
    .filter(([table]) => !EXCLUDED_TABLES.has(table))
    .map(([table, cols]) => [table, buildEntity(table, cols)]),
);

export function getEntity(table: string): EntityDef | null {
  return ENTITIES[table] ?? null;
}

export function entitiesByGroup(): Array<{ group: AdminGroup; label: string; entities: EntityDef[] }> {
  const order: AdminGroup[] = ["users", "patients", "doctors", "appointments", "finance", "content", "catalogs", "comms", "system", "other"];
  return order
    .map((group) => ({
      group,
      label: GROUP_LABELS[group],
      entities: Object.values(ENTITIES)
        .filter((e) => e.group === group)
        .sort((a, b) => a.label.localeCompare(b.label, "ar")),
    }))
    .filter((g) => g.entities.length > 0);
}
