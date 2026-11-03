import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Maximize2, Minimize2, Smartphone, Loader2 } from "lucide-react";
import { QrCode } from "@/components/QrCode";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { siteConfig } from "@/lib/seo";

export const Route = createFileRoute("/dashboard/waiting-room")({
  component: WaitingRoomPage,
  head: () => ({ meta: [{ title: "شاشة صالة الانتظار — Tebana" }] }),
});

interface QueueStats {
  waiting_count: number;
  avg_minutes: number;
}

function WaitingRoomPage() {
  const { user, profile, isLoading } = useAuth();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [specialty, setSpecialty] = useState("");
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFs, setIsFs] = useState(false);

  // Resolve the current doctor (doctor_details.id drives the public booking URL).
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    (async () => {
      if (profile?.id) {
        const { data } = await supabase
          .from("doctor_details")
          .select("id, specialty")
          .eq("profile_id", profile.id)
          .maybeSingle();
        if (data) {
          setDoctorId(data.id as string);
          setSpecialty((data.specialty as string | null) ?? "");
        }
      }
      setLoading(false);
    })();
  }, [isLoading, user, profile?.id, navigate]);

  // Live counters — refresh every 30s while the screen is displayed.
  useEffect(() => {
    if (!doctorId) return;
    let active = true;
    const tick = async () => {
      // RPC is newer than the generated types — cast until `supabase gen types` is re-run.
      const { data } = await supabase.rpc("doctor_today_queue_stats" as never);
      if (active && Array.isArray(data) && data[0]) setStats(data[0] as QueueStats);
    };
    void tick();
    const iv = setInterval(tick, 30_000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [doctorId]);

  // Keep the clinic screen awake (best-effort; ignored where unsupported).
  useEffect(() => {
    let lock: { release?: () => void } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: string) => Promise<{ release?: () => void }> };
    };
    nav.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      try {
        lock?.release?.();
      } catch {
        /* noop */
      }
    };
  }, []);

  // Track fullscreen state for the toggle icon.
  useEffect(() => {
    const onFs = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  };

  const link =
    doctorId && typeof window !== "undefined" ? `${window.location.origin}/doctor/${doctorId}` : "";

  if (isLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!doctorId) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-muted-foreground">
          تعذّر تحميل بيانات الطبيب. تأكّد من إكمال ملفك كطبيب.
        </p>
        <Link
          to="/dashboard"
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          العودة للوحة
        </Link>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      dir="rtl"
      className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background px-6 py-10"
    >
      {/* Controls (subtle; hidden feel in fullscreen) */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/70 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur hover:bg-accent"
        >
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Link>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/70 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur hover:bg-accent"
        >
          {isFs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          {isFs ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
        </button>
      </div>

      {/* Doctor identity */}
      <h1 className="text-center text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
        {profile?.full_name ?? "طبيبك"}
      </h1>
      {specialty && <p className="mt-2 text-xl font-bold text-primary">{specialty}</p>}

      {/* Live counters */}
      {stats && (
        <div className="mt-5 inline-flex items-center gap-4 rounded-full border border-primary/20 bg-primary/5 px-5 py-2.5 text-primary">
          <span className="inline-flex items-center gap-2 font-bold">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            المنتظرون الآن: <span className="tabular-nums">{stats.waiting_count}</span>
          </span>
          <span className="h-4 w-px bg-primary/20" />
          <span className="font-bold">
            متوسط الكشف: <span className="tabular-nums">{stats.avg_minutes}</span> دقيقة
          </span>
        </div>
      )}

      {/* QR */}
      <div className="mt-8 rounded-3xl border-2 border-border bg-white p-6 shadow-xl">
        <QrCode value={link} size={320} />
      </div>

      {/* Call to action */}
      <div className="mt-8 flex items-center gap-3">
        <Smartphone className="h-8 w-8 text-primary" />
        <p className="text-center text-2xl font-extrabold text-foreground sm:text-3xl">
          امسح الكود لحجز دورك ومتابعة الطابور
        </p>
      </div>
      <p className="mt-2 text-base text-muted-foreground">افتح كاميرا هاتفك ووجّهها نحو الكود</p>

      <div className="mt-8 flex items-center gap-2 opacity-80">
        <img src="/logo-mark.png" alt="" className="h-7 w-7 rounded-lg object-cover" />
        <span className="text-xl font-extrabold text-primary">{siteConfig.brand.ar}</span>
      </div>
    </div>
  );
}
