import { Link } from "@tanstack/react-router";
import {
  Heart,
  MessageCircle,
  BadgeCheck,
  Pill,
  AlertTriangle,
  Megaphone,
  MapPin,
  Stethoscope,
  User as UserIcon,
} from "lucide-react";
import { useState } from "react";
import { toggleReaction, type FeedPost } from "@/lib/feed";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";

const typeMeta = {
  awareness: {
    icon: Megaphone,
    color: "text-teal bg-teal/10 border-teal/20",
    labelEn: "Awareness",
    labelAr: "توعية",
  },
  question: {
    icon: AlertTriangle,
    color:
      "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20",
    labelEn: "Question",
    labelAr: "استفسار",
  },
  missing_drug: {
    icon: Pill,
    color: "text-rose-600 bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20",
    labelEn: "Missing Drug",
    labelAr: "دواء ناقص",
  },
};

export function PostCard({
  post,
  initiallyLiked = false,
}: {
  post: FeedPost;
  initiallyLiked?: boolean;
}) {
  const { isAuthenticated, user } = useAuth();
  const { t, language } = useLanguage();
  const [liked, setLiked] = useState(initiallyLiked);
  const [count, setCount] = useState(post.reactions_count);
  const [busy, setBusy] = useState(false);

  const meta = typeMeta[post.post_type];
  const Icon = meta.icon;

  const handleLike = async () => {
    if (!isAuthenticated || !user) {
      toast.error(t("Sign in to react", "سجّل دخول للتفاعل"));
      return;
    }
    setBusy(true);
    const prevLiked = liked;
    setLiked(!liked);
    setCount(count + (liked ? -1 : 1));
    try {
      await toggleReaction(post.id, user.id);
    } catch {
      setLiked(prevLiked);
      setCount(count);
      toast.error(t("Couldn't update reaction", "تعذّر تحديث التفاعل"));
    } finally {
      setBusy(false);
    }
  };

  const authorName = post.author?.full_name ?? t("Anonymous", "مجهول");
  const isDoctor = post.author_role === "doctor";

  return (
    <article className="rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isDoctor ? "bg-primary/10" : "bg-muted"}`}
        >
          {isDoctor ? (
            <Stethoscope className="h-5 w-5 text-primary" />
          ) : (
            <UserIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {post.author_doctor_id ? (
              <Link
                to="/doctor/$id"
                params={{ id: post.author_doctor_id }}
                className="font-semibold text-foreground hover:text-primary truncate"
              >
                {authorName}
              </Link>
            ) : (
              <span className="font-semibold text-foreground truncate">{authorName}</span>
            )}
            {post.is_author_verified_doctor && (
              <BadgeCheck
                className="h-4 w-4 text-primary shrink-0"
                aria-label={t("Verified doctor", "طبيب موثّق")}
              />
            )}
            {post.author_specialty && (
              <span className="text-xs text-muted-foreground">· {post.author_specialty}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>
              {new Date(post.created_at).toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", {
                dateStyle: "medium",
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
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.color}`}
        >
          <Icon className="h-3 w-3" />
          {language === "ar" ? meta.labelAr : meta.labelEn}
        </span>
      </div>

      {/* Body */}
      <Link to="/feed/post/$id" params={{ id: post.id }} className="mt-3 block">
        <h3 className="text-lg font-semibold text-foreground hover:text-primary line-clamp-2">
          {post.title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
          {post.body}
        </p>
      </Link>

      {/* Drug info badge */}
      {post.post_type === "missing_drug" && post.drug_info && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/20 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Pill className="h-4 w-4 text-rose-600" />
            <span className="font-semibold text-rose-700 dark:text-rose-300">
              {post.drug_info.drug_name}
            </span>
            {post.drug_info.dosage && (
              <span className="text-rose-600/80">— {post.drug_info.dosage}</span>
            )}
          </div>
          {post.is_resolved && (
            <div className="mt-1 text-xs font-medium text-teal">✓ {t("Resolved", "تم الحل")}</div>
          )}
        </div>
      )}

      {/* Media */}
      {post.media_urls.length > 0 && (
        <div
          className={`mt-3 grid gap-2 ${post.media_urls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
        >
          {post.media_urls.slice(0, 4).map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              className="h-40 w-full rounded-lg object-cover"
              loading="lazy"
            />
          ))}
        </div>
      )}

      {/* Tags */}
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

      {/* Actions */}
      <div className="mt-4 flex items-center gap-4 border-t border-border pt-3">
        <button
          onClick={handleLike}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 text-sm transition-colors ${liked ? "text-rose-600" : "text-muted-foreground hover:text-rose-600"}`}
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
          <span>{count}</span>
        </button>
        <Link
          to="/feed/post/$id"
          params={{ id: post.id }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
        >
          <MessageCircle className="h-4 w-4" />
          <span>{post.replies_count}</span>
        </Link>
      </div>
    </article>
  );
}
