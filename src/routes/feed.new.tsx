import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Megaphone, AlertTriangle, Pill, ImagePlus, X, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { createPost, uploadPostImage, type PostType } from "@/lib/feed";

export const Route = createFileRoute("/feed/new")({
  head: () => ({ meta: [{ title: "بوست جديد — Tabibi" }] }),
  component: NewPostPage,
});

function NewPostPage() {
  const { t, language } = useLanguage();
  const { user, role, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  const [profileId, setProfileId] = useState<string | null>(null);
  const [isVerifiedDoctor, setIsVerifiedDoctor] = useState(false);
  const [city, setCity] = useState<string | null>(null);

  const [type, setType] = useState<PostType>("question");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [drugName, setDrugName] = useState("");
  const [dosage, setDosage] = useState("");
  const [alternative, setAlternative] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, city")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile) return;
      setProfileId(profile.id);
      setCity(profile.city);

      const { data: dd } = await supabase
        .from("doctor_details")
        .select("is_verified")
        .eq("profile_id", profile.id)
        .maybeSingle();
      setIsVerifiedDoctor(!!dd?.is_verified);
    })();
  }, [user]);

  useEffect(() => {
    return () => previews.forEach((u) => URL.revokeObjectURL(u));
  }, [previews]);

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return;
    const list = Array.from(selected).slice(0, 4 - files.length).filter((f) => f.size <= 5 * 1024 * 1024);
    if (list.length === 0) return;
    setFiles((prev) => [...prev, ...list]);
    setPreviews((prev) => [...prev, ...list.map((f) => URL.createObjectURL(f))]);
  };

  const removeFile = (i: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[i]);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const canAwareness = isVerifiedDoctor;
  const types: { key: PostType; labelEn: string; labelAr: string; icon: typeof Megaphone; disabled?: boolean }[] = [
    { key: "question", labelEn: "Question", labelAr: "استفسار", icon: AlertTriangle },
    { key: "missing_drug", labelEn: "Missing Drug", labelAr: "دواء ناقص", icon: Pill },
    { key: "awareness", labelEn: "Awareness", labelAr: "توعية", icon: Megaphone, disabled: !canAwareness },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profileId) return;
    if (title.trim().length < 3) {
      toast.error(t("Title is too short", "العنوان قصير جداً"));
      return;
    }
    if (body.trim().length < 1) {
      toast.error(t("Body is required", "النص مطلوب"));
      return;
    }
    if (type === "missing_drug" && drugName.trim().length < 1) {
      toast.error(t("Drug name is required", "اسم الدواء مطلوب"));
      return;
    }

    setSubmitting(true);
    try {
      const mediaUrls: string[] = [];
      for (const f of files) {
        const url = await uploadPostImage(f, user.id);
        mediaUrls.push(url);
      }
      const id = await createPost({
        authorProfileId: profileId,
        authorRole: (role ?? "patient") as "doctor" | "patient" | "admin",
        postType: type,
        title: title.trim(),
        body: body.trim(),
        tags: tagsInput.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8),
        mediaUrls,
        city,
        drugInfo: type === "missing_drug" ? { drugName: drugName.trim(), dosage: dosage.trim() || undefined, alternativeSuggested: alternative.trim() || undefined } : undefined,
      });
      toast.success(t("Post published!", "تم نشر البوست!"));
      navigate({ to: "/feed/post/$id", params: { id } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(t("Failed to publish: ", "فشل النشر: ") + msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
          <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 text-center">
          <Lock className="mx-auto h-12 w-12 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">{t("Sign in to post", "سجّل دخول للنشر")}</h1>
          <Link to="/login" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {t("Sign In", "تسجيل الدخول")}
          </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold text-foreground">{t("New Post", "بوست جديد")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Share with the medical community.", "شارك مع المجتمع الطبي.")}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {/* Type selector */}
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">{t("Post type", "نوع البوست")}</label>
            <div className="grid grid-cols-3 gap-2">
              {types.map((tp) => {
                const Icon = tp.icon;
                const active = type === tp.key;
                return (
                  <button
                    key={tp.key}
                    type="button"
                    disabled={tp.disabled}
                    onClick={() => setType(tp.key)}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-sm transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : tp.disabled
                        ? "border-border bg-muted/30 text-muted-foreground cursor-not-allowed opacity-60"
                        : "border-border bg-card text-foreground hover:border-primary/50"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{language === "ar" ? tp.labelAr : tp.labelEn}</span>
                    {tp.disabled && <Lock className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
            {!canAwareness && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("Awareness posts are limited to verified doctors.", "بوستات التوعية متاحة للأطباء الموثّقين فقط.")}
              </p>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">{t("Title", "العنوان")}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              placeholder={t("A short, clear headline", "عنوان قصير وواضح")}
            />
          </div>

          {/* Body */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">{t("Details", "التفاصيل")}</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
              required
              rows={6}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              placeholder={t("Explain your post in detail...", "اشرح موضوعك بالتفصيل...")}
            />
            <p className="mt-1 text-xs text-muted-foreground">{body.length}/5000</p>
          </div>

          {/* Drug info (if missing_drug) */}
          {type === "missing_drug" && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 dark:bg-rose-500/5 dark:border-rose-500/20 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                <Pill className="h-4 w-4" />
                {t("Drug details", "تفاصيل الدواء")}
              </h3>
              <input
                value={drugName}
                onChange={(e) => setDrugName(e.target.value)}
                required
                placeholder={t("Drug name (e.g. Concerta 36mg)", "اسم الدواء (مثلاً Concerta 36mg)")}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <input
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                placeholder={t("Dosage (optional)", "الجرعة (اختياري)")}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <input
                value={alternative}
                onChange={(e) => setAlternative(e.target.value)}
                placeholder={t("Alternative suggested (optional)", "البديل المقترح (اختياري)")}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">{t("Tags (comma separated)", "وسوم (مفصولة بفاصلة)")}</label>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder={t("e.g. flu, awareness, children", "مثلاً إنفلونزا, توعية, أطفال")}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          {/* Images */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">{t("Photos (up to 4)", "صور (حتى 4)")}</label>
            <div className="flex flex-wrap gap-2">
              {previews.map((url, i) => (
                <div key={url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-border">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="absolute end-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                    aria-label="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {files.length < 4 && (
                <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-card text-muted-foreground hover:border-primary hover:text-primary">
                  <ImagePlus className="h-5 w-5" />
                  <span className="text-xs">{t("Add", "إضافة")}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </label>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("Max 5 MB each.", "حد أقصى 5 ميجا لكل صورة.")}</p>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate({ to: "/feed" })}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              {t("Cancel", "إلغاء")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? t("Publishing...", "جاري النشر...") : t("Publish", "نشر")}
            </button>
          </div>
        </form>
    </div>
  );
}
