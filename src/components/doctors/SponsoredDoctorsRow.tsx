import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { BadgeCheck, MapPin, Star, Megaphone } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useCurrency } from "@/hooks/useCurrency";
import { trackSponsoredEvent } from "@/lib/sponsorship.functions";
import { TierBadge } from "@/components/TierBadge";

interface SponsoredItem {
  slot_id: string;
  doctor_id: string;
  cpc_bid_cents: number;
  doctor: {
    id: string;
    specialty: string | null;
    rating: number | null;
    is_verified: boolean | null;
    consultation_fee: number | null;
    currency: string | null;
    profiles: { full_name: string | null; city: string | null; avatar_url: string | null } | null;
  };
}

interface Props {
  /** Optional filter — only show sponsored matching this specialty (case-insensitive substring). */
  specialty?: string;
  /** Optional filter — only show sponsored matching this governorate id. */
  governorateId?: string;
}

function sessionHash(): string {
  try {
    const KEY = "tabibi_session_hash";
    let h = sessionStorage.getItem(KEY);
    if (!h) {
      h = crypto.randomUUID();
      sessionStorage.setItem(KEY, h);
    }
    return h;
  } catch {
    return "anon";
  }
}

/**
 * Renders top-3 active sponsored doctor slots matching the current filters.
 * Sponsored placements are visibly labeled "إعلان" / "Sponsored" per
 * Egypt CPA Law 181/2018 + UAE eCommerce Law + Saudi e-commerce 2019.
 */
export function SponsoredDoctorsRow({ specialty, governorateId }: Props) {
  const { t, language } = useLanguage();
  const { formatPrice } = useCurrency();
  const track = useServerFn(trackSponsoredEvent);
  const [items, setItems] = useState<SponsoredItem[]>([]);
  const [loading, setLoading] = useState(true);
  const tracked = useRef<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    (async () => {
      let q = supabase
        .from("sponsored_slots")
        .select(`
          id, doctor_id, cpc_bid_cents, specialty, governorate_id,
          doctor:doctor_id (
            id, specialty, rating, is_verified, consultation_fee, currency,
            profiles:profile_id ( full_name, city, avatar_url )
          )
        `)
        .eq("status", "active")
        .order("cpc_bid_cents", { ascending: false })
        .limit(20);
      if (governorateId) {
        q = q.or(`governorate_id.is.null,governorate_id.eq.${governorateId}`);
      }
      const { data, error } = await q;
      if (!mounted || error) {
        setLoading(false);
        return;
      }
      let rows = (data ?? []) as unknown as SponsoredItem[];
      if (specialty) {
        const s = specialty.toLowerCase();
        rows = rows.filter(
          (r) => !r.doctor?.specialty || r.doctor.specialty.toLowerCase().includes(s),
        );
      }
      // Dedupe by doctor_id and cap at 3
      const seen = new Set<string>();
      const unique: SponsoredItem[] = [];
      for (const r of rows) {
        if (seen.has(r.doctor_id)) continue;
        if (!r.doctor) continue;
        seen.add(r.doctor_id);
        unique.push(r);
        if (unique.length >= 3) break;
      }
      setItems(unique);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [specialty, governorateId]);

  // Fire impression once per slot per session
  useEffect(() => {
    const sh = sessionHash();
    items.forEach((it, idx) => {
      if (tracked.current.has(it.slot_id)) return;
      tracked.current.add(it.slot_id);
      track({
        data: {
          slotId: it.slot_id,
          eventType: "impression",
          position: idx + 1,
          sessionHash: sh,
        },
      }).catch(() => {});
    });
  }, [items, track]);

  if (loading || items.length === 0) return null;

  return (
    <section
      aria-label={t("Sponsored doctors", "أطباء برعاية إعلانية")}
      className="mb-6 rounded-2xl border border-amber-200/60 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20 p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Megaphone className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
        <span className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wide">
          {t("Sponsored", "إعلان مموّل")}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((it, idx) => {
          const d = it.doctor;
          const name = d.profiles?.full_name ?? t("Doctor", "طبيب");
          const initial = name.charAt(0).toUpperCase();
          const fee = Number(d.consultation_fee ?? 0);
          const ccy = d.currency ?? "EGP";
          return (
            <Link
              key={it.slot_id}
              to="/doctor/$id"
              params={{ id: d.id }}
              onClick={() => {
                track({
                  data: {
                    slotId: it.slot_id,
                    eventType: "click",
                    position: idx + 1,
                    sessionHash: sessionHash(),
                  },
                }).catch(() => {});
              }}
              className="group block bg-card border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${name} (${t("Sponsored", "إعلان")})`}
            >
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-full bg-linear-to-br from-primary to-teal flex items-center justify-center text-primary-foreground text-lg font-semibold shrink-0">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="font-semibold text-foreground truncate text-sm">{name}</h3>
                    {d.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-primary shrink-0" aria-label={t("Verified", "موثّق")} />}
                    {/* Sponsored slots are Gold-tier-only by RLS — show the badge for trust */}
                    <TierBadge tier="gold" size="sm" />
                  </div>
                  {d.specialty && <p className="text-xs text-muted-foreground truncate">{d.specialty}</p>}
                  {d.profiles?.city && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <MapPin className="h-3 w-3" aria-hidden="true" /> {d.profiles.city}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-current text-amber-500" aria-hidden="true" />
                  <span className="font-medium">{Number(d.rating ?? 0).toFixed(1)}</span>
                </div>
                <div className="text-muted-foreground">
                  {fee > 0 ? formatPrice(fee, ccy) : t("Free", "مجاناً")}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-amber-900/70 dark:text-amber-300/70 text-center">
        {t(
          "Paid placement — does not affect your booking choice or doctor quality.",
          "ظهور مدفوع — لا يؤثر على جودة الطبيب أو حقك في الاختيار."
        )}
      </p>
    </section>
  );
}
