import { reverseGeocode } from "@/lib/geo";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PostType = "awareness" | "question" | "missing_drug";
/** Values allowed by the posts/post_replies `author_role` CHECK constraint. */
export type AuthorRole = "doctor" | "patient" | "pharmacist" | "admin";

type PostRow = Database["public"]["Tables"]["posts"]["Row"];
type ReplyRow = Database["public"]["Tables"]["post_replies"]["Row"];
type DrugInfoRow = Pick<
  Database["public"]["Tables"]["post_drug_info"]["Row"],
  "drug_name" | "dosage" | "alternative_suggested"
>;

export interface FeedPost {
  id: string;
  author_profile_id: string;
  author_role: AuthorRole;
  post_type: PostType;
  title: string;
  body: string;
  specialty_id: string | null;
  tags: string[];
  media_urls: string[];
  city: string | null;
  country: string | null;
  is_pinned: boolean;
  is_resolved: boolean;
  reactions_count: number;
  replies_count: number;
  created_at: string;
  updated_at: string;
  // Joined
  author?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    city: string | null;
  };
  is_author_verified_doctor?: boolean;
  author_specialty?: string | null;
  /** doctor_details.id of the author (what /doctor/$id expects), when a doctor. */
  author_doctor_id?: string | null;
  drug_info?: {
    drug_name: string;
    dosage: string | null;
    alternative_suggested: string | null;
  } | null;
}

