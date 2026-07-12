import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SITE_CONTENT_DEFAULTS, type HeroSettings } from "@/hooks/useSiteContent";
import enareVideo from "@/assets/enare-hospital.mp4.asset.json";
import { cn } from "@/lib/utils";

type Slide = {
  id: string;
  title: string;
  subtitle: string;
  image_url: string | null;
  link_url: string | null;
  badge: string | null;
  cta_label: string | null;
};

const ROTATE_MS = 5000;

function isInternal(href: string | null) {
  if (!href) return false;
  return href.startsWith("/");
}

function heroToSlide(h: HeroSettings): Slide {
  return {
    id: "fallback",
    title: h.title,
    subtitle: h.subtitle,
    image_url: h.image_url || null,
    link_url: h.cta_href || "/categorias",
    badge: h.badge,
    cta_label: h.cta_label,
  };
}

export function HeroCarousel({ fallbackHero }: { fallbackHero: HeroSettings }) {
  const q = useQuery({
    queryKey: ["hero-banners"],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from("banners")
        .select("id, title, subtitle, image_url, link_url, badge, cta_label, starts_at, ends_at")
        .eq("is_active", true)
        .in("position", ["hero", "home"])
        .is("deleted_at", null)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(6);
      return (data ?? []).filter((b: any) => {
        if (b.starts_at && b.starts_at > nowIso) return false;
        if (b.ends_at && b.ends_at < nowIso) return false;
        return true;
      }) as any[];
    },
    staleTime: 60_000,
  });

  const slides: Slide[] = useMemo(() => {
    const rows = (q.data ?? []).map((b: any): Slide => ({
      id: b.id,
      title: b.title ?? "",
      subtitle: b.subtitle ?? "",
      image_url: b.image_url ?? null,
      link_url: b.link_url ?? null,
      badge: b.badge ?? null,
      cta_label: b.cta_label ?? null,
    }));
    return rows.length ? rows : [heroToSlide(fallbackHero)];
  }, [q.data, fallbackHero]);

  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    setProgress(0);
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      const p = Math.min(1, elapsed / ROTATE_MS);
      setProgress(p);
      if (p >= 1) {
        setIdx((i) => (i + 1) % slides.length);
      } else {
        raf = requestAnimationFrame(tick);
      }
    };
    let raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [idx, slides.length]);

  if (q.isLoading) {
    return (
      <div className="h-[180px] w-full animate-pulse rounded-[24px] bg-muted" />
    );
  }

  const s = slides[idx] ?? slides[0];
  const href = s.link_url || "/categorias";
  const ctaLabel = s.cta_label?.trim() || "Ver detalhes";
  const isEnare = /enare/i.test(s.title) || /enare/i.test(s.badge ?? "");

  const CardInner = (
    <div
      className="relative h-[190px] overflow-hidden rounded-[24px] p-5 text-white shadow-[var(--shadow-elevated)] transition-transform duration-500 hover:-translate-y-0.5"
      style={{ background: "var(--gradient-primary)" }}
    >
      <video
        src={enareVideo.url}
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
            "linear-gradient(100deg, hsl(var(--primary) / 0.96) 0%, hsl(var(--primary) / 0.82) 45%, rgba(0,0,0,0.65) 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(120% 90% at 0% 50%, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 40%, transparent 70%)",
        }}
      />
      <div
        className="relative z-10 flex h-full max-w-[85%] flex-col justify-between animate-fade-in [text-shadow:0_2px_10px_rgba(0,0,0,0.45)]"
        key={s.id}
      >
        <div>
          {s.badge ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ring-1 ring-white/30 backdrop-blur-md [text-shadow:none]">
              {s.badge}
            </span>
          ) : null}
          <h2 className="mt-2 text-[23px] font-black leading-[1.1] tracking-tight line-clamp-2 drop-shadow-lg">
            {s.title}
          </h2>
          {s.subtitle ? (
            <p className="mt-1.5 text-[12.5px] font-medium text-white/95 leading-snug line-clamp-2">
              {s.subtitle}
            </p>
          ) : null}
        </div>
        {!isEnare && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[12px] font-bold text-primary shadow-lg [text-shadow:none]">
            {ctaLabel} <ArrowRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      {slides.length > 1 && (
        <div className="absolute inset-x-0 bottom-2 z-10 flex justify-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir para banner ${i + 1}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIdx(i);
              }}
              className={cn(
                "relative h-1.5 overflow-hidden rounded-full bg-white/40 transition-all",
                i === idx ? "w-6" : "w-1.5 hover:bg-white/60",
              )}
            >
              {i === idx && (
                <span
                  className="absolute inset-y-0 left-0 bg-white"
                  style={{ width: `${progress * 100}%` }}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (isEnare) {
    return <div className="block">{CardInner}</div>;
  }
  if (isInternal(href)) {
    return (
      <Link to={href} className="block tap-scale">
        {CardInner}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="block tap-scale">
      {CardInner}
    </a>
  );
}