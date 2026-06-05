/**
 * OptimizedImage — responsive `<picture>` with AVIF + WebP + fallback.
 *
 * Rank Math course module 8 (Core Web Vitals):
 *   - explicit width + height → zero CLS
 *   - srcset → browser picks the smallest sufficient asset (LCP/bandwidth)
 *   - AVIF/WebP via Supabase Storage `?format=…` → smaller payload (LCP, mobile data)
 *   - loading="lazy" by default (set `priority` for above-the-fold)
 *   - fetchPriority="high" + decoding="async" for LCP candidates
 *
 * Supabase Storage supports on-the-fly transform via
 *   /storage/v1/render/image/public/...?width=W&height=H&resize=cover&quality=Q&format=webp
 * When the src is a Supabase Storage URL we generate AVIF + WebP `<source>` tags
 * plus a fallback `<img>`. For external URLs (e.g. Unsplash) we render a plain `<img>`.
 */
import { useMemo } from "react";

interface OptimizedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "loading"> {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Widths (px) used to build srcset. Defaults to [1x, 2x] of `width`. */
  srcsetWidths?: number[];
  /** Sizes attribute. Defaults to `${width}px`. */
  sizes?: string;
  /** If true, eager loading + high fetch priority (use for LCP). */
  priority?: boolean;
  /** Quality 1-100 (default 80). */
  quality?: number;
}

function isSupabaseStorage(url: string): boolean {
  return url.includes("/storage/v1/object/") || url.includes("/storage/v1/render/");
}

function buildSupabaseUrl(
  src: string,
  w: number,
  h: number,
  q: number,
  format?: "webp" | "avif" | "origin",
): string {
  // Switch /object/ → /render/image/ which is the resize endpoint
  let base = src.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  base = base.split("?")[0];
  const params = new URLSearchParams({
    width: String(w),
    height: String(h),
    resize: "cover",
    quality: String(q),
  });
  if (format && format !== "origin") params.set("format", format);
  return `${base}?${params.toString()}`;
}

function buildSrcSet(
  src: string,
  widths: number[],
  ratio: number,
  quality: number,
  format?: "webp" | "avif" | "origin",
): string {
  return widths
    .map((w) => `${buildSupabaseUrl(src, w, Math.round(w * ratio), quality, format)} ${w}w`)
    .join(", ");
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  srcsetWidths,
  sizes,
  priority = false,
  quality = 80,
  className,
  style,
  ...rest
}: OptimizedImageProps) {
  const widths = srcsetWidths ?? [width, width * 2];
  const ratio = height / width;
  const widthsKey = widths.join(",");

  const sources = useMemo(() => {
    if (!src || !isSupabaseStorage(src)) return null;
    return {
      avif: buildSrcSet(src, widths, ratio, quality, "avif"),
      webp: buildSrcSet(src, widths, ratio, quality, "webp"),
      fallback: buildSrcSet(src, widths, ratio, quality, "origin"),
      defaultSrc: buildSupabaseUrl(src, width, height, quality, "origin"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, width, height, quality, widthsKey, ratio]);

  const sizesAttr = sizes ?? `${width}px`;

  const commonImgProps = {
    ...rest,
    alt,
    width,
    height,
    loading: (priority ? "eager" : "lazy") as "eager" | "lazy",
    fetchpriority: priority ? "high" : "auto",
    decoding: "async" as const,
    className,
    style,
  };

  if (!sources) {
    return <img {...commonImgProps} src={src} sizes={sizesAttr} />;
  }

  return (
    <picture>
      <source type="image/avif" srcSet={sources.avif} sizes={sizesAttr} />
      <source type="image/webp" srcSet={sources.webp} sizes={sizesAttr} />
      <img
        {...commonImgProps}
        src={sources.defaultSrc}
        srcSet={sources.fallback}
        sizes={sizesAttr}
      />
    </picture>
  );
}
