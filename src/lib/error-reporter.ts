/**
 * Centralized error reporter for client + server.
 *
 * Usage:
 *   import { reportError } from "@/lib/error-reporter";
 *   reportError(err, { context: { foo: "bar" }, source: "client" });
 *
 * On the client, errors batch and flush every 10s or when the page hides.
 * On the server, errors flush immediately to Supabase REST API.
 *
 * Privacy: Strips bearer tokens, refresh tokens, and email-shaped strings
 * from messages and stack traces before persisting.
 */

type ErrorLevel = "debug" | "info" | "warn" | "error" | "fatal";
type ErrorSource = "client" | "server" | "sw";

type ReportEntry = {
  source: ErrorSource;
  level: ErrorLevel;
  message: string;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
  user_id: string | null;
  context: Record<string, unknown>;
  fingerprint: string;
};

type ReportOptions = {
  source?: ErrorSource;
  level?: ErrorLevel;
  context?: Record<string, unknown>;
  userId?: string | null;
};

const SUPABASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== "undefined" && process.env?.SUPABASE_URL) ||
  "https://wqrrwvaxovrjjiilqkmt.supabase.co";

const SUPABASE_ANON =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  (typeof process !== "undefined" && process.env?.SUPABASE_PUBLISHABLE_KEY) ||
  "";

const ENDPOINT = `${SUPABASE_URL}/rest/v1/error_logs`;
const FLUSH_INTERVAL_MS = 10_000;
const MAX_BATCH = 50;
const SAMPLING_RATE = 1.0; // 100% — drop to 0.1 if volume gets noisy.

const isBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";

const queue: ReportEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function redact(input: string): string {
  if (!input) return input;
  return input
    // Bearer / JWT tokens
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, "***JWT***")
    // Email addresses
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "***@***")
    // Stripe-like keys
    .replace(/sk_(?:test|live)_[A-Za-z0-9]{16,}/g, "sk_***")
    .replace(/pk_(?:test|live)_[A-Za-z0-9]{16,}/g, "pk_***");
}

function fingerprintFor(message: string, stack: string | null): string {
  const base = (stack ?? message).split("\n").slice(0, 3).join("|");
  let h = 0;
  for (let i = 0; i < base.length; i++) {
    h = ((h << 5) - h + base.charCodeAt(i)) | 0;
  }
  return `fp_${(h >>> 0).toString(36)}`;
}

function normalizeError(err: unknown): { message: string; stack: string | null } {
  if (err instanceof Error) {
    return {
      message: redact(err.message || err.name || "Error"),
      stack: err.stack ? redact(err.stack) : null,
    };
  }
  if (typeof err === "string") return { message: redact(err), stack: null };
  try {
    return { message: redact(JSON.stringify(err).slice(0, 1000)), stack: null };
  } catch {
    return { message: "Unserializable error", stack: null };
  }
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH);
  if (!SUPABASE_ANON) return; // No-op in environments without a key.

  try {
    const body = JSON.stringify(batch);
    const headers: Record<string, string> = {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    };
    // NOTE: sendBeacon cannot set custom headers, but Supabase REST requires
    // an `apikey` header — so we always use fetch with keepalive:true instead
    // (which is supported by all modern browsers and works during page unload).
    await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body,
      keepalive: true,
      credentials: "omit",
      mode: "cors",
    });
  } catch {
    // Swallow — we never want telemetry to crash the app.
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

export function reportError(err: unknown, opts: ReportOptions = {}): void {
  if (Math.random() > SAMPLING_RATE) return;
  const { message, stack } = normalizeError(err);
  const entry: ReportEntry = {
    source: opts.source ?? (isBrowser ? "client" : "server"),
    level: opts.level ?? "error",
    message: message.slice(0, 1000),
    stack: stack ? stack.slice(0, 4000) : null,
    url: isBrowser ? window.location.href.slice(0, 500) : null,
    user_agent: isBrowser ? navigator.userAgent.slice(0, 300) : null,
    user_id: opts.userId ?? null,
    context: opts.context ?? {},
    fingerprint: fingerprintFor(message, stack),
  };
  queue.push(entry);

  if (entry.level === "fatal" || queue.length >= MAX_BATCH) {
    void flush();
  } else {
    scheduleFlush();
  }
}

/**
 * Initializes browser-side global handlers (window.onerror + unhandledrejection).
 * Idempotent — safe to call multiple times.
 */
let installed = false;
export function installClientErrorHandlers(): void {
  if (!isBrowser || installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    reportError(event.error ?? new Error(event.message ?? "window.onerror"), {
      source: "client",
      context: { lineno: event.lineno, colno: event.colno, filename: event.filename },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason ?? new Error("unhandledrejection"), {
      source: "client",
      context: { type: "unhandledrejection" },
    });
  });

  // Flush on visibility hidden / pagehide (mobile especially).
  const flushOnHide = () => {
    if (queue.length > 0) void flush();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnHide();
  });
  window.addEventListener("pagehide", flushOnHide);
}
