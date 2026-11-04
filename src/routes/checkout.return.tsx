import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string; cr?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
    cr: typeof search.cr === "string" ? search.cr : undefined,
  }),
  component: CheckoutReturn,
  head: () => ({
    meta: [{ title: "تم الدفع - طبانا" }],
  }),
});

function CheckoutReturn() {
  const { session_id: sessionIdRaw, cr } = Route.useSearch();
  const sessionId = sessionIdRaw ?? cr;

  return (
    <div className="container mx-auto max-w-xl px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {sessionId ? (
          <>
            <CheckCircle2 className="mx-auto h-16 w-16 text-success" />
            <h1 className="mt-4 text-2xl font-bold">تم الدفع بنجاح</h1>
            <p className="mt-2 text-muted-foreground">
              تم تفعيل اشتراكك. قد يستغرق ظهور الميزات الجديدة بضع ثوانٍ.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">رقم الجلسة: {sessionId}</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">لم نتمكن من قراءة بيانات الجلسة</h1>
            <p className="mt-2 text-muted-foreground">حاول مرة أخرى من صفحة الأسعار.</p>
          </>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Link
            to="/dashboard"
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            لوحة التحكم
          </Link>
          <Link
            to="/pricing"
            className="rounded-lg border border-border px-5 py-2 text-sm font-medium hover:bg-muted"
          >
            عرض الخطط
          </Link>
        </div>
      </div>
    </div>
  );
}
