import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  SlidersHorizontal,
  Search,
  Heart,
  Star,
  ArrowRight,
  Sparkles,
  GraduationCap,
  Hospital,
  Pill,
  Syringe,
  Bandage,
  ClipboardList,
  Activity,
  HelpCircle,
  FileCheck,
  Tag,
  PlayCircle,
  Flame,
  ThumbsUp,
  Calculator,
  ListChecks,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/products";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useSiteContent, SITE_CONTENT_DEFAULTS } from "@/hooks/useSiteContent";
import { ImagePlaceholder, safeImageUrl } from "@/components/ImagePlaceholder";
import { HeroCarousel } from "@/components/HeroCarousel";
import { EmptyState } from "@/components/EmptyState";
import { SearchOverlay } from "@/components/SearchOverlay";
import { NotificationBell } from "@/components/NotificationBell";
import heroVideo from "@/assets/hero-nursing.mp4.asset.json";

export const Route = createFileRoute("/")({
  component: HomePage,
});

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  "graduation-cap": GraduationCap,
  hospital: Hospital,
  pill: Pill,
  syringe: Syringe,
  bandage: Bandage,
  "clipboard-list": ClipboardList,
  activity: Activity,
  "help-circle": HelpCircle,
  "file-check": FileCheck,
  tag: Tag,
};

function isEmojiIcon(value: string | null | undefined): value is string {
  if (!value) return false;
  // A short string that isn't one of the known lucide keys is treated as emoji
  return !ICONS[value] && value.length <= 4;
}

function mapProduct(p: any): Product & { categoryId?: string } {
  return {
    id: p.slug ?? p.id,
    name: p.title,
    category: p.categories?.name ?? "",
    categoryId: p.category_id ?? undefined,
    price: Number(p.promo_price ?? p.price ?? 0),
    oldPrice: p.promo_price ? Number(p.price) : undefined,
    discount: p.promo_price ? Math.round((1 - Number(p.promo_price) / Number(p.price)) * 100) : undefined,
    rating: Number(p.rating_avg ?? 0),
    sales: p.sales_count ?? 0,
    image: p.cover_url ?? "",
    description: "",
    benefits: [],
  };
}

const PRODUCT_SELECT =
  "id, category_id, slug, title, price, promo_price, cover_url, sales_count, rating_avg, categories(name)";

