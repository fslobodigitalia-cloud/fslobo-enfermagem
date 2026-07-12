import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { X, Search, Clock, TrendingUp, ArrowUpRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ImagePlaceholder, safeImageUrl } from "@/components/ImagePlaceholder";

const STORAGE_KEY = "search:recent";
const MAX_RECENT = 6;
const SUGGESTIONS = ["ENARE", "Farmacologia", "Vacinas", "Legislação", "Feridas", "Protocolos"];

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function pushRecent(term: string) {
  const t = term.trim();
  if (!t) return;
  const prev = loadRecent().filter((s) => s.toLowerCase() !== t.toLowerCase());
  const next = [t, ...prev].slice(0, MAX_RECENT);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setRecent(loadRecent());
    setTerm("");
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const trimmed = term.trim();
  const debouncedKey = useMemo(() => trimmed.toLowerCase(), [trimmed]);

  const results = useQuery({
    queryKey: ["search-products", debouncedKey],
    enabled: open && trimmed.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, slug, title, cover_url, price, promo_price, categories(name)")
        .eq("status", "published")
        .is("deleted_at", null)
        .ilike("title", `%${trimmed}%`)
        .limit(8);
      return data ?? [];
    },
    staleTime: 30_000,
  });

  function commit(t: string) {
    if (!t.trim()) return;
    pushRecent(t);
    setRecent(loadRecent());
    // For now we just close and let the user click a suggestion; a future /busca route can consume this
    onClose();
    navigate({ to: "/categorias" });
  }

  function clearRecent() {
    window.localStorage.removeItem(STORAGE_KEY);
    setRecent([]);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background animate-fade-in">
      <div className="mx-auto flex h-full max-w-md flex-col">
        <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit(term);
              }}
              placeholder="Buscar produtos, temas..."
              className="h-11 w-full rounded-full border border-border/60 bg-card pl-10 pr-4 text-[14px] outline-none focus:border-primary/40"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar busca"
            className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-8 pt-4">
          {trimmed.length >= 2 ? (
            <ResultsList data={results.data ?? []} loading={results.isLoading} onPick={() => onClose()} />
          ) : (
            <>
              {recent.length > 0 && (
                <section className="mb-6">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" /> Recentes
                    </h3>
                    <button
                      type="button"
                      onClick={clearRecent}
                      className="text-[11px] font-semibold text-primary hover:underline"
                    >
                      Limpar
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recent.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setTerm(r);
                          inputRef.current?.focus();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted"
                      >
                        <Clock className="h-3 w-3 text-muted-foreground" /> {r}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" /> Sugestões
                </h3>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setTerm(s);
                        inputRef.current?.focus();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-[12px] font-semibold text-primary hover:bg-primary/15"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultsList({
  data,
  loading,
  onPick,
}: {
  data: any[];
  loading: boolean;
  onPick: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl p-2">
            <div className="h-12 w-12 rounded-lg bg-muted animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-2.5 w-1/2 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (!data.length) {
    return (
      <div className="mt-6 text-center text-[13px] text-muted-foreground">
        Nenhum resultado. Tente outro termo.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border/60">
      {data.map((p: any) => {
        const img = safeImageUrl(p.cover_url);
        const price = Number(p.promo_price ?? p.price ?? 0);
        return (
          <li key={p.id}>
            <Link
              to="/produto/$id"
              params={{ id: p.slug ?? p.id }}
              onClick={() => {
                pushRecent(p.title);
                onPick();
              }}
              className="flex items-center gap-3 py-2.5"
            >
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-secondary">
                {img ? (
                  <img src={img} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlaceholder iconClassName="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-foreground">{p.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {p.categories?.name ?? "Sem categoria"} · R$ {price.toFixed(2).replace(".", ",")}
                </p>
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}