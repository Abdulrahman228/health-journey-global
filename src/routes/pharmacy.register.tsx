import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, Upload, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { createChain, uploadPharmacyLogo, getMyChain } from "@/lib/pharmacy";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/pharmacy/register")({
  component: PharmacyRegisterPage,
  head: () => ({
    meta: [
      { title: "Register your pharmacy chain | Tabibi" },
      { name: "description", content: "Register your pharmacy chain on Tabibi and help patients find missing medications." },
    ],
  }),
});

function PharmacyRegisterPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [slug, setSlug] = useState("");
  const [website, setWebsite] = useState("");
  const [license, setLicense] = useState("");
  const [description, setDescription] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && !isAuthenticated) {
    throw redirect({ to: "/login" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!name || !slug) {
      toast.error(t("Name and slug are required", "الاسم والمعرّف مطلوبان"));
      return;
    }
    setSubmitting(true);
    try {
      const existing = await getMyChain(user.id);
      if (existing) {
        toast.error(t("You already have a pharmacy chain", "لديك بالفعل سلسلة صيدليات"));
        navigate({ to: "/pharmacy/dashboard" });
        return;
      }

      let logoUrl: string | undefined;
      if (logoFile) {
        logoUrl = await uploadPharmacyLogo(logoFile, user.id);
      }

      const chainId = await createChain({
        ownerUserId: user.id,
        name,
        nameAr: nameAr || undefined,
        slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        website: website || undefined,
        licenseNumber: license || undefined,
        description: description || undefined,
        logoUrl,
      });

      // Assign pharmacy role
      await supabase.from("user_roles").upsert({ user_id: user.id, role: "pharmacy" });

      toast.success(t("Submitted! We'll review your chain shortly.", "تم الإرسال! سنراجع سلسلتك قريباً."));
      navigate({ to: "/pharmacy/dashboard" });
      void chainId;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed", "فشل"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
        <section className="border-b border-border bg-linear-to-br from-teal/10 via-background to-background">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal/15 text-teal">
                <Building2 className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  {t("Register your pharmacy chain", "سجّل سلسلة صيدلياتك")}
                </h1>
                <p className="mt-2 text-muted-foreground">
                  {t(
                    "Add your chain and branches, then list which rare medications are in stock. Patients searching for missing drugs will find you.",
                    "أضف سلسلتك وفروعها، ثم انشر الأدوية النادرة المتوفرة لديك. المرضى الباحثون عن أدوية ناقصة سيجدونك.",
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
            <ShieldCheck className="inline h-4 w-4 me-1" />
            {t(
              "Your chain will be reviewed by our team before going live. You'll be notified once approved.",
              "سيتم مراجعة سلسلتك من قبل فريقنا قبل تفعيلها. ستصلك إشعار بمجرد الموافقة.",
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-border bg-card p-6">
            <Field label={t("Chain name (English)", "اسم السلسلة (إنجليزي) *")} required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="El Ezaby Pharmacy"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </Field>

            <Field label={t("Chain name (Arabic)", "اسم السلسلة (عربي)")}>
              <input
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder="صيدليات العزبي"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </Field>

            <Field label={t("URL slug (unique)", "المعرّف الفريد *")} required>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="el-ezaby"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </Field>

            <Field label={t("Website", "الموقع الإلكتروني")}>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://elezabypharmacy.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </Field>

            <Field label={t("License number", "رقم الترخيص")}>
              <input
                value={license}
                onChange={(e) => setLicense(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </Field>

            <Field label={t("Description", "وصف")}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </Field>

            <Field label={t("Logo", "الشعار")}>
              <label className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-background/50 px-4 py-3 text-sm text-muted-foreground cursor-pointer hover:bg-accent">
                <Upload className="h-4 w-4" />
                {logoFile ? logoFile.name : t("Choose image (PNG/JPG)", "اختر صورة (PNG/JPG)")}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
            </Field>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("Submit for review", "إرسال للمراجعة")}
              </button>
              <Link
                to="/missing-drugs"
                className="rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium hover:bg-accent"
              >
                {t("Cancel", "إلغاء")}
              </Link>
            </div>
          </form>
        </section>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ms-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
