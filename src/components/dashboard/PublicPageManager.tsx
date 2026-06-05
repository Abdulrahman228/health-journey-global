import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Globe,
  Link2,
  Lock,
  Copy,
  Check,
  Trash2,
  Plus,
  ExternalLink,
  Eye,
  QrCode as QrCodeIcon,
  Sparkles,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShareProfileButton } from "@/components/ShareProfileButton";
import { siteConfig } from "@/lib/seo";
import { buildDoctorSlug, buildPatientSlug, slugify } from "@/lib/slug";
import { createShortLink } from "@/lib/profile.functions";

type Visibility = "public" | "unlisted" | "private";

interface PublicProfileFields {
  id: string;
  slug: string | null;
  public_bio: string | null;
  public_banner_url: string | null;
  profile_visibility: Visibility;
  profile_views_count: number;
  full_name: string | null;
  city: string | null;
}

interface ShortLinkRow {
  short_id: string;
  target_path: string;
  label: string | null;
  click_count: number;
  last_clicked_at: string | null;
  created_at: string;
}

interface PublicPageManagerProps {
  profileId: string;
  /** "doctor" | "patient" — controls slug template + URL prefix */
  role: "doctor" | "patient";
}

/**
 * Dashboard section for managing the user's public profile page.
 * Lets them set a slug, change visibility, edit bio/banner, and
 * generate/manage QR short links that resolve to /d/ or /u/ pages.
 */
