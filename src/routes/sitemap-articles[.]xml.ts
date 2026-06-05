import { createFileRoute } from "@tanstack/react-router";
import { buildUrlset, fetchArticleEntries, XML_HEADERS } from "@/lib/sitemap";

export const Route = createFileRoute("/sitemap-articles.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries = await fetchArticleEntries();
        return new Response(buildUrlset(entries), {
          status: 200,
          headers: XML_HEADERS,
        });
      },
    },
  },
});
