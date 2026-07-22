import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, FileImage, Loader2, ShieldCheck, UploadCloud, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { submitManualSubscription } from "@/lib/subscriptions.manual";
import type { ManualGoldPlanCode } from "@/lib/subscriptions.access";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB (mirrors the bucket's server-side limit)
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const PLAN_LABEL: Record<string, string> = {
  doctor_gold_monthly: "Gold شهري",
  doctor_gold_yearly: "Gold سنوي",
};

type Phase = "idle" | "uploading" | "done";

/**
 * Receipt upload for the manual-payment (Trust-but-Verify) flow.
 *
 * Validates that the file is a jpg/png/webp under 5 MB, uploads it to the
 * `receipts` bucket under the doctor's own folder, then calls
 * submitManualSubscription — which grants Gold immediately (pending) and
 * notifies the admins. On success it shows the "pending review + temporary
 * access" state.
 */
export function ReceiptUploadWidget({ planCode }: { planCode: ManualGoldPlanCode }) {
  const { user, isLoading: authLoading } = useAuth();
  const submit = useServerFn(submitManualSubscription);

  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const validate = (f: File): string | null => {
    if (!ACCEPTED.includes(f.type)) {
      return "صيغة غير مدعومة، يُقبل فقط JPG أو PNG";
    }
    if (f.size > MAX_BYTES) {
      return "حجم الملف كبير، الحد الأقصى 5 ميجابايت";
    }
    return null;
  };

  const pick = useCallback((f: File | null | undefined) => {
    if (!f) return;
    const err = validate(f);
    if (err) {
      setError(err);
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const upload = async () => {
    if (!file) return;
    if (!user) {
      setError("يجب تسجيل الدخول أولاً");
      return;
    }
    const err = validate(file);
    if (err) {
      setError(err);
      return;
    }

    setPhase("uploading");
    setError(null);
    try {
      const ext = EXT[file.type] ?? "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("receipts")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error("فشل الرفع، يرجى المحاولة مرة أخرى");

      const { data: pub } = supabase.storage.from("receipts").getPublicUrl(path);
      const receiptUrl = pub?.publicUrl;
      if (!receiptUrl) throw new Error("فشل الرفع، يرجى المحاولة مرة أخرى");

      await submit({ data: { planCode, receiptUrl } });
      setPhase("done");
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : "فشل الرفع، يرجى المحاولة مرة أخرى");
    }
  };

  // --- Success state -------------------------------------------------------
  if (phase === "done") {
    return (
      <section
        dir="rtl"
        className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center dark:border-green-900/50 dark:bg-green-950/30"
        aria-live="polite"
      >
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <h3 className="mt-3 text-lg font-bold text-green-900 dark:text-green-200">
          تم رفع الإيصال بنجاح. جاري المراجعة...
        </h3>
        <p className="mx-auto mt-2 flex max-w-md items-center justify-center gap-1.5 text-sm text-green-800 dark:text-green-300">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          تم تفعيل مزايا Gold مؤقتاً على حسابك الآن. سيراجع فريقنا الإيصال خلال 24 ساعة لتأكيد اشتراكك.
        </p>
      </section>
    );
  }

  // --- Upload form ---------------------------------------------------------
  return (
    <section
      dir="rtl"
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
      aria-label="رفع إيصال الدفع"
    >
      <header className="mb-4">
        <h2 className="text-xl font-bold text-foreground">تأكيد الاشتراك برفع الإيصال</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          بعد الدفع، ارفع صورة الإيصال لتفعيل اشتراك{" "}
          <span className="font-semibold text-primary">{PLAN_LABEL[planCode] ?? planCode}</span>{" "}
          فوراً (بانتظار مراجعة الإدارة).
        </p>
      </header>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition " +
          (dragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-background hover:border-primary/50")
        }
      >
        {file ? (
          <>
            <FileImage className="h-8 w-8 text-primary" />
            <p className="mt-2 max-w-full truncate text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} ميجابايت</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
                setError(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" /> إزالة
            </button>
          </>
        ) : (
          <>
            <UploadCloud className="h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">اسحب الصورة هنا أو اضغط للاختيار</p>
            <p className="text-xs text-muted-foreground">JPG أو PNG — بحد أقصى 5 ميجابايت</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={upload}
        disabled={!file || phase === "uploading" || authLoading}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
      >
        {phase === "uploading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> جاري الرفع...
          </>
        ) : (
          <>
            <UploadCloud className="h-4 w-4" /> رفع الإيصال وتفعيل الاشتراك
          </>
        )}
      </button>

      {!authLoading && !user && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          يجب تسجيل الدخول بحساب الطبيب لرفع الإيصال.
        </p>
      )}
    </section>
  );
}

export default ReceiptUploadWidget;
