import { createFileRoute } from "@tanstack/react-router";
import { STATIC_ENTRIES, buildUrlset, XML_HEADERS } from "@/lib/sitemap";

export const Route = createFileRoute("/sitemap-static.xml")({
  server: {
    handlers: {
      GET: async () => {
        const today = new Date().toISOString().slice(0, 10);
        const xml = buildUrlset(STATIC_ENTRIES.map((e) => ({ lastmod: today, ...e })));
        return new Response(xml, { status: 200, headers: XML_HEADERS });
      },
    },
  },
});
