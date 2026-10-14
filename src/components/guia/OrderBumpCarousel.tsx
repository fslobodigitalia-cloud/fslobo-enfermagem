import * as React from "react";
import { flushSync } from "react-dom";
import { Check, ChevronLeft, ChevronRight, MoveHorizontal, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents, type BundleOffer, type DigitalBump } from "@/config/digitalProducts";
import { getBundleDisplay, type BundleDisplay } from "@/lib/guiaKit";

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
 * Todos os cards são verticais e compactos (capa, nome, preço, descrição, botão).
 * Celular (< 768px): cards de largura fixa (~176px) com scroll horizontal nativo e
 * scroll-snap (um card por vez), sem animação automática e sem rolagem horizontal
 * da página; uma parte do próximo card fica visível.
 */

const STEP_MS = 450;
const AUTOPLAY_MS = 4500;
const GAP_PX = 16;
/** Largura do card no celular e alturas da capa (proporção ~0,71 preservada). */
const MOBILE_CARD_PX = 176;
const MIN_CARD_PX = 170;
const MAX_PER_VIEW = 3;
const COVER_H_COMPACT = 112;
const COVER_H_DESKTOP = 132;
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
 * Capa real do produto (arquivo local em public/). Se a imagem falhar, cai numa
 * capa teal com o nome do produto — nunca aparece ícone de imagem quebrada. A
 * caixa da capa tem tamanho fixo (proporção ~0,71 das capas): trocar de imagem
 * para fallback não gera layout shift, e a capa sempre aparece inteira
 * (object-contain, sem cortar nem esticar).
 */
