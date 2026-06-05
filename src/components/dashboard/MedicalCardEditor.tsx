import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HeartPulse, Save, Eye, EyeOff, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BLOOD_TYPES,
  FIELD_LABELS,
  MEDICAL_FIELDS,
  withField,
  type MedicalCard,
  type MedicalFieldKey,
} from "@/lib/medical-card";

interface MedicalCardEditorProps {
  profileId: string;
}

const TEXTAREA_FIELDS: MedicalFieldKey[] = ["allergies", "chronic_conditions", "medications"];

/** Patient-only editor for the public medical card (V7). */
export function MedicalCardEditor({ profileId }: MedicalCardEditorProps) {
  const { t, language } = useLanguage();
  const qc = useQueryClient();

  const { data: card = {}, isLoading } = useQuery({
    queryKey: ["medical-card", profileId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("medical_card")
        .eq("id", profileId)
        .maybeSingle();
      if (error) throw error;
      return ((data?.medical_card as MedicalCard) ?? {}) as MedicalCard;
    },
  });

  const [local, setLocal] = useState<MedicalCard>({});

  useEffect(() => {
    if (!isLoading) setLocal(card);
  }, [isLoading, card]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ medical_card: local })
        .eq("id", profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Medical card saved", "تم حفظ البطاقة الطبية"));
      qc.invalidateQueries({ queryKey: ["medical-card", profileId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setValue = (key: MedicalFieldKey, value: string) =>
    setLocal((c) => withField(c, key, { value }));

  const setPublic = (key: MedicalFieldKey, isPublic: boolean) =>
    setLocal((c) => withField(c, key, { public: isPublic }));

  if (isLoading) return null;

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
        <HeartPulse className="h-5 w-5 text-primary" />
        {t("My medical card", "بطاقتي الطبية")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          "Store your basic health info securely. Toggle the eye icon to opt-in to showing a field on your public page (/u/{slug}).",
          "احفظ معلوماتك الصحية الأساسية. شغّل أيقونة العين بجوار أي حقل لإظهاره على صفحتك العامة (/u/{slug}).",
        )}
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {MEDICAL_FIELDS.map((key) => {
          const label = FIELD_LABELS[key][language === "ar" ? "ar" : "en"];
          const value = local[key]?.value ?? "";
          const isPublic = Boolean(local[key]?.public);
          const isTextarea = TEXTAREA_FIELDS.includes(key);
          const isBlood = key === "blood_type";

          return (
            <div
              key={key}
              className={`${isTextarea ? "sm:col-span-2" : "sm:col-span-1"} rounded-xl border border-border bg-background p-3`}
            >
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`mc-${key}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </Label>
                <div className="flex items-center gap-1.5">
                  {isPublic ? (
                    <Eye className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <Switch
                    id={`mc-${key}-public`}
                    checked={isPublic}
                    onCheckedChange={(v) => setPublic(key, v)}
                    aria-label={t(`Show ${label} publicly`, `إظهار ${label} للجمهور`)}
                  />
                </div>
              </div>

              {isBlood ? (
                <Select value={value} onValueChange={(v) => setValue(key, v)}>
                  <SelectTrigger id={`mc-${key}`} className="mt-2">
                    <SelectValue placeholder={t("Select…", "اختر…")} />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOOD_TYPES.map((bt) => (
                      <SelectItem key={bt} value={bt}>
                        {bt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : isTextarea ? (
                <Textarea
                  id={`mc-${key}`}
                  value={value}
                  onChange={(e) => setValue(key, e.target.value)}
                  placeholder={t("e.g. Penicillin, peanuts", "مثال: بنسلين، فول سوداني")}
                  rows={2}
                  className="mt-2"
                />
              ) : (
                <Input
                  id={`mc-${key}`}
                  value={value}
                  onChange={(e) => setValue(key, e.target.value)}
                  placeholder={
                    key === "emergency_phone"
                      ? "+20 100 …"
                      : key === "preferred_language"
                      ? t("Arabic", "العربية")
                      : ""
                  }
                  type={key === "emergency_phone" ? "tel" : "text"}
                  className="mt-2"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {t(
              "Public fields appear on your /u/{slug} page and may help in emergencies, but anyone with the link can read them. Keep critical data private unless you intend to share it.",
              "الحقول العامة تظهر على صفحة /u/{slug} وقد تساعد في الطوارئ، لكن أي شخص معه الرابط يستطيع قراءتها. اترك البيانات الحساسة خاصة إلا إذا قصدت مشاركتها.",
            )}
          </span>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="me-2 h-4 w-4" />
          {save.isPending ? t("Saving…", "جارٍ الحفظ…") : t("Save medical card", "حفظ البطاقة")}
        </Button>
      </div>
    </section>
  );
}
