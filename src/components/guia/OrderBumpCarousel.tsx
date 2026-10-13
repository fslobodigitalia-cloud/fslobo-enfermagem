import * as React from "react";
import { flushSync } from "react-dom";
import { Check, ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents, type DigitalBump } from "@/config/digitalProducts";

/**
 * Carrossel de order bumps — SÓ apresentação. Não guarda seleção própria:
 * `selectedBumps` e `onToggle` pertencem à página (único estado de verdade),
 * que continua enviando apenas os slugs ao checkout.
 *
 * Desktop (>= 768px): carrossel cíclico, um card por vez. Não há cópias dos
 * cards — a ordem dos MESMOS elementos é rotacionada ao fim de cada passo,
 * então nunca existe controle duplicado nem foco duplicado. Cards fora da
 * janela visível ficam `inert` (sem foco e fora da árvore de acessibilidade).
 * Pausa com mouse/foco/interação; sem autoplay em prefers-reduced-motion.
 *
 * Celular (< 768px): cards compactos (capa pequena + texto lado a lado), scroll
 * horizontal nativo com scroll-snap (um card por vez), sem animação automática e
 * sem rolagem horizontal da página.
 */

const STEP_MS = 450;
const AUTOPLAY_MS = 4500;
const GAP_PX = 16;
const CONTROL_CLASS =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-800 transition-colors hover:border-teal-500 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/40";
const DESKTOP_QUERY = "(min-width: 768px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false,
  );
  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** Preço curto exibido nos cards: "R$ 10" (sem centavos quando redondo). */
function shortPrice(cents: number): string {
  return formatCents(cents).replace(/,00$/, "");
}

/**
 * Capa real do produto (arquivo local ou URL pública do bucket product-covers).
 * Se a imagem falhar, cai numa capa teal com o nome do produto — nunca aparece
 * ícone de imagem quebrada. As caixas têm tamanho fixo: trocar de imagem para
 * fallback não gera layout shift. A capa sempre aparece inteira (object-contain).
 */
