import { createFileRoute } from "@tanstack/react-router";
import { buildUrlset, fetchDoctorEntries, XML_HEADERS } from "@/lib/sitemap";

export const Route = createFileRoute("/sitemap-doctors.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries = await fetchDoctorEntries();
        return new Response(buildUrlset(entries), {
          status: 200,
          headers: XML_HEADERS,
        });
      },
    },
  },
});
