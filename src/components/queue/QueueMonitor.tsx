import { Clock, Loader2, Users } from "lucide-react";
import { useQueue } from "@/hooks/useQueue";

function formatWait(minutes: number): string {
  if (minutes <= 0) return "حان دورك";
  if (minutes < 60) return `~${Math.round(minutes)} دقيقة`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m ? `~${h} ساعة و${m} دقيقة` : `~${h} ساعة`;
}

/**
 * Patient-facing live queue card: shows the current position and estimated wait,
 * updating instantly via the useQueue realtime subscription.
 */
export function QueueMonitor({ appointmentId }: { appointmentId: string }) {
  const q = useQueue(appointmentId);

  if (q.isLoading) {
    return (
      <div className="flex justify-center rounded-2xl border border-border bg-card py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }
  if (!q.found) return null;

  const terminal = q.status === "completed" || q.status === "cancelled" || q.status === "no_show";

  return (
    <div className="rounded-2xl border border-border bg-card p-5" dir="rtl">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Users className="h-4 w-4 text-primary" aria-hidden="true" />
        طابور العيادة
      </div>

      {terminal ? (
        <p className="mt-3 text-sm text-muted-foreground">انتهى هذا الحجز.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted/40 p-3 text-center">
            <p className="text-xs text-muted-foreground">الترتيب</p>
            <p className="mt-1 text-3xl font-bold text-foreground">{q.position}</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3 text-center">
            <p className="text-xs text-muted-foreground">الوقت المتبقي تقريباً</p>
            <p className="mt-1 text-lg font-bold text-primary">{formatWait(q.waitMinutes)}</p>
          </div>
        </div>
      )}

      {q.currentlyServing != null && !terminal && (
        <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          يتم الآن خدمة رقم #{q.currentlyServing}
        </p>
      )}
    </div>
  );
}
