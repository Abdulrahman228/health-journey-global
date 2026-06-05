import { siteConfig } from "@/lib/seo";

/**
 * Renders the brand name with BOTH Arabic and English spellings so
 * search engines, screen readers, and users see them as a single
 * entity (E-A-T signal). Outputs valid HTML5 `<bdi>` to isolate
 * directionality when mixing scripts.
 *
 * Example: <span>طبيبي <bdi>(Tabibi)</bdi></span>
 *
 * `variant`:
 *  - "inline" (default): both names on one line, English in parentheses
 *  - "stacked": Arabic on top, English below as small caption
 *  - "wordmark": large display style for hero/footer brand block
 */
type Variant = "inline" | "stacked" | "wordmark";

interface BrandNameProps {
  variant?: Variant;
  className?: string;
  /** Force a primary script. Defaults to "ar" (Arabic-first audience). */
  primary?: "ar" | "en";
}

export function BrandName({
  variant = "inline",
  className,
  primary = "ar",
}: BrandNameProps) {
  const ar = siteConfig.brand.ar;
  const en = siteConfig.brand.en;
  const first = primary === "ar" ? ar : en;
  const second = primary === "ar" ? en : ar;
  const lang = primary;

  if (variant === "stacked") {
    return (
      <span
        className={className}
        itemScope
        itemType="https://schema.org/Brand"
        aria-label={`${ar} - ${en}`}
      >
        <span
          lang={lang}
          itemProp="name"
          className="block font-bold leading-tight"
        >
          {first}
        </span>
        <bdi
          lang={primary === "ar" ? "en" : "ar"}
          itemProp="alternateName"
          className="block text-xs font-medium opacity-70"
        >
          {second}
        </bdi>
      </span>
    );
  }

  if (variant === "wordmark") {
    return (
      <span
        className={className}
        itemScope
        itemType="https://schema.org/Brand"
        aria-label={`${ar} - ${en}`}
      >
        <span lang={lang} itemProp="name" className="font-bold tracking-tight">
          {first}
        </span>{" "}
        <bdi
          lang={primary === "ar" ? "en" : "ar"}
          itemProp="alternateName"
          className="font-semibold opacity-80"
        >
          {second}
        </bdi>
      </span>
    );
  }

  // inline (default)
  return (
    <span
      className={className}
      itemScope
      itemType="https://schema.org/Brand"
      aria-label={`${ar} - ${en}`}
    >
      <span lang={lang} itemProp="name">
        {first}
      </span>{" "}
      <bdi lang={primary === "ar" ? "en" : "ar"} itemProp="alternateName">
        ({second})
      </bdi>
    </span>
  );
}
