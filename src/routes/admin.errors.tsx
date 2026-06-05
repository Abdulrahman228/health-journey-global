import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AdminNav } from "@/components/admin/AdminNav";
import {
  adminListErrorGroups,
  adminGetErrorLog,
  type ErrorLogGroup,
  type ErrorLogRow,
} from "@/lib/error-logs.functions";
import { Loader2, AlertTriangle, RefreshCw, Eye, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/errors")({
  head: () => ({
    meta: [
      { title: "سجل الأخطاء — لوحة الأدمن" },
      {
        name: "description",
        content: "متابعة الأخطاء الفعلية في الإنتاج (Client / Server / SW).",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminErrorsPage,
});

type Filter = "all" | "fatal" | "error" | "warn" | "info";
type Hours = 1 | 6 | 24 | 72 | 168;

function AdminErrorsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();

  const [hours, setHours] = useState<Hours>(24);
  const [filter, setFilter] = useState<Filter>("all");
  const [rows, setRows] = useState<ErrorLogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ErrorLogRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await adminListErrorGroups({
        data: { userId: user.id, sinceHours: hours, level: filter },
      });
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل الأخطاء");
    } finally {
      setLoading(false);
    }
  }, [user, hours, filter]);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (!isAdmin) {
      navigate({ to: "/dashboard" });
      return;
    }
    load();
  }, [authLoading, roleLoading, user, isAdmin, navigate, load]);

  const openDetail = async (sampleId: string) => {
    if (!user) return;
    try {
      const row = (await adminGetErrorLog({
        data: { userId: user.id, id: sampleId },
      })) as ErrorLogRow | null;
      setDetail(row);
      setDetailOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل التفاصيل");
    }
  };

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8" dir="rtl">
      <AdminNav />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden="true" />
            سجل الأخطاء
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            مجموعات أخطاء فريدة عبر العميل، السيرفر، وعامل الخدمة (آخر {hours} ساعة).
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          <RefreshCw className="h-4 w-4" />
          تحديث
        </button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">المستوى:</span>
        {(["all", "fatal", "error", "warn", "info"] as const).map((lv) => (
          <button
            key={lv}
            type="button"
            onClick={() => setFilter(lv)}
            className={
              "rounded-md border px-3 py-1.5 font-medium transition " +
              (filter === lv
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-accent")
            }
          >
            {lv === "all"
              ? "الكل"
              : lv === "fatal"
                ? "حرجة"
                : lv === "error"
                  ? "خطأ"
                  : lv === "warn"
                    ? "تحذير"
                    : "معلومة"}
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-border" aria-hidden="true" />
        <span className="text-muted-foreground">الفترة:</span>
        {([1, 6, 24, 72, 168] as const).map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setHours(h)}
            className={
              "rounded-md border px-3 py-1.5 font-medium transition " +
              (hours === h
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-accent")
            }
          >
            {h === 1 ? "1س" : h === 6 ? "6س" : h === 24 ? "24س" : h === 72 ? "3أيام" : "أسبوع"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <AlertTriangle
            className="mx-auto h-10 w-10 text-muted-foreground/60"
            aria-hidden="true"
          />
          <p className="mt-3 font-medium text-foreground">لا توجد أخطاء في هذه الفترة 🎉</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full table-auto text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start">العدد</th>
                <th className="px-3 py-2 text-start">المستوى</th>
                <th className="px-3 py-2 text-start">المصدر</th>
                <th className="px-3 py-2 text-start">الرسالة</th>
                <th className="px-3 py-2 text-start">آخر مرة</th>
                <th className="px-3 py-2 text-end">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.fingerprint} className="border-t border-border">
                  <td className="px-3 py-2 font-mono">{g.count}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " +
                        (g.level === "fatal"
                          ? "bg-red-100 text-red-700"
                          : g.level === "error"
                            ? "bg-orange-100 text-orange-700"
                            : g.level === "warn"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-blue-100 text-blue-700")
                      }
                    >
                      {g.level}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{g.source}</td>
                  <td className="max-w-105 truncate px-3 py-2 text-foreground" title={g.message}>
                    {g.message}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(g.lastSeen).toLocaleString("ar-EG")}
                  </td>
                  <td className="px-3 py-2 text-end">
                    <button
                      type="button"
                      onClick={() => openDetail(g.sampleId)}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      عرض
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailOpen && detail ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetailOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between">
              <h2 className="text-lg font-bold text-foreground">تفاصيل الخطأ</h2>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="rounded-md p-1 hover:bg-accent"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="font-medium text-muted-foreground">الرسالة</dt>
                <dd className="mt-0.5 text-foreground">{detail.message}</dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="font-medium text-muted-foreground">المستوى</dt>
                  <dd className="mt-0.5">{detail.level}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">المصدر</dt>
                  <dd className="mt-0.5">{detail.source}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">الوقت</dt>
                  <dd className="mt-0.5">{new Date(detail.createdAt).toLocaleString("ar-EG")}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">المستخدم</dt>
                  <dd className="mt-0.5 font-mono text-xs">{detail.userId ?? "—"}</dd>
                </div>
              </div>
              {detail.url ? (
                <div>
                  <dt className="font-medium text-muted-foreground">الصفحة</dt>
                  <dd className="mt-0.5 break-all text-xs">{detail.url}</dd>
                </div>
              ) : null}
              {detail.userAgent ? (
                <div>
                  <dt className="font-medium text-muted-foreground">User Agent</dt>
                  <dd className="mt-0.5 break-all text-xs text-muted-foreground">{detail.userAgent}</dd>
                </div>
              ) : null}
              {detail.fingerprint ? (
                <div>
                  <dt className="font-medium text-muted-foreground">البصمة</dt>
                  <dd className="mt-0.5 font-mono text-xs">{detail.fingerprint}</dd>
                </div>
              ) : null}
              {detail.stack ? (
                <div>
                  <dt className="font-medium text-muted-foreground">Stack</dt>
                  <dd className="mt-0.5 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
                    {detail.stack}
                  </dd>
                </div>
              ) : null}
              {detail.context && detail.context !== "{}" ? (
                <div>
                  <dt className="font-medium text-muted-foreground">سياق</dt>
                  <dd className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(detail.context), null, 2);
                      } catch {
                        return detail.context;
                      }
                    })()}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}
