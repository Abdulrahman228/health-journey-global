import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Search, MapPin, Stethoscope, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeArabicText } from "@/lib/arabic";

interface SpecialtyRow {
  slug: string;
  name_ar: string;
  name_en: string;
}

interface Props {
  isRTL: boolean;
  t: (en: string, ar: string) => string;
}

/**
 * One search box for the homepage: specialty, doctor name or symptom.
 * Specialties match from the first letters with Arabic-spelling tolerance
 * (ى/ي, ة/ه, أ/ا); anything else searches the doctors list. "Near me" opens
 * the geographic search.
 */
export function SmartSearch({ isRTL, t }: Props) {
  const router = useRouter();
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [specialties, setSpecialties] = useState<SpecialtyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("specialties")
      .select("slug,name_ar,name_en")
      .order("name_ar")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("specialties load failed", error);
        setSpecialties((data as SpecialtyRow[] | null) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const q = normalizeArabicText(value);
  const matches = useMemo(() => {
    if (q.length < 1) return [];
    const starts: SpecialtyRow[] = [];
    const contains: SpecialtyRow[] = [];
    for (const s of specialties) {
      const names = [normalizeArabicText(s.name_ar), normalizeArabicText(s.name_en), s.slug];
      if (names.some((n) => n.startsWith(q))) starts.push(s);
      else if (names.some((n) => n.includes(q))) contains.push(s);
    }
    return [...starts, ...contains].slice(0, 6);
  }, [q, specialties]);

  // Rows: specialties first, then a free-text doctors search.
  const rows = useMemo(() => {
    const list: { key: string; label: string; hint: string; href: string; icon: "spec" | "search" }[] =
      matches.map((s) => ({
        key: s.slug,
        label: isRTL ? s.name_ar : s.name_en,
        hint: t("Specialty", "تخصص"),
        href: `/specialty/${s.slug}`,
        icon: "spec",
      }));
    if (value.trim()) {
      list.push({
        key: "__search",
        label: t(`Search doctors for "${value.trim()}"`, `ابحث عن «${value.trim()}» بين الأطباء`),
        hint: t("Doctor name or symptom", "اسم طبيب أو عرَض"),
        href: `/doctors?search=${encodeURIComponent(value.trim())}`,
        icon: "search",
      });
    }
    return list;
  }, [matches, value, isRTL, t]);

  function go(href: string) {
    setLoading(true);
    setOpen(false);
    router.navigate({ href });
  }

  function submit() {
    const row = rows[active] ?? rows[0];
    if (row) go(row.href);
    else go("/doctors");
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-2 shadow-[0_12px_40px_-16px_oklch(0.50_0.10_192/0.35)] sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            role="combobox"
            aria-expanded={open && rows.length > 0}
            aria-controls="home-search-list"
            aria-autocomplete="list"
            autoComplete="off"
            enterKeyHint="search"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, rows.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={t("Specialty, doctor name or symptom…", "التخصص، اسم الطبيب أو العرَض…")}
            className="h-12 w-full rounded-xl bg-transparent ps-11 pe-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => go("/nearby")}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <MapPin className="h-4 w-4 text-primary" />
            {t("Near me", "الأقرب لي")}
          </button>
          <button
            type="button"
            onClick={submit}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Arrow className="h-4 w-4" />}
            {t("Search", "ابحث")}
          </button>
        </div>
      </div>

      {open && rows.length > 0 && (
        <ul
          id="home-search-list"
          role="listbox"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-popover shadow-xl"
        >
          {rows.map((r, i) => (
            <li key={r.key} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(r.href);
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-start text-sm transition-colors ${
                  i === active ? "bg-accent" : "hover:bg-accent/60"
                }`}
              >
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  {r.icon === "spec" ? <Stethoscope className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-foreground">{r.label}</span>
                  <span className="text-xs text-muted-foreground">{r.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
