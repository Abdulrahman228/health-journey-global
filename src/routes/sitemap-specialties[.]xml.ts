import { createFileRoute } from "@tanstack/react-router";
import {
  buildUrlset,
  fetchSpecialtyEntries,
  fetchSpecialtyCityEntries,
  XML_HEADERS,
} from "@/lib/sitemap";

export const Route = createFileRoute("/sitemap-specialties.xml")({
  server: {
    handlers: {
      GET: async () => {
        const [s, c] = await Promise.all([
          fetchSpecialtyEntries(),
          fetchSpecialtyCityEntries(),
        ]);
        return new Response(buildUrlset([...s, ...c]), {
          status: 200,
          headers: XML_HEADERS,
        });
      },
    },
  },
});
