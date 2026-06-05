import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QrCodeProps {
  /** URL or text to encode. */
  value: string;
  /** Pixel size of the rendered SVG (square). */
  size?: number;
  /** Foreground colour. Default: brand blue. */
  fgColor?: string;
  /** Background colour. Default: white. */
  bgColor?: string;
  /** Error-correction level. Higher = bigger code but tolerates more damage. */
  level?: "L" | "M" | "Q" | "H";
  className?: string;
}

/**
 * Renders a QR code as inline SVG (no canvas, no external network).
 * Generation runs in `useEffect` so it doesn't block SSR.
 */
export function QrCode({
  value,
  size = 224,
  fgColor = "#1d4ed8",
  bgColor = "#ffffff",
  level = "M",
  className,
}: QrCodeProps) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, {
      type: "svg",
      errorCorrectionLevel: level,
      margin: 1,
      width: size,
      color: { dark: fgColor, light: bgColor },
    })
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [value, size, fgColor, bgColor, level]);

  if (error) {
    return (
      <div
        className={className}
        style={{ width: size, height: size }}
        role="img"
        aria-label="QR generation error"
      >
        <span className="text-xs text-destructive">QR error</span>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`QR code for ${value}`}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
