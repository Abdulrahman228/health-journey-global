import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2,
  Megaphone,
  Plus,
  Pause,
  Play,
  X,
  TrendingUp,
  MousePointerClick,
  CalendarCheck,
  Coins,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import {
  listMySlots,
  upsertSponsoredSlot,
  setSlotStatus,
} from "@/lib/sponsorship.functions";
import { RegionPicker, type RegionSelection } from "@/components/regions/RegionPicker";

export const Route = createFileRoute("/doctor/sponsorship")({
  head: () => ({
    meta: [
      { title: "إعلانات Sponsored — طبيبي" },
      {
        name: "description",
        content: "إدارة حملاتك الإعلانية الممولة على طبيبي. متاحة فقط لاشتراكات Gold.",
      },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  component: SponsorshipPage,
});

interface SlotRow {
  id: string;
  status: string;
  monthly_budget_cents: number;
  daily_cap_cents: number | null;
  cpc_bid_cents: number;
  spent_total_cents: number;
  spent_today_cents: number;
  starts_at: string;
  ends_at: string | null;
  governorate_id: string | null;
  city_id: string | null;
  specialty: string | null;
  governorate: { name_ar: string; name_en: string } | null;
  city: { name_ar: string; name_en: string } | null;
}

interface Stats {
  impressions: number;
  clicks: number;
  bookings: number;
  spent_cents: number;
}

function fmtEgp(cents: number) {
  return `${(cents / 100).toLocaleString("ar-EG")} ج.م`;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "نشط", cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
    paused: { label: "متوقف", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
    pending: { label: "قيد البدء", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
    exhausted: { label: "اكتملت الميزانية", cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
    expired: { label: "منتهية", cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
    cancelled: { label: "ملغاة", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  };
  const s = map[status] ?? { label: status, cls: "bg-muted text-foreground" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

function SponsorshipPage() {
  const { user, role, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const list = useServerFn(listMySlots);
  const upsert = useServerFn(upsertSponsoredSlot);
  const updateStatus = useServerFn(setSlotStatus);

  const [tier, setTier] = useState<"free" | "premium" | "gold" | null>(null);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [stats, setStats] = useState<Stats>({
    impressions: 0,
    clicks: 0,
    bookings: 0,
    spent_cents: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await list();
      setTier(r.tier);
      setSlots(r.slots as unknown as SlotRow[]);
      setStats(r.stats);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (role !== "doctor") return;
    load();
  }, [authLoading, user, role, navigate]);

  if (authLoading || (loading && tier === null)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="جاري التحميل" />
      </div>
    );
  }

  if (role !== "doctor") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center" dir="rtl">
        <p className="text-muted-foreground">صفحة الأطباء فقط.</p>
        <Link to="/" className="mt-3 inline-block text-primary hover:underline">
          العودة للرئيسية
        </Link>
      </div>
    );
  }

  if (tier !== "gold") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center" dir="rtl">
        <Crown className="mx-auto h-12 w-12 text-amber-500" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold">الإعلانات الممولة لاشتراكات Gold فقط</h1>
        <p className="mt-2 text-muted-foreground">
          ارقي لاشتراك Gold لتحجز أماكن Sponsored في أعلى نتائج البحث، وتزيد ظهورك بنسبة 3-5×،
          وتدفع عمولة 10% فقط بدلاً من 15%.
        </p>
        <Link
          to="/pricing"
          className="mt-6 inline-block rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          استعرض خطط الاشتراك
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6" dir="rtl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold">الإعلانات الممولة</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> حملة جديدة
        </button>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        كل النقرات تحسب طبقاً لسعر CPC المحدد. تظهر إعلاناتك في أعلى نتائج البحث بشارة "إعلان"
        حسب لائحة حماية المستهلك.
      </p>

      {/* Stats */}
      <div className="mt-6 grid gap-3 grid-cols-2 md:grid-cols-4">
        <StatCard icon={TrendingUp} label="مشاهدات (30 يوم)" value={stats.impressions.toLocaleString("ar-EG")} />
        <StatCard icon={MousePointerClick} label="نقرات" value={stats.clicks.toLocaleString("ar-EG")} />
        <StatCard icon={CalendarCheck} label="حجوزات" value={stats.bookings.toLocaleString("ar-EG")} />
        <StatCard icon={Coins} label="المصروف" value={fmtEgp(stats.spent_cents)} />
      </div>

      {showForm && (
        <SlotForm
          onCancel={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false);
            await load();
            toast.success("تم حفظ الحملة");
          }}
          submit={upsert}
        />
      )}

      <h2 className="mt-8 text-lg font-bold">حملاتي</h2>

      {slots.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          لا توجد حملات بعد. اضغط "حملة جديدة" لتبدأ.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {slots.map((s) => (
            <li key={s.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">
                      {s.specialty ?? "كل التخصصات"}
                      {s.governorate ? ` · ${s.governorate.name_ar}` : ""}
                      {s.city ? ` · ${s.city.name_ar}` : ""}
                    </h3>
                    <StatusPill status={s.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    ميزانية: {fmtEgp(s.monthly_budget_cents)} / شهر · CPC: {fmtEgp(s.cpc_bid_cents)}
                    {s.daily_cap_cents ? ` · سقف يومي: ${fmtEgp(s.daily_cap_cents)}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    صرف اليوم: {fmtEgp(s.spent_today_cents)} · إجمالي: {fmtEgp(s.spent_total_cents)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {s.status === "active" && (
                    <button
                      type="button"
                      onClick={async () => {
                        await updateStatus({ data: { slotId: s.id, status: "paused" } });
                        await load();
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Pause className="h-3.5 w-3.5" aria-hidden="true" /> إيقاف
                    </button>
                  )}
                  {s.status === "paused" && (
                    <button
                      type="button"
                      onClick={async () => {
                        await updateStatus({ data: { slotId: s.id, status: "active" } });
                        await load();
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden="true" /> تشغيل
                    </button>
                  )}
                  {s.status !== "cancelled" && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm("إلغاء الحملة؟")) return;
                        await updateStatus({ data: { slotId: s.id, status: "cancelled" } });
                        await load();
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-background px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" /> إلغاء
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Icon className="h-4 w-4" aria-hidden={true} />
        {label}
      </div>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function SlotForm({
  onCancel,
  onSaved,
  submit,
}: {
  onCancel: () => void;
  onSaved: () => void;
  submit: ReturnType<typeof useServerFn<typeof upsertSponsoredSlot>>;
}) {
  const [region, setRegion] = useState<RegionSelection>({
    countryId: null,
    governorateId: null,
    cityId: null,
    districtId: null,
  });
  const [specialty, setSpecialty] = useState("");
  const [budget, setBudget] = useState("500");
  const [cpc, setCpc] = useState("3");
  const [dailyCap, setDailyCap] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-5">
      <h3 className="text-base font-bold">تفاصيل الحملة</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        كلما حددت الاستهداف بدقة (محافظة + تخصص) زاد معدل التحويل وانخفض السعر الفعلي.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <h4 className="text-sm font-semibold mb-2">الاستهداف الجغرافي</h4>
          <RegionPicker value={region} onChange={setRegion} required={false} idPrefix="slot" />
        </div>

        <div>
          <label htmlFor="slot-specialty" className="mb-1.5 block text-sm font-medium">
            التخصص (اختياري — اتركه فارغ للظهور لكل التخصصات)
          </label>
          <input
            id="slot-specialty"
            type="text"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder="مثال: قلب، أطفال، أسنان"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label htmlFor="slot-budget" className="mb-1.5 block text-sm font-medium">
              الميزانية الشهرية (ج.م) <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="slot-budget"
              type="number"
              min={100}
              step={50}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              required
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">الحد الأدنى: 100 ج.م</p>
          </div>
          <div>
            <label htmlFor="slot-cpc" className="mb-1.5 block text-sm font-medium">
              سعر النقرة CPC (ج.م) <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="slot-cpc"
              type="number"
              min={0.5}
              step={0.5}
              value={cpc}
              onChange={(e) => setCpc(e.target.value)}
              required
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">المنصوح: 2-5 ج.م</p>
          </div>
          <div>
            <label htmlFor="slot-daily" className="mb-1.5 block text-sm font-medium">
              سقف يومي (اختياري)
            </label>
            <input
              id="slot-daily"
              type="number"
              min={10}
              step={10}
              value={dailyCap}
              onChange={(e) => setDailyCap(e.target.value)}
              placeholder="بدون حد"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await submit({
                  data: {
                    governorateId: region.governorateId,
                    cityId: region.cityId,
                    specialty: specialty.trim() || null,
                    monthlyBudgetCents: Math.round(parseFloat(budget) * 100),
                    cpcBidCents: Math.round(parseFloat(cpc) * 100),
                    dailyCapCents: dailyCap ? Math.round(parseFloat(dailyCap) * 100) : null,
                  },
                });
                onSaved();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "حفظ وتشغيل الحملة"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
