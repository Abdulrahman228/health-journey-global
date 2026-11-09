import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AdminShell } from "@/components/admin/AdminNav";
import { entitiesByGroup, ENTITIES } from "@/lib/admin/registry";
import { adminEntityCounts } from "@/lib/admin/data";

export const Route = createFileRoute("/admin/data/")({
  head: () => ({
    meta: [
      { title: "كل البيانات — لوحة الأدمن | طبانا" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminDataIndex,
});

function AdminDataIndex() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const groups = entitiesByGroup();

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) navigate({ to: "/login" });
  }, [authLoading, roleLoading, user, navigate]);

  const counts = useQuery({
    queryKey: ["admin-entity-counts"],
    queryFn: () => adminEntityCounts({ data: { entities: Object.keys(ENTITIES) } }),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  if (authLoading || roleLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-3 font-semibold">هذه الصفحة للأدمن فقط.</p>
      </div>
    );
  }

  return (
    <AdminShell>
      <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
        <Database className="h-6 w-6 text-primary" /> كل البيانات
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        كل جدول في النظام ({Object.keys(ENTITIES).length}) — عرض، بحث، فلترة، تعديل، إضافة، حذف وتصدير. كل عملية تُسجَّل في سجل التدقيق.
      </p>
      <div className="mt-6 space-y-6">
        {groups.map((g) => (
          <section key={g.group}>
            <h2 className="mb-2 text-sm font-bold text-muted-foreground">{g.label}</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.entities.map((e) => (
                <Link
                  key={e.table}
                  to="/admin/data/$entity"
                  params={{ entity: e.table }}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 transition hover:border-primary/40 hover:shadow-sm"
                >
                  <span>
                    <span className="block font-semibold text-foreground">{e.label}</span>
                    <code className="block text-xs text-muted-foreground" dir="ltr">{e.table}</code>
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground tabular-nums">
                    {counts.data?.counts[e.table] ?? "…"}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
