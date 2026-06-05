/**
 * /indexnow-key.txt — IndexNow ownership verification file.
 *
 * Per https://www.indexnow.org/documentation the key file must:
 *  - Live at the URL referenced by `keyLocation` in our submissions.
 *  - Contain ONLY the key as plain UTF-8 text (no JSON, no whitespace).
 *
 * We serve it dynamically from the `INDEXNOW_KEY` env var so rotation
 * is a one-line change with no redeploy needed.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getIndexNowKey } from "@/lib/indexnow";

export const Route = createFileRoute("/indexnow-key.txt")({
  server: {
    handlers: {
      GET: () => {
        const key = getIndexNowKey();
        if (!key) {
          return new Response("INDEXNOW_KEY not configured", { status: 404 });
        }
        return new Response(key, {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=86400, s-maxage=604800",
          },
        });
      },
    },
  },
});
