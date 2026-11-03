/**
 * Server-only helpers for the outbound messaging queue (public.outbox_messages).
 *
 * The queue is drained by the `send-outbox` edge function (pg_cron calls it
 * every minute). After we enqueue something that the user is waiting for —
 * a welcome message to a just-imported patient, an invite — we also poke the
 * function right away so the message leaves within seconds, not a minute.
 *
 * Auth to the function: the service-role key as a Bearer token (the function
 * compares it against its own SUPABASE_SERVICE_ROLE_KEY; verify_jwt is off).
 */

export async function triggerOutboxDrain(
  limit = 25,
): Promise<{ ok: boolean; sent?: number; error?: string }> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, error: "supabase_not_configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/functions/v1/send-outbox`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ limit }),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as { sent?: number; error?: string };
    if (!res.ok) return { ok: false, error: json?.error ?? `HTTP ${res.status}` };
    return { ok: true, sent: json?.sent ?? 0 };
  } catch (e) {
    // Best effort only — the cron sweeper will pick the rows up anyway.
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
