import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2, Database, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AdminShell } from "@/components/admin/AdminNav";
import { AdminTable } from "@/components/admin/AdminTable";
import { getEntity, GROUP_LABELS } from "@/lib/admin/registry";

type Search = { id?: string; user_id?: string; q?: string };

export const Route = createFileRoute("/admin/data/$entity")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.entity} — بيانات الأدمن | طبانا` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    id: typeof s.id === "string" ? s.id : undefined,
    user_id: typeof s.user_id === "string" ? s.user_id : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: AdminEntityPage,
});

function AdminEntityPage() {
  const { entity: name } = Route.useParams();
  const search = Route.useSearch();
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const entity = getEntity(name);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) navigate({ to: "/login" });
  }, [authLoading, roleLoading, user, navigate]);

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-3 font-semibold">هذه الصفحة للأدمن فقط.</p>
      </div>
    );
  }

  const initialFilters = [
    ...(search.id ? [{ column: entity?.pk ?? "id", op: "eq" as const, value: search.id }] : []),
    ...(search.user_id && entity?.columns.some((c) => c.name === "user_id") ? [{ column: "user_id", op: "eq" as const, value: search.user_id }] : []),
  ];

  return (
    <AdminShell>
      {!entity ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="font-semibold">لا يوجد كيان باسم «{name}»</p>
          <Link to="/admin/data" className="mt-3 inline-block text-sm text-primary hover:underline">كل البيانات</Link>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">
                <Link to="/admin/data" className="hover:text-primary">كل البيانات</Link> › {GROUP_LABELS[entity.group]}
              </p>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-foreground">
                <Database className="h-6 w-6 text-primary" /> {entity.label}
                <code className="rounded bg-secondary px-2 py-0.5 text-sm font-normal text-secondary-foreground" dir="ltr">{entity.table}</code>
              </h1>
            </div>
            <div className="text-xs text-muted-foreground">
              {entity.readOnly ? "قراءة فقط" : `التعديل: ${entity.editLevel} · الحذف: ${entity.deleteLevel}`}
            </div>
          </div>
          <AdminTable entity={entity} initialFilters={initialFilters} />
        </>
      )}
    </AdminShell>
  );
}
