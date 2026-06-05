/**
 * /rx/$id — printable prescription page with QR verification code.
 *
 * Authorized access only (patient / doctor / admin). The QR encodes
 * the verification URL `${SITE_URL}/rx/verify/{prescriptionNumber}`
 * for pharmacies to validate authenticity.
 *
 * Print stylesheet hides chrome and shows clean A4 layout.
 * noindex, nofollow — private medical data.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "@/hooks/useAuth";
import { getPrescriptionView, type PrescriptionView } from "@/lib/emr.functions";
import { siteConfig } from "@/lib/seo";
import { AlertTriangle, Loader2, Printer, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/rx/$id")({
  head: () => ({
    meta: [
      { title: "وصفة طبية | طبيبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PrescriptionPrintPage,
});

function PrescriptionPrintPage() {
  const { id } = Route.useParams();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<PrescriptionView | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    let cancelled = false;
    (async () => {
      const view = await getPrescriptionView({
        data: { userId: user.id, prescriptionId: id },
      });
      if (cancelled) return;
      if (!view) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setData(view);
      // Generate QR with verification URL
      const verifyUrl = `${siteConfig.url}/rx/verify/${view.prescription.prescriptionNumber}`;
      try {
        const url = await QRCode.toDataURL(verifyUrl, {
          margin: 1,
          width: 220,
          errorCorrectionLevel: "M",
        });
        if (!cancelled) setQrDataUrl(url);
      } catch {
        /* ignore — page still functional */
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, id, navigate]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold">الوصفة غير متاحة</h1>
        <p className="mt-2 text-muted-foreground">
          إما أنها غير موجودة أو ليس لديك صلاحية الاطلاع عليها.
        </p>
      </div>
    );
  }

  const { prescription, record, patient, doctor } = data;
  const issuedAr = new Date(prescription.createdAt).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const validUntilAr = prescription.validUntil
    ? new Date(prescription.validUntil).toLocaleDateString("ar-EG", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  return (
    <div className="rx-page mx-auto max-w-3xl px-6 py-8 print:p-0">
      {/* Toolbar — hidden on print */}
      <div className="rx-toolbar mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-xl font-bold text-foreground">وصفة طبية</h1>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          طباعة / حفظ PDF
        </button>
      </div>

      <article className="rx-sheet rounded-xl border border-border bg-white p-8 text-slate-900 shadow-sm print:border-0 print:shadow-none">
        {/* Header */}
        <header className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <div className="text-lg font-extrabold tracking-tight">طبيبي · Tabibi</div>
            <div className="mt-0.5 text-xs text-slate-600">
              منصة الرعاية الصحية الموحّدة
            </div>
            <div className="mt-4">
              <div className="text-base font-bold">
                د. {doctor.name ?? "—"}
              </div>
              {doctor.specialty && (
                <div className="text-sm text-slate-700">{doctor.specialty}</div>
              )}
              {doctor.licenseNumber && (
                <div className="mt-0.5 text-xs text-slate-500">
                  ترخيص رقم: {doctor.licenseNumber}
                </div>
              )}
              {doctor.phone && (
                <div className="text-xs text-slate-500">{doctor.phone}</div>
              )}
            </div>
          </div>
          <div className="text-end">
            <div className="text-xs text-slate-500">رقم الوصفة</div>
            <div className="font-mono text-base font-bold">
              {prescription.prescriptionNumber}
            </div>
            <div className="mt-3 text-xs text-slate-500">تاريخ الإصدار</div>
            <div className="text-sm">{issuedAr}</div>
            <div className="mt-2 text-xs text-slate-500">صالحة حتى</div>
            <div className="text-sm">{validUntilAr}</div>
          </div>
        </header>

        {/* Patient */}
        <section className="mt-5 grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">المريض</div>
            <div className="mt-0.5 font-semibold">{patient.name ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">تاريخ الزيارة</div>
            <div className="mt-0.5 font-semibold">
              {new Date(record.visitDate).toLocaleDateString("ar-EG", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
          </div>
        </section>

        {/* Allergy alert */}
        {patient.allergies.length > 0 && (
          <aside
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm text-red-900"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <div>
              <span className="font-bold">تحذير حساسيات: </span>
              {patient.allergies.join("، ")}
            </div>
          </aside>
        )}

        {/* Diagnosis */}
        {record.diagnosis.length > 0 && (
          <section className="mt-4 text-sm">
            <span className="font-bold">التشخيص: </span>
            {record.diagnosis.join("، ")}
            {record.icd10Codes.length > 0 && (
              <span className="text-slate-500"> ({record.icd10Codes.join(", ")})</span>
            )}
          </section>
        )}

        {/* Rx items table */}
        <section className="mt-5">
          <h2 className="mb-3 text-base font-bold">℞ الأدوية الموصوفة</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-start">
                <th scope="col" className="py-2 text-start font-semibold">الدواء</th>
                <th scope="col" className="py-2 text-start font-semibold">الجرعة</th>
                <th scope="col" className="py-2 text-start font-semibold">التكرار</th>
                <th scope="col" className="py-2 text-start font-semibold">المدة</th>
                <th scope="col" className="py-2 text-start font-semibold">الإعطاء</th>
                <th scope="col" className="py-2 text-start font-semibold">الكمية</th>
              </tr>
            </thead>
            <tbody>
              {prescription.items.map((it, idx) => (
                <tr key={it.id} className="border-b border-slate-200 align-top">
                  <td className="py-2 pe-3">
                    <div className="font-semibold">
                      {idx + 1}. {it.drugName}
                    </div>
                    {it.activeIngredient && (
                      <div className="text-xs text-slate-500">{it.activeIngredient}</div>
                    )}
                    {it.instructions && (
                      <div className="mt-1 text-xs italic text-slate-600">
                        {it.instructions}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pe-3">{it.dosage}</td>
                  <td className="py-2 pe-3">{it.frequency}</td>
                  <td className="py-2 pe-3">{it.duration}</td>
                  <td className="py-2 pe-3">{it.route ?? "—"}</td>
                  <td className="py-2">{it.quantity ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {prescription.notes && (
          <section className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
            <span className="font-bold">ملاحظات الطبيب: </span>
            {prescription.notes}
          </section>
        )}

        {/* Footer: signature + QR */}
        <footer className="mt-8 flex items-end justify-between border-t border-slate-300 pt-5">
          <div className="max-w-xs">
            {/* Live signature/stamp images if doctor uploaded them */}
            <div className="flex items-end gap-2 min-h-[48px]">
              {doctor.signatureUrl && (
                <img
                  src={doctor.signatureUrl}
                  alt="توقيع الطبيب"
                  className="h-12 object-contain"
                />
              )}
              {doctor.stampUrl && (
                <img
                  src={doctor.stampUrl}
                  alt="ختم الطبيب"
                  className="h-16 object-contain"
                />
              )}
            </div>
            <div className="border-b border-slate-400 pb-1 text-center text-sm font-bold mt-1">
              توقيع وختم الطبيب
            </div>
            <div className="mt-1 text-center text-xs text-slate-500">
              د. {doctor.name ?? "—"}
            </div>
            <div className="mt-3 flex items-center gap-1 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              توقيع رقمي معتمد عبر منصة طبيبي
            </div>
          </div>
          <div className="text-center">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR للتحقق من رقم الوصفة ${prescription.prescriptionNumber}`}
                width={120}
                height={120}
                className="border border-slate-200"
              />
            ) : (
              <div className="h-[120px] w-[120px] border border-slate-200 bg-slate-50" aria-hidden="true" />
            )}
            <div className="mt-1 text-[10px] text-slate-500">امسح للتحقق</div>
          </div>
        </footer>
      </article>

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white; }
          .rx-toolbar, header[role="banner"], footer[role="contentinfo"], nav { display: none !important; }
          .rx-sheet { box-shadow: none !important; border: 0 !important; padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}
