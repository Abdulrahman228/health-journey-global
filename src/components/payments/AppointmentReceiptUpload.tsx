import { useRef, useState } from "react";
import { CheckCircle2, FileImage, Loader2, UploadCloud, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Patient uploads their transfer receipt for an appointment. Stores the file in
 * the `receipts` bucket (own folder) then calls submit_appointment_receipt,
 * which flags the appointment for review and notifies the admins.
 */
export function AppointmentReceiptUpload({ appointmentId }: { appointmentId: string }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const pick = (f?: File | null) => {
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) {
      setError(t("Only JPG / PNG / WebP images", "صيغة مدعومة فقط: JPG أو PNG"));
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(t("Max size is 5 MB", "الحد الأقصى 5 ميجابايت"));
      return;
    }
    setError(null);
    setFile(f);
  };

  const submit = async () => {
    if (!file || !user) return;
    setPhase("uploading");
    setError(null);
    try {
      const ext = EXT[file.type] ?? "jpg";
      const path = `${user.id}/appt-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("receipts")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { error: rpcErr } = await supabase.rpc("submit_appointment_receipt", {
        p_appointment_id: appointmentId,
        p_receipt_url: path,
      });
      if (rpcErr) throw rpcErr;
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Upload failed", "فشل الرفع"));
      setPhase("idle");
    }
  };

  if (phase === "done") {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div>
          <p className="text-sm font-bold text-foreground">{t("Receipt received", "تم استلام الإيصال")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("Our team will confirm your payment shortly — you'll get a notification.", "سيؤكّد فريقنا الدفع قريبًا — وسيصلك إشعار.")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-4">
      <p className="mb-2 text-sm font-semibold text-foreground">
        {t("Speed up confirmation — upload the transfer receipt", "لتأكيد أسرع — ارفع صورة إيصال التحويل")}
      </p>

      {file ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <FileImage className="h-4 w-4 text-primary" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <button type="button" onClick={() => setFile(null)} aria-label={t("Remove", "إزالة")}>
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-3 text-sm text-muted-foreground hover:bg-accent"
        >
          <UploadCloud className="h-4 w-4" />
          {t("Choose receipt image", "اختر صورة الإيصال")}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={!file || phase === "uploading"}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
      >
        {phase === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
        {t("Send receipt", "إرسال الإيصال")}
      </button>
    </div>
  );
}
