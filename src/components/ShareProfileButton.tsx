import { useEffect, useMemo, useState } from "react";
import { Share2, Copy, Check, Download, MessageCircle, Mail } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrCode } from "@/components/QrCode";
import { useLanguage } from "@/hooks/useLanguage";
import { siteConfig } from "@/lib/seo";
import { createShortLink } from "@/lib/profile.functions";

interface ShareProfileButtonProps {
  /** Profile id (used to lazily create a short link). */
  profileId: string;
  /** Canonical path being shared, e.g. `/d/dr-ahmed-shatat-cairo`. */
  targetPath: string;
  /** Display name shown in the modal headline. */
  displayName: string;
  /** Variant of the trigger button. */
  variant?: "primary" | "ghost" | "icon";
  className?: string;
}

/**
 * Universal share button: opens a modal with a QR code, the canonical link,
 * a short `/q/{id}` link (generated on demand), and one-tap sharing actions
 * for WhatsApp, Email, the native Web Share API, and PNG download.
 */
export function ShareProfileButton({
  profileId,
  targetPath,
  displayName,
  variant = "ghost",
  className,
}: ShareProfileButtonProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [shortId, setShortId] = useState<string | null>(null);
  const [creatingShort, setCreatingShort] = useState(false);
  const [copied, setCopied] = useState<"long" | "short" | null>(null);

  const longUrl = `${siteConfig.url}${targetPath}`;
  const shortUrl = useMemo(
    () => (shortId ? `${siteConfig.url}/q/${shortId}` : null),
    [shortId],
  );

  // Lazily create a short link the first time the modal opens.
  useEffect(() => {
    if (!open || shortId || creatingShort) return;
    setCreatingShort(true);
    createShortLink({ data: { profileId, targetPath } })
      .then((r) => setShortId(r.shortId))
      .catch((e) => {
        // Non-fatal — long URL still works.
        console.warn("[ShareProfileButton] short link failed:", e);
      })
      .finally(() => setCreatingShort(false));
  }, [open, shortId, creatingShort, profileId, targetPath]);

  const shareUrl = shortUrl ?? longUrl;
  const shareText = t(`Check out ${displayName} on Tabibi`, `زور صفحة ${displayName} على طبيبي`);

  const handleCopy = async (which: "long" | "short") => {
    const url = which === "short" ? shortUrl : longUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(which);
      toast.success(t("Link copied", "تم نسخ الرابط"));
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error(t("Copy failed", "فشل النسخ"));
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: displayName, text: shareText, url: shareUrl });
      } catch {
        /* user cancelled */
      }
    } else {
      handleCopy("short");
    }
  };

  const handleDownloadPng = async () => {
    try {
      const dataUrl = await QRCode.toDataURL(shareUrl, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 1024,
        color: { dark: "#1d4ed8", light: "#ffffff" },
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `tabibi-qr-${shortId ?? "profile"}.png`;
      a.click();
    } catch {
      toast.error(t("Download failed", "فشل التنزيل"));
    }
  };

  const triggerBtn =
    variant === "icon" ? (
      <Button
        size="icon"
        variant="outline"
        className={className}
        aria-label={t("Share", "مشاركة")}
      >
        <Share2 className="h-4 w-4" />
      </Button>
    ) : variant === "primary" ? (
      <Button className={className}>
        <Share2 className="me-2 h-4 w-4" />
        {t("Share", "مشاركة")}
      </Button>
    ) : (
      <Button variant="outline" className={className}>
        <Share2 className="me-2 h-4 w-4" />
        {t("Share", "مشاركة")}
      </Button>
    );

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`;
  const emailHref = `mailto:?subject=${encodeURIComponent(displayName)}&body=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{triggerBtn}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Share profile", "مشاركة الصفحة")}</DialogTitle>
          <DialogDescription>
            {t(
              `Scan the QR code or copy the link to share ${displayName}.`,
              `امسح رمز QR أو انسخ الرابط لمشاركة ${displayName}.`,
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
            <QrCode value={shareUrl} size={224} />
          </div>

          {/* Short link */}
          <div className="w-full">
            <label className="text-xs font-medium text-muted-foreground">
              {t("Short link", "رابط قصير")}
            </label>
            <div className="mt-1 flex gap-2">
              <Input
                readOnly
                value={shortUrl ?? (creatingShort ? t("Generating…", "جارٍ التوليد…") : longUrl)}
                className="font-mono text-xs"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={() => handleCopy("short")}
                disabled={!shortUrl}
                aria-label={t("Copy short link", "نسخ الرابط القصير")}
              >
                {copied === "short" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Long link */}
          <div className="w-full">
            <label className="text-xs font-medium text-muted-foreground">
              {t("Full link", "الرابط الكامل")}
            </label>
            <div className="mt-1 flex gap-2">
              <Input readOnly value={longUrl} className="text-xs" />
              <Button
                size="icon"
                variant="outline"
                onClick={() => handleCopy("long")}
                aria-label={t("Copy full link", "نسخ الرابط الكامل")}
              >
                {copied === "long" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Action grid */}
          <div className="grid w-full grid-cols-2 gap-2 pt-2 sm:grid-cols-4">
            <Button asChild variant="secondary" size="sm">
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="me-1 h-4 w-4" /> WhatsApp
              </a>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <a href={emailHref}>
                <Mail className="me-1 h-4 w-4" /> {t("Email", "بريد")}
              </a>
            </Button>
            <Button variant="secondary" size="sm" onClick={handleNativeShare}>
              <Share2 className="me-1 h-4 w-4" /> {t("More", "المزيد")}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleDownloadPng}>
              <Download className="me-1 h-4 w-4" /> PNG
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
