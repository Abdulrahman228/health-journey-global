import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Calendar, Check, X, Clock, Video, Phone, MessageSquare } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import {
  listMyConsultationRequests,
  proposeConsultationSlot,
  doctorRejectRequest,
  acceptConsultationProposal,
  rejectConsultationProposal,
  cancelConsultationRequest,
} from "@/lib/consultations.functions";

type Status =
  | "pending_doctor"
  | "proposed"
  | "accepted"
  | "paid"
  | "rejected_by_patient"
  | "rejected_by_doctor"
  | "expired"
  | "cancelled";

type ConsultationType = "video" | "voice" | "chat";

interface PatientItem {
  id: string;
  status: Status;
  reason: string;
  consultation_type: ConsultationType;
  proposed_slot: string | null;
  proposed_duration_minutes: number | null;
  fee_cents: number | null;
  currency: string;
  doctor_note: string | null;
  expires_at: string | null;
  created_at: string;
  doctor_details_id: string;
}

interface DoctorItem {
  id: string;
  status: Status;
  reason: string;
  consultation_type: ConsultationType;
  proposed_slot: string | null;
  fee_cents: number | null;
  currency: string;
  expires_at: string | null;
  created_at: string;
  patient_id: string;
  profiles: { full_name: string | null } | null;
}

const statusLabel: Record<Status, [string, string]> = {
  pending_doctor: ["Pending doctor", "بانتظار رد الطبيب"],
  proposed: ["Proposed", "تم اقتراح ميعاد"],
  accepted: ["Accepted — awaiting payment", "مقبول — بانتظار الدفع"],
  paid: ["Confirmed", "مؤكد ومدفوع"],
  rejected_by_patient: ["Rejected by you", "رفضته"],
  rejected_by_doctor: ["Rejected by doctor", "رفضه الطبيب"],
  expired: ["Expired", "منتهي الصلاحية"],
  cancelled: ["Cancelled", "ملغي"],
};

const statusVariant: Record<Status, "default" | "secondary" | "destructive" | "outline"> = {
  pending_doctor: "secondary",
  proposed: "default",
  accepted: "default",
  paid: "default",
  rejected_by_patient: "outline",
  rejected_by_doctor: "destructive",
  expired: "outline",
  cancelled: "outline",
};

const typeIcon = {
  video: Video,
  voice: Phone,
  chat: MessageSquare,
};

