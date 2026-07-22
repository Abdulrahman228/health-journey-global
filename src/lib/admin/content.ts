import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveAdmin, runAdminAction } from "./_kit";
import { AdminDeleteContentSchema } from "./_schemas";

/**
 * Delete community content — moderation (level: admin).
 *
 *  - post   → removes children (reactions, reports, drug info, replies) first,
 *             then the post.
 *  - reply  → removes direct child replies, then the reply.
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

        if (contentType === "post") {
          await supabaseAdmin.from("post_reactions").delete().eq("post_id", contentId);
          await supabaseAdmin.from("post_reports").delete().eq("post_id", contentId);
          await supabaseAdmin.from("post_drug_info").delete().eq("post_id", contentId);
          await supabaseAdmin.from("post_replies").delete().eq("post_id", contentId);
          const { error } = await supabaseAdmin.from("posts").delete().eq("id", contentId);
          if (error) throw new Error(error.message);
        } else if (contentType === "reply") {
          await supabaseAdmin.from("post_replies").delete().eq("parent_reply_id", contentId);
          const { error } = await supabaseAdmin.from("post_replies").delete().eq("id", contentId);
          if (error) throw new Error(error.message);
        } else {
          const { error } = await supabaseAdmin.from("reviews").delete().eq("id", contentId);
          if (error) throw new Error(error.message);
        }

        return {
          resourceId: contentId,
          summary: `deleted ${contentType}: ${data.reason}`,
          metadata: { contentType, reason: data.reason },
          result: { ok: true, contentType, deleted: true },
        };
      },
    });
  });
