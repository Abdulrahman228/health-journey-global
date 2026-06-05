import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Video } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { submitConsultationRequest } from "@/lib/consultations.functions";

interface Props {
  doctorDetailsId: string;
  doctorName: string;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "secondary";
}

export default function RequestConsultationModal({
  doctorDetailsId,
  doctorName,
  triggerLabel,
  triggerVariant = "default",
}: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [type, setType] = useState<"video" | "voice" | "chat">("video");

  const submitMut = useMutation({
    mutationFn: () =>
      submitConsultationRequest({
        data: {
          doctorDetailsId,
          reason: reason.trim(),
          consultationType: type,
        },
      }),
    onSuccess: () => {
      toast.success(t("Request submitted", "تم إرسال الطلب — سيرد الطبيب قريباً"));
      setOpen(false);
      setReason("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size="lg">
          <Video className="me-2 h-5 w-5" />
          {triggerLabel ?? t("Request online consultation", "اطلب كشف أونلاين")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Request online consultation", "طلب كشف أونلاين")}</DialogTitle>
          <DialogDescription>
            {t(
              `Submit a request to Dr. ${doctorName}. The doctor will propose a time and fee, then you can accept and pay.`,
              `قدّم طلب كشف أونلاين للدكتور ${doctorName}. سيقترح الطبيب موعد ورسم الكشف، ثم تقبل وتدفع.`,
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t("Consultation type", "نوع الكشف")}</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as "video" | "voice" | "chat")}>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="ct-video" value="video" />
                <Label htmlFor="ct-video">{t("Video", "فيديو")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="ct-voice" value="voice" />
                <Label htmlFor="ct-voice">{t("Voice", "صوت فقط")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="ct-chat" value="chat" />
                <Label htmlFor="ct-chat">{t("Chat", "دردشة")}</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cr-reason">
              {t("Describe your symptoms or reason", "اشرح الأعراض أو سبب الكشف")}
            </Label>
            <Textarea
              id="cr-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t(
                "Briefly describe what you're experiencing…",
                "اكتب مختصر عن حالتك أو الأعراض…",
              )}
              rows={5}
              maxLength={2000}
            />
            <div className="text-xs text-muted-foreground">
              {reason.length}/2000
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("Cancel", "إلغاء")}
          </Button>
          <Button
            onClick={() => submitMut.mutate()}
            disabled={reason.trim().length < 5 || submitMut.isPending}
          >
            {submitMut.isPending
              ? t("Submitting…", "جارٍ الإرسال…")
              : t("Submit request", "إرسال الطلب")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
