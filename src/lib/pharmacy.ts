import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface PharmacyChain {
  id: string;
  owner_user_id: string;
  name: string;
  name_ar: string | null;
  slug: string;
  logo_url: string | null;
  website: string | null;
  license_number: string | null;
  description: string | null;
  description_ar: string | null;
  is_verified: boolean;
  verification_status: string;
  created_at: string;
}

export interface PharmacyBranch {
  id: string;
  chain_id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  working_hours: Json | null;
  is_active: boolean;
}

export interface DrugListing {
  id: string;
  chain_id: string;
  branch_id: string | null;
  drug_name: string;
  dosage: string | null;
  alternative_name: string | null;
  price: number | null;
  currency: string | null;
  stock_status: string;
  notes: string | null;
  linked_post_id: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  chain?: Pick<PharmacyChain, "id" | "name" | "name_ar" | "logo_url" | "slug">;
  branch?: Pick<PharmacyBranch, "id" | "name" | "city" | "address" | "phone" | "lat" | "lng"> | null;
}

// ---------- Chains ----------

export async function listVerifiedChains(): Promise<PharmacyChain[]> {
  const { data, error } = await supabase
    .from("pharmacy_chains")
    .select("*")
    .eq("is_verified", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getMyChain(userId: string): Promise<PharmacyChain | null> {
  const { data, error } = await supabase
    .from("pharmacy_chains")
    .select("*")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function createChain(input: {
  ownerUserId: string;
  name: string;
  nameAr?: string;
  slug: string;
  website?: string;
  licenseNumber?: string;
  description?: string;
  logoUrl?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from("pharmacy_chains")
    .insert({
      owner_user_id: input.ownerUserId,
      name: input.name,
      name_ar: input.nameAr ?? null,
      slug: input.slug,
      website: input.website ?? null,
      license_number: input.licenseNumber ?? null,
      description: input.description ?? null,
      logo_url: input.logoUrl ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

// ---------- Branches ----------

export async function listBranches(chainId: string): Promise<PharmacyBranch[]> {
  const { data, error } = await supabase
    .from("pharmacy_branches")
    .select("*")
    .eq("chain_id", chainId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createBranch(input: {
  chainId: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  phone?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from("pharmacy_branches")
    .insert({
      chain_id: input.chainId,
      name: input.name,
      address: input.address ?? null,
      city: input.city ?? null,
      country: input.country ?? "Egypt",
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      phone: input.phone ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteBranch(id: string): Promise<void> {
  const { error } = await supabase.from("pharmacy_branches").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Drug Listings ----------

export interface ListListingsFilters {
  drugName?: string;
  city?: string;
  chainId?: string;
  limit?: number;
}

export async function listDrugListings(filters: ListListingsFilters = {}): Promise<DrugListing[]> {
  let q = supabase
    .from("pharmacy_drug_listings")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 50);

  if (filters.drugName) q = q.ilike("drug_name", `%${filters.drugName}%`);
  if (filters.chainId) q = q.eq("chain_id", filters.chainId);

  const { data, error } = await q;
  if (error) throw error;
  let listings: DrugListing[] = data ?? [];

  // Filter out expired
  const now = new Date();
  listings = listings.filter((l) => !l.expires_at || new Date(l.expires_at) > now);

  if (listings.length === 0) return [];

  const chainIds = Array.from(new Set(listings.map((l) => l.chain_id)));
  const branchIds = Array.from(
    new Set(listings.map((l) => l.branch_id).filter((x): x is string => !!x))
  );

  type BranchLite = Pick<PharmacyBranch, "id" | "name" | "city" | "address" | "phone" | "lat" | "lng">;
  const [{ data: chains }, { data: branches }] = await Promise.all([
    supabase.from("pharmacy_chains").select("id, name, name_ar, logo_url, slug, is_verified").in("id", chainIds),
    branchIds.length
      ? supabase.from("pharmacy_branches").select("id, name, city, address, phone, lat, lng").in("id", branchIds)
      : Promise.resolve({ data: [] as BranchLite[] }),
  ]);

  const chainMap = new Map((chains ?? []).map((c) => [c.id, c]));
  const branchMap = new Map(((branches ?? []) as BranchLite[]).map((b) => [b.id, b]));

  // Only show listings for verified chains
  listings = listings.filter((l) => chainMap.get(l.chain_id)?.is_verified);

  // City filter (was accepted but ignored): match the listing's branch city.
  const cityQ = filters.city?.trim().toLowerCase();
  if (cityQ) {
    listings = listings.filter((l) => {
      const b = l.branch_id ? branchMap.get(l.branch_id) : undefined;
      return (b?.city ?? "").toLowerCase().includes(cityQ);
    });
  }

  return listings.map((l) => ({
    ...l,
    chain: chainMap.get(l.chain_id),
    branch: l.branch_id ? branchMap.get(l.branch_id) ?? null : null,
  }));
}

export async function listMyListings(chainId: string): Promise<DrugListing[]> {
  const { data, error } = await supabase
    .from("pharmacy_drug_listings")
    .select("*")
    .eq("chain_id", chainId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const listings: DrugListing[] = data ?? [];

  type BranchLite = Pick<PharmacyBranch, "id" | "name" | "city" | "address" | "phone" | "lat" | "lng">;
  const branchIds = Array.from(new Set(listings.map((l) => l.branch_id).filter((x): x is string => !!x)));
  if (branchIds.length === 0) return listings;

  const { data: branches } = await supabase
    .from("pharmacy_branches")
    .select("id, name, city, address, phone, lat, lng")
    .in("id", branchIds);
  const map = new Map(((branches ?? []) as BranchLite[]).map((b) => [b.id, b]));
  return listings.map((l) => ({ ...l, branch: l.branch_id ? map.get(l.branch_id) ?? null : null }));
}

export async function createListing(input: {
  chainId: string;
  branchId?: string | null;
  drugName: string;
  dosage?: string;
  alternativeName?: string;
  price?: number;
  currency?: string;
  notes?: string;
  expiresAt?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from("pharmacy_drug_listings")
    .insert({
      chain_id: input.chainId,
      branch_id: input.branchId ?? null,
      drug_name: input.drugName,
      dosage: input.dosage ?? null,
      alternative_name: input.alternativeName ?? null,
      price: input.price ?? null,
      currency: input.currency ?? "EGP",
      notes: input.notes ?? null,
      expires_at: input.expiresAt ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function deactivateListing(id: string): Promise<void> {
  const { error } = await supabase
    .from("pharmacy_drug_listings")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteListing(id: string): Promise<void> {
  const { error } = await supabase.from("pharmacy_drug_listings").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadPharmacyLogo(file: File, userId: string): Promise<string> {
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("pharmacy-logos").upload(path, file, { upsert: true });
  if (error) throw new Error("تعذّر رفع الشعار، حاول مرة أخرى");
  const { data } = supabase.storage.from("pharmacy-logos").getPublicUrl(path);
  return data.publicUrl;
}
