import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { reportError } from "./lib/error-reporter";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  const captured = consumeLastCapturedError();
  const err = captured ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(err);
  reportError(err, {
    source: "server",
    level: "error",
    context: { kind: "ssr_swallowed", responseStatus: response.status },
  });
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // ----------------------------------------------------------------------
    // 1) Canonicalize host: www.mytabibi.com → mytabibi.com (301).
    //    Also forces HTTPS just in case CF ever serves us http.
    // ----------------------------------------------------------------------
    const url = new URL(request.url);
    if (url.hostname === "www.mytabibi.com") {
      url.hostname = "mytabibi.com";
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);

      // 2) Add Last-Modified to HTML responses for SEO content-freshness signal.
      const ct = normalized.headers.get("content-type") ?? "";
      if (ct.includes("text/html") && !normalized.headers.has("last-modified")) {
        const headers = new Headers(normalized.headers);
        headers.set("last-modified", new Date().toUTCString());
        return new Response(normalized.body, {
          status: normalized.status,
          statusText: normalized.statusText,
          headers,
        });
      }
      return normalized;
    } catch (error) {
      console.error(error);
      reportError(error, { source: "server", level: "fatal", context: { kind: "fetch_throw" } });
      return brandedErrorResponse();
    }
  },
};