function HomePage() {
  const [activeCat, setActiveCat] = useState<string>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const site = useSiteContent();
  const hero = site.data?.hero ?? SITE_CONTENT_DEFAULTS.hero;
  const labels = site.data?.labels ?? SITE_CONTENT_DEFAULTS.labels;
  const { isAuthenticated } = useAuth();

  const live = useQuery({
    queryKey: ["public-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("status", "published")
        .is("deleted_at", null)
        .contains("placements", ["bestsellers"])
        .order("sales_count", { ascending: false, nullsFirst: false })
        .limit(12);
      return (data ?? []).map(mapProduct);
    },
  });

  const promos = useQuery({
    queryKey: ["public-products-promo"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("status", "published")
        .is("deleted_at", null)
        .contains("placements", ["promo"])
        .order("created_at", { ascending: false })
        .limit(8);
      return (data ?? []).map(mapProduct);
    },
  });

  const launches = useQuery({
    queryKey: ["public-products-launches"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("status", "published")
        .is("deleted_at", null)
        .contains("placements", ["launches"])
        .order("created_at", { ascending: false })
        .limit(8);
      return (data ?? []).map(mapProduct);
    },
  });

  const recommended = useQuery({
    queryKey: ["public-products-recommended"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("status", "published")
        .is("deleted_at", null)
        .contains("placements", ["recommended"])
        .order("rating_avg", { ascending: false, nullsFirst: false })
        .limit(8);
      return (data ?? []).map(mapProduct);
    },
  });

  const progress = useQuery({
    queryKey: ["user-progress-home"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_progress")
        .select("progress_pct, last_accessed_at, products(id, slug, title, cover_url, price, promo_price, categories(name))")
        .order("last_accessed_at", { ascending: false })
        .limit(4);
      return (data ?? [])
        .filter((r: any) => r.products)
        .map((r: any) => ({
          progress_pct: r.progress_pct as number,
          product: mapProduct(r.products),
        }));
    },
  });

  const byCat = (list: (Product & { categoryId?: string })[]) =>
    activeCat === "all" ? list : list.filter((p) => p.categoryId === activeCat);

  const bestsellers = byCat(live.data ?? []).slice(0, 4);
  const promoItems = byCat(promos.data ?? []).slice(0, 4);
  const launchItems = byCat(launches.data ?? []).slice(0, 4);
  const recItems = byCat(recommended.data ?? []).slice(0, 4);

  return (
    <div className="animate-fade-in">
      <TopBar />
      <div className="px-5 pt-4">
        <SearchBar placeholder={labels.search_placeholder} onOpen={() => setSearchOpen(true)} />
      </div>
      <Categories active={activeCat} onChange={setActiveCat} />
      <div className="px-5 mt-5">
        <HeroCarousel fallbackHero={hero} />
      </div>

      <QuickAccess />

      {isAuthenticated && (progress.isLoading || (progress.data && progress.data.length > 0)) && (
        <>
          <Section title="Continuar estudando" href="/pedidos" icon={PlayCircle} />
          <ContinueLearning loading={progress.isLoading} items={progress.data ?? []} />
        </>
      )}

      {(live.isLoading || bestsellers.length > 0) && (
        <>
          <Section title={labels.bestsellers_title} href="/categorias" icon={Flame} />
          <ProductGrid items={bestsellers} loading={live.isLoading} />
        </>
      )}

      {(promos.isLoading || promoItems.length > 0) && (
        <>
          <Section title="Promoções" href="/categorias" icon={Tag} />
          <ProductGrid items={promoItems} loading={promos.isLoading} />
        </>
      )}

      {(launches.isLoading || launchItems.length > 0) && (
        <>
          <Section title={labels.launches_title} href="/categorias" icon={Sparkles} />
          <ProductGrid items={launchItems} loading={launches.isLoading} />
        </>
      )}

      {(recommended.isLoading || recItems.length > 0) && (
        <>
          <Section title="Recomendados para você" href="/categorias" icon={ThumbsUp} />
          <ProductGrid items={recItems} loading={recommended.isLoading} />
        </>
      )}

      <Section title="Todos os produtos" href="/categorias" icon={Sparkles} />
      <InfiniteFeed />

      <div className="h-6" />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function QuickAccess() {
  return (
    <div className="mt-6 px-5 grid grid-cols-2 gap-3">
      <Link
        to="/calculadora"
        className="group relative overflow-hidden rounded-[24px] bg-gradient-to-br from-primary via-primary to-primary/70 p-4 text-primary-foreground shadow-[var(--shadow-elevated)] tap-scale hover:-translate-y-0.5 transition-all"
      >
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/20 backdrop-blur">
          <Calculator className="h-5 w-5" />
        </span>
        <p className="mt-3 text-[15px] font-extrabold leading-tight">Calculadora</p>
        <p className="mt-0.5 text-[11px] font-medium opacity-90">Doses, gotejamento e mais</p>
        <span className="pointer-events-none absolute -right-6 -bottom-6 h-24 w-24 rounded-full bg-white/10 blur-xl" />
      </Link>
      <Link
        to="/checklist"
        className="group relative overflow-hidden rounded-[24px] bg-gradient-to-br from-secondary via-secondary to-secondary/70 p-4 text-secondary-foreground shadow-[var(--shadow-elevated)] tap-scale hover:-translate-y-0.5 transition-all"
      >
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-primary backdrop-blur">
          <ListChecks className="h-5 w-5" />
        </span>
        <p className="mt-3 text-[15px] font-extrabold leading-tight">Checklist</p>
        <p className="mt-0.5 text-[11px] font-medium opacity-80">Procedimentos e rotinas</p>
        <span className="pointer-events-none absolute -right-6 -bottom-6 h-24 w-24 rounded-full bg-primary/10 blur-xl" />
      </Link>
    </div>
  );
}

function TopBar() {
  return (
    <header className="px-5 pt-6">
      <div
        className="relative overflow-hidden rounded-[24px] p-5 text-white shadow-[var(--shadow-elevated)] min-h-[180px]"
        style={{ background: "var(--gradient-primary)" }}
      >
        <video
          src={heroVideo.url}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(120deg, hsl(var(--primary) / 0.92) 0%, hsl(var(--primary) / 0.75) 55%, rgba(0,0,0,0.55) 100%)",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-black/25"
        />
        <div className="relative z-10 flex items-start justify-between gap-3 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.45)]">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide backdrop-blur-sm ring-1 ring-white/20">
              <Sparkles className="h-3 w-3" /> Feito para quem cuida
            </span>
            <h1 className="mt-2 text-[22px] font-extrabold leading-tight text-white">
              Conteúdo que salva plantão.
            </h1>
            <p className="mt-1 text-[12.5px] text-white leading-snug max-w-[85%]">
              Materiais completos, calculadora de doses e checklists práticos — tudo num só lugar, direto ao ponto.
            </p>
          </div>
          <div className="shrink-0">
            <NotificationBell />
          </div>
        </div>
        <span className="pointer-events-none absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-white/10 blur-2xl z-10" />
      </div>
    </header>
  );
}

function SearchBar({ placeholder, onOpen }: { placeholder: string; onOpen: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onOpen}
        className="relative flex-1 tap-scale"
        aria-label="Abrir busca"
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
        <span className="flex h-12 w-full items-center rounded-full border border-border/60 bg-card pl-11 pr-4 text-left text-[14px] text-muted-foreground shadow-[var(--shadow-card)]">
          {placeholder}
        </span>
      </button>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Filtros de pesquisa"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-elevated)] tap-scale hover:-translate-y-0.5 transition-all"
      >
        <SlidersHorizontal className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}

function Categories({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  const q = useQuery({
    queryKey: ["public-categories-chips"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, icon")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      return data ?? [];
    },
  });
  const cats = [
    ...(q.data ?? []),
  ];
  return (
    <div className="mt-5 hide-scrollbar overflow-x-auto">
      <div className="flex gap-2 px-5 pb-1.5">
        <Link
          to="/calculadora"
          className="group inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary/80 pl-1.5 pr-4 text-[12.5px] font-bold text-primary-foreground shadow-[var(--shadow-elevated)] tap-scale transition-all duration-300 hover:-translate-y-0.5"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20">
            <Calculator className="h-3.5 w-3.5" />
          </span>
          Calculadora
        </Link>
        <Link
          to="/checklist"
          className="group inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-card pl-1.5 pr-4 text-[12.5px] font-bold text-foreground shadow-[var(--shadow-card)] tap-scale transition-all duration-300 hover:-translate-y-0.5"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
            <ListChecks className="h-3.5 w-3.5" />
          </span>
          Checklist
        </Link>
        {cats.map((c) => {
          const isActive = c.id === active;
          const emoji = isEmojiIcon(c.icon);
          const Icon = emoji ? null : ICONS[c.icon ?? "sparkles"] ?? Sparkles;
          return (
            <button
              key={c.id}
              onClick={() => onChange(c.id)}
              className={cn(
                "group inline-flex h-10 shrink-0 items-center gap-2 rounded-full pl-1.5 pr-4 text-[12.5px] font-semibold tap-scale transition-all duration-300",
                isActive
                  ? "bg-primary text-primary-foreground shadow-[var(--shadow-elevated)] scale-[1.02]"
                  : "bg-card text-foreground shadow-[var(--shadow-card)] hover:-translate-y-0.5",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full transition-colors",
                  isActive ? "bg-white/20 text-primary-foreground" : "bg-primary/10 text-primary",
                )}
              >
                {emoji ? (
                  <span className="text-[14px] leading-none">{c.icon}</span>
                ) : Icon ? (
                  <Icon className="h-3.5 w-3.5" />
                ) : null}
              </span>
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Section({ title, href, icon: Icon }: { title: string; href: string; icon?: LucideIcon }) {
  return (
    <div className="mt-7 flex items-center justify-between px-5">
      <h3 className="flex items-center gap-2 text-[17px] font-extrabold tracking-tight text-foreground">
        {Icon ? <Icon className="h-4 w-4 text-primary" /> : null}
        {title}
      </h3>
      <Link
        to={href}
        className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-primary tap-scale"
      >
        Ver todos <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function ContinueLearning({
  items,
  loading,
}: {
  items: { progress_pct: number; product: Product }[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-3 hide-scrollbar overflow-x-auto">
        <div className="flex gap-3 px-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-24 w-[280px] shrink-0 animate-pulse rounded-[20px] bg-muted" />
          ))}
        </div>
      </div>
    );
  }
  if (!items.length) return null;
  return (
    <div className="mt-3 hide-scrollbar overflow-x-auto">
      <div className="flex gap-3 px-5">
        {items.map(({ product: p, progress_pct }) => {
          const img = safeImageUrl(p.image);
          return (
            <Link
              key={p.id}
              to="/produto/$id"
              params={{ id: p.id }}
              className="group flex w-[280px] shrink-0 items-center gap-3 rounded-[20px] bg-card p-3 shadow-[var(--shadow-card)] tap-scale hover:-translate-y-0.5 transition-all"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-secondary">
                {img ? (
                  <img src={img} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlaceholder iconClassName="h-6 w-6" />
                )}
                <div className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                  <PlayCircle className="h-6 w-6 text-white" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[13px] font-semibold text-foreground">{p.name}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.max(0, Math.min(100, progress_pct))}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-primary tabular-nums">
                    {progress_pct}%
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ProductGrid({ items, loading }: { items: Product[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-3 px-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[22px] bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="aspect-square rounded-2xl bg-muted animate-pulse" />
            <div className="mt-3 h-4 w-2/3 rounded bg-muted animate-pulse" />
            <div className="mt-2 h-3 w-1/2 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <EmptyState
        title="Nada por aqui ainda"
        description="Assim que novos materiais forem publicados, eles aparecem nesta seção."
        actionLabel="Explorar categorias"
        actionHref="/categorias"
      />
    );
  }
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 px-5">
      {items.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

const FEED_PAGE_SIZE = 8;

function InfiniteFeed() {
  const q = useInfiniteQuery({
    queryKey: ["public-products-feed"],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * FEED_PAGE_SIZE;
      const to = from + FEED_PAGE_SIZE - 1;
      const { data } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("status", "published")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(from, to);
      return (data ?? []).map(mapProduct);
    },
    getNextPageParam: (last, all) =>
      last.length < FEED_PAGE_SIZE ? undefined : all.length,
  });

  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && q.hasNextPage && !q.isFetchingNextPage) {
        q.fetchNextPage();
      }
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage, q.fetchNextPage]);

  const items = (q.data?.pages ?? []).flat();

  if (q.isLoading) {
    return <ProductGrid items={[]} loading />;
  }
  if (!items.length) {
    return (
      <EmptyState
        title="Nenhum produto disponível"
        description="Quando novos produtos forem publicados, aparecem aqui."
        actionLabel="Explorar categorias"
        actionHref="/categorias"
      />
    );
  }
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-3 px-5">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      <div ref={sentinel} className="h-10" />
      {q.isFetchingNextPage && (
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-[22px] bg-card p-4 shadow-[var(--shadow-card)]">
              <div className="aspect-square rounded-2xl bg-muted animate-pulse" />
              <div className="mt-3 h-4 w-2/3 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      )}
      {!q.hasNextPage && (
        <p className="mt-4 px-5 text-center text-[11px] text-muted-foreground">
          Você viu todos os produtos ✨
        </p>
      )}
    </>
  );
}

function ProductCard({ product }: { product: Product }) {
  const [fav, setFav] = useState(false);
  const img = safeImageUrl(product.image);
  return (
    <article className="group flex flex-col rounded-[22px] bg-card p-4 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-soft)]">
      <div className="relative mb-3 aspect-square overflow-hidden rounded-2xl bg-secondary">
        {img ? (
          <img
            src={img}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <ImagePlaceholder />
        )}
        {product.discount ? (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow-md">
            -{product.discount}%
          </span>
        ) : null}
        <button
          onClick={(e) => {
            e.preventDefault();
            setFav((v) => !v);
          }}
          aria-label="Favoritar"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-card/95 shadow-sm backdrop-blur tap-scale"
        >
          <Heart
            className={cn(
              "h-4 w-4 transition-all duration-300",
              fav ? "fill-primary stroke-primary scale-110" : "stroke-muted-foreground",
            )}
          />
        </button>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[15px] font-extrabold text-foreground">
          R$ {product.price.toFixed(2).replace(".", ",")}
        </span>
        {product.oldPrice ? (
          <span className="text-[10px] text-muted-foreground line-through">
            R$ {product.oldPrice.toFixed(2).replace(".", ",")}
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-0.5">
          <Star className="h-3 w-3 fill-amber-400 stroke-amber-400" />
          <span className="font-semibold text-foreground">{product.rating}</span>
        </span>
        <span>•</span>
        <span>{product.sales.toLocaleString("pt-BR")} vendas</span>
      </div>
      <h4 className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
        {product.name}
      </h4>
      <p className="text-[10.5px] font-medium text-muted-foreground">{product.category}</p>
      <Link
        to="/produto/$id"
        params={{ id: product.id }}
        className="mt-3 inline-flex h-9 items-center justify-center rounded-full bg-secondary text-[12px] font-bold text-foreground tap-scale hover:bg-primary hover:text-primary-foreground transition-colors"
      >
        Saber Mais
      </Link>
    </article>
  );
}
