import { AccessToken, type VideoGrant } from "npm:livekit-server-sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type LiveKitTokenRequest = {
  roomName?: string;
  participantName?: string;
  role?: "doctor" | "patient" | string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const body = (await req.json()) as LiveKitTokenRequest;
    const roomName = sanitizeRoomName(body.roomName);
    const participantName = sanitizeText(body.participantName ?? "tabibi-user", 80);
    const role = sanitizeText(body.role ?? "patient", 24);

    if (!roomName || !participantName) {
      return jsonResponse({ error: "roomName_and_participantName_required" }, 400);
    }

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const wsUrl = Deno.env.get("LIVEKIT_WS_URL");

    if (!apiKey || !apiSecret || !wsUrl) {
      return jsonResponse(
        { error: "livekit_env_not_configured" },
        500,
      );
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: `${role}-${participantName}`,
      name: participantName,
      ttl: "1h",
      metadata: JSON.stringify({ role }),
    });

    const videoGrant: VideoGrant = {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    };

    token.addGrant(videoGrant);

    return jsonResponse(
      {
        token: await token.toJwt(),
        wsUrl,
      },
      200,
    );
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
