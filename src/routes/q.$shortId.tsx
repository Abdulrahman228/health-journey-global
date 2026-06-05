import { createFileRoute, redirect } from "@tanstack/react-router";
import { resolveShortLink } from "@/lib/profile.functions";

/**
 * /q/{shortId} — resolves to a profile path and redirects.
 * Used by QR codes and short marketing links.
 */
export const Route = createFileRoute("/q/$shortId")({
  loader: async ({ params }) => {
    const target = await resolveShortLink({ data: params.shortId });
    throw redirect({ to: target ?? "/", replace: true });
  },
  component: () => null,
});
