import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { isOnlineVisit } from "@/lib/appointment-type";
import { ArrowLeft, Loader2, Video } from "lucide-react";

// Client-only: the LiveKit SDK is loaded in a lazy chunk so it never executes
// during SSR on the Cloudflare Worker.
const ConsultationRoom = lazy(() => import("@/components/ConsultationRoom"));

export const Route = createFileRoute("/consultation/$id")({
  head: () => ({
    meta: [
      { title: "Video Consultation — Tebana" },
      { name: "description", content: "Secure video consultation room on Tebana." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ConsultationPage,
});

interface LiveKitCreds {
  token: string;
  wsUrl: string;
}

function ConsultationPage() {
  const { id } = Route.useParams();
  const { t } = useLanguage();
  const { user, profile, role: userRole, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [authLoading, user, navigate]);

  const { data: appt, isLoading } = useQuery({
    queryKey: ["consultation", id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Doctors: appointments store doctor_details.id, NOT profile.id — so resolve
  // the doctor's doctor_details.id before matching them to appt.doctor_id.
  const { data: doctorDetailsId } = useQuery({
    queryKey: ["my-doctor-details-id", profile?.id],
    enabled: !!profile?.id && userRole === "doctor",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctor_details")
        .select("id")
        .eq("profile_id", profile!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.id as string | undefined) ?? null;
    },
  });

  const isDoctorHere = !!appt && !!doctorDetailsId && doctorDetailsId === appt.doctor_id;
  const isParticipant = !!appt && (profile?.id === appt.patient_id || isDoctorHere);
  const isVideo = isOnlineVisit(appt?.appointment_type);
  const isCancelled = appt?.status === "cancelled";
  const role: "doctor" | "patient" = isDoctorHere ? "doctor" : "patient";

  // LiveKit access token. Room name = the appointment id so the web and the
  // mobile apps join the SAME room (the apps also use the raw appointment id).
  const {
    data: creds,
    isLoading: credsLoading,
    error: credsError,
  } = useQuery<LiveKitCreds>({
    queryKey: ["livekit-token", id],
    enabled: !!appt && isVideo && isParticipant && !isCancelled,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("livekit-token", {
        body: {
          roomName: id,
          participantName: profile?.full_name ?? user?.email ?? "Guest",
          role,
        },
      });
      if (error) throw error;
      return data as LiveKitCreds;
    },
  });

  // Wait for the doctor_details.id to resolve before deciding authorization,
  // otherwise a doctor briefly sees the "not authorized" screen.
  const resolvingDoctor = userRole === "doctor" && doctorDetailsId === undefined;
  if (authLoading || isLoading || resolvingDoctor) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!appt) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">{t("Appointment not found", "الموعد غير موجود")}</p>
      </div>
    );
  }

  if (!isParticipant) {
    return (
      <div className="text-center py-20 px-4">
        <p className="text-muted-foreground">
          {t("You are not authorized to join this consultation.", "غير مصرح لك بدخول هذه الاستشارة.")}
        </p>
        <Link to="/appointments" className="mt-4 inline-block text-primary hover:underline">
          {t("Back to appointments", "العودة للمواعيد")}
        </Link>
      </div>
    );
  }

  if (!isVideo) {
    return (
      <div className="text-center py-20 px-4">
        <p className="text-muted-foreground">
          {t("This is an in-person appointment.", "هذا موعد في العيادة وليس عن بُعد.")}
        </p>
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="text-center py-20 px-4">
        <p className="text-muted-foreground">{t("This appointment has been cancelled.", "تم إلغاء هذا الموعد.")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <Link to="/appointments" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t("Leave room", "مغادرة الغرفة")}
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <div className="h-2 w-2 rounded-full bg-teal animate-pulse" />
            <Video className="h-4 w-4 text-primary" />
            <span className="text-foreground font-medium">
              {t("Video consultation", "استشارة عن بُعد")}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-black">
        {!mounted || credsLoading ? (
          <div className="flex items-center justify-center h-[calc(100vh-57px)]">
            <Loader2 className="h-8 w-8 animate-spin text-white/80" />
          </div>
        ) : credsError || !creds?.token || !creds?.wsUrl ? (
          <div className="flex flex-col items-center justify-center h-[calc(100vh-57px)] gap-3 px-4 text-center">
            <p className="text-white/80">
              {t("Could not start the session. Please try again.", "تعذّر بدء الجلسة. حاول مرة أخرى.")}
            </p>
            <Link to="/appointments" className="text-primary hover:underline">
              {t("Back to appointments", "العودة للمواعيد")}
            </Link>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-[calc(100vh-57px)]">
                <Loader2 className="h-8 w-8 animate-spin text-white/80" />
              </div>
            }
          >
            <ConsultationRoom
              wsUrl={creds.wsUrl}
              token={creds.token}
              onLeave={() => navigate({ to: "/appointments" })}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
