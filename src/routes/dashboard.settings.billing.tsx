/**
 * /dashboard/settings/billing — doctor's payout method + tax info.
 *
 * Private — noindex, nofollow.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  getMyBillingSettings,
  upsertMyBillingSettings,
  type BillingSettings,
} from "@/lib/accounting.functions";
import { Banknote, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/settings/billing")({
  head: () => ({
    meta: [
      { title: "إعدادات الدفع | لوحة الطبيب — طبيبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BillingSettingsPage,
});

const METHODS: Array<{ v: BillingSettings["payoutMethod"]; l: string }> = [
  { v: "bank", l: "تحويل بنكي" },
  { v: "instapay", l: "InstaPay" },
  { v: "vodafone_cash", l: "فودافون كاش" },
  { v: "wise", l: "Wise" },
  { v: "manual", l: "يدوي (تواصل مع الإدارة)" },
];

function BillingSettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BillingSettings | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const s = await getMyBillingSettings({ data: { userId: user.id } });
    setForm(s);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    load();
  }, [authLoading, user, navigate, load]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !form) return;
    setSaving(true);
    const res = await upsertMyBillingSettings({
      data: {
        userId: user.id,
        payoutMethod: form.payoutMethod,
        accountHolder: form.accountHolder,
        bankName: form.bankName,
        ibanOrAccount: form.ibanOrAccount,
        swift: form.swift,
        vodafoneNumber: form.vodafoneNumber,
        instapayHandle: form.instapayHandle,
        taxId: form.taxId,
        vatRegistered: form.vatRegistered,
      },
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("فشل الحفظ: " + res.error);
      return;
    }
    toast.success("تم حفظ بيانات الدفع");
  };

  if (authLoading || loading || !form) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const m = form.payoutMethod;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Banknote className="h-6 w-6 text-primary" aria-hidden="true" />
          إعدادات الدفع
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          البيانات اللازمة لتحويل أرباحك. لا تشاركها مع أي طرف ثالث.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-xl border border-border bg-card p-6"
      >
        <div>
          <label className="text-sm font-semibold text-foreground">طريقة استلام الأرباح</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {METHODS.map((opt) => (
              <label
                key={opt.v}
                className={
                  "cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition " +
                  (m === opt.v
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted")
                }
              >
                <input
                  type="radio"
                  className="sr-only"
                  name="method"
                  value={opt.v}
                  checked={m === opt.v}
                  onChange={() =>
                    setForm((f) => (f ? { ...f, payoutMethod: opt.v } : f))
                  }
                />
                {opt.l}
              </label>
            ))}
          </div>
        </div>

        <Field label="اسم صاحب الحساب">
          <input
            type="text"
            value={form.accountHolder ?? ""}
            onChange={(e) =>
              setForm((f) => (f ? { ...f, accountHolder: e.target.value || null } : f))
            }
            className={INPUT_CLS}
          />
        </Field>

        {m === "bank" && (
          <>
            <Field label="اسم البنك">
              <input
                type="text"
                value={form.bankName ?? ""}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, bankName: e.target.value || null } : f))
                }
                className={INPUT_CLS}
              />
            </Field>
            <Field label="رقم الحساب / IBAN">
              <input
                type="text"
                value={form.ibanOrAccount ?? ""}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, ibanOrAccount: e.target.value || null } : f,
                  )
                }
                className={INPUT_CLS}
                dir="ltr"
              />
            </Field>
            <Field label="SWIFT / BIC (للتحويلات الدولية)">
              <input
                type="text"
                value={form.swift ?? ""}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, swift: e.target.value || null } : f))
                }
                className={INPUT_CLS}
                dir="ltr"
              />
            </Field>
          </>
        )}

        {m === "instapay" && (
          <Field label="معرّف InstaPay" hint="مثل yourname@bankname">
            <input
              type="text"
              value={form.instapayHandle ?? ""}
              onChange={(e) =>
                setForm((f) =>
                  f ? { ...f, instapayHandle: e.target.value || null } : f,
                )
              }
              className={INPUT_CLS}
              dir="ltr"
            />
          </Field>
        )}

        {m === "vodafone_cash" && (
          <Field label="رقم فودافون كاش">
            <input
              type="tel"
              value={form.vodafoneNumber ?? ""}
              onChange={(e) =>
                setForm((f) =>
                  f ? { ...f, vodafoneNumber: e.target.value || null } : f,
                )
              }
              className={INPUT_CLS}
              dir="ltr"
            />
          </Field>
        )}

        {m === "wise" && (
          <Field label="بريد Wise المرتبط بالحساب">
            <input
              type="email"
              value={form.instapayHandle ?? ""}
              onChange={(e) =>
                setForm((f) =>
                  f ? { ...f, instapayHandle: e.target.value || null } : f,
                )
              }
              className={INPUT_CLS}
              dir="ltr"
            />
          </Field>
        )}

        <div className="border-t border-border pt-5">
          <h2 className="text-base font-semibold text-foreground">البيانات الضريبية</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="رقم البطاقة الضريبية" hint="اختياري">
              <input
                type="text"
                value={form.taxId ?? ""}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, taxId: e.target.value || null } : f))
                }
                className={INPUT_CLS}
              />
            </Field>
            <label className="flex items-center gap-2 self-end text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={form.vatRegistered}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, vatRegistered: e.target.checked } : f))
                }
                className="h-4 w-4 accent-primary"
              />
              مسجّل في ضريبة القيمة المضافة
            </label>
          </div>
        </div>

        <div className="rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground">
          <strong className="text-foreground">عمولة المنصة الحالية:</strong>{" "}
          {form.platformFeePct}% من قيمة كل كشف.
          <br />
          <strong className="text-foreground">الحد الأدنى للسحب:</strong>{" "}
          {form.minimumPayout} EGP.
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            حفظ الإعدادات
          </button>
        </div>
      </form>
    </div>
  );
}

const INPUT_CLS =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