function BumpMockup({ bump, compact }: { bump: DigitalBump; compact: boolean }) {
  const [failed, setFailed] = React.useState(false);
  const src = failed ? undefined : bump.image;

  if (compact) {
    return (
      <div className="relative flex h-[120px] w-[88px] shrink-0 items-center justify-center">
        {src ? (
          <img
            src={src}
            alt={`Capa de ${bump.name}`}
            width={88}
            height={120}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailed(true)}
            className="h-full w-full select-none object-contain drop-shadow-[0_5px_6px_rgba(15,23,42,0.3)]"
          />
        ) : (
          <div
            role="img"
            aria-label={`Capa de ${bump.name}`}
            className="flex h-full w-full items-end overflow-hidden rounded-md bg-gradient-to-br from-teal-700 via-teal-800 to-teal-950 px-1 py-1.5 text-white shadow-[0_5px_6px_-2px_rgba(15,23,42,0.3),inset_3px_0_6px_-4px_rgba(0,0,0,0.45)]"
          >
            <span className="line-clamp-5 break-words text-[10px] font-extrabold leading-tight tracking-tight">{bump.name}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-gradient-to-b from-slate-50 to-teal-50/60">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 bottom-3 h-5 rounded-[50%] bg-slate-900/10 blur-md"
      />
      {src ? (
        <img
          src={src}
          alt={`Capa de ${bump.name}`}
          width={320}
          height={400}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="relative h-full w-full select-none object-contain p-3 drop-shadow-[0_10px_14px_rgba(15,23,42,0.18)]"
        />
      ) : (
        <div
          role="img"
          aria-label={`Capa de ${bump.name}`}
          className="absolute inset-3 flex flex-col justify-end overflow-hidden rounded-xl bg-gradient-to-br from-teal-700 via-teal-800 to-teal-950 p-4 text-white shadow-[inset_5px_0_10px_-6px_rgba(0,0,0,0.45)]"
        >
          <span aria-hidden="true" className="mb-3 h-[3px] w-8 rounded-full bg-white/80" />
          <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/85">Adicional opcional</span>
          <span className="mt-2 text-[16px] font-extrabold leading-snug">{bump.name}</span>
        </div>
      )}
    </div>
  );
}

interface BumpCardProps {
  bump: DigitalBump;
  selected: boolean;
  onToggle: (bump: DigitalBump) => void;
  inert: boolean;
  width: number | null;
  /** Celular (< 768px): capa pequena à esquerda e texto ao lado. */
  compact: boolean;
}

const BumpCard = React.memo(function BumpCard({ bump, selected, onToggle, inert, width, compact }: BumpCardProps) {
  const price = shortPrice(bump.priceCents);
  const inertProps = (inert ? { inert: "" } : {}) as React.HTMLAttributes<HTMLLIElement>;

  const priceRow = (
    <div className={cn("flex items-center gap-x-2 gap-y-1", compact ? "flex-wrap" : "min-h-[28px] justify-between")}>
      <p className="text-[14px] font-extrabold text-teal-800">+ {price}</p>
      {selected && (
        <span className="flex items-center gap-1 rounded-full bg-teal-600 px-2.5 py-1 text-[11px] font-extrabold text-white">
          <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" /> No pedido
        </span>
      )}
    </div>
  );

  return (
    <li
      {...inertProps}
      style={width !== null ? { width } : undefined}
      className={cn("shrink-0 list-none snap-start snap-always", width === null && "w-[75vw]")}
    >
      {/* O clique no card inteiro é só conveniência de ponteiro; o controle
          acessível por teclado/leitor de tela são os botões dentro dele. */}
      <div
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          onToggle(bump);
        }}
        className={cn(
          "relative flex h-full cursor-pointer flex-col rounded-3xl border-2 transition-colors duration-150",
          compact ? "gap-2 p-2" : "gap-3 p-3 sm:p-3.5",
          selected
            ? "border-teal-600 bg-emerald-50 shadow-[0_10px_28px_-14px_rgba(13,148,136,0.55)]"
            : "border-slate-200 bg-white shadow-[0_2px_4px_rgba(15,23,42,0.04),0_8px_20px_-14px_rgba(15,23,42,0.14)] [@media(hover:hover)]:hover:border-slate-300",
        )}
      >
        {compact ? (
          <>
            <div className="flex items-start gap-2.5">
              <BumpMockup bump={bump} compact />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <h4 className="line-clamp-3 break-words text-[14px] font-extrabold leading-snug text-slate-900">{bump.name}</h4>
                {priceRow}
              </div>
            </div>
            <p className="line-clamp-3 break-words px-0.5 text-[12.5px] leading-snug text-slate-600">{bump.description}</p>
          </>
        ) : (
          <>
            <BumpMockup bump={bump} compact={false} />
            <div className="flex flex-1 flex-col gap-1.5 px-0.5">
              <h4 className="text-[15px] font-extrabold leading-snug text-slate-900">{bump.name}</h4>
              <p className="min-h-[3.6rem] text-[13px] leading-snug text-slate-600">{bump.description}</p>
              {priceRow}
            </div>
          </>
        )}

        <button
          type="button"
          aria-pressed={selected}
          aria-label={selected ? `Remover do pedido: ${bump.name}` : `Adicionar ${bump.name} por ${price}`}
          onClick={() => onToggle(bump)}
          className={cn(
            "mt-auto flex min-h-[48px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border-2 px-2 text-[14px] font-extrabold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/40",
            selected
              ? "border-teal-700 bg-white text-teal-800 [@media(hover:hover)]:hover:border-rose-600 [@media(hover:hover)]:hover:bg-rose-50 [@media(hover:hover)]:hover:text-rose-700"
              : "border-transparent bg-teal-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_24px_-12px_rgba(13,148,136,0.6)] hover:bg-teal-700",
          )}
        >
          {selected ? (
            <>
              <X className="hidden h-4 w-4 shrink-0 min-[400px]:block" strokeWidth={3} aria-hidden="true" /> Remover do pedido
            </>
          ) : (
            `Adicionar +${price}`
          )}
        </button>
      </div>
    </li>
  );
});

export interface OrderBumpCarouselProps {
  bumps: readonly DigitalBump[];
  selectedBumps: ReadonlySet<string>;
  onToggle: (slug: string) => void;
}