export interface FeedReply {
  id: string;
  post_id: string;
  author_profile_id: string;
  author_role: AuthorRole;
  body: string;
  parent_reply_id: string | null;
  is_doctor_verified: boolean;
  created_at: string;
  author?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

const POST_TYPES: readonly PostType[] = ["awareness", "question", "missing_drug"];
const AUTHOR_ROLES: readonly AuthorRole[] = ["doctor", "patient", "pharmacist", "admin"];

function asPostType(v: string): PostType {
  return POST_TYPES.find((p) => p === v) ?? "question";
}
function asAuthorRole(v: string): AuthorRole {
  return AUTHOR_ROLES.find((r) => r === v) ?? "patient";
}

/**
 * app_role(s) → the `author_role` the CHECK constraint accepts
 * ('doctor' | 'patient' | 'pharmacist' | 'admin'). Raw app roles such as
 * `super_admin`, `pharmacy` or `lab` violate it and the insert fails.
 */
export function toAuthorRole(roles: readonly string[]): AuthorRole {
  if (roles.includes("doctor")) return "doctor";
  if (roles.includes("admin") || roles.includes("super_admin")) return "admin";
  if (roles.includes("pharmacy")) return "pharmacist";
  return "patient";
}

type PostRowWithDrug = PostRow & { drug_info?: DrugInfoRow | DrugInfoRow[] | null };

/** DB row (nullable arrays/flags) → FeedPost with safe defaults. */
function toFeedPost(row: PostRowWithDrug): FeedPost {
  const di = Array.isArray(row.drug_info) ? (row.drug_info[0] ?? null) : (row.drug_info ?? null);
  return {
    id: row.id,
    author_profile_id: row.author_profile_id,
    author_role: asAuthorRole(row.author_role),
    post_type: asPostType(row.post_type),
    title: row.title,
    body: row.body,
    specialty_id: row.specialty_id,
    tags: row.tags ?? [],
    media_urls: row.media_urls ?? [],
    city: row.city,
    country: row.country,
    is_pinned: row.is_pinned ?? false,
    is_resolved: row.is_resolved ?? false,
    reactions_count: row.reactions_count ?? 0,
    replies_count: row.replies_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    drug_info: di,
  };
}

function toFeedReply(row: ReplyRow): FeedReply {
  return {
    id: row.id,
    post_id: row.post_id,
    author_profile_id: row.author_profile_id,
    author_role: asAuthorRole(row.author_role),
    body: row.body,
    parent_reply_id: row.parent_reply_id,
    is_doctor_verified: row.is_doctor_verified ?? false,
    created_at: row.created_at,
  };
}

/**
 * PostgREST `.or()` value: double-quoted so a search containing `,` `.` `:`
 * `(` `)` cannot break (or inject into) the filter tree.
 */
function orQuoted(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export interface ListPostsFilters {
  type?: PostType | "all";
  specialtyId?: string;
  search?: string;
  city?: string;
  country?: string;
  drugName?: string;
  resolved?: "all" | "open" | "resolved";
  limit?: number;
}

export async function listPosts(filters: ListPostsFilters = {}): Promise<FeedPost[]> {
  let q = supabase
    .from("posts")
    .select("*, drug_info:post_drug_info(drug_name, dosage, alternative_suggested)")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 50);

  if (filters.type && filters.type !== "all") q = q.eq("post_type", filters.type);
  if (filters.specialtyId) q = q.eq("specialty_id", filters.specialtyId);
  if (filters.city) q = q.ilike("city", `%${filters.city}%`);
  if (filters.country) q = q.ilike("country", `%${filters.country}%`);
  if (filters.search) {
    const pattern = orQuoted(`%${filters.search}%`);
    q = q.or(`title.ilike.${pattern},body.ilike.${pattern}`);
  }
  if (filters.resolved === "open") q = q.eq("is_resolved", false);
  if (filters.resolved === "resolved") q = q.eq("is_resolved", true);

  const { data, error } = await q;
  if (error) throw error;
  let posts = (data ?? []).map(toFeedPost);

  if (filters.drugName) {
    const needle = filters.drugName.toLowerCase();
    posts = posts.filter((p) => p.drug_info?.drug_name?.toLowerCase().includes(needle));
  }
  if (posts.length === 0) return [];

  const profileIds = Array.from(new Set(posts.map((p) => p.author_profile_id)));

  const [profiles, { data: doctorRows }] = await Promise.all([
    fetchAuthorCards(profileIds),
    supabase
      .from("doctor_details")
      .select("id, profile_id, is_verified, specialty")
      .in("profile_id", profileIds),
  ]);

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const doctorMap = new Map((doctorRows ?? []).map((d) => [d.profile_id, d]));

  return posts.map((p) => {
    const dd = doctorMap.get(p.author_profile_id);
    return {
      ...p,
      author: profileMap.get(p.author_profile_id) ?? undefined,
      is_author_verified_doctor: dd?.is_verified ?? false,
      author_doctor_id: dd?.id ?? null,
      author_specialty: dd?.specialty ?? null,
    };
  });
}

export async function reverseGeocodeCity(
  lat: number,
  lng: number,
): Promise<{ city: string | null; country: string | null }> {
  if (typeof window === "undefined") return { city: null, country: null };
  const r = await reverseGeocode(lat, lng);
  return { city: r?.city ?? null, country: r?.country ?? null };
}

export async function getPost(id: string): Promise<FeedPost | null> {
  const { data, error } = await supabase
    .from("posts")
    .select("*, drug_info:post_drug_info(drug_name, dosage, alternative_suggested)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const post = toFeedPost(data);

  const [cards, { data: dd }] = await Promise.all([
    fetchAuthorCards([post.author_profile_id]),
    supabase
      .from("doctor_details")
      .select("id, is_verified, specialty")
      .eq("profile_id", post.author_profile_id)
      .maybeSingle(),
  ]);

  return {
    ...post,
    author: cards[0] ?? undefined,
    is_author_verified_doctor: dd?.is_verified ?? false,
    author_specialty: dd?.specialty ?? null,
    author_doctor_id: dd?.id ?? null,
  };
}

export async function listReplies(postId: string): Promise<FeedReply[]> {
  const { data, error } = await supabase
    .from("post_replies")
    .select("*")
    .eq("post_id", postId)
    .order("is_doctor_verified", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  const replies = (data ?? []).map(toFeedReply);
  if (replies.length === 0) return [];

  const profileIds = Array.from(new Set(replies.map((r) => r.author_profile_id)));
  const profiles = await fetchAuthorCards(profileIds);
  const map = new Map(profiles.map((p) => [p.id, p]));

  return replies.map((r) => ({ ...r, author: map.get(r.author_profile_id) ?? undefined }));
}

export interface CreatePostInput {
  authorProfileId: string;
  authorRole: AuthorRole;
  postType: PostType;
  title: string;
  body: string;
  specialtyId?: string | null;
  tags?: string[];
  mediaUrls?: string[];
  city?: string | null;
  country?: string | null;
  drugInfo?: {
    drugName: string;
    dosage?: string;
    alternativeSuggested?: string;
  };
}

export async function createPost(input: CreatePostInput): Promise<string> {
  const { data, error } = await supabase
    .from("posts")
    .insert({
      author_profile_id: input.authorProfileId,
      author_role: input.authorRole,
      post_type: input.postType,
      title: input.title,
      body: input.body,
      specialty_id: input.specialtyId ?? null,
      tags: input.tags ?? [],
      media_urls: input.mediaUrls ?? [],
      city: input.city ?? null,
      country: input.country ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (input.postType === "missing_drug" && input.drugInfo) {
    const { error: drugErr } = await supabase.from("post_drug_info").insert({
      post_id: data.id,
      drug_name: input.drugInfo.drugName,
      dosage: input.drugInfo.dosage ?? null,
      alternative_suggested: input.drugInfo.alternativeSuggested ?? null,
    });
    if (drugErr) {
      // Never leave a "missing drug" post without its drug — undo and report.
      await supabase.from("posts").delete().eq("id", data.id);
      throw drugErr;
    }
  }
  return data.id;
}

export async function createReply(input: {
  postId: string;
  authorProfileId: string;
  authorRole: AuthorRole;
  body: string;
  parentReplyId?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("post_replies").insert({
    post_id: input.postId,
    author_profile_id: input.authorProfileId,
    author_role: input.authorRole,
    body: input.body,
    parent_reply_id: input.parentReplyId ?? null,
  });
  if (error) throw error;
}

export async function toggleReaction(postId: string, userId: string): Promise<"added" | "removed"> {
  const { data: existing, error: readErr } = await supabase
    .from("post_reactions")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) throw readErr;

  if (existing) {
    const { error } = await supabase.from("post_reactions").delete().eq("id", existing.id);
    if (error) throw error;
    return "removed";
  }
  const { error } = await supabase.from("post_reactions").insert({
    post_id: postId,
    user_id: userId,
    reaction_type: "like",
  });
  if (error) throw error;
  return "added";
}

export async function getUserReactions(userId: string, postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("post_reactions")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);
  if (error) console.warn("[feed] reactions lookup failed:", error.message);
  return new Set((data ?? []).map((r) => r.post_id));
}

/** RLS silently filters rows it refuses — treat "0 rows changed" as an error. */
const NOT_ALLOWED = "not_allowed";

export async function setResolved(postId: string, resolved: boolean): Promise<void> {
  const { data, error } = await supabase
    .from("posts")
    .update({ is_resolved: resolved })
    .eq("id", postId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(NOT_ALLOWED);
}

export async function deletePost(postId: string): Promise<void> {
  const { data, error } = await supabase.from("posts").delete().eq("id", postId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(NOT_ALLOWED);
}

export async function uploadPostImage(file: File, userId: string): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("not_an_image");
  const ext =
    (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  // First folder MUST be the auth uid — storage policy "Users upload own post media".
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("post-media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("post-media").getPublicUrl(path);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// Author cards (2026-11-02 security hardening)
// Patient rows in `profiles` are no longer readable by other users, so post /
// reply author names come from the `public_profile_cards` RPC, which returns
// name / avatar / city only — and only for actual post or reply authors.
// ---------------------------------------------------------------------------
type AuthorCard = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  city: string | null;
};

async function fetchAuthorCards(ids: string[]): Promise<AuthorCard[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return [];
  const { data, error } = await supabase.rpc("public_profile_cards", { p_ids: unique });
  if (error) {
    console.warn("[feed] public_profile_cards failed:", error.message);
    return [];
  }
  return data ?? [];
}
