/**
 * /dashboard/settings/signature — doctor signature & stamp upload.
 *
 * Used on prescription PDFs (rx.$id) and verification page (rx.verify).
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { FileSignature, Loader2, Stamp, Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/settings/signature")({
  head: () => ({
    meta: [
      { title: "التوقيع والختم | لوحة الطبيب — طبيبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SignaturePage,
});

const BUCKET = "doctor-assets";

function SignaturePage() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"signature" | "stamp" | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile?.id) {
      navigate({ to: "/login" });
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("doctor_details")
        .select("id, signature_url, stamp_url")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (!alive) return;
      if (data) {
        setDoctorId((data as { id: string }).id);
        setSignatureUrl((data as { signature_url: string | null }).signature_url ?? null);
        setStampUrl((data as { stamp_url: string | null }).stamp_url ?? null);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [authLoading, user, profile?.id, navigate]);

  const upload = async (file: File, kind: "signature" | "stamp") => {
    if (!doctorId || !profile?.id) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("Please upload an image (PNG/JPG)", "ارفع صورة بصيغة PNG أو JPG"));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("Max file size is 2MB", "الحد الأقصى للملف 2 ميجابايت"));
      return;
    }
    setUploading(kind);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${profile.id}/${kind}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: updErr } = await supabase
        .from("doctor_details")
        .update(kind === "signature" ? { signature_url: url } : { stamp_url: url })
        .eq("id", doctorId);
      if (updErr) throw updErr;
      if (kind === "signature") setSignatureUrl(url);
      else setStampUrl(url);
      toast.success(t("Saved", "تم الحفظ"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "error");
    } finally {
      setUploading(null);
    }
  };

  const remove = async (kind: "signature" | "stamp") => {
    if (!doctorId) return;
    if (!confirm(t("Remove this image?", "حذف هذه الصورة؟"))) return;
    const { error } = await supabase
      .from("doctor_details")
      .update(kind === "signature" ? { signature_url: null } : { stamp_url: null })
      .eq("id", doctorId);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (kind === "signature") setSignatureUrl(null);
    else setStampUrl(null);
    toast.success(t("Removed", "تم الحذف"));
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl" dir={isRTL ? "rtl" : "ltr"}>
      <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
        <FileSignature className="h-6 w-6 text-primary" />
        {t("Signature & Stamp", "التوقيع والختم")}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {t(
          "Upload your medical signature and clinic stamp. They appear on every prescription PDF you issue.",
          "ارفع توقيعك الطبي وختم العيادة. يظهران تلقائيًا على كل وصفة طبية تصدرها.",
        )}
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <UploadCard
          label={t("Signature", "التوقيع")}
          icon={<FileSignature className="h-5 w-5" />}
          imageUrl={signatureUrl}
          uploading={uploading === "signature"}
          onFile={(f) => upload(f, "signature")}
          onRemove={() => remove("signature")}
          tip={t("PNG with transparent background works best", "PNG بخلفية شفافة هو الأفضل")}
        />
        <UploadCard
          label={t("Stamp", "الختم")}
          icon={<Stamp className="h-5 w-5" />}
          imageUrl={stampUrl}
          uploading={uploading === "stamp"}
          onFile={(f) => upload(f, "stamp")}
          onRemove={() => remove("stamp")}
          tip={t("Use a square clinic stamp image", "استخدم صورة ختم مربعة للعيادة")}
        />
      </div>
    </div>
  );
}

function UploadCard({
  label,
  icon,
  imageUrl,
  uploading,
  onFile,
  onRemove,
  tip,
}: {
  label: string;
  icon: React.ReactNode;
  imageUrl: string | null;
  uploading: boolean;
  onFile: (f: File) => void;
  onRemove: () => void;
  tip: string;
}) {
  return (
    <section className="bg-card border border-border rounded-2xl p-4">
      <h2 className="font-semibold mb-3 flex items-center gap-2">
        {icon}
        {label}
      </h2>
      {imageUrl ? (
        <div className="bg-white border border-border rounded-lg p-3 flex items-center justify-center min-h-[120px]">
          <img src={imageUrl} alt={label} className="max-h-24 object-contain" />
        </div>
      ) : (
        <div className="bg-muted/30 border border-dashed border-border rounded-lg p-3 flex items-center justify-center min-h-[120px] text-sm text-muted-foreground">
          {tip}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <label className="flex-1 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer hover:bg-primary/90 transition">
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {imageUrl ? "تغيير" : "رفع"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.currentTarget.value = "";
            }}
          />
        </label>
        {imageUrl && (
          <button
            onClick={onRemove}
            className="text-sm text-rose-600 hover:text-rose-700 px-2"
          >
            حذف
          </button>
        )}
      </div>
    </section>
  );
}
