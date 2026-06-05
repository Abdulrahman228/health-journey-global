/**
 * Subdomain detection for L3 white-label doctor pages.
 *
 * Treats {slug}.mytabibi.com as a doctor-scoped subdomain. The reserved
 * subdomains below are NEVER treated as doctor slugs (they are real apps).
 */

const RESERVED_SUBDOMAINS = new Set<string>([
  "www",
  "api",
  "app",
  "admin",
  "cdn",
  "static",
  "media",
  "assets",
  "mail",
  "blog",
  "docs",
  "help",
  "support",
  "status",
  "dev",
  "staging",
  "preview",
  "test",
]);

const APEX_DOMAINS = ["mytabibi.com", "tabibi.com", "tabibi.app"];

export interface SubdomainInfo {
  isSubdomain: boolean;
  slug: string | null;
  apex: string | null;
}

/** Parse a host string. Returns slug if the host is a doctor subdomain. */
export function parseHost(host: string | null | undefined): SubdomainInfo {
  if (!host) return { isSubdomain: false, slug: null, apex: null };
  const h = host.toLowerCase().split(":")[0]; // strip port
  // localhost / IP — never a subdomain
  if (h === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    return { isSubdomain: false, slug: null, apex: null };
  }
  for (const apex of APEX_DOMAINS) {
    if (h === apex) {
      return { isSubdomain: false, slug: null, apex };
    }
    if (h.endsWith("." + apex)) {
      const sub = h.slice(0, h.length - apex.length - 1);
      // multi-level (e.g. a.b.mytabibi.com) — only first label as slug
      const first = sub.split(".")[0];
      if (!first || RESERVED_SUBDOMAINS.has(first)) {
        return { isSubdomain: false, slug: null, apex };
      }
      // slug must match DB constraint: ^[a-z0-9][a-z0-9-]{1,79}$
      if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(first)) {
        return { isSubdomain: false, slug: null, apex };
      }
      return { isSubdomain: true, slug: first, apex };
    }
  }
  return { isSubdomain: false, slug: null, apex: null };
}

/** Client-side current subdomain. SSR-safe: returns nulls during SSR. */
export function getCurrentSubdomain(): SubdomainInfo {
  if (typeof window === "undefined") {
    return { isSubdomain: false, slug: null, apex: null };
  }
  return parseHost(window.location.hostname);
}
