import { Pill, MapPin, Phone, BadgeCheck, Building2 } from "lucide-react";
import type { DrugListing } from "@/lib/pharmacy";
import { useLanguage } from "@/hooks/useLanguage";

export function ListingCard({ listing }: { listing: DrugListing }) {
  const { t, language } = useLanguage();
  const chainName = language === "ar" && listing.chain?.name_ar ? listing.chain.name_ar : listing.chain?.name;

  return (
    <article className="rounded-2xl border-2 border-teal/30 bg-linear-to-br from-teal/5 to-background p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        {listing.chain?.logo_url ? (
          <img
            src={listing.chain.logo_url}
            alt={chainName ?? ""}
            className="h-12 w-12 rounded-xl object-cover border border-border"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal/15 text-teal">
            <Building2 className="h-6 w-6" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="font-semibold text-foreground truncate">{chainName}</h4>
            <BadgeCheck className="h-4 w-4 text-teal shrink-0" />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("Verified pharmacy", "صيدلية موثّقة")} ·{" "}
            {new Date(listing.created_at).toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", { dateStyle: "medium" })}
          </p>
        </div>
        <span className="rounded-full bg-teal/15 px-2.5 py-1 text-xs font-semibold text-teal">
          {t("Available", "متوفر")}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-background p-4">
        <div className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Pill className="h-5 w-5 text-rose-600" />
          <span>{listing.drug_name}</span>
          {listing.dosage && <span className="text-sm font-normal text-muted-foreground">— {listing.dosage}</span>}
        </div>
        {listing.alternative_name && (
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium">{t("Alternative", "البديل")}:</span> {listing.alternative_name}
          </p>
        )}
        {listing.price != null && (
          <p className="mt-2 text-sm">
            <span className="font-medium text-foreground">{listing.price}</span>{" "}
            <span className="text-muted-foreground">{listing.currency}</span>
          </p>
        )}
        {listing.notes && <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{listing.notes}</p>}
      </div>

      {listing.branch && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {listing.branch.name}
            {listing.branch.city && ` · ${listing.branch.city}`}
          </span>
          {listing.branch.phone && (
            <a href={`tel:${listing.branch.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
              <Phone className="h-3.5 w-3.5" />
              {listing.branch.phone}
            </a>
          )}
          {listing.branch.lat && listing.branch.lng && (
            <a
              href={`https://maps.google.com/?q=${listing.branch.lat},${listing.branch.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ms-auto text-primary hover:underline text-xs font-medium"
            >
              {t("Directions →", "الاتجاهات ←")}
            </a>
          )}
        </div>
      )}

      {!listing.branch && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("Available across all branches of this chain", "متوفر في جميع فروع السلسلة")}
        </p>
      )}
    </article>
  );
}
