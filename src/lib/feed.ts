import { supabase } from "@/integrations/supabase/client";

export type PostType = "awareness" | "question" | "missing_drug";
export type AuthorRole = "doctor" | "patient" | "pharmacist" | "admin";

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
  if (filters.search) q = q.or(`title.ilike.%${filters.search}%,body.ilike.%${filters.search}%`);
  if (filters.resolved === "open") q = q.eq("is_resolved", false);
  if (filters.resolved === "resolved") q = q.eq("is_resolved", true);

  const { data, error } = await q;
  if (error) throw error;
  let posts = (data ?? []) as unknown as FeedPost[];

  if (filters.drugName) {
    const needle = filters.drugName.toLowerCase();
    posts = posts.filter((p) => {
      const di = Array.isArray(p.drug_info) ? p.drug_info[0] : p.drug_info;
      return di?.drug_name?.toLowerCase().includes(needle);
    });
  }
  if (posts.length === 0) return [];

  const profileIds = Array.from(new Set(posts.map((p) => p.author_profile_id)));

  const [{ data: profiles }, { data: doctorRows }] = await Promise.all([
    fetchAuthorCards(profileIds).then((rows) => ({ data: rows })),
    supabase
      .from("doctor_details")
      .select("profile_id, is_verified, specialty")
      .in("profile_id", profileIds),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const doctorMap = new Map((doctorRows ?? []).map((d) => [d.profile_id, d]));

  return posts.map((p) => {
    const dd = doctorMap.get(p.author_profile_id);
    return {
      ...p,
      drug_info: Array.isArray(p.drug_info) ? (p.drug_info[0] ?? null) : p.drug_info,
      author: profileMap.get(p.author_profile_id) ?? undefined,
      is_author_verified_doctor: dd?.is_verified ?? false,
      author_specialty: dd?.specialty ?? null,
    };
  });
}

export async function reverseGeocodeCity(
  lat: number,
  lng: number,
): Promise<{ city: string | null; country: string | null }> {
  if (typeof window === "undefined" || !window.google?.maps) return { city: null, country: null };
  const geocoder = new window.google.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== "OK" || !results || results.length === 0) {
        resolve({ city: null, country: null });
        return;
      }
      let city: string | null = null;
      let country: string | null = null;
      for (const r of results) {
        for (const c of r.address_components) {
          if (
            !city &&
            (c.types.includes("locality") || c.types.includes("administrative_area_level_2"))
          )
            city = c.long_name;
          if (!country && c.types.includes("country")) country = c.long_name;
        }
        if (city && country) break;
      }
      resolve({ city, country });
    });
  });
}

export async function getPost(id: string): Promise<FeedPost | null> {
  const { data, error } = await supabase
    .from("posts")
    .select("*, drug_info:post_drug_info(drug_name, dosage, alternative_suggested)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const post = data as unknown as FeedPost;

  const [{ data: profile }, { data: dd }] = await Promise.all([
    fetchAuthorCards([post.author_profile_id]).then((rows) => ({ data: rows[0] ?? null })),
    supabase
      .from("doctor_details")
      .select("is_verified, specialty")
      .eq("profile_id", post.author_profile_id)
      .maybeSingle(),
  ]);

  return {
    ...post,
    drug_info: Array.isArray(post.drug_info) ? (post.drug_info[0] ?? null) : post.drug_info,
    author: profile ?? undefined,
    is_author_verified_doctor: dd?.is_verified ?? false,
    author_specialty: dd?.specialty ?? null,
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
  const replies = (data ?? []) as unknown as FeedReply[];
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
    if (drugErr) throw drugErr;
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
  const { data: existing } = await supabase
    .from("post_reactions")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();

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
  const { data } = await supabase
    .from("post_reactions")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);
  return new Set((data ?? []).map((r) => r.post_id));
}

export async function setResolved(postId: string, resolved: boolean): Promise<void> {
  const { error } = await supabase.from("posts").update({ is_resolved: resolved }).eq("id", postId);
  if (error) throw error;
}

export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw error;
}

export async function uploadPostImage(file: File, userId: string): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("post-media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
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
  const { data, error } = await supabase.rpc(
    "public_profile_cards" as never,
    { p_ids: unique } as never,
  );
  if (error) {
    console.warn("[feed] public_profile_cards failed:", error.message);
    return [];
  }
  return (data as unknown as AuthorCard[] | null) ?? [];
}
