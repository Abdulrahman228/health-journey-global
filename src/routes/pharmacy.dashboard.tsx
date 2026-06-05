import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Building2,
  Plus,
  MapPin,
  Pill,
  Loader2,
  Trash2,
  Clock,
  BadgeCheck,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import {
  getMyChain,
  listBranches,
  listMyListings,
  createBranch,
  createListing,
  deleteBranch,
  deactivateListing,
} from "@/lib/pharmacy";
import { toast } from "sonner";

export const Route = createFileRoute("/pharmacy/dashboard")({
  component: PharmacyDashboard,
  head: () => ({
    meta: [{ title: "Pharmacy Dashboard | Tabibi" }],
  }),
});

function PharmacyDashboard() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { t } = useLanguage();
  const qc = useQueryClient();

  if (!isLoading && !isAuthenticated) {
    throw redirect({ to: "/login" });
  }

  const { data: chain, isLoading: chainLoading } = useQuery({
    queryKey: ["my-chain", user?.id],
    queryFn: () => getMyChain(user!.id),
    enabled: !!user?.id,
  });

  const { data: branches } = useQuery({
    queryKey: ["my-branches", chain?.id],
    queryFn: () => listBranches(chain!.id),
    enabled: !!chain?.id,
  });

  const { data: listings } = useQuery({
    queryKey: ["my-listings", chain?.id],
    queryFn: () => listMyListings(chain!.id),
    enabled: !!chain?.id,
  });

  if (chainLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!chain) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-bold">{t("No pharmacy chain yet", "لا توجد سلسلة صيدليات بعد")}</h1>
          <p className="mt-2 text-muted-foreground">
            {t("Register your pharmacy chain to start listing available medications.", "سجّل سلسلتك لتبدأ نشر الأدوية المتوفرة.")}
          </p>
          <Link
            to="/pharmacy/register"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t("Register pharmacy chain", "تسجيل سلسلة صيدليات")}
          </Link>
      </div>
    );
  }

  return (
    <div>
        {/* Header */}
        <section className="border-b border-border bg-linear-to-br from-teal/10 via-background to-background">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-start gap-4">
              {chain.logo_url ? (
                <img src={chain.logo_url} alt={chain.name} className="h-16 w-16 rounded-2xl object-cover border border-border" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal/15 text-teal">
                  <Building2 className="h-8 w-8" />
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-foreground">{chain.name}</h1>
                  {chain.is_verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal/15 px-2.5 py-0.5 text-xs font-semibold text-teal">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      {t("Verified", "موثّق")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-600">
                      <Clock className="h-3.5 w-3.5" />
                      {t("Pending review", "قيد المراجعة")}
                    </span>
                  )}
                </div>
                {chain.name_ar && <p className="text-sm text-muted-foreground mt-0.5">{chain.name_ar}</p>}
              </div>
            </div>
          </div>
        </section>

        {!chain.is_verified && (
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-4">
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>
                {t(
                  "Your chain is under review. You can add branches and listings now, but they'll only appear publicly once your chain is approved.",
                  "سلسلتك قيد المراجعة. يمكنك إضافة الفروع والإعلانات الآن، لكنها لن تظهر للعامة حتى يتم اعتماد سلسلتك.",
                )}
              </p>
            </div>
          </div>
        )}

        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 grid gap-6 lg:grid-cols-2">
          <BranchesSection
            branches={branches ?? []}
            onAdd={async (input) => {
              await createBranch({ ...input, chainId: chain.id });
              qc.invalidateQueries({ queryKey: ["my-branches", chain.id] });
              toast.success(t("Branch added", "تمت إضافة الفرع"));
            }}
            onDelete={async (id) => {
              await deleteBranch(id);
              qc.invalidateQueries({ queryKey: ["my-branches", chain.id] });
              toast.success(t("Branch removed", "تم حذف الفرع"));
            }}
          />
          <ListingsSection
            listings={listings ?? []}
            branches={branches ?? []}
            onAdd={async (input) => {
              await createListing({ ...input, chainId: chain.id });
              qc.invalidateQueries({ queryKey: ["my-listings", chain.id] });
              toast.success(t("Listing added", "تمت إضافة الإعلان"));
            }}
            onDeactivate={async (id) => {
              await deactivateListing(id);
              qc.invalidateQueries({ queryKey: ["my-listings", chain.id] });
              toast.success(t("Listing deactivated", "تم إيقاف الإعلان"));
            }}
          />
        </div>
    </div>
  );
}

