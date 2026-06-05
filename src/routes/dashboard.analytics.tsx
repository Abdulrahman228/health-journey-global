/**
 * /dashboard/analytics — Premium/Gold doctor analytics.
 *
 * Free-tier doctors see an upsell card. Premium/Gold get:
 *   - Profile views & bookings trend (last 30 days)
 *   - View → booking conversion rate
 *   - Revenue trend
 *   - Online vs in-person mix
 *   - Top patient cities
 *
 * Private — noindex, nofollow.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useCurrency } from "@/hooks/useCurrency";
import {
  getDoctorAnalytics,
  type DoctorAnalytics,
} from "@/lib/analytics.functions";
import {
  Activity,
  ArrowUpRight,
  Crown,
  Eye,
  Loader2,
  MapPin,
  Sparkles,
  Stethoscope,
  Target,
  TrendingUp,
  Video,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/dashboard/analytics")({
  head: () => ({
    meta: [
      { title: "تحليلات | لوحة الطبيب — طبيبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t, isRTL } = useLanguage();
  const { formatPrice } = useCurrency();
  const navigate = useNavigate();
  const [data, setData] = useState<DoctorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    let alive = true;
    setLoading(true);
    getDoctorAnalytics({ data: { userId: user.id } })
      .then((r) => alive && setData(r))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [authLoading, user, navigate]);

  if (loading || authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-10">
        <p className="text-muted-foreground">
          {t(
            "Couldn't load analytics. Please try again.",
            "تعذّر تحميل التحليلات. أعد المحاولة.",
          )}
        </p>
      </div>
    );
  }

  // ---- Free tier upsell ----
  if (!data.hasAccess) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-amber-500" />
          {t("Doctor Analytics", "تحليلات الطبيب")}
        </h1>
        <p className="text-muted-foreground mb-6">
          {t(
            "Unlock detailed insights into how patients discover and book you.",
            "اكتشف كيف يجدك المرضى ومتى يحجزون — متاح في باقتي بريميوم وجولد.",
          )}
        </p>

        <div className="bg-linear-to-br from-amber-50 to-yellow-100 dark:from-amber-950/30 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <Crown className="h-7 w-7 text-amber-600 shrink-0" />
            <div>
              <h2 className="text-lg font-bold mb-1">
                {t("Premium feature", "ميزة بريميوم")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(
                  "See profile views, conversion, revenue trends, and patient demographics.",
                  "اطّلع على المشاهدات ومعدل التحويل واتجاه الإيرادات وتوزيع المرضى الجغرافي.",
                )}
              </p>
            </div>
          </div>

          <ul className="space-y-2 text-sm mb-6">
            <li className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-amber-600" />
              {t("Profile views over time", "المشاهدات اليومية لملفك")}
            </li>
            <li className="flex items-center gap-2">
              <Target className="h-4 w-4 text-amber-600" />
              {t("View → booking conversion", "معدل تحويل المشاهدات إلى حجوزات")}
            </li>
            <li className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-600" />
              {t("Revenue trend (30 days)", "اتجاه الإيرادات خلال 30 يوماً")}
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-amber-600" />
              {t("Top patient cities", "أكثر المدن طلباً")}
            </li>
          </ul>

          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold px-5 py-3 rounded-xl transition"
          >
            <Crown className="h-4 w-4" />
            {t("Upgrade now", "ترقية الباقة الآن")}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  // ---- Premium/Gold view ----
  const ccy = "EGP";
  const series = data.series;
  const byTypeData = [
    { name: t("Online", "أونلاين"), value: data.byType.online, color: "#0EA5E9" },
    { name: t("In-person", "حضوري"), value: data.byType.in_person, color: "#10B981" },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            {t("Doctor Analytics", "تحليلات الطبيب")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              `${data.range.from} → ${data.range.to} (last 30 days)`,
              `${data.range.from} → ${data.range.to} (آخر 30 يوماً)`,
            )}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 bg-linear-to-r from-amber-400 to-yellow-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
          <Crown className="h-3 w-3" />
          {data.tier === "gold"
            ? t("Gold", "جولد")
            : t("Premium", "بريميوم")}
        </span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard
          icon={<Eye className="h-4 w-4" />}
          label={t("Profile views", "المشاهدات")}
          value={data.totals.views.toLocaleString()}
          tone="sky"
        />
        <KpiCard
          icon={<Stethoscope className="h-4 w-4" />}
          label={t("Bookings", "الحجوزات")}
          value={data.totals.bookings.toLocaleString()}
          tone="green"
        />
        <KpiCard
          icon={<Target className="h-4 w-4" />}
          label={t("Conversion", "التحويل")}
          value={`${data.totals.conversionPct}%`}
          tone="indigo"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label={t("Revenue", "الإيرادات")}
          value={formatPrice(data.totals.revenue, ccy)}
          tone="amber"
        />
      </div>

      {/* Trend chart */}
      <section className="bg-card border border-border rounded-2xl p-4 mb-6">
        <h2 className="font-semibold mb-3">
          {t("Views & bookings (30 days)", "المشاهدات والحجوزات (30 يوم)")}
        </h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 12, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="g-views" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g-book" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(d) => String(d).slice(5)}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
                labelFormatter={(d) => String(d)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="views"
                name={t("Views", "مشاهدات")}
                stroke="#0EA5E9"
                fill="url(#g-views)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="bookings"
                name={t("Bookings", "حجوزات")}
                stroke="#10B981"
                fill="url(#g-book)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Revenue + Type mix */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <section className="bg-card border border-border rounded-2xl p-4">
          <h2 className="font-semibold mb-3">
            {t("Daily revenue", "الإيرادات اليومية")}
          </h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d) => String(d).slice(5)}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => formatPrice(Number(v), ccy)}
                />
                <Bar dataKey="revenue" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-card border border-border rounded-2xl p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Video className="h-4 w-4" />
            {t("Booking type", "نوع الحجز")}
          </h2>
          {data.byType.online + data.byType.in_person === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              {t("No bookings in this range yet.", "لا توجد حجوزات في هذه الفترة بعد.")}
            </p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byTypeData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    innerRadius={40}
                    paddingAngle={2}
                  >
                    {byTypeData.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Top cities */}
      <section className="bg-card border border-border rounded-2xl p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          {t("Top patient cities", "أكثر المدن طلباً")}
        </h2>
        {data.topCities.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {t("No city data yet.", "لا توجد بيانات مدن بعد.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {data.topCities.map((c) => (
              <li key={c.city} className="flex items-center justify-between text-sm">
                <span className="truncate">{c.city}</span>
                <span className="font-semibold tabular-nums">{c.bookings}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "sky" | "green" | "indigo" | "amber";
}) {
  const tones: Record<string, string> = {
    sky: "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300 border-sky-200 dark:border-sky-800",
    green:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    indigo:
      "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
    amber:
      "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  };
  return (
    <div className={`border rounded-xl p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-xs opacity-80 mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
