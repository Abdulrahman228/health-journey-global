import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { EntityDef } from "@/lib/admin/registry";
import type { AdminRow } from "@/lib/admin/data";
import { adminBanUser } from "@/lib/admin/users";
import { adminDeleteUser, adminSendPasswordReset, adminSetUserRoles, adminUserImpact } from "@/lib/admin/user-actions";
import { adminSetDoctorFlags } from "@/lib/admin/doctors";
import { adminUpdateAppointment } from "@/lib/admin/appointments";
import { APP_ROLES, APPOINTMENT_STATUSES, PAYMENT_STATUSES } from "@/lib/admin/_schemas";

interface Props {
  entity: EntityDef;
  row: AdminRow;
  /** Called after a successful action so the table refreshes. */
  onDone: () => void;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function askReason(what: string): string | null {
  const r = window.prompt(`سبب ${what} (يُسجَّل في سجل التدقيق):`);
  if (!r || r.trim().length < 3) return null;
  return r.trim();
}

/**
 * Entity-specific actions shown in the row drawer. Generic edit/delete live in
 * AdminTable; these are the operations that need server logic (auth, cascades,
 * notifications) rather than a plain column update.
 */
export function EntityActions({ entity, row, onDone }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(name: string, fn: () => Promise<unknown>, success = "تم") {
    setBusy(name);
    try {
      await fn();
      toast.success(success);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const Btn = ({ id, label, tone = "default", onClick }: { id: string; label: string; tone?: "default" | "danger" | "primary"; onClick: () => void }) => (
    <button
      type="button"
      disabled={busy !== null}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
        tone === "danger"
          ? "border-destructive/40 text-destructive hover:bg-destructive/10"
          : tone === "primary"
            ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
            : "border-border bg-background hover:bg-accent"
      }`}
    >
      {busy === id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {label}
    </button>
  );

  if (entity.table === "profiles") {
    const userId = str(row.user_id);
    if (!userId) return <p className="text-xs text-muted-foreground">هذا الملف غير مرتبط بحساب دخول (ملف مُدار).</p>;
    return (
      <div className="flex flex-wrap gap-2">
        <Btn id="reset" label="رابط إعادة كلمة السر" onClick={() => run("reset", async () => {
          const res = await adminSendPasswordReset({ data: { targetUserId: userId } });
          try { await navigator.clipboard.writeText(res.link); } catch { /* clipboard may be blocked */ }
          window.prompt(res.emailed ? "تم إرسال الرابط بالبريد، ونُسخ أيضًا:" : "البريد غير مفعّل — انسخ الرابط وأرسله للمستخدم:", res.link);
        }, "تم إنشاء الرابط")} />
        <Btn id="roles" label="تغيير الأدوار" onClick={() => {
          const input = window.prompt(`الأدوار مفصولة بفاصلة (${APP_ROLES.join(", ")}):`);
          if (!input) return;
          const roles = input.split(/[،,\s]+/).map((s) => s.trim()).filter(Boolean) as (typeof APP_ROLES)[number][];
          const bad = roles.filter((r) => !APP_ROLES.includes(r));
          if (bad.length) return toast.error(`أدوار غير معروفة: ${bad.join(", ")}`);
          const reason = askReason("تغيير الأدوار");
          if (!reason) return;
          run("roles", () => adminSetUserRoles({ data: { targetUserId: userId, roles, reason } }), "تم تحديث الأدوار");
        }} />
        {row.status === "banned" ? (
          <Btn id="unban" label="فك الحظر" onClick={() => {
            const reason = askReason("فك الحظر");
            if (!reason) return;
            run("unban", () => adminBanUser({ data: { targetUserId: userId, reason, unban: true } }), "تم فك الحظر");
          }} />
        ) : (
          <Btn id="ban" label="حظر" tone="danger" onClick={() => {
            const reason = askReason("الحظر");
            if (!reason) return;
            run("ban", () => adminBanUser({ data: { targetUserId: userId, reason, unban: false } }), "تم الحظر");
          }} />
        )}
        <Btn id="impact" label="معاينة الأثر" onClick={() => run("impact", async () => {
          const { impact } = await adminUserImpact({ data: { targetUserId: userId } });
          const lines = Object.entries(impact).map(([k, v]) => `${k}: ${v}`).join("\n");
          window.alert(`ما يرتبط بهذا المستخدم:\n\n${lines}`);
        }, "تم")} />
        <Btn id="soft" label="حذف ناعم (حظر + إخفاء البيانات)" tone="danger" onClick={() => {
          const reason = askReason("الحذف الناعم");
          if (!reason) return;
          if (window.prompt('اكتب "حذف" للتأكيد:') !== "حذف") return;
          run("soft", () => adminDeleteUser({ data: { targetUserId: userId, mode: "soft", reason } }), "تم الحذف الناعم");
        }} />
        <Btn id="hard" label="حذف نهائي (super_admin)" tone="danger" onClick={() => {
          const reason = askReason("الحذف النهائي");
          if (!reason) return;
          if (window.prompt('هذا الإجراء لا يمكن التراجع عنه. اكتب "حذف نهائي" للتأكيد:') !== "حذف نهائي") return;
          run("hard", () => adminDeleteUser({ data: { targetUserId: userId, mode: "hard", reason } }), "تم الحذف النهائي");
        }} />
        <Link to="/admin/data/$entity" params={{ entity: "appointments" }} search={{ id: undefined, user_id: undefined, q: undefined }} className="self-center text-xs text-primary hover:underline">
          المواعيد ←
        </Link>
      </div>
    );
  }

  if (entity.table === "doctor_details") {
    const id = str(row.id);
    return (
      <div className="flex flex-wrap gap-2">
        <Btn id="verify" label={row.is_verified ? "سحب التوثيق" : "توثيق الطبيب"} tone={row.is_verified ? "danger" : "primary"} onClick={() => {
          const reason = askReason(row.is_verified ? "سحب التوثيق" : "التوثيق");
          if (!reason) return;
          run("verify", () => adminSetDoctorFlags({ data: { doctorDetailsId: id, is_verified: !row.is_verified, reason } }), row.is_verified ? "تم سحب التوثيق" : "تم التوثيق");
        }} />
        <Btn id="tele" label={row.telemedicine_enabled ? "إيقاف الاستشارات أونلاين" : "تفعيل الاستشارات أونلاين"} onClick={() => {
          const reason = askReason("تغيير الاستشارات أونلاين");
          if (!reason) return;
          run("tele", () => adminSetDoctorFlags({ data: { doctorDetailsId: id, telemedicine_enabled: !row.telemedicine_enabled, reason } }), "تم");
        }} />
        <Btn id="comm" label="عمولة خاصة %" onClick={() => {
          const input = window.prompt("نسبة العمولة على الكشف الأونلاين لهذا الطبيب (0–100). اتركه فارغًا لإلغاء التخصيص:");
          if (input === null) return;
          const pct = input.trim() === "" ? null : Number(input);
          if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) return toast.error("نسبة غير صالحة");
          const reason = askReason("تغيير العمولة");
          if (!reason) return;
          run("comm", () => adminSetDoctorFlags({ data: { doctorDetailsId: id, commission_pct: pct, reason } }), "تم تحديث العمولة");
        }} />
        {row.profile_id ? (
          <Link to="/admin/data/$entity" params={{ entity: "profiles" }} search={{ id: str(row.profile_id), user_id: undefined, q: undefined }} className="self-center text-xs text-primary hover:underline">
            الملف الشخصي ←
          </Link>
        ) : null}
        <Link to="/admin/data/$entity" params={{ entity: "clinics" }} search={{ id: undefined, user_id: undefined, q: undefined }} className="self-center text-xs text-primary hover:underline">
          العيادات ←
        </Link>
      </div>
    );
  }

  if (entity.table === "appointments") {
    const id = str(row.id);
    const patchWith = (label: string, patch: Record<string, unknown>) => {
      const reason = askReason(label);
      if (!reason) return;
      run(label, () => adminUpdateAppointment({ data: { appointmentId: id, patch: patch as never, reason } }), "تم تحديث الموعد");
    };
    return (
      <div className="flex flex-wrap gap-2">
        <Btn id="status" label="تغيير الحالة" onClick={() => {
          const s = window.prompt(`الحالة الجديدة (${APPOINTMENT_STATUSES.join(" / ")}):`, str(row.status));
          if (!s || !(APPOINTMENT_STATUSES as readonly string[]).includes(s)) return s ? toast.error("حالة غير معروفة") : undefined;
          patchWith("تغيير الحالة", { status: s });
        }} />
        <Btn id="pay" label="حالة الدفع" onClick={() => {
          const s = window.prompt(`حالة الدفع (${PAYMENT_STATUSES.join(" / ")}):`, str(row.payment_status));
          if (!s || !(PAYMENT_STATUSES as readonly string[]).includes(s)) return s ? toast.error("حالة غير معروفة") : undefined;
          patchWith("تغيير حالة الدفع", { payment_status: s });
        }} />
        <Btn id="time" label="تغيير الموعد" onClick={() => {
          const s = window.prompt("الوقت الجديد (مثال 2026-11-20T10:30:00+02:00):", str(row.scheduled_at));
          if (!s) return;
          patchWith("تغيير وقت الموعد", { scheduled_at: s, appointment_date: s.slice(0, 10) });
        }} />
        <Btn id="reassign" label="نقل لطبيب آخر" onClick={() => {
          const s = window.prompt("معرّف الطبيب الجديد (doctor_details.id):");
          if (!s) return;
          patchWith("نقل الموعد لطبيب آخر", { doctor_id: s.trim(), clinic_id: null });
        }} />
        <Btn id="cancel" label="إلغاء الموعد" tone="danger" onClick={() => patchWith("إلغاء الموعد", { status: "cancelled" })} />
        {row.doctor_id ? (
          <Link to="/admin/data/$entity" params={{ entity: "doctor_details" }} search={{ id: str(row.doctor_id), user_id: undefined, q: undefined }} className="self-center text-xs text-primary hover:underline">
            الطبيب ←
          </Link>
        ) : null}
        {row.patient_id ? (
          <Link to="/admin/data/$entity" params={{ entity: "profiles" }} search={{ id: str(row.patient_id), user_id: undefined, q: undefined }} className="self-center text-xs text-primary hover:underline">
            المريض ←
          </Link>
        ) : null}
      </div>
    );
  }

  if (entity.table === "user_roles" && row.user_id) {
    return (
      <Link to="/admin/data/$entity" params={{ entity: "profiles" }} search={{ id: undefined, user_id: str(row.user_id), q: undefined }} className="text-xs text-primary hover:underline">
        ملف المستخدم ←
      </Link>
    );
  }

  return null;
}