export function OrderBumpCarousel({ bumps, selectedBumps, onToggle }: OrderBumpCarouselProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);

  const viewportRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLUListElement>(null);
  const rootRef = React.useRef<HTMLElement>(null);
  const animatingRef = React.useRef(false);
  const timers = React.useRef<number[]>([]);

  const [offset, setOffset] = React.useState(0);
  const [viewportWidth, setViewportWidth] = React.useState(0);
  const [hovered, setHovered] = React.useState(false);
  const [focusInCards, setFocusInCards] = React.useState(false);
  const [inView, setInView] = React.useState(false);
  const [autoplay, setAutoplay] = React.useState(true);
  const [announcement, setAnnouncement] = React.useState("");

  const count = bumps.length;
  const perView = viewportWidth >= 480 ? 2 : 1;
  const cardWidth = viewportWidth > 0 ? (viewportWidth - GAP_PX * (perView - 1)) / perView : null;
  const looping = isDesktop && cardWidth !== null && count > perView;
  const step = (cardWidth ?? 0) + GAP_PX;

  // Última versão do que os handlers estáveis precisam ler.
  const latest = React.useRef({ onToggle, selectedBumps, looping, step, count, reducedMotion });
  latest.current = { onToggle, selectedBumps, looping, step, count, reducedMotion };

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setViewportWidth(Math.floor(width));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => setInView(entries[0]?.isIntersecting ?? false), {
      threshold: 0.25,
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  // Fora do modo cíclico a ordem volta ao original (celular, redimensionamento).
  React.useEffect(() => {
    if (!looping) setOffset(0);
  }, [looping]);

  const displayed = React.useMemo(() => {
    if (!looping || count === 0) return bumps;
    const shift = ((offset % count) + count) % count;
    return [...bumps.slice(shift), ...bumps.slice(0, shift)];
  }, [bumps, count, looping, offset]);

  /** Reordena os MESMOS elementos preservando o foco, se houver. */
  const rotate = React.useCallback((direction: 1 | -1) => {
    const active = document.activeElement as HTMLElement | null;
    flushSync(() => setOffset((current) => current + direction));
    if (active && active !== document.activeElement && trackRef.current?.contains(active)) {
      active.focus({ preventScroll: true });
    }
  }, []);

  const go = React.useCallback(
    (direction: 1 | -1, auto = false) => {
      const { looping: canLoop, step: distance, reducedMotion: reduce } = latest.current;
      const track = trackRef.current;
      if (!canLoop || !track || animatingRef.current) return;
      if (auto && track.contains(document.activeElement)) return;

      if (reduce) {
        rotate(direction);
        return;
      }

      animatingRef.current = true;
      const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

      if (direction === 1) {
        track.style.transition = `transform ${STEP_MS}ms ease-in-out`;
        track.style.transform = `translateX(${-distance}px)`;
        later(() => {
          track.style.transition = "none";
          rotate(1);
          track.style.transform = "translateX(0)";
          animatingRef.current = false;
        }, STEP_MS);
      } else {
        track.style.transition = "none";
        rotate(-1);
        track.style.transform = `translateX(${-distance}px)`;
        void track.offsetWidth; // força o reflow antes de animar de volta
        track.style.transition = `transform ${STEP_MS}ms ease-in-out`;
        track.style.transform = "translateX(0)";
        later(() => {
          track.style.transition = "none";
          animatingRef.current = false;
        }, STEP_MS);
      }
    },
    [rotate],
  );

  const running = looping && autoplay && !reducedMotion && inView && !hovered && !focusInCards;
  React.useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => go(1, true), AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [running, go]);

  const handleToggle = React.useCallback((bump: DigitalBump) => {
    const { onToggle: toggle, selectedBumps: current } = latest.current;
    const wasSelected = current.has(bump.slug);
    toggle(bump.slug);
    setAutoplay(false);
    setAnnouncement(wasSelected ? `${bump.name} removido do pedido.` : `${bump.name} adicionado ao pedido.`);
  }, []);

  const manualGo = (direction: 1 | -1) => {
    setAutoplay(false);
    go(direction);
  };

  if (count === 0) return null;

  return (
    <section
      ref={rootRef}
      aria-roledescription="carrossel"
      aria-labelledby="order-bumps-title"
      className="flex flex-col gap-4 rounded-2xl border border-teal-100 bg-teal-50/80 p-3 sm:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 id="order-bumps-title" className="text-[16px] font-extrabold leading-snug text-slate-900">
            Complete seu material por apenas R$ 10 cada
          </h3>
          <p className="text-[13px] leading-relaxed text-slate-700">
            Escolha os materiais que vão ajudar você na rotina, nos estudos e nos concursos.
          </p>
        </div>
      </div>

      {looping && (
        <div className="flex items-center justify-end gap-2" role="group" aria-label="Controles do carrossel">
          {!reducedMotion && (
            <button
              type="button"
              onClick={() => setAutoplay((current) => !current)}
              aria-label={autoplay ? "Pausar movimento automático do carrossel" : "Retomar movimento automático do carrossel"}
              className={CONTROL_CLASS}
            >
              {autoplay ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
            </button>
          )}
          <button type="button" onClick={() => manualGo(-1)} aria-label="Produto anterior" className={CONTROL_CLASS}>
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => manualGo(1)} aria-label="Próximo produto" className={CONTROL_CLASS}>
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      )}

      <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <div
          ref={viewportRef}
          className={cn(
            "py-1",
            isDesktop
              ? "-mx-1 overflow-hidden px-1"
              : "-mx-3 overflow-x-auto overscroll-x-contain px-3 scroll-pl-3 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          )}
        >
          <ul
            ref={trackRef}
            aria-label="Materiais adicionais"
            onFocus={() => setFocusInCards(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusInCards(false);
            }}
            className={cn("flex", !isDesktop && "w-max pr-5", !looping && isDesktop && "justify-center")}
            style={{ gap: GAP_PX }}
          >
            {displayed.map((bump, index) => (
              <BumpCard
                key={bump.slug}
                bump={bump}
                selected={selectedBumps.has(bump.slug)}
                onToggle={handleToggle}
                inert={looping && index >= perView}
                width={isDesktop ? cardWidth : viewportWidth > 0 ? Math.floor(viewportWidth - 20) : null}
                compact={!isDesktop}
              />
            ))}
          </ul>
        </div>
      </div>

      {!isDesktop && count > 1 && (
        <p className="text-center text-[12px] font-semibold text-slate-500">Arraste para o lado para ver mais materiais</p>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
