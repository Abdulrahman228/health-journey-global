import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Globe, Save, Copy, Check, ExternalLink, Upload } from "lucide-react";
import { toast } from "sonner";
import { DoctorShell } from "@/components/doctor/DoctorNav";
import { supabase } from "@/integrations/supabase/client";
import { getMySoloSettings, updateSoloMode } from "@/lib/solo.functions";

export const Route = createFileRoute("/doctor/solo")({
  head: () => ({
    meta: [
      { title: "إعدادات Solo Mode — طبانا" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SoloSettingsPage,
});

function SoloSettingsPage() {
  const { user, profile, role, isLoading: authLoading } = useAuth();
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Upload a logo file to the public doctor-assets bucket and use its URL.
  const uploadLogo = async (file: File) => {
    if (!profile?.id) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("الصيغة المدعومة: PNG أو JPG أو WebP");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("الحد الأقصى 2 ميجابايت");
      return;
    }
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${profile.id}/solo-logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("doctor-assets")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("doctor-assets").getPublicUrl(path);
      setLogoUrl(pub.publicUrl);
      toast.success("تم رفع الشعار — لا تنسَ الحفظ");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الرفع");
    } finally {
      setUploadingLogo(false);
    }
  };
  const navigate = useNavigate();
  const fetchSettings = useServerFn(getMySoloSettings);
  const save = useServerFn(updateSoloMode);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [brandColor, setBrandColor] = useState("#1d4ed8");
  const [logoUrl, setLogoUrl] = useState("");
  const [clinicName, setClinicName] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (role !== "doctor") return;
    (async () => {
      try {
        const r = await fetchSettings();
        setSlug(r.slug);
        setEnabled(r.enabled);
        if (r.brandColor) setBrandColor(r.brandColor);
        if (r.logoUrl) setLogoUrl(r.logoUrl);
        if (r.clinicName) setClinicName(r.clinicName);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, user, role, navigate]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="جاري التحميل" />
      </div>
    );
  }

  if (role !== "doctor") {
    return <p className="text-center py-16 text-muted-foreground">صفحة الأطباء فقط.</p>;
  }

  const subdomainUrl = slug ? `https://${slug}.mytabibi.com` : null;
  // Path link works instantly for every doctor (no DNS setup) — the primary link.
  const pathUrl = slug ? `https://mytabibi.com/d/${slug}` : null;

  return (
    <DoctorShell>
      <div dir="rtl">
      <div className="flex items-center gap-2 mb-2">
        <Globe className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-bold">Solo Mode — صفحتك الخاصة</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        فعّل Solo Mode لتحصل على صفحة خاصة بك
        <strong> (mytabibi.com/d/{slug || "yourslug"})</strong> تعرض ملفك فقط دون
        أي روابط لأطباء آخرين، مع شعارك ولونك الخاص، وحجز مباشر داخل نفس الصفحة.
        مناسبة لمشاركة QR code داخل العيادة أو على الكروت — وتعمل فورًا بدون أي إعداد.
      </p>

      {!slug && (
        <div className="mb-6 rounded-xl border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-sm">
          <p className="font-semibold text-amber-900 dark:text-amber-300">يجب تعيين slug أولاً</p>
          <p className="mt-1 text-amber-800 dark:text-amber-300/80">
            اذهب إلى{" "}
            <Link to="/dashboard" className="underline">
              لوحة التحكم
            </Link>{" "}
            وضع slug في إعدادات صفحتك العامة قبل تفعيل Solo Mode.
          </p>
        </div>
      )}

      {pathUrl && (
        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">رابطك الخاص — يعمل فورًا ✅</p>
              <p className="font-mono text-sm font-semibold truncate">{pathUrl}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(pathUrl);
                  setCopied(true);
                  toast.success("تم النسخ");
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="نسخ الرابط"
              >
                {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                نسخ
              </button>
              <a
                href={pathUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> فتح
              </a>
            </div>
          </div>
          {subdomainUrl && (
            <p className="mt-3 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
              نطاق فرعي متقدّم (اختياري): <span className="font-mono">{subdomainUrl}</span> — يتطلب
              إعداد DNS في Cloudflare. الرابط بالأعلى يعمل بدون أي إعداد ونفس التصميم تمامًا.
            </p>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <p className="font-semibold">تفعيل Solo Mode</p>
            <p className="text-xs text-muted-foreground">إخفاء كل روابط السوق وعرض ملفك فقط على نطاقك الفرعي</p>
          </div>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-5 w-9 cursor-pointer accent-primary"
            aria-label="تفعيل Solo Mode"
          />
        </label>

        <div>
          <label htmlFor="solo-clinic-name" className="mb-1.5 block text-sm font-medium">
            اسم العيادة (اختياري)
          </label>
          <input
            id="solo-clinic-name"
            type="text"
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
            placeholder="عيادة د. أحمد"
            maxLength={100}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="solo-brand-color" className="mb-1.5 block text-sm font-medium">
            اللون الأساسي
          </label>
          <div className="flex items-center gap-2">
            <input
              id="solo-brand-color"
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="h-10 w-14 rounded-lg border border-input cursor-pointer"
              aria-label="لون العلامة"
            />
            <input
              type="text"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              pattern="^#[0-9a-fA-F]{6}$"
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            شعار العيادة (PNG / JPG / WebP ≥ 192×192)
          </label>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="الشعار"
                className="h-14 w-14 rounded-lg border border-border object-contain bg-background"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                <Globe className="h-5 w-5" />
              </div>
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent">
              {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {logoUrl ? "تغيير الشعار" : "رفع الشعار"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={uploadingLogo}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadLogo(f);
                  e.target.value = "";
                }}
              />
            </label>
            {logoUrl && (
              <button
                type="button"
                onClick={() => setLogoUrl("")}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                إزالة
              </button>
            )}
          </div>
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="أو الصق رابط شعار (يدعم SVG)"
            className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <button
          type="button"
          disabled={saving || !slug}
          onClick={async () => {
            setSaving(true);
            try {
              await save({
                data: {
                  enabled,
                  brandColor: brandColor || null,
                  logoUrl: logoUrl || null,
                  clinicName: clinicName || null,
                },
              });
              toast.success("تم الحفظ");
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          حفظ الإعدادات
        </button>
      </div>
      </div>
    </DoctorShell>
  );
}
