/**
 * /profile/lab-results — patient-facing list of medical attachments
 * (lab results, imaging, ECG) uploaded by their doctors.
 *
 * Private — noindex, nofollow.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  ArrowUpRight,
  Brain,
  Download,
  FileImage,
  FileText,
  HeartPulse,
  Loader2,
  Microscope,
} from "lucide-react";

type AttachmentType = "lab_result" | "xray" | "mri" | "ct" | "ecg" | "prescription" | "other";

interface LabRow {
  id: string;
  type: AttachmentType;
  fileUrl: string;
  fileName: string | null;
  notes: string | null;
  uploadedAt: string;
  doctorName: string | null;
  signedUrl?: string;
}

export const Route = createFileRoute("/profile/lab-results")({
  head: () => ({
    meta: [
      { title: "نتائج التحاليل والأشعة | طبيبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LabResultsPage,
});

function LabResultsPage() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [rows, setRows] = useState<LabRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile?.id) {
      navigate({ to: "/login" });
      return;
    }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        // Fetch attachments authored by someone OTHER than the patient
        // (uploaded_by ≠ patient) — that's the labs/imaging the doctor sent.
        const { data, error } = await supabase
          .from("medical_attachments")
          .select(
            "id, type, file_url, file_name, notes, uploaded_at, uploaded_by_profile_id, patient_profile_id",
          )
          .eq("patient_profile_id", profile.id)
          .in("type", ["lab_result", "xray", "mri", "ct", "ecg"])
          .order("uploaded_at", { ascending: false });

        if (error) throw error;

        const attachments = (data ?? []) as Array<{
          id: string;
          type: AttachmentType;
          file_url: string;
          file_name: string | null;
          notes: string | null;
          uploaded_at: string;
          uploaded_by_profile_id: string | null;
          patient_profile_id: string;
        }>;

        // Resolve doctor names.
        const docIds = Array.from(
          new Set(
            attachments
              .map((a) => a.uploaded_by_profile_id)
              .filter((x): x is string => Boolean(x) && x !== profile.id),
          ),
        );
        const nameMap = new Map<string, string>();
        if (docIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", docIds);
          for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
            if (p.full_name) nameMap.set(p.id, p.full_name);
          }
        }

        // Mark related notifications as read on visit.
        const { data: notifs } = await supabase
          .from("notifications")
          .select("id, metadata")
          .eq("user_id", user.id)
          .eq("kind", "lab_ready")
          .eq("is_read", false);
        const unreadIds = (notifs ?? [])
          .map((n: { id: string }) => n.id)
          .filter(Boolean);
        if (unreadIds.length > 0) {
          await supabase.rpc("mark_notifications_read", { _ids: unreadIds });
        }

        if (!alive) return;
        setRows(
          attachments.map((a) => ({
            id: a.id,
            type: a.type,
            fileUrl: a.file_url,
            fileName: a.file_name,
            notes: a.notes,
            uploadedAt: a.uploaded_at,
            doctorName: a.uploaded_by_profile_id
              ? nameMap.get(a.uploaded_by_profile_id) ?? null
              : null,
          })),
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [authLoading, user, profile?.id, navigate]);

  const grouped = useMemo(() => {
    const buckets: Record<AttachmentType, LabRow[]> = {
      lab_result: [],
      xray: [],
      mri: [],
      ct: [],
      ecg: [],
      prescription: [],
      other: [],
    };
    for (const r of rows) buckets[r.type].push(r);
    return buckets;
  }, [rows]);

  if (loading || authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const typeMeta: Record<
    AttachmentType,
    { icon: React.ReactNode; label: string; color: string }
  > = {
    lab_result: {
      icon: <Microscope className="h-5 w-5" />,
      label: t("Lab results", "نتائج التحاليل"),
      color: "text-emerald-600",
    },
    xray: {
      icon: <FileImage className="h-5 w-5" />,
      label: t("X-Ray", "أشعة سينية"),
      color: "text-sky-600",
    },
    mri: {
      icon: <Brain className="h-5 w-5" />,
      label: t("MRI", "رنين مغناطيسي"),
      color: "text-purple-600",
    },
    ct: {
      icon: <Activity className="h-5 w-5" />,
      label: t("CT scan", "أشعة مقطعية"),
      color: "text-indigo-600",
    },
    ecg: {
      icon: <HeartPulse className="h-5 w-5" />,
      label: t("ECG", "تخطيط القلب"),
      color: "text-rose-600",
    },
    prescription: {
      icon: <FileText className="h-5 w-5" />,
      label: t("Prescription", "روشتة"),
      color: "text-amber-600",
    },
    other: {
      icon: <FileText className="h-5 w-5" />,
      label: t("Other", "أخرى"),
      color: "text-muted-foreground",
    },
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl" dir={isRTL ? "rtl" : "ltr"}>
      <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
        <Microscope className="h-6 w-6 text-primary" />
        {t("Lab results & imaging", "نتائج التحاليل والأشعة")}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {t(
          "All results uploaded by your doctors, in one place.",
          "كل النتائج التي رفعها لك الأطباء في مكان واحد.",
        )}
      </p>

      {rows.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {t(
              "No lab results yet. They'll appear here once your doctor uploads them.",
              "لا توجد نتائج بعد. ستظهر هنا فور رفعها من الطبيب.",
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {(Object.keys(grouped) as AttachmentType[])
            .filter((k) => k !== "prescription" && k !== "other")
            .filter((k) => grouped[k].length > 0)
            .map((kind) => (
              <section key={kind}>
                <h2 className={`font-semibold mb-3 flex items-center gap-2 ${typeMeta[kind].color}`}>
                  {typeMeta[kind].icon}
                  {typeMeta[kind].label}
                  <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                    {grouped[kind].length}
                  </span>
                </h2>
                <ul className="space-y-2">
                  {grouped[kind].map((r) => (
                    <li
                      key={r.id}
                      className="bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                          {r.fileName ?? typeMeta[kind].label}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {new Date(r.uploadedAt).toLocaleDateString(isRTL ? "ar-EG" : "en-GB")}
                          {r.doctorName ? ` • ${r.doctorName}` : ""}
                        </div>
                        {r.notes && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {r.notes}
                          </p>
                        )}
                      </div>
                      <a
                        href={r.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg px-3 py-2 text-sm font-medium shrink-0"
                      >
                        <Download className="h-4 w-4" />
                        {t("View", "عرض")}
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}

      <div className="mt-8 text-center">
        <Link
          to="/profile/medical-history"
          className="text-sm text-primary hover:underline"
        >
          {t("View full medical history →", "عرض السجل الطبي الكامل ←")}
        </Link>
      </div>
    </div>
  );
}
