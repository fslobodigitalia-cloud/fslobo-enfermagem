import { createFileRoute, Link, useRouter, useParams } from "@tanstack/react-router";
import {
  ArrowLeft, Heart, Share2, Star, Check, ShoppingBag, ChevronDown, Loader2,
  Sparkles, Clock, Users, Award, BookOpen, PlayCircle, Zap, Shield, Download, Eye,
  X, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ImagePlaceholder, safeImageUrl } from "@/components/ImagePlaceholder";

export const Route = createFileRoute("/produto/$id")({
  head: () => ({ meta: [{ title: "Produto — FSlobo" }] }),
  component: ProductPage,
});

const BENEFITS = [
  { icon: Zap, label: "Acesso imediato", desc: "Comece a estudar em segundos" },
  { icon: Shield, label: "Garantia de 7 dias", desc: "100% do seu dinheiro de volta" },
  { icon: Download, label: "Estude offline", desc: "Baixe o conteúdo e leve com você" },
  { icon: Award, label: "Certificado", desc: "Comprove seu aprendizado" },
];

function ProductPage() {
  const { id } = useParams({ from: "/produto/$id" });
  const router = useRouter();
  const [fav, setFav] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [activeImage, setActiveImage] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ["public-product", id],
    queryFn: async () => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const base = supabase
        .from("products")
        .select("id, slug, title, short_description, full_description, price, promo_price, cover_url, rating_avg, rating_count, sales_count, product_type, faq, cta_url, categories(name)")
        .eq("status", "published")
        .is("deleted_at", null);
      const { data: bySlug, error: e1 } = await base.eq("slug", id).maybeSingle();
      if (e1) throw e1;
      if (bySlug) return bySlug;
      if (!isUuid) return null;
      const { data: byId, error: e2 } = await base.eq("id", id).maybeSingle();
      if (e2) throw e2;
      return byId;
    },
  });

  const productId = (q.data as any)?.id as string | undefined;

  const images = useQuery({
    queryKey: ["public-product-images", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_images")
        .select("id, url, alt, display_order")
        .eq("product_id", productId!)
        .is("deleted_at", null)
        .order("display_order", { ascending: true });
      return data ?? [];
    },
    enabled: !!productId,
  });

  const modules = useQuery({
    queryKey: ["public-product-modules", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_modules")
        .select("id, title, description, duration_minutes, display_order")
        .eq("product_id", productId!)
        .is("deleted_at", null)
        .order("display_order", { ascending: true });
      return data ?? [];
    },
    enabled: !!productId,
  });

  const reviews = useQuery({
    queryKey: ["public-product-reviews", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("reviews")
        .select("id, rating, title, comment, created_at, profiles(full_name, avatar_url)")
        .eq("product_id", productId!)
        .eq("is_approved", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
    enabled: !!productId,
  });

  const related = useQuery({
    queryKey: ["public-product-related", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, slug, title, price, promo_price, cover_url, rating_avg")
        .eq("status", "published")
        .is("deleted_at", null)
        .neq("id", productId!)
        .limit(6);
      return data ?? [];
    },
    enabled: !!productId,
  });

  const previews = useQuery({
    queryKey: ["public-product-previews", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_previews")
        .select("id, file_url, title, display_order")
        .eq("product_id", productId!)
        .is("deleted_at", null)
        .order("display_order", { ascending: true });
      return data ?? [];
    },
    enabled: !!productId,
  });

  const gallery = useMemo(() => {
    const list: { url: string; alt: string }[] = [];
    const cover = safeImageUrl((q.data as any)?.cover_url);
    if (cover) list.push({ url: cover, alt: (q.data as any)?.title ?? "Produto" });
    for (const im of images.data ?? []) {
      const u = safeImageUrl(im.url);
      if (u) list.push({ url: u, alt: im.alt ?? "" });
    }
    return list;
  }, [q.data, images.data]);

  if (q.isLoading) {
    return <div className="p-16 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!q.data) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Produto não encontrado.</p>
        <Link to="/" className="mt-4 inline-block text-primary font-semibold">Voltar</Link>
      </div>
    );
  }

  const p = q.data as any;
  const price = Number(p.promo_price ?? p.price ?? 0);
  const oldPrice = p.promo_price ? Number(p.price) : null;
  const discount = p.promo_price && p.price ? Math.round((1 - Number(p.promo_price) / Number(p.price)) * 100) : null;
  const rating = Number(p.rating_avg ?? 0);
  const ratingCount = Number(p.rating_count ?? 0);
  const sales = Number(p.sales_count ?? 0);
  const categoryName = p.categories?.name ?? "";
  const faq: { question: string; answer: string }[] = Array.isArray(p.faq) ? p.faq : [];
  const totalMinutes = (modules.data ?? []).reduce((s, m: any) => s + (m.duration_minutes ?? 0), 0);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const hero = gallery[activeImage] ?? null;
  const previewList: any[] = previews.data ?? [];

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight") setLightboxIndex((i) => (i === null ? i : (i + 1) % previewList.length));
      if (e.key === "ArrowLeft") setLightboxIndex((i) => (i === null ? i : (i - 1 + previewList.length) % previewList.length));
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [lightboxIndex, previewList.length]);

  return (
    <div className="relative animate-[slide-in-right_0.3s_ease-out] pb-28">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/15 via-primary/5 to-transparent" />
        <div className="absolute -top-16 -right-16 -z-10 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />

        <div className="flex items-center justify-between px-5 pt-4">
          <button
            onClick={() => router.history.back()}
            aria-label="Voltar"
            className="grid h-11 w-11 place-items-center rounded-full bg-card/95 shadow-md backdrop-blur tap-scale"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <div className="flex gap-2">
            <button
              aria-label="Compartilhar"
              onClick={() => {
                import("@/lib/fbq").then(({ fbqTrackCustom }) =>
                  fbqTrackCustom("Share", { content_type: "product", content_name: p.title, method: "native" }),
                );
                if (navigator.share) navigator.share({ title: p.title, url: window.location.href }).catch(()=>{});
              }}
              className="grid h-11 w-11 place-items-center rounded-full bg-card/95 shadow-md backdrop-blur tap-scale"
            >
              <Share2 className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={() => setFav((v) => !v)}
              aria-label="Favoritar"
              className="grid h-11 w-11 place-items-center rounded-full bg-card/95 shadow-md backdrop-blur tap-scale"
            >
              <Heart className={cn("h-[18px] w-[18px] transition-all", fav && "fill-primary stroke-primary")} />
            </button>
          </div>
        </div>

        {/* Big mockup */}
        <div className="mt-6 px-5">
          <div className="mx-auto grid h-[280px] w-full max-w-[320px] place-items-center overflow-hidden rounded-[32px] bg-card shadow-[var(--shadow-frame)] ring-1 ring-border/40">
            {hero ? (
              <img src={hero.url} alt={hero.alt || p.title} className="h-full w-full object-contain p-4" />
            ) : (
              <ImagePlaceholder iconClassName="h-14 w-14" />
            )}
          </div>

          {gallery.length > 1 && (
            <div className="mt-4 flex justify-center gap-2">
              {gallery.map((g, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  aria-label={`Imagem ${i + 1}`}
                  className={cn(
                    "h-14 w-14 overflow-hidden rounded-xl bg-card ring-2 transition-all tap-scale",
                    activeImage === i ? "ring-primary" : "ring-border/40",
                  )}
                >
                  <img src={g.url} alt={g.alt} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Title + price */}
        <div className="mt-7 px-5">
          {categoryName && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary">{categoryName}</p>
          )}
          <h1 className="mt-1.5 text-[26px] font-extrabold leading-[1.15] tracking-tight text-foreground">
            {p.title}
          </h1>
          {p.short_description && (
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{p.short_description}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1">
              <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" />
              <span className="text-[12px] font-bold text-foreground">{rating.toFixed(1)}</span>
              <span className="text-[11px] text-muted-foreground">({ratingCount || sales})</span>
            </div>
            {sales > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                <Users className="h-3 w-3" /> {sales.toLocaleString("pt-BR")} alunos
              </span>
            )}
            {discount ? (
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                -{discount}% hoje
              </span>
            ) : null}
          </div>

          <div className="mt-5 flex items-baseline gap-3">
            <span className="text-[30px] font-extrabold tracking-tight text-foreground">
              R$ {price.toFixed(2).replace(".", ",")}
            </span>
            {oldPrice ? (
              <span className="text-[14px] text-muted-foreground line-through">
                R$ {oldPrice.toFixed(2).replace(".", ",")}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            ou 12x de R$ {(price / 12).toFixed(2).replace(".", ",")} sem juros
          </p>
        </div>
      </section>

      {/* Content card */}
      <div className="mt-6 rounded-t-[32px] bg-card px-5 pt-8 pb-6 shadow-[0_-8px_30px_-15px_rgb(15_23_42/0.1)]">
        {/* Benefits */}
        <Section title="Por que escolher" icon={Sparkles}>
          <div className="grid grid-cols-2 gap-3">
            {BENEFITS.map((b) => (
              <div key={b.label} className="rounded-2xl bg-secondary/60 p-4">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                  <b.icon className="h-4.5 w-4.5" />
                </div>
                <p className="mt-2.5 text-[13px] font-bold text-foreground">{b.label}</p>
                <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{b.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        {p.full_description && (
          <Section title="Sobre este produto" icon={BookOpen}>
            <p className="whitespace-pre-line text-[14px] leading-relaxed text-muted-foreground">
              {p.full_description}
            </p>
          </Section>
        )}

        {/* Previews carousel */}
        {(previews.data ?? []).length > 0 && (
          <Section title="Prévia do material" icon={Eye} hint={`${(previews.data ?? []).length} páginas`}>
            <div
              className="hide-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 snap-x snap-mandatory scroll-smooth"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {previewList.map((pv: any, i: number) => {
                const u = safeImageUrl(pv.file_url);
                return (
                  <button
                    type="button"
                    onClick={() => u && setLightboxIndex(i)}
                    key={`${pv.id}-${i}`}
                    className="group relative aspect-[1080/1350] h-[360px] w-[288px] shrink-0 snap-start overflow-hidden rounded-2xl bg-secondary/60 ring-1 ring-border/40 shadow-md transition-transform hover:scale-[1.03] cursor-zoom-in"
                    aria-label={`Ampliar ${pv.title ?? `prévia ${i + 1}`}`}
                  >
                    {u ? (
                      <img src={u} alt={pv.title ?? "Prévia"} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <ImagePlaceholder />
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 flex items-center justify-between">
                      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-white/95">
                        {pv.title ?? "Prévia"}
                      </p>
                      <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-foreground">Ampliar</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* Modules / curriculum */}
        {(modules.data ?? []).length > 0 && (
          <Section
            title="Conteúdo do curso"
            icon={PlayCircle}
            hint={totalMinutes > 0 ? `${(modules.data ?? []).length} módulos · ${hours > 0 ? `${hours}h ` : ""}${mins}min` : `${(modules.data ?? []).length} módulos`}
          >
            <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-secondary/60">
              {(modules.data ?? []).map((m: any, i: number) => (
                <div key={m.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-card text-[11px] font-bold text-primary shadow-sm">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-foreground">{m.title}</p>
                    {m.description && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">{m.description}</p>}
                  </div>
                  {m.duration_minutes ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                      <Clock className="h-3 w-3" /> {m.duration_minutes}min
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Reviews */}
        {(reviews.data ?? []).length > 0 && (
          <Section title="Avaliações" icon={Star} hint={`${rating.toFixed(1)} · ${ratingCount || (reviews.data ?? []).length}`}>
            <div className="hide-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 snap-x snap-mandatory">
              {(reviews.data ?? []).map((r: any) => (
                <div key={r.id} className="w-[280px] shrink-0 snap-start rounded-2xl bg-secondary/60 p-4">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={cn("h-3.5 w-3.5", i < r.rating ? "fill-amber-400 stroke-amber-400" : "stroke-muted-foreground/40")} />
                    ))}
                  </div>
                  {r.title && <p className="mt-2 text-[13px] font-bold text-foreground">{r.title}</p>}
                  {r.comment && <p className="mt-1 line-clamp-4 text-[12.5px] leading-relaxed text-muted-foreground">{r.comment}</p>}
                  <p className="mt-3 text-[11px] font-semibold text-foreground">
                    {r.profiles?.full_name ?? "Aluno"}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* FAQ */}
        {faq.length > 0 && (
          <Section title="Perguntas frequentes" icon={ChevronDown}>
            <div className="space-y-2">
              {faq.map((f, i) => (
                <button
                  key={i}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full rounded-2xl bg-secondary/60 px-4 py-3.5 text-left tap-scale"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13.5px] font-semibold text-foreground">{f.question}</p>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", openFaq === i && "rotate-180")} />
                  </div>
                  {openFaq === i && (
                    <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-muted-foreground animate-fade-in">
                      {f.answer}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Related */}
        {(related.data ?? []).length > 0 && (
          <Section title="Você também vai gostar" icon={Sparkles}>
            <div className="hide-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 snap-x snap-mandatory">
              {(related.data ?? []).map((r: any) => {
                const rImg = safeImageUrl(r.cover_url);
                const rPrice = Number(r.promo_price ?? r.price ?? 0);
                return (
                  <Link
                    key={r.id}
                    to="/produto/$id"
                    params={{ id: r.slug ?? r.id }}
                    className="w-[160px] shrink-0 snap-start rounded-2xl bg-secondary/60 p-3 tap-scale"
                  >
                    <div className="aspect-square overflow-hidden rounded-xl bg-card">
                      {rImg ? (
                        <img src={rImg} alt={r.title} className="h-full w-full object-cover" />
                      ) : (
                        <ImagePlaceholder />
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-[12px] font-semibold text-foreground">{r.title}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <p className="text-[12.5px] font-extrabold text-primary">
                        R$ {rPrice.toFixed(2).replace(".", ",")}
                      </p>
                      {r.rating_avg ? (
                        <span className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-muted-foreground">
                          <Star className="h-2.5 w-2.5 fill-amber-400 stroke-amber-400" />
                          {Number(r.rating_avg).toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          </Section>
        )}

        {/* Final CTA — premium 3D cinematic */}
        <div className="mt-10 [perspective:1200px]">
          <div className="group relative overflow-hidden rounded-[28px] p-[1.5px] shadow-[0_30px_60px_-15px_rgb(15_23_42/0.45),0_10px_25px_-10px_rgb(15_23_42/0.35)] transition-transform duration-500 [transform-style:preserve-3d] hover:[transform:rotateX(2deg)_rotateY(-2deg)_translateY(-2px)]"
               style={{ background: "linear-gradient(135deg, hsl(var(--primary)) 0%, color-mix(in oklab, hsl(var(--primary)) 55%, white) 45%, hsl(var(--primary)) 100%)" }}
          >
            <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-primary via-primary to-primary/70 p-6 text-primary-foreground">
              {/* Noise / texture */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-overlay"
                style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")" }}
              />
              {/* Sheen sweep */}
              <div className="pointer-events-none absolute -inset-y-8 -left-1/3 w-1/2 rotate-12 bg-gradient-to-r from-transparent via-white/30 to-transparent blur-2xl transition-transform duration-1000 ease-out group-hover:translate-x-[260%]" />
              {/* Orbs */}
              <div className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white/25 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-black/20 blur-3xl" />

              <div className="relative">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.15em] text-white/95 ring-1 ring-white/25 backdrop-blur">
                  <Sparkles className="h-3 w-3" /> Oferta exclusiva
                </div>
                <h3 className="mt-3 text-[24px] font-black leading-[1.1] tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
                  Pronto para começar?
                </h3>
                <p className="mt-1.5 text-[13px] font-medium text-white/90 drop-shadow-sm">
                  Acesso imediato após a compra. Garantia de 7 dias.
                </p>
                <div className="mt-5 flex items-baseline gap-3">
                  <span className="text-[34px] font-black tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
                    R$ {price.toFixed(2).replace(".", ",")}
                  </span>
                  {oldPrice && (
                    <span className="text-[14px] font-semibold text-white/70 line-through">
                      R$ {oldPrice.toFixed(2).replace(".", ",")}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    const url = (q.data as { cta_url?: string | null } | undefined)?.cta_url;
                    if (url) window.open(url, "_blank", "noopener,noreferrer");
                    else document.querySelector<HTMLButtonElement>("[data-buy-cta]")?.click();
                  }}
                  className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[14px] font-black uppercase tracking-wider text-primary shadow-[0_10px_30px_-10px_rgba(0,0,0,0.45),inset_0_-3px_0_rgb(0_0_0_/0.08)] transition-all hover:translate-y-[-1px] hover:shadow-[0_18px_40px_-12px_rgba(0,0,0,0.55),inset_0_-3px_0_rgb(0_0_0_/0.08)] active:translate-y-0"
                >
                  <ShoppingBag className="h-4 w-4" /> Quero garantir agora
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden trigger kept for the premium CTA button */}
      <button data-buy-cta className="hidden" aria-hidden="true" tabIndex={-1} />

      {/* Preview lightbox */}
      {lightboxIndex !== null && previewList[lightboxIndex] && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in"
          onClick={() => setLightboxIndex(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); }}
            aria-label="Fechar"
            className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20 transition"
          >
            <X className="h-5 w-5" />
          </button>
          {previewList.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => i === null ? i : (i - 1 + previewList.length) % previewList.length); }}
                aria-label="Anterior"
                className="absolute left-3 top-1/2 -translate-y-1/2 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20 transition"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => i === null ? i : (i + 1) % previewList.length); }}
                aria-label="Próxima"
                className="absolute right-3 top-1/2 -translate-y-1/2 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20 transition"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          <img
            src={safeImageUrl(previewList[lightboxIndex].file_url) ?? ""}
            alt={previewList[lightboxIndex].title ?? "Prévia"}
            className="max-h-[90vh] max-w-[92vw] object-contain rounded-lg shadow-2xl select-none"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/90 ring-1 ring-white/20">
            {lightboxIndex + 1} / {previewList.length}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title, icon: Icon, hint, children,
}: { title: string; icon?: React.ComponentType<{ className?: string }>; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && (
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <h2 className="text-[16px] font-extrabold tracking-tight text-foreground">{title}</h2>
        </div>
        {hint && <span className="text-[11px] font-semibold text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}