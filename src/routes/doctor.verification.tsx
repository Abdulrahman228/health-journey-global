import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BadgeCheck, ShieldCheck, Loader2, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { DoctorDocumentsUploader } from "@/components/verification/DoctorDocumentsUploader";

export const Route = createFileRoute("/doctor/verification")({
  head: () => ({
    meta: [
      { title: "توثيق الطبيب - طبيبي" },
      { name: "description", content: "قدّم بيانات توثيقك من نقابة الأطباء لتفعيل الكشف أون لاين." },
    ],
  }),
  component: VerificationPage,
});

interface DoctorRow {
  id: string;
  syndicate_number: string | null;
  national_id_last4: string | null;
  is_verified: boolean;
  verification_status: string | null;
  verification_notes: string | null;
  verification_submitted_at: string | null;
}

function VerificationPage() {
  const { user, profile, role, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState<DoctorRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [syndicate, setSyndicate] = useState("");
  const [nidLast4, setNidLast4] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (role !== "doctor" || !profile) {
      setLoading(false);
      return;
    }
    supabase
      .from("doctor_details")
      .select("id,syndicate_number,national_id_last4,is_verified,verification_status,verification_notes,verification_submitted_at")
      .eq("profile_id", profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setDoctor(data as DoctorRow);
          setSyndicate(data.syndicate_number ?? "");
          setNidLast4(data.national_id_last4 ?? "");
        }
        setLoading(false);
      });
  }, [authLoading, user, role, profile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctor) return;
    if (!/^\d{4,12}$/.test(syndicate)) {
      toast.error("رقم النقابة لازم يكون من 4 إلى 12 رقم");
      return;
    }
    if (!/^\d{4}$/.test(nidLast4)) {
      toast.error("آخر 4 أرقام من الرقم القومي مطلوبة");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from("doctor_details")
      .update({
        syndicate_number: syndicate,
        national_id_last4: nidLast4,
        verification_status: "pending",
        verification_submitted_at: new Date().toISOString(),
        verification_notes: null,
      })
      .eq("id", doctor.id);
    setSubmitting(false);
    if (error) {
      toast.error("حصل خطأ، جرّب تاني");
      return;
    }
    toast.success("تم إرسال طلب التوثيق، هتتم المراجعة خلال 24-48 ساعة");
    setDoctor({
      ...doctor,
      syndicate_number: syndicate,
      national_id_last4: nidLast4,
      verification_status: "pending",
      verification_submitted_at: new Date().toISOString(),
      verification_notes: null,
    });
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== "doctor" || !doctor) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">صفحة توثيق الأطباء فقط.</p>
        <Link to="/" className="mt-3 inline-block text-primary hover:underline">العودة للرئيسية</Link>
      </div>
    );
  }

  const status = doctor.verification_status ?? "not_submitted";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <ShieldCheck className="h-7 w-7 text-primary" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">توثيق الطبيب</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          التوثيق إلزامي قبل تفعيل الكشف أون لاين طبقاً للائحة نقابة الأطباء 2023.
        </p>
      </div>

      {doctor.is_verified ? (
        <div className="mt-6 rounded-2xl border border-success/30 bg-success/10 p-5 text-center">
          <BadgeCheck className="mx-auto h-8 w-8 text-success" />
          <p className="mt-2 font-semibold text-success">حسابك موثّق</p>
          <p className="mt-1 text-sm text-muted-foreground">
            تظهر شارة "طبيب موثّق" على بروفايلك ونتائج البحث.
          </p>
        </div>
      ) : status === "pending" && doctor.verification_submitted_at ? (
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-center">
          <Clock className="mx-auto h-8 w-8 text-amber-600" />
          <p className="mt-2 font-semibold text-amber-700 dark:text-amber-500">طلبك قيد المراجعة</p>
          <p className="mt-1 text-sm text-muted-foreground">
            هتتم المراجعة خلال 24-48 ساعة. هنبعتلك إشعار فور صدور القرار.
          </p>
        </div>
      ) : status === "rejected" ? (
        <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-5">
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            <p className="font-semibold">تم رفض الطلب</p>
          </div>
          {doctor.verification_notes && (
            <p className="mt-2 text-sm text-foreground">السبب: {doctor.verification_notes}</p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">صحّح البيانات وأعد التقديم.</p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium">رقم القيد بنقابة الأطباء *</label>
          <input
            type="text"
            inputMode="numeric"
            value={syndicate}
            onChange={(e) => setSyndicate(e.target.value.replace(/\D/g, ""))}
            placeholder="مثال: 123456"
            disabled={doctor.is_verified}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            نتحقق من الرقم يدوياً مع قاعدة بيانات النقابة.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">آخر 4 أرقام من الرقم القومي *</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={nidLast4}
            onChange={(e) => setNidLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="####"
            disabled={doctor.is_verified}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            بتُستخدم فقط للمطابقة مع سجلات النقابة - مش بنحفظ الرقم كامل.
          </p>
        </div>

        {!doctor.is_verified && (
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "جارٍ الإرسال..." : status === "pending" ? "تحديث البيانات" : "إرسال للمراجعة"}
          </button>
        )}
      </form>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        بمتابعتك أنت توافق على معالجة بياناتك طبقاً لقانون حماية البيانات 151/2020.
      </p>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6">
        <DoctorDocumentsUploader />
      </div>
    </div>
  );
}
