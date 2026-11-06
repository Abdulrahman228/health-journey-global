import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveAdmin, runAdminAction } from "./_kit";
import { AdminDeleteContentSchema } from "./_schemas";

/**
 * Delete community content — moderation (level: admin).
 *
 *  - post   → deletes the post (reactions, reports, drug info, replies cascade).
 *  - reply  → deletes the reply (nested replies + reports cascade).
 *  - review → deletes the review row.
 *
 * Server logic stays inside the inline handler so it is stripped from the client.
 */
export const adminDeleteContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminDeleteContentSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const admin = await resolveAdmin(context.userId, "admin");
    return runAdminAction({
      admin,
      action: "content.delete",
      resourceType: "content",
      mutate: async () => {
        const { contentType, contentId } = data;

        // Children (reactions, reports, drug info, nested replies) are removed
        // by ON DELETE CASCADE FKs on posts / post_replies. `.select("id")`
        // turns "nothing matched" into a real error instead of a fake success.
        const { data: deleted, error } =
          contentType === "post"
            ? await supabaseAdmin.from("posts").delete().eq("id", contentId).select("id")
            : contentType === "reply"
              ? await supabaseAdmin.from("post_replies").delete().eq("id", contentId).select("id")
              : await supabaseAdmin.from("reviews").delete().eq("id", contentId).select("id");
        if (error) throw new Error(error.message);
        if (!deleted || deleted.length === 0) throw new Error("Content not found.");

        return {
          resourceId: contentId,
          summary: `deleted ${contentType}: ${data.reason}`,
          metadata: { contentType, reason: data.reason },
          result: { ok: true, contentType, deleted: true },
        };
      },
    });
  });
