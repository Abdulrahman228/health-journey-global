// send-push — delivers a push notification via Firebase Cloud Messaging (HTTP v1).
//
// Works for BOTH platforms: Android registers a native FCM token; iOS registers
// via Firebase too (FCM maps to APNs under the hood), so one sender covers both.
//
// Wiring: create a Supabase Database Webhook on `notifications` INSERT that POSTs
// the new row here (Dashboard → Database → Webhooks). This function looks up the
// recipient's fcm_token and sends the push.
//
// Secrets required:
//   FCM_SERVICE_ACCOUNT  – the Firebase service-account JSON (as a string)
//   PUSH_WEBHOOK_SECRET  – shared secret; set the same value as a custom header
//                          `x-webhook-secret` on the Database Webhook (optional
//                          but recommended). If unset, the check is skipped.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function b64url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
};

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

// Sign a JWT with the service account and exchange it for an OAuth access token.
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${b64urlBytes(new Uint8Array(sig))}`;

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`token exchange failed: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

// Look up a user's push token (server-side, service role — never exposed).
async function getUserToken(userId: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return null;
  const res = await fetch(
    `${supabaseUrl}/rest/v1/profiles?user_id=eq.${userId}&select=fcm_token`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ fcm_token: string | null }>;
  return rows?.[0]?.fcm_token ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Shared-secret gate — MANDATORY (2026-11-02 audit). Without it anyone could
  // push arbitrary notifications to any user. Set PUSH_WEBHOOK_SECRET on the
  // function and send the same value in the `x-webhook-secret` header from the
  // Database Webhook / server caller.
  const expected = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!expected) return json({ error: "push_not_configured" }, 503);
  if (req.headers.get("x-webhook-secret") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const saRaw = Deno.env.get("FCM_SERVICE_ACCOUNT");
  if (!saRaw) return json({ error: "fcm_not_configured" }, 500);
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(saRaw) as ServiceAccount;
  } catch {
    return json({ error: "bad_service_account" }, 500);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // Accept either a Database Webhook envelope ({ record: {...} }) or a direct body.
  const record = (payload.record as Record<string, unknown>) ?? payload;
  const userId = String(record.user_id ?? payload.userId ?? "");
  const title = String(record.title ?? payload.title ?? "طبانا");
  const body = String(record.body ?? payload.body ?? "");
  const link = record.link != null ? String(record.link) : undefined;
  if (!userId) return json({ error: "user_id_required" }, 400);

  const token = await getUserToken(userId);
  if (!token) return json({ ok: true, skipped: "no_token" }); // user has no device registered

  try {
    const accessToken = await getAccessToken(sa);
    const message: Record<string, unknown> = {
      token,
      notification: { title, body },
      data: link ? { link } : undefined,
      // Audible + high priority on both platforms. Uses the app's existing
      // high-importance "appointments" channel (already sounds by default), so
      // background pushes ring instead of landing in a silent fallback channel.
      android: {
        priority: "high",
        notification: { sound: "default", channel_id: "appointments" },
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: { aps: { sound: "default" } },
      },
    };
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      },
    );
    if (!res.ok) return json({ error: "fcm_send_failed", detail: await res.text() }, 502);
    return json({ ok: true });
  } catch (e) {
    return json({ error: "internal_error", detail: String(e) }, 500);
  }
});