function BranchesSection({
  branches,
  onAdd,
  onDelete,
}: {
  branches: Array<{ id: string; name: string; city: string | null; address: string | null; phone: string | null }>;
  onAdd: (input: { name: string; city?: string; address?: string; phone?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name) return;
    setBusy(true);
    try {
      await onAdd({ name, city: city || undefined, address: address || undefined, phone: phone || undefined });
      setName("");
      setCity("");
      setAddress("");
      setPhone("");
      setShowForm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" /> {t("Branches", "الفروع")}
          <span className="text-sm font-normal text-muted-foreground">({branches.length})</span>
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("Add branch", "إضافة فرع")}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="space-y-2 mb-4 rounded-lg border border-border bg-background p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("Branch name *", "اسم الفرع *")}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("City", "المدينة")} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("Phone", "الهاتف")} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          </div>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("Address", "العنوان")} className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          <button type="submit" disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("Save", "حفظ")}
          </button>
        </form>
      )}

      {branches.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{t("No branches yet", "لا توجد فروع بعد")}</p>
      ) : (
        <ul className="space-y-2">
          {branches.map((b) => (
            <li key={b.id} className="flex items-start justify-between rounded-lg border border-border bg-background p-3">
              <div className="text-sm">
                <p className="font-medium text-foreground">{b.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[b.city, b.address].filter(Boolean).join(" · ")}
                  {b.phone && ` · ${b.phone}`}
                </p>
              </div>
              <button onClick={() => onDelete(b.id)} className="text-destructive hover:bg-destructive/10 rounded-md p-1.5">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ListingsSection({
  listings,
  branches,
  onAdd,
  onDeactivate,
}: {
  listings: Array<{ id: string; drug_name: string; dosage: string | null; price: number | null; currency: string; is_active: boolean; branch_id: string | null; expires_at: string | null }>;
  branches: Array<{ id: string; name: string }>;
  onAdd: (input: { drugName: string; dosage?: string; alternativeName?: string; price?: number; notes?: string; branchId?: string }) => Promise<void>;
  onDeactivate: (id: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [showForm, setShowForm] = useState(false);
  const [drugName, setDrugName] = useState("");
  const [dosage, setDosage] = useState("");
  const [alternative, setAlternative] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [branchId, setBranchId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!drugName) return;
    setBusy(true);
    try {
      await onAdd({
        drugName,
        dosage: dosage || undefined,
        alternativeName: alternative || undefined,
        price: price ? Number(price) : undefined,
        notes: notes || undefined,
        branchId: branchId || undefined,
      });
      setDrugName("");
      setDosage("");
      setAlternative("");
      setPrice("");
      setNotes("");
      setBranchId("");
      setShowForm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Pill className="h-5 w-5 text-rose-600" /> {t("Drug listings", "إعلانات الأدوية")}
          <span className="text-sm font-normal text-muted-foreground">({listings.filter((l) => l.is_active).length})</span>
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("Add listing", "إضافة إعلان")}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="space-y-2 mb-4 rounded-lg border border-border bg-background p-3">
          <input value={drugName} onChange={(e) => setDrugName(e.target.value)} placeholder={t("Drug name *", "اسم الدواء *")} className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" required />
          <div className="grid grid-cols-2 gap-2">
            <input value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder={t("Dosage", "التركيز")} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
            <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" step="0.01" placeholder={t("Price (EGP)", "السعر (جنيه)")} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          </div>
          <input value={alternative} onChange={(e) => setAlternative(e.target.value)} placeholder={t("Alternative drug name", "اسم البديل")} className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
            <option value="">{t("All branches", "جميع الفروع")}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t("Notes (optional)", "ملاحظات (اختياري)")} className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          <button type="submit" disabled={busy} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("Save", "حفظ")}
          </button>
        </form>
      )}

      {listings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{t("No listings yet", "لا توجد إعلانات بعد")}</p>
      ) : (
        <ul className="space-y-2 max-h-96 overflow-y-auto">
          {listings.map((l) => (
            <li key={l.id} className={`flex items-start justify-between rounded-lg border p-3 ${l.is_active ? "border-border bg-background" : "border-dashed border-muted bg-muted/30 opacity-60"}`}>
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  {l.drug_name} {l.dosage && <span className="text-muted-foreground">— {l.dosage}</span>}
                </p>
                {l.price != null && <p className="text-xs text-muted-foreground">{l.price} {l.currency}</p>}
              </div>
              {l.is_active && (
                <button onClick={() => onDeactivate(l.id)} className="text-muted-foreground hover:text-destructive rounded-md p-1.5 text-xs">
                  {t("Deactivate", "إيقاف")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
