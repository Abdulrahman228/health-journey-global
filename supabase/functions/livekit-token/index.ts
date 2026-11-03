// livekit-token — mints a LiveKit room token for a telemedicine consultation.
//
// SECURITY (2026-11-02 audit): the previous version minted a publish/subscribe
// token for ANY room name without authentication, so anyone holding an
// appointment id (they are listed on the public queue board) could join a
// live consultation. Now:
//   • the caller must send a valid Supabase user JWT;
//   • the room name must be the id of an appointment the caller is a party
//     to (patient or doctor) — resolved through RLS, never from the body;
//   • the participant identity is derived from the authenticated user, so a
//     caller cannot impersonate the doctor or another patient.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken, type VideoGrant } from "npm:livekit-server-sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type LiveKitTokenRequest = {
  roomName?: string;
  participantName?: string;
  role?: string; // ignored — the role is resolved from the appointment
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLOSED_STATUSES = new Set(["cancelled", "no_show"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    // 1) Authenticate the caller.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return jsonResponse({ error: "not_authenticated" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) {
      return jsonResponse({ error: "server_misconfigured" }, 500);
    }

    // Client acting AS the caller so RLS + auth.uid() resolve correctly.
    const supa = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await supa.auth.getUser(jwt);
    const user = userData?.user;
    if (userErr || !user) return jsonResponse({ error: "not_authenticated" }, 401);

    // 2) Validate the request.
    const body = (await req.json().catch(() => ({}))) as LiveKitTokenRequest;
    const roomName = sanitizeRoomName(body.roomName);
    const participantName = sanitizeText(body.participantName ?? "tabibi-user", 80);
    if (!roomName || !UUID_RE.test(roomName)) {
      return jsonResponse({ error: "roomName_must_be_an_appointment_id" }, 400);
    }

    // 3) Authorize: the room is an appointment the caller is a party to.
    //    Under RLS only the patient, the doctor (and admins) can see the row.
    const { data: appt, error: apptErr } = await supa
      .from("appointments")
      .select("id, patient_id, doctor_id, status")
      .eq("id", roomName)
      .maybeSingle();
    if (apptErr || !appt) return jsonResponse({ error: "forbidden" }, 403);
    if (CLOSED_STATUSES.has(String(appt.status))) {
      return jsonResponse({ error: "appointment_closed" }, 403);
    }

    const { data: me } = await supa
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!me?.id) return jsonResponse({ error: "forbidden" }, 403);

    let role: "patient" | "doctor" | null = null;
    if (me.id === appt.patient_id) {
      role = "patient";
    } else {
      const { data: dd } = await supa
        .from("doctor_details")
        .select("id")
        .eq("id", appt.doctor_id)
        .eq("profile_id", me.id)
        .maybeSingle();
      if (dd?.id) role = "doctor";
    }
    if (!role) return jsonResponse({ error: "forbidden" }, 403);

    // 4) Mint the token.
    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const wsUrl = Deno.env.get("LIVEKIT_WS_URL");
    if (!apiKey || !apiSecret || !wsUrl) {
      return jsonResponse({ error: "livekit_env_not_configured" }, 500);
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: `${role}-${user.id}`, // stable + unforgeable
      name: participantName,
      ttl: "1h",
      metadata: JSON.stringify({ role, appointmentId: appt.id }),
    });

    const videoGrant: VideoGrant = {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    };
    token.addGrant(videoGrant);

    return jsonResponse({ token: await token.toJwt(), wsUrl, role }, 200);
  } catch (error) {
    return jsonResponse(
      {
        error: "token_generation_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

function sanitizeRoomName(value: unknown): string {
  return sanitizeText(String(value ?? ""), 96).replace(/[^A-Za-z0-9_.:-]/g, "-");
}

function sanitizeText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
