/**
 * /rx/verify/$number — public prescription verification page.
 *
 * Used by pharmacies (or anyone) scanning the QR on a Tabibi
 * prescription. Returns ONLY authenticity metadata — never any PHI.
 *
 * Indexable by search engines is fine because no PHI is exposed, but
 * we noindex the parameterized variant to avoid pharmacy-bot indexing
 * patient-specific URLs.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { verifyPrescription, type PrescriptionVerification } from "@/lib/emr.functions";
import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldCheck, XCircle } from "lucide-react";

export const Route = createFileRoute("/rx/verify/$number")({
  head: ({ params }) => ({
    meta: [
      { title: `التحقق من الوصفة ${params.number} | طبيبي` },
      {
        name: "description",
        content:
          "تحقّق من صحة الوصفة الطبية الصادرة عبر منصة طبيبي. صفحة موثوقة للصيدليات والمرضى.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VerifyRxPage,
});

function VerifyRxPage() {
  const { number } = Route.useParams();
  const [data, setData] = useState<PrescriptionVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await verifyPrescription({
        data: { prescriptionNumber: number },
      });
      if (cancelled) return;
      if (!v) setNotFound(true);
      else setData(v);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [number]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <header className="mb-6 text-center">
        <ShieldCheck className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-bold">التحقق من وصفة طبية</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          منصة طبيبي · Tabibi Health
        </p>
      </header>

      {notFound || !data ? (
        <div
          role="alert"
          className="rounded-xl border-2 border-destructive bg-destructive/5 p-6 text-center"
        >
          <XCircle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold text-destructive">
            الوصفة غير موجودة
          </h2>
          <p className="mt-1 text-sm text-foreground">
            رقم الوصفة <span className="font-mono font-bold">{number}</span> غير
            مسجّل لدينا. تأكّد من رقم الوصفة أو تواصل مع الطبيب المُصدِر.
          </p>
        </div>
      ) : (
        <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <StatusBadge status={data.status} />

          <dl className="mt-5 space-y-3 text-sm">
            <Row label="رقم الوصفة">
              <span className="font-mono text-base font-bold">
                {data.prescriptionNumber}
              </span>
            </Row>
            <Row label="الطبيب المُصدِر">
              <span className="font-semibold">د. {data.doctorName ?? "—"}</span>
            </Row>
            {data.doctorLicense && (
              <Row label="رقم الترخيص">
                <span className="font-mono">{data.doctorLicense}</span>
              </Row>
            )}
            <Row label="تاريخ الإصدار">
              {new Date(data.issuedAt).toLocaleDateString("ar-EG", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </Row>
            <Row label="صالحة حتى">
              {data.validUntil
                ? new Date(data.validUntil).toLocaleDateString("ar-EG", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "غير محدّد"}
            </Row>
            <Row label="عدد الأدوية">
              {data.itemCount.toLocaleString("ar-EG")} دواء
            </Row>
          </dl>

          <p className="mt-6 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            تُعرض بيانات التحقّق فقط؛ تفاصيل الأدوية والمريض محميّة لأسباب
            الخصوصية. اطلبها من المريض مباشرةً.
          </p>
        </article>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: PrescriptionVerification["status"] }) {
  const map = {
    active: {
      icon: CheckCircle2,
      bg: "bg-emerald-50 dark:bg-emerald-950",
      fg: "text-emerald-800 dark:text-emerald-200",
      border: "border-emerald-300",
      label: "وصفة سارية وصحيحة",
    },
    dispensed: {
      icon: CheckCircle2,
      bg: "bg-sky-50 dark:bg-sky-950",
      fg: "text-sky-800 dark:text-sky-200",
      border: "border-sky-300",
      label: "تم صرفها مسبقاً",
    },
    expired: {
      icon: Clock,
      bg: "bg-amber-50 dark:bg-amber-950",
      fg: "text-amber-800 dark:text-amber-200",
      border: "border-amber-300",
      label: "منتهية الصلاحية",
    },
    cancelled: {
      icon: AlertTriangle,
      bg: "bg-destructive/10",
      fg: "text-destructive",
      border: "border-destructive",
      label: "ملغاة",
    },
  }[status];
  const Icon = map.icon;
  return (
    <div
      role="status"
      className={`flex items-center gap-2 rounded-lg border-2 ${map.border} ${map.bg} ${map.fg} px-4 py-3 text-base font-bold`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      {map.label}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end text-foreground">{children}</dd>
    </div>
  );
}
