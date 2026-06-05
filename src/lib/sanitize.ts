// Workers-safe HTML sanitizer.
//
// `isomorphic-dompurify` cannot be loaded in Cloudflare Workers (no DOM,
// jsdom incompatible) — its module top-level calls `purify.sanitize.bind`
// which crashes when DOM globals are missing. Article bodies are
// admin-authored markdown rendered via `marked`, so a conservative
// regex-based strip is sufficient on both server and client.

interface SanitizeOptions {
  /** Allowed extra attributes (currently informational; the strip is permissive). */
  ADD_ATTR?: string[];
}

export function sanitizeHtml(html: string, _options?: SanitizeOptions): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?<\/embed>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*'javascript:[^']*'/gi, "$1='#'")
    .replace(/(href|src)\s*=\s*javascript:[^\s>]+/gi, '$1="#"');
}
