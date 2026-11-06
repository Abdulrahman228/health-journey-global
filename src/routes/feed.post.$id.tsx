import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Stethoscope,
  User as UserIcon,
  Heart,
  Pill,
  MapPin,
  Send,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getPost,
  listReplies,
  createReply,
  toggleReaction,
  getUserReactions,
  setResolved,
  toAuthorRole,
  deletePost,
  type FeedPost,
  type FeedReply,
} from "@/lib/feed";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";

export const Route = createFileRoute("/feed/post/$id")({
  head: () => ({ meta: [{ title: "بوست — Tebana" }] }),
  component: PostPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-foreground">البوست غير موجود</h1>
      <Link to="/feed" className="mt-4 inline-block text-primary hover:underline">
        عودة للمجتمع
      </Link>
    </div>
  ),
  errorComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <p className="text-muted-foreground">حدث خطأ</p>
      <Link to="/feed" className="mt-4 inline-block text-primary hover:underline">
        عودة
      </Link>
    </div>
  ),
});

function PostPage() {
  const { id } = Route.useParams();
  const { t, language } = useLanguage();
  const { user, roles, isAuthenticated } = useAuth();
  const userId = user?.id ?? null;
  const navigate = useNavigate();

  const [post, setPost] = useState<FeedPost | null>(null);
  const [replies, setReplies] = useState<FeedReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [posting, setPosting] = useState(false);
  const [liking, setLiking] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    Promise.all([getPost(id), listReplies(id)])
      .then(async ([p, r]) => {
        if (cancelled) return;
        // p === null → the "Post not found" view below.
        setPost(p);
        setReplies(r);
        if (p && userId) {
          const reacted = await getUserReactions(userId, [id]);
          if (!cancelled) setLiked(reacted.has(id));
        }
      })
      .catch((e) => {
        console.error("[feed/post] load failed:", e);
        if (!cancelled) setLoadError(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, userId]);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("[feed/post] profile lookup failed:", error.message);
        if (data) setProfileId(data.id);
      });
  }, [userId]);

  const handleLike = async () => {
    if (!isAuthenticated || !user || !post) {
      toast.error(t("Sign in to react", "سجّل دخول للتفاعل"));
      return;
    }
    if (liking) return;
    const prev = liked;
    const prevPost = post;
    setLiking(true);
    setLiked(!liked);
    setPost({ ...post, reactions_count: post.reactions_count + (liked ? -1 : 1) });
    try {
      await toggleReaction(post.id, user.id);
    } catch {
      setLiked(prev);
      setPost(prevPost);
      toast.error(t("Couldn't update reaction", "تعذّر تحديث التفاعل"));
    } finally {
      setLiking(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !replyText.trim() || !post) return;
    if (!profileId) {
      toast.error(
        t(
          "Your profile isn't ready yet — reload the page.",
          "ملفك الشخصي غير جاهز بعد — أعد تحميل الصفحة.",
        ),
      );
      return;
    }
    setPosting(true);
    try {
      await createReply({
        postId: post.id,
        authorProfileId: profileId,
        authorRole: toAuthorRole(roles),
        body: replyText.trim(),
      });
      setReplyText("");
      const r = await listReplies(post.id);
      setReplies(r);
      setPost({ ...post, replies_count: r.length });
      toast.success(t("Reply posted", "تم نشر الرد"));
    } catch (err) {
      console.error("[feed/post] reply failed:", err);
      toast.error(t("Couldn't post your reply — try again.", "تعذّر نشر الرد — حاول مرة أخرى."));
    } finally {
      setPosting(false);
    }
  };

  const handleMarkResolved = async () => {
    if (!post) return;
    try {
      await setResolved(post.id, !post.is_resolved);
      setPost({ ...post, is_resolved: !post.is_resolved });
      toast.success(
        post.is_resolved
          ? t("Marked unresolved", "تم إلغاء الحل")
          : t("Marked as resolved", "تم تحديده كمحلول"),
      );
    } catch {
      toast.error(t("Couldn't update the post.", "تعذّر تحديث البوست."));
    }
  };

  const handleDelete = async () => {
    if (!post) return;
    if (!confirm(t("Delete this post?", "حذف هذا البوست؟"))) return;
    try {
      await deletePost(post.id);
      toast.success(t("Deleted", "تم الحذف"));
      navigate({ to: "/feed" });
    } catch {
      toast.error(t("Couldn't delete the post.", "تعذّر حذف البوست."));
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <p className="text-destructive">
          {t(
            "Couldn't load this post. Check your connection.",
            "تعذّر تحميل البوست. تحقّق من الاتصال.",
          )}
        </p>
        <Link
          to="/feed"
          className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {t("Back to community", "العودة للمجتمع")}
        </Link>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-foreground">
          {t("Post not found", "المنشور غير موجود")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("It may have been removed.", "ربما تم حذفه.")}
        </p>
        <Link
          to="/feed"
          className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {t("Back to community", "العودة للمجتمع")}
        </Link>
      </div>
    );
  }

  const isOwner = post.author_profile_id === profileId;
  const isDoctor = post.author_role === "doctor";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <Link
        to="/feed"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t("Back to feed", "عودة للمجتمع")}
      </Link>

      {/* Post */}
      <article className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${isDoctor ? "bg-primary/10" : "bg-muted"}`}
          >
            {isDoctor ? (
              <Stethoscope className="h-5 w-5 text-primary" />
            ) : (
              <UserIcon className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-foreground">
                {post.author?.full_name ?? t("Anonymous", "مجهول")}
              </span>
              {post.is_author_verified_doctor && <BadgeCheck className="h-4 w-4 text-primary" />}
              {post.author_specialty && (
                <span className="text-xs text-muted-foreground">· {post.author_specialty}</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>
                {new Date(post.created_at).toLocaleString(language === "ar" ? "ar-EG" : "en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
              {post.city && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <MapPin className="h-3 w-3" />
                    {post.city}
                  </span>
                </>
              )}
            </div>
          </div>
          {isOwner && (
            <div className="flex gap-1">
              {post.post_type === "missing_drug" && (
                <button
                  onClick={handleMarkResolved}
                  className={`rounded-lg px-2 py-1 text-xs ${post.is_resolved ? "bg-teal/10 text-teal" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                  title={t("Toggle resolved", "تبديل الحل")}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={handleDelete}
                className="rounded-lg bg-muted p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <h1 className="mt-4 text-xl font-bold text-foreground">{post.title}</h1>
        <p className="mt-2 whitespace-pre-wrap text-foreground/90">{post.body}</p>

        {post.post_type === "missing_drug" && post.drug_info && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/20 p-3">
            <div className="flex items-center gap-2 text-sm">
              <Pill className="h-4 w-4 text-rose-600" />
              <span className="font-semibold text-rose-700 dark:text-rose-300">
                {post.drug_info.drug_name}
              </span>
              {post.drug_info.dosage && <span>— {post.drug_info.dosage}</span>}
            </div>
            {post.drug_info.alternative_suggested && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Alternative", "البديل")}: {post.drug_info.alternative_suggested}
              </p>
            )}
            {post.is_resolved && (
              <div className="mt-1 text-xs font-medium text-teal">✓ {t("Resolved", "تم الحل")}</div>
            )}
          </div>
        )}

        {post.media_urls.length > 0 && (
          <div
            className={`mt-4 grid gap-2 ${post.media_urls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
          >
            {post.media_urls.map((url, i) => (
              <img key={i} src={url} alt="" className="w-full rounded-lg object-cover max-h-96" />
            ))}
          </div>
        )}

        {post.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center gap-4 border-t border-border pt-3">
          <button
            onClick={handleLike}
            disabled={liking}
            className={`inline-flex items-center gap-1.5 text-sm ${liked ? "text-rose-600" : "text-muted-foreground hover:text-rose-600"}`}
          >
            <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
            <span>{post.reactions_count}</span>
          </button>
          <span className="text-sm text-muted-foreground">
            {post.replies_count} {t("replies", "رد")}
          </span>
        </div>
      </article>

      {/* Reply composer */}
      {isAuthenticated ? (
        <form onSubmit={handleReply} className="mt-6 rounded-2xl border border-border bg-card p-4">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={t("Write a reply...", "اكتب رداً...")}
            maxLength={2000}
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{replyText.length}/2000</span>
            <button
              type="submit"
              disabled={posting || !replyText.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              <Send className="h-4 w-4 rtl:rotate-180" />
              {posting ? t("Posting...", "جاري النشر...") : t("Reply", "رد")}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline">
              {t("Sign in", "سجّل دخول")}
            </Link>
            {t(" to join the conversation.", " للمشاركة في النقاش.")}
          </p>
        </div>
      )}

      {/* Replies */}
      <div className="mt-6 space-y-3">
        {replies.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            {t("No replies yet.", "لا توجد ردود بعد.")}
          </p>
        ) : (
          replies.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${r.is_doctor_verified ? "bg-primary/10" : "bg-muted"}`}
                >
                  {r.is_doctor_verified ? (
                    <Stethoscope className="h-4 w-4 text-primary" />
                  ) : (
                    <UserIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground">
                      {r.author?.full_name ?? t("Anonymous", "مجهول")}
                    </span>
                    {r.is_doctor_verified && <BadgeCheck className="h-3.5 w-3.5 text-primary" />}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString(
                      language === "ar" ? "ar-EG" : "en-US",
                    )}
                  </span>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{r.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