export function PublicPageManager({ profileId, role }: PublicPageManagerProps) {
  const { t } = useLanguage();
  const qc = useQueryClient();

  // ---- Fetch the live profile row ------------------------------------------
  const { data: profile, isLoading } = useQuery({
    queryKey: ["public-profile", profileId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select(
          "id, slug, public_bio, public_banner_url, profile_visibility, profile_views_count, full_name, city",
        )
        .eq("id", profileId)
        .maybeSingle();
      if (error) throw error;
      return data as PublicProfileFields | null;
    },
  });

  // ---- Fetch existing short links ------------------------------------------
  const { data: links = [] } = useQuery({
    queryKey: ["short-links", profileId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profile_short_links")
        .select("short_id, target_path, label, click_count, last_clicked_at, created_at")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ShortLinkRow[];
    },
  });

  // ---- Local form state -----------------------------------------------------
  const [slugInput, setSlugInput] = useState("");
  const [bio, setBio] = useState("");
  const [banner, setBanner] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("unlisted");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setSlugInput(profile.slug ?? "");
    setBio(profile.public_bio ?? "");
    setBanner(profile.public_banner_url ?? "");
    setVisibility(profile.profile_visibility ?? "unlisted");
  }, [profile]);

  // ---- Save profile mutation -----------------------------------------------
  const save = useMutation({
    mutationFn: async () => {
      const candidate = slugInput.trim().toLowerCase();
      if (candidate && !/^[a-z0-9][a-z0-9-]{1,79}$/.test(candidate)) {
        throw new Error(
          t(
            "Slug must contain only lowercase letters, numbers and hyphens.",
            "الرابط يجب أن يحتوي على حروف صغيرة وأرقام وشرطات فقط.",
          ),
        );
      }
      const { error } = await (supabase as any)
        .from("profiles")
        .update({
          slug: candidate || null,
          public_bio: bio.trim() || null,
          public_banner_url: banner.trim() || null,
          profile_visibility: visibility,
        })
        .eq("id", profileId);
      if (error) {
        if (error.code === "23505") {
          throw new Error(t("This slug is taken.", "هذا الرابط مستخدم بالفعل."));
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success(t("Public page updated", "تم تحديث الصفحة العامة"));
      qc.invalidateQueries({ queryKey: ["public-profile", profileId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Slug suggestion ------------------------------------------------------
  const suggestSlug = async () => {
    const base =
      role === "doctor"
        ? buildDoctorSlug(profile?.full_name, profile?.city)
        : buildPatientSlug(profile?.full_name);
    if (!base) {
      toast.error(t("Please fill in your name first.", "أدخل اسمك أولاً."));
      return;
    }
    try {
      const { data, error } = await (supabase as any).rpc("suggest_unique_slug", {
        p_base: base,
      });
      if (error) throw error;
      setSlugInput(typeof data === "string" ? data : base);
      toast.success(t("Slug suggested", "تم اقتراح الرابط"));
    } catch (e: any) {
      setSlugInput(base);
      toast.warning(e?.message ?? t("Used local fallback", "تم استخدام رابط مؤقت"));
    }
  };

  // ---- Short link mutations -------------------------------------------------
  const createLink = useMutation({
    mutationFn: async () => {
      if (!profile?.slug) {
        throw new Error(t("Set a slug first.", "اضبط الرابط أولاً."));
      }
      const targetPath = `/${role === "doctor" ? "d" : "u"}/${profile.slug}`;
      await createShortLink({
        data: { profileId, targetPath, label: newLinkLabel.trim() || undefined },
      });
    },
    onSuccess: () => {
      toast.success(t("Short link created", "تم إنشاء الرابط القصير"));
      setNewLinkLabel("");
      qc.invalidateQueries({ queryKey: ["short-links", profileId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteLink = useMutation({
    mutationFn: async (shortId: string) => {
      const { error } = await (supabase as any)
        .from("profile_short_links")
        .delete()
        .eq("short_id", shortId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Short link deleted", "تم حذف الرابط القصير"));
      qc.invalidateQueries({ queryKey: ["short-links", profileId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Derived URLs ---------------------------------------------------------
  const path = profile?.slug ? `/${role === "doctor" ? "d" : "u"}/${profile.slug}` : null;
  const fullUrl = path ? `${siteConfig.url}${path}` : null;

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success(t("Copied", "تم النسخ"));
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error(t("Copy failed", "فشل النسخ"));
    }
  };

  if (isLoading) return null;

  const visibilityIcon =
    visibility === "public" ? Globe : visibility === "unlisted" ? Link2 : Lock;

  return (
    <section className="mt-10 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <QrCodeIcon className="h-5 w-5 text-primary" />
            {t("My public page", "صفحتي العامة")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Share your link or QR code with patients, on social media, or on printed cards.",
              "شارك رابطك أو رمز QR مع المرضى، على وسائل التواصل، أو على البطاقات المطبوعة.",
            )}
          </p>
        </div>
        {fullUrl && (
          <ShareProfileButton
            profileId={profileId}
            targetPath={path!}
            displayName={profile?.full_name ?? t("My page", "صفحتي")}
            variant="primary"
          />
        )}
      </div>

      {/* Live URL preview */}
      <div className="mt-5 rounded-xl border border-dashed border-border bg-secondary/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("Your public URL", "رابطك العام")}
            </div>
            <div className="mt-1 truncate font-mono text-sm font-medium text-foreground">
              {fullUrl ?? t("(set a slug below)", "(اضبط الرابط أدناه)")}
            </div>
            {profile && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="gap-1">
                  <Eye className="h-3 w-3" /> {profile.profile_views_count}{" "}
                  {t("views", "مشاهدة")}
                </Badge>
                <Badge variant="outline">{visibility}</Badge>
              </div>
            )}
          </div>
          {fullUrl && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copy(fullUrl, "url")}
              >
                {copied === "url" ? <Check className="me-1 h-4 w-4" /> : <Copy className="me-1 h-4 w-4" />}
                {t("Copy", "نسخ")}
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={path!} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="me-1 h-4 w-4" /> {t("Open", "فتح")}
                </a>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-1">
          <Label htmlFor="slug">{t("URL slug", "الرابط (slug)")}</Label>
          <div className="mt-1 flex gap-2">
            <div className="flex flex-1 items-center overflow-hidden rounded-md border border-input bg-background">
              <span className="px-2 text-xs text-muted-foreground">
                {siteConfig.url.replace(/^https?:\/\//, "")}/{role === "doctor" ? "d" : "u"}/
              </span>
              <Input
                id="slug"
                value={slugInput}
                onChange={(e) => setSlugInput(slugify(e.target.value).replace(/^-/, ""))}
                placeholder={
                  role === "doctor" ? "dr-ahmed-shatat-cairo" : "mohamed-nour"
                }
                className="border-0 font-mono"
              />
            </div>
            <Button type="button" variant="outline" onClick={suggestSlug}>
              <Sparkles className="me-1 h-4 w-4" />
              {t("Suggest", "اقترح")}
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("Lowercase letters, numbers, hyphens only.", "حروف صغيرة، أرقام وشرطات فقط.")}
          </p>
        </div>

        <div className="sm:col-span-1">
          <Label htmlFor="visibility">{t("Visibility", "مستوى الظهور")}</Label>
          <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
            <SelectTrigger id="visibility" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">
                <span className="inline-flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5" /> {t("Public — indexed by Google", "عام — يظهر في جوجل")}
                </span>
              </SelectItem>
              <SelectItem value="unlisted">
                <span className="inline-flex items-center gap-2">
                  <Link2 className="h-3.5 w-3.5" /> {t("Unlisted — link only", "غير مفهرس — بالرابط فقط")}
                </span>
              </SelectItem>
              <SelectItem value="private">
                <span className="inline-flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5" /> {t("Private — only me", "خاص — لي فقط")}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="bio">{t("Public bio", "نبذة عامة")}</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={t(
              "A short paragraph visible to anyone who opens your page.",
              "فقرة قصيرة تظهر لأي شخص يفتح صفحتك.",
            )}
            rows={4}
            className="mt-1"
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="banner">{t("Banner image URL (optional)", "رابط صورة الغلاف (اختياري)")}</Label>
          <Input
            id="banner"
            value={banner}
            onChange={(e) => setBanner(e.target.value)}
            placeholder="https://…"
            className="mt-1"
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="me-2 h-4 w-4" />
          {save.isPending ? t("Saving…", "جارٍ الحفظ…") : t("Save", "حفظ")}
        </Button>
      </div>

      {/* Short links */}
      <div className="mt-8 border-t border-border pt-6">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Link2 className="h-4 w-4 text-primary" />
          {t("Short links & QR codes", "روابط قصيرة ورموز QR")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "Create labelled short links (Instagram bio, WhatsApp status, printed card) and track scans separately.",
            "أنشئ روابط قصيرة بأسماء مختلفة (Instagram، WhatsApp، البطاقة المطبوعة) وتتبع كل واحد على حدة.",
          )}
        </p>

        <div className="mt-4 flex gap-2">
          <Input
            placeholder={t("Label (e.g. WhatsApp)", "اسم تعريفي (مثلاً WhatsApp)")}
            value={newLinkLabel}
            onChange={(e) => setNewLinkLabel(e.target.value)}
          />
          <Button
            onClick={() => createLink.mutate()}
            disabled={createLink.isPending || !profile?.slug}
          >
            <Plus className="me-1 h-4 w-4" />
            {t("New", "جديد")}
          </Button>
        </div>

        {links.length === 0 ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("No short links yet.", "لا توجد روابط قصيرة بعد.")}
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {links.map((l) => {
              const short = `${siteConfig.url}/q/${l.short_id}`;
              return (
                <li
                  key={l.short_id}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-sm font-medium text-foreground">
                        /q/{l.short_id}
                      </code>
                      {l.label && (
                        <Badge variant="secondary" className="text-[10px]">
                          {l.label}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      → <span className="font-mono">{l.target_path}</span> · {l.click_count}{" "}
                      {t("clicks", "نقرة")}
                      {l.last_clicked_at && (
                        <>
                          {" · "}
                          {t("last", "آخر")}: {new Date(l.last_clicked_at).toLocaleDateString()}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copy(short, l.short_id)}
                    >
                      {copied === l.short_id ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm(t("Delete this short link?", "حذف هذا الرابط القصير؟"))) {
                          deleteLink.mutate(l.short_id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer note */}
      <div className="mt-6 rounded-lg border border-primary/10 bg-primary/5 p-3 text-xs leading-relaxed text-foreground/80">
        <strong>{t("Tip", "نصيحة")}:</strong>{" "}
        {t(
          "Doctors get listed in /doctors search and Google when visibility is public. Patient pages default to unlisted for privacy.",
          "الأطباء يظهرون في /doctors وفي جوجل عند اختيار «عام». صفحات المرضى افتراضياً «غير مفهرسة» لحماية الخصوصية.",
        )}
        {" "}
        {visibility === "unlisted" && (
          <span className="text-muted-foreground">
            (<VisibilityIconText icon={visibilityIcon} /> {t("link only", "بالرابط فقط")})
          </span>
        )}
      </div>
    </section>
  );
}

function VisibilityIconText({ icon: Icon }: { icon: typeof Globe }) {
  return <Icon className="me-0.5 inline h-3 w-3" />;
}
