/**
 * TierBadge — visual indicator for doctor subscription tier.
 *
 * Used across doctor cards, profile, booking sidebar.
 *  - "free"    → not rendered
 *  - "premium" → blue gradient with "Premium" label
 *  - "gold"    → gold gradient with crown + "Gold" label
 *
 * Always shown alongside (not replacing) the verified badge.
 */
import { Crown, Sparkles } from "lucide-react";

export type DoctorTier = "free" | "premium" | "gold";

interface Props {
  tier: DoctorTier | string | null | undefined;
  /** "sm" (default) | "md" | "lg" */
  size?: "sm" | "md" | "lg";
  /** Show text label next to icon. Default true on md/lg, false on sm. */
  showLabel?: boolean;
  /** RTL-aware Arabic label. Default false → English. */
  ar?: boolean;
  className?: string;
}

const SIZE: Record<NonNullable<Props["size"]>, { icon: string; pad: string; text: string }> = {
  sm: { icon: "h-3.5 w-3.5", pad: "px-1.5 py-0.5", text: "text-[10px]" },
  md: { icon: "h-4 w-4", pad: "px-2 py-1", text: "text-xs" },
  lg: { icon: "h-5 w-5", pad: "px-3 py-1.5", text: "text-sm" },
};

export function TierBadge({ tier, size = "sm", showLabel, ar = false, className = "" }: Props) {
  if (tier !== "premium" && tier !== "gold") return null;
  const dims = SIZE[size];
  const labelOn = showLabel ?? size !== "sm";

  const isGold = tier === "gold";
  const labelText = isGold ? (ar ? "جولد" : "Gold") : ar ? "بريميوم" : "Premium";
  const aria = ar ? `طبيب ${labelText}` : `${labelText} doctor`;

  const tone = isGold
    ? "bg-gradient-to-r from-amber-400 to-yellow-600 text-white ring-amber-500/30"
    : "bg-gradient-to-r from-sky-500 to-indigo-600 text-white ring-sky-500/30";

  return (
    <span
      role="img"
      aria-label={aria}
      title={aria}
      className={`inline-flex items-center gap-1 rounded-full font-bold ring-1 shadow-sm ${tone} ${dims.pad} ${dims.text} ${className}`}
    >
      {isGold ? <Crown className={dims.icon} /> : <Sparkles className={dims.icon} />}
      {labelOn && <span className="leading-none">{labelText}</span>}
    </span>
  );
}
