/**
 * Whether an appointment is an online / video consultation.
 *
 * The codebase historically stored several spellings for the same concept
 * (booking writes "online"; other places use "video" / "video_consultation" /
 * "telehealth" / "telemedicine"). This tolerant check treats them all as the
 * same online visit so the join button and the video room work regardless of
 * which value a given appointment happened to be saved with.
 */
export function isOnlineVisit(type: string | null | undefined): boolean {
  const t = (type ?? "").trim().toLowerCase();
  return (
    t === "online" ||
    t === "video" ||
    t === "video_consultation" ||
    t === "telehealth" ||
    t === "telemedicine"
  );
}