function BumpMockup({ bump, compact }: { bump: DigitalBump; compact: boolean }) {
  const [failed, setFailed] = React.useState(false);
  const src = failed ? undefined : bump.image;
  const height = compact ? COVER_H_COMPACT : COVER_H_DESKTOP;
  const width = Math.round(height * 0.708);

  return (
    <div className="flex items-center justify-center rounded-2xl bg-gradient-to-b from-slate-50 to-teal-50/60 py-2">
      <div className="relative shrink-0" style={{ height, width }}>
        {src ? (
          <img
            src={src}
            alt={`Capa de ${bump.name}`}
            width={width}
            height={height}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailed(true)}
            className="h-full w-full select-none object-contain drop-shadow-[0_6px_8px_rgba(15,23,42,0.28)]"
          />
        ) : (
          <div
            role="img"
            aria-label={`Capa de ${bump.name}`}
            className="flex h-full w-full items-end overflow-hidden rounded-md bg-gradient-to-br from-teal-700 via-teal-800 to-teal-950 px-1 py-1.5 text-white shadow-[0_6px_8px_-2px_rgba(15,23,42,0.3),inset_3px_0_6px_-4px_rgba(0,0,0,0.45)]"
          >
            <span className="line-clamp-5 break-words text-[10px] font-extrabold leading-tight tracking-tight">{bump.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface BumpCardProps {
  bump: DigitalBump;
  selected: boolean;
  /** Incluído por um kit ativo: aparece selecionado, mas sem ação individual. */
  included: boolean;
  onToggle: (bump: DigitalBump) => void;
  inert: boolean;
  width: number | null;
  /** Celular (< 768px): capa um pouco menor, card de largura fixa. */
  compact: boolean;
}

const BumpCard = React.memo(function BumpCard({ bump, selected, included, onToggle, inert, width, compact }: BumpCardProps) {
  const price = shortPrice(bump.priceCents);
  const inertProps = (inert ? { inert: "" } : {}) as React.HTMLAttributes<HTMLLIElement>;

  return (
    <li
      {...inertProps}
      style={width !== null ? { width } : undefined}
      className={cn("shrink-0 list-none snap-start snap-always", width === null && "w-[176px]")}
    >
      {/* O clique no card inteiro é só conveniência de ponteiro; o controle
          acessível por teclado/leitor de tela é o botão dentro dele. */}
      <div
        onClick={(event) => {
          if (included || (event.target as HTMLElement).closest("button")) return;
          onToggle(bump);
        }}
        className={cn(
          "relative flex h-full flex-col gap-2 rounded-3xl border-2 p-2 transition-colors duration-150",
          included ? "cursor-default" : "cursor-pointer",
          selected || included
            ? "border-teal-600 bg-emerald-50 shadow-[0_10px_28px_-14px_rgba(13,148,136,0.55)]"
            : "border-slate-200 bg-white shadow-[0_2px_4px_rgba(15,23,42,0.04),0_8px_20px_-14px_rgba(15,23,42,0.14)] [@media(hover:hover)]:hover:border-slate-300",
        )}
      >
        <BumpMockup bump={bump} compact={compact} />

        <div className="flex flex-1 flex-col gap-1 px-0.5">
          <h4 className="line-clamp-3 break-words text-[14px] font-extrabold leading-snug text-slate-900">{bump.name}</h4>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className={cn("text-[14px] font-extrabold", included ? "text-slate-500 line-through" : "text-teal-800")}>+ {price}</p>
            {(selected || included) && (
              <span className="flex items-center gap-1 rounded-full bg-teal-600 px-2 py-0.5 text-[11px] font-extrabold text-white">
                <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" /> {included ? "Incluído no pacote" : "No pedido"}
              </span>
            )}
          </div>
          <p title={bump.description} className="line-clamp-2 break-words text-[12.5px] leading-snug text-slate-600">
            {bump.description}
          </p>
        </div>

        {included ? (
          /* Estado desabilitado do kit: NÃO é botão nem recebe foco. */
          <div className="mt-auto flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50 px-1 text-[14px] font-extrabold text-teal-800">
            <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> Incluído
            <span className="sr-only"> no pacote completo: {bump.name}</span>
          </div>
        ) : (
          <button
            type="button"
            aria-pressed={selected}
            aria-label={selected ? `Remover do pedido: ${bump.name}` : `Adicionar ${bump.name} por ${price}`}
            onClick={() => onToggle(bump)}
            className={cn(
              "mt-auto flex min-h-[48px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border-2 px-1 text-[14px] font-extrabold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/40",
              selected
                ? "border-teal-700 bg-white text-teal-800 [@media(hover:hover)]:hover:border-rose-600 [@media(hover:hover)]:hover:bg-rose-50 [@media(hover:hover)]:hover:text-rose-700"
                : "border-transparent bg-teal-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_24px_-12px_rgba(13,148,136,0.6)] hover:bg-teal-700",
            )}
          >
            {selected ? (
              "Remover do pedido"
            ) : (
              `Adicionar +${price}`
            )}
          </button>
        )}
      </div>
    </li>
  );
});

function KitOfferBlock({
  display,
  active,
  onToggle,
  copy,
}: {
  display: BundleDisplay;
  active: boolean;
  onToggle: () => void;
  copy: OrderBumpCopy;
}) {
  const total = formatCents(display.totalCents);
  return (
    <div
      role="group"
      aria-labelledby="kit-offer-title"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border-2 p-3.5 transition-colors duration-150 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        active
          ? "border-teal-600 bg-emerald-50 shadow-[0_10px_28px_-14px_rgba(13,148,136,0.55)]"
          : "border-teal-400 bg-gradient-to-br from-white via-teal-50 to-emerald-50 shadow-[0_8px_22px_-14px_rgba(13,148,136,0.5)]",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="w-fit rounded-full bg-teal-700 px-2.5 py-1 text-[11.5px] font-extrabold text-white">
          Economize {formatCents(display.savingsCents)}
        </span>
        <h4 id="kit-offer-title" className="text-[16px] font-extrabold leading-snug text-slate-900">
          {copy.kitTitle}
        </h4>
        <p className="text-[13px] font-semibold leading-snug text-slate-700">{copy.kitDescription}</p>
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-slate-600">
          <span className="text-[13.5px] font-semibold">
            De <s className="decoration-slate-500">{shortPrice(display.normalCents)}</s> por
          </span>
          <strong className="text-[26px] font-extrabold leading-none text-teal-700">{total}</strong>
          <span className="text-[13.5px] font-semibold">no total</span>
        </p>
        <p className="text-[12.5px] leading-snug text-slate-600">{copy.kitFooter}</p>
        {active && (
          <p id="kit-offer-guidance" className="text-[12.5px] font-bold leading-snug text-teal-800">
            Remova o pacote completo para escolher os materiais separadamente.
          </p>
        )}
      </div>
      <div className="flex w-full shrink-0 flex-col gap-2 sm:w-[230px]">
        {active && (
          <div className="flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-teal-600 bg-teal-50 px-2 text-center text-[14px] font-extrabold leading-tight text-teal-800">
            <Check className="h-4 w-4 shrink-0" strokeWidth={3} aria-hidden="true" /> Pacote completo adicionado
          </div>
        )}
        {/* Mesmo botão nos dois estados (o foco do teclado não se perde ao adicionar). */}
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex min-h-[48px] w-full items-center justify-center rounded-2xl border-2 px-3 py-2 text-center text-[14.5px] font-extrabold leading-tight transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/40",
            active
              ? "border-teal-700 bg-white text-teal-800 [@media(hover:hover)]:hover:border-rose-600 [@media(hover:hover)]:hover:bg-rose-50 [@media(hover:hover)]:hover:text-rose-700"
              : "border-transparent bg-teal-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_24px_-12px_rgba(13,148,136,0.6)] hover:bg-teal-700",
          )}
        >
          {active ? copy.removeKitLabel : `${copy.ctaLabel} ${total}`}
        </button>
      </div>
    </div>
  );
}

/**
 * Textos configuráveis do carrossel. Os padrões são os da página do Guia de
 * Evolução (R$ 10, 6 materiais + Guia principal = pacote de 7); outras páginas
 * sobrescrevem só o que precisam. Nenhum valor monetário é escrito aqui: preços
 * e economia são sempre derivados de basePriceCents e do BundleOffer.
 */
export interface OrderBumpCopy {
  title: string;
  introduction: string;
  kitTitle: string;
  /** Complemento logo abaixo do título do pacote. */
  kitDescription: string;
  kitFooter: string;
  /** Prefixo do botão; o total (derivado) é anexado ao final. Ex.: "Quero os 7 materiais por". */
  ctaLabel: string;
  removeKitLabel: string;
  mobileHeadline: string;
  mobileHint: string;
}

export const DEFAULT_ORDER_BUMP_COPY: OrderBumpCopy = {
  title: "Complete seu material por apenas R$ 10 cada",
  introduction: "Escolha os materiais que vão ajudar você na rotina, nos estudos e nos concursos.",
  kitTitle: "Leve o pacote completo com 7 materiais",
  kitDescription: "Seu Guia principal + todos os 6 materiais desta seção.",
  kitFooter: "Tenha tudo em um único pedido e prepare-se do plantão aos concursos.",
  ctaLabel: "Quero os 7 materiais por",
  removeKitLabel: "Remover pacote completo",
  mobileHeadline: "Quem cuida bem também se prepara bem.",
  mobileHint: "Deslize e veja todos antes de finalizar — o próximo guia pode ser o apoio que faltava no seu plantão. →",
};

export interface OrderBumpCarouselProps {
  bumps: readonly DigitalBump[];
  selectedBumps: ReadonlySet<string>;
  onToggle: (slug: string) => void;
  /** Oferta de kit (opcional). O kit está ativo quando selectedBumps contém kit.slug. */
  kit?: BundleOffer;
  onToggleKit?: () => void;
  /** Preço do produto principal (centavos) — base dos valores exibidos na promoção do pacote. */
  basePriceCents?: number;
  /** Sobrescreve parte dos textos (o restante usa DEFAULT_ORDER_BUMP_COPY). */
  copy?: Partial<OrderBumpCopy>;
}

export function OrderBumpCarousel({ bumps, selectedBumps, onToggle, kit, onToggleKit, basePriceCents, copy: copyOverrides }: OrderBumpCarouselProps) {
  const copy = React.useMemo<OrderBumpCopy>(() => ({ ...DEFAULT_ORDER_BUMP_COPY, ...copyOverrides }), [copyOverrides]);
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
  const perView = Math.max(1, Math.min(MAX_PER_VIEW, Math.floor((viewportWidth + GAP_PX) / (MIN_CARD_PX + GAP_PX))));
  const cardWidth = viewportWidth > 0 ? (viewportWidth - GAP_PX * (perView - 1)) / perView : null;
  const looping = isDesktop && cardWidth !== null && count > perView;
  const step = (cardWidth ?? 0) + GAP_PX;

  // Última versão do que os handlers estáveis precisam ler.
  const latest = React.useRef({ onToggle, onToggleKit, kit, selectedBumps, looping, step, count, reducedMotion });
  latest.current = { onToggle, onToggleKit, kit, selectedBumps, looping, step, count, reducedMotion };
  const kitActive = kit ? selectedBumps.has(kit.slug) : false;
  const bundleDisplay = kit && basePriceCents !== undefined ? getBundleDisplay(basePriceCents, kit) : null;

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
    const { onToggle: toggle, kit: offer, selectedBumps: current } = latest.current;
    if (offer && current.has(offer.slug)) return; // com o kit ativo, os cards individuais não respondem
    const wasSelected = current.has(bump.slug);
    toggle(bump.slug);
    setAutoplay(false);
    setAnnouncement(wasSelected ? `${bump.name} removido do pedido.` : `${bump.name} adicionado ao pedido.`);
  }, []);

  const handleToggleKit = React.useCallback(() => {
    const { onToggleKit: toggleKit, kit: offer, selectedBumps: current } = latest.current;
    if (!toggleKit || !offer) return;
    const wasActive = current.has(offer.slug);
    const replacedIndividuals = !wasActive && current.size > 0;
    toggleKit();
    setAutoplay(false);
    setAnnouncement(
      wasActive
        ? "Pacote completo removido do pedido."
        : replacedIndividuals
          ? "Pacote completo adicionado. Ele substituiu as escolhas individuais."
          : "Pacote completo adicionado ao pedido.",
    );
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
            {copy.title}
          </h3>
          <p className="text-[13px] leading-relaxed text-slate-700">{copy.introduction}</p>
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
            aria-describedby={kitActive ? "kit-offer-guidance" : undefined}
            onFocus={() => setFocusInCards(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusInCards(false);
            }}
            className={cn("flex", !isDesktop && "w-max", !looping && isDesktop && "justify-center")}
            style={{ gap: GAP_PX, paddingRight: !isDesktop ? Math.max(0, viewportWidth - MOBILE_CARD_PX) : undefined }}
          >
            {displayed.map((bump, index) => (
              <BumpCard
                key={bump.slug}
                bump={bump}
                selected={selectedBumps.has(bump.slug)}
                included={kitActive && Boolean(kit?.memberSlugs.includes(bump.slug))}
                onToggle={handleToggle}
                inert={looping && index >= perView}
                width={isDesktop ? cardWidth : MOBILE_CARD_PX}
                compact={!isDesktop}
              />
            ))}
          </ul>
        </div>
      </div>

      {!isDesktop && count > 1 && (
        <div className="flex flex-col items-center gap-1 px-1 text-center">
          <p className="flex items-center justify-center gap-1.5 text-[13.5px] font-bold leading-snug text-teal-700">
            <MoveHorizontal className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />
            {copy.mobileHeadline}
          </p>
          <p className="text-[12px] leading-snug text-slate-600">{copy.mobileHint}</p>
        </div>
      )}

      {/* Oferta do kit: depois dos cards (e, no celular, depois da mensagem de deslizar). */}
      {kit && onToggleKit && bundleDisplay && (
        <div className="mt-2">
          <KitOfferBlock display={bundleDisplay} active={kitActive} onToggle={handleToggleKit} copy={copy} />
        </div>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