function fmtSlot(iso: string | null, locale: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function fmtMoney(cents: number | null, currency: string) {
  if (cents == null) return "—";
  return `${(cents / 100).toLocaleString()} ${currency}`;
}

export function ConsultationsInbox() {
  const { t, language } = useLanguage();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["consultation-requests"],
    queryFn: () => listMyConsultationRequests(),
    refetchInterval: 30000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["consultation-requests"] });

  const [proposeOpen, setProposeOpen] = useState<DoctorItem | null>(null);

  const acceptMut = useMutation({
    mutationFn: (id: string) =>
      acceptConsultationProposal({
        data: {
          requestId: id,
          returnUrl: window.location.origin + "/checkout/return?cr=" + id,
          cancelUrl: window.location.origin + "/dashboard",
        },
      }),
    onSuccess: (res) => {
      if (res.url) {
        window.location.href = res.url;
      } else {
        toast.error(t("Could not create payment", "تعذّر إنشاء جلسة الدفع"));
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => rejectConsultationProposal({ data: { requestId: id } }),
    onSuccess: () => {
      toast.success(t("Proposal rejected", "تم رفض الميعاد"));
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelConsultationRequest({ data: { requestId: id } }),
    onSuccess: () => {
      toast.success(t("Request cancelled", "تم إلغاء الطلب"));
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const doctorRejectMut = useMutation({
    mutationFn: (id: string) => doctorRejectRequest({ data: { requestId: id } }),
    onSuccess: () => {
      toast.success(t("Request declined", "تم رفض الطلب"));
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t("Loading…", "جارٍ التحميل…")}</div>;
  }

  const patientItems = (() => {
    try { return JSON.parse((data as { asPatient?: string })?.asPatient ?? "[]") as PatientItem[]; } catch { return [] as PatientItem[]; }
  })();
  const doctorItems = (() => {
    try { return JSON.parse((data as { asDoctor?: string })?.asDoctor ?? "[]") as DoctorItem[]; } catch { return [] as DoctorItem[]; }
  })();

  return (
    <div className="space-y-6">
      {/* Doctor inbox (only shows for doctor accounts) */}
      {doctorItems.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold">
            {t("Incoming consultation requests", "طلبات كشف واردة")}
            <Badge className="ms-2" variant="secondary">
              {doctorItems.filter((r) => r.status === "pending_doctor").length}
            </Badge>
          </h3>
          {doctorItems.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {r.profiles?.full_name ?? t("Patient", "مريض")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmtSlot(r.created_at, language)}
                    </div>
                  </div>
                  <Badge variant={statusVariant[r.status]}>
                    {t(statusLabel[r.status][0], statusLabel[r.status][1])}
                  </Badge>
                </div>
                <div className="rounded-md bg-muted/50 p-2 text-sm">{r.reason}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {(() => {
                    const Icon = typeIcon[r.consultation_type];
                    return <Icon className="h-3.5 w-3.5" />;
                  })()}
                  <span>{r.consultation_type}</span>
                </div>
                {r.status === "pending_doctor" && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setProposeOpen(r)}>
                      <Calendar className="me-1 h-4 w-4" />
                      {t("Propose slot", "اقترح موعداً")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => doctorRejectMut.mutate(r.id)}
                      disabled={doctorRejectMut.isPending}
                    >
                      <X className="me-1 h-4 w-4" />
                      {t("Decline", "رفض")}
                    </Button>
                  </div>
                )}
                {r.status === "proposed" && r.proposed_slot && (
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {fmtSlot(r.proposed_slot, language)} · {fmtMoney(r.fee_cents, r.currency)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t("Awaiting patient response", "بانتظار رد المريض")}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {/* Patient inbox */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">
          {t("My consultation requests", "طلبات الكشف الخاصة بي")}
        </h3>
        {patientItems.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {t("No requests yet.", "لا توجد طلبات بعد.")}
          </div>
        ) : (
          patientItems.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    {fmtSlot(r.created_at, language)}
                  </div>
                  <Badge variant={statusVariant[r.status]}>
                    {t(statusLabel[r.status][0], statusLabel[r.status][1])}
                  </Badge>
                </div>
                <div className="rounded-md bg-muted/50 p-2 text-sm">{r.reason}</div>

                {r.status === "proposed" && r.proposed_slot && (
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      <Clock className="h-4 w-4" />
                      {fmtSlot(r.proposed_slot, language)}
                      {r.proposed_duration_minutes && (
                        <span className="text-xs text-muted-foreground">
                          ({r.proposed_duration_minutes} {t("min", "دقيقة")})
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-base font-bold">
                      {fmtMoney(r.fee_cents, r.currency)}
                    </div>
                    {r.doctor_note && (
                      <div className="mt-2 text-xs text-muted-foreground">{r.doctor_note}</div>
                    )}
                    {r.expires_at && (
                      <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                        {t("Valid until", "صالح حتى")} {fmtSlot(r.expires_at, language)}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => acceptMut.mutate(r.id)}
                        disabled={acceptMut.isPending}
                      >
                        <Check className="me-1 h-4 w-4" />
                        {t("Accept & pay", "قبول والدفع")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rejectMut.mutate(r.id)}
                        disabled={rejectMut.isPending}
                      >
                        <X className="me-1 h-4 w-4" />
                        {t("Reject", "رفض الميعاد")}
                      </Button>
                    </div>
                  </div>
                )}

                {r.status === "pending_doctor" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => cancelMut.mutate(r.id)}
                    disabled={cancelMut.isPending}
                  >
                    {t("Cancel request", "إلغاء الطلب")}
                  </Button>
                )}

                {r.status === "rejected_by_doctor" && (
                  <div className="text-xs text-muted-foreground">
                    {t(
                      "The doctor was unable to take this consultation.",
                      "اعتذر الطبيب عن هذا الكشف.",
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {/* Doctor: propose slot modal */}
      {proposeOpen && (
        <ProposeSlotDialog
          item={proposeOpen}
          onClose={() => setProposeOpen(null)}
          onDone={() => {
            setProposeOpen(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ProposeSlotDialog({
  item,
  onClose,
  onDone,
}: {
  item: DoctorItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useLanguage();
  // default: tomorrow 6pm in local TZ
  const def = new Date();
  def.setDate(def.getDate() + 1);
  def.setHours(18, 0, 0, 0);
  const defaultLocal = def.toISOString().slice(0, 16);

  const [slot, setSlot] = useState(defaultLocal);
  const [duration, setDuration] = useState(30);
  const [feeEgp, setFeeEgp] = useState(300);
  const [note, setNote] = useState("");

  const proposeMut = useMutation({
    mutationFn: () =>
      proposeConsultationSlot({
        data: {
          requestId: item.id,
          slot: new Date(slot).toISOString(),
          durationMinutes: duration,
          feeCents: Math.round(feeEgp * 100),
          currency: "EGP",
          note: note.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success(t("Slot proposed — patient will be notified", "تم اقتراح الميعاد للمريض"));
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Propose consultation time", "اقتراح ميعاد كشف")}</DialogTitle>
          <DialogDescription>
            {t(
              "Send the patient your proposed time and fee. They can accept and pay or reject.",
              "اقترح موعد ورسم الكشف. سيقبل المريض ويدفع أو يرفض الميعاد.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ps-slot">{t("Date & time", "التاريخ والساعة")}</Label>
            <Input
              id="ps-slot"
              type="datetime-local"
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ps-dur">{t("Duration (min)", "المدة (دقيقة)")}</Label>
              <Input
                id="ps-dur"
                type="number"
                min={10}
                max={180}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 30)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-fee">{t("Fee (EGP)", "السعر (جنيه)")}</Label>
              <Input
                id="ps-fee"
                type="number"
                min={0}
                value={feeEgp}
                onChange={(e) => setFeeEgp(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-note">{t("Optional note to patient", "ملاحظة للمريض (اختياري)")}</Label>
            <Textarea
              id="ps-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={1000}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("Cancel", "إلغاء")}
          </Button>
          <Button onClick={() => proposeMut.mutate()} disabled={proposeMut.isPending}>
            {proposeMut.isPending ? t("Sending…", "جارٍ الإرسال…") : t("Send proposal", "إرسال الاقتراح")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
