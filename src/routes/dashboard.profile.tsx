/**
 * /dashboard/profile — the doctor's "Clinic Profile" hub: specialty + fees editor,
 * multi-clinic manager, public page/QR, and the online-consultations toggle.
 * These used to live on the long dashboard home; they now have their own sidebar
 * page (rendered inside the DoctorShell via the /dashboard layout Outlet).
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { ClinicsManager } from "@/components/dashboard/ClinicsManager";
import { PublicPageManager } from "@/components/dashboard/PublicPageManager";
import { TelemedicineToggle } from "@/components/doctor/TelemedicineToggle";
import { DoctorProfileEditor } from "./dashboard";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/profile")({
  head: () => ({
    meta: [
      { title: "ملف العيادة — طبانا" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DoctorProfilePage,
});

function DoctorProfilePage() {
  const { t } = useLanguage();
  const { profile, isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate({ to: "/login" });
  }, [authLoading, isAuthenticated, navigate]);

  const { data: details, isLoading } = useQuery({
    queryKey: ["doctor_details", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctor_details")
        .select("*")
        .eq("profile_id", profile!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t("Clinic Profile", "ملف العيادة")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Your specialty, clinics, public page and online consultations.",
            "تخصصك، عياداتك، صفحتك العامة، والاستشارات عن بُعد.",
          )}
        </p>
      </div>

      <DoctorProfileEditor details={details} profileId={profile?.id ?? null} />

      {details?.id && <ClinicsManager doctorDetailsId={details.id} />}

      {profile?.id && <PublicPageManager profileId={profile.id} role="doctor" />}

      <section>
        <h2 className="mb-4 text-xl font-semibold text-foreground">
          {t("Online Consultations", "الاستشارات عن بُعد")}
        </h2>
        <TelemedicineToggle />
      </section>
    </div>
  );
}
