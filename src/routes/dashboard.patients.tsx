/**
 * /dashboard/patients — doctor's patient roster.
 *
 * Lists all patients the logged-in doctor has ever treated (across
 * medical_records + appointments), with quick search by name or ID.
 * Clicking a row opens /dashboard/patient/$id for full history.
 *
 * Private page — noindex, nofollow.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { searchMyPatients } from "@/lib/emr.functions";
import { Loader2, Search, User, Stethoscope } from "lucide-react";

export const Route = createFileRoute("/dashboard/patients")({
  head: () => ({
    meta: [
      { title: "مرضائي | لوحة الطبيب — طبيبي" },
      { name: "description", content: "إدارة مرضى الطبيب وعرض تاريخهم الطبي." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PatientsRosterPage,
});

interface PatientCard {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  city: string | null;
  lastSeen: string | null;
}

function PatientsRosterPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<PatientCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(
    async (qStr: string) => {
      if (!user) return;
      setLoading(true);
      try {
        const data = await searchMyPatients({ data: { userId: user.id, q: qStr } });
        setRows(data as PatientCard[]);
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    load("");
  }, [authLoading, user, navigate, load]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  const empty = !loading && rows.length === 0;

  const subtitle = useMemo(
    () =>
      q
        ? `${rows.length} نتيجة بحث`
        : `${rows.length} مريض في سجلك`,
    [q, rows.length],
  );

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">مرضائي</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </header>

      <div className="relative mb-6">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <label className="sr-only" htmlFor="patient-search">
          ابحث عن مريض
        </label>
        <input
          id="patient-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث بالاسم أو معرّف المريض…"
          className="w-full rounded-lg border border-border bg-card py-2.5 ps-10 pe-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : empty ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Stethoscope className="mx-auto h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
          <p className="mt-3 font-medium text-foreground">
            {q ? "لا يوجد مرضى مطابقون" : "لم تستقبل أي مرضى بعد"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            عندما يحجز مريض موعد معك، سيظهر هنا تلقائياً.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {rows.map((p) => (
            <li key={p.id}>
              <Link
                to="/dashboard/patient/$id"
                params={{ id: p.id }}
                className="flex h-full items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {p.avatarUrl ? (
                  <img
                    src={p.avatarUrl}
                    alt=""
                    width={48}
                    height={48}
                    loading="lazy"
                    decoding="async"
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10"
                    aria-hidden="true"
                  >
                    <User className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-foreground">
                    {p.fullName || "بدون اسم"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.city ? `${p.city} · ` : ""}
                    {p.lastSeen
                      ? `آخر زيارة ${new Date(p.lastSeen).toLocaleDateString("ar-EG")}`
                      : "—"}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
