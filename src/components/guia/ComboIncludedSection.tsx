import * as React from "react";
import { ChevronLeft, ChevronRight, Check, Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MEDICAMENTOS_COVER = {
  src: "/medicamentos-na-pratica/capa-medicamentos-na-pratica.webp",
  alt: "Capa do material Medicamentos na Prática",
};

const MEDICAMENTOS_PAGES = [1, 2, 3, 4].map((number) => ({
  src: `/medicamentos-na-pratica/modulo-${number}.webp`,
  alt: `Página ${number} de exemplo de Medicamentos na Prática`,
}));

/** Proporção real dos arquivos modulo-N.webp (1200 x 1600). */
const PAGE_RATIO = 1200 / 1600;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

const MEDICAMENTOS_POINTS = [
  "Medicamentos mais utilizados no dia a dia do plantão",
  "Vias de administração e principais cuidados de enfermagem",
  "3 PDFs de Medicamentos na Prática, já incluídos no combo",
];

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

/**
 * Visualização grande de uma página de prévia. No celular ocupa a tela
 * toda (100dvh). A página ampliada fica dentro de um contêiner rolável
 * (overflow:auto), com a imagem em tamanho real multiplicado pelo zoom —
 * assim NADA é cortado: dá para chegar a qualquer canto com o dedo
 * (rolagem nativa), com o mouse (arrastar) ou com a barra de rolagem.
 * Zoom por botões +/−/redefinir, pinça no toque e teclas +, −, 0.
 */
function PagePreviewViewer({
  open,
  startIndex,
  onOpenChange,
}: {
  open: boolean;
  startIndex: number;
  onOpenChange: (open: boolean) => void;
}) {
  const [index, setIndex] = React.useState(startIndex);
  const [zoom, setZoom] = React.useState(1);
  const [box, setBox] = React.useState({ width: 0, height: 0 });
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const centerRef = React.useRef({ x: 0.5, y: 0.5 });
  const dragRef = React.useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const pinchRef = React.useRef<{ distance: number; zoom: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const total = MEDICAMENTOS_PAGES.length;

  React.useEffect(() => {
    if (open) {
      setIndex(startIndex);
      setZoom(1);
    }
  }, [open, startIndex]);

  // Mede a área disponível para a página (callback ref, pois o conteúdo do
  // Dialog só monta depois de aberto).
  const attachScroller = React.useCallback((el: HTMLDivElement | null) => {
    scrollerRef.current = el;
    setNode(el);
  }, []);

  React.useEffect(() => {
    if (!node) return;
    const measure = () => setBox({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  // Tamanho "ajustado à tela" (zoom 1): a página inteira cabe sem cortar.
  const fitWidth = Math.max(0, Math.min(box.width, box.height * PAGE_RATIO));
  const imageWidth = fitWidth * zoom;

  // Mantém o ponto central visível estável ao mudar o zoom.
  React.useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { x, y } = centerRef.current;
    el.scrollLeft = x * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = y * el.scrollHeight - el.clientHeight / 2;
  }, [imageWidth]);

  const rememberCenter = () => {
    const el = scrollerRef.current;
    if (!el || el.scrollWidth === 0 || el.scrollHeight === 0) return;
    centerRef.current = {
      x: (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth,
      y: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight,
    };
  };

  const changeZoom = (next: number) => {
    rememberCenter();
    setZoom(clampZoom(next));
  };

  const resetZoom = () => {
    centerRef.current = { x: 0.5, y: 0.5 };
    setZoom(1);
  };

  const goTo = (next: number) => {
    centerRef.current = { x: 0.5, y: 0 };
    setZoom(1);
    setIndex((next + total) % total);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      changeZoom(zoom + ZOOM_STEP);
    } else if (event.key === "-") {
      event.preventDefault();
      changeZoom(zoom - ZOOM_STEP);
    } else if (event.key === "0") {
      event.preventDefault();
      resetZoom();
    }
  };

  // Arrastar com o mouse para mover a página ampliada (no toque a rolagem é nativa).
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || zoom <= 1) return;
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
    setDragging(true);
    el.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (!drag || !el) return;
    el.scrollLeft = drag.left - (event.clientX - drag.x);
    el.scrollTop = drag.top - (event.clientY - drag.y);
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  // Pinça com dois dedos.
  const touchDistance = (event: React.TouchEvent) => {
    const [a, b] = [event.touches[0], event.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };
  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      pinchRef.current = { distance: touchDistance(event), zoom };
    }
  };
  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length !== 2 || pinch.distance === 0) return;
    changeZoom(pinch.zoom * (touchDistance(event) / pinch.distance));
  };
  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) pinchRef.current = null;
  };

  const page = MEDICAMENTOS_PAGES[index];
  const controlClass =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 disabled:opacity-40 disabled:hover:bg-white/10";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none border-0 bg-slate-950 text-white sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:h-[94dvh] sm:max-h-[94dvh] sm:w-[calc(100vw-48px)] sm:max-w-[1040px] sm:rounded-[26px] sm:border sm:border-white/15"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2 sm:px-6">
          <div className="min-w-0">
            <DialogTitle className="truncate text-[14px] font-extrabold sm:text-[17px]">Medicamentos na Prática</DialogTitle>
            <DialogDescription aria-live="polite" className="truncate text-[12px] text-slate-300">
              Página {index + 1} de {total} · pinça ou +/− para ampliar
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button type="button" aria-label="Fechar visualização" className={controlClass}>
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </DialogClose>
        </div>

        {/* Área rolável: a imagem tem tamanho real (ajuste × zoom); margin:auto
            centraliza sem cortar o lado esquerdo/topo quando ela transborda. */}
        <div
          ref={attachScroller}
          data-testid="page-viewer-scroller"
          className={cn(
            "flex min-h-0 flex-1 overflow-auto bg-slate-900/80 [touch-action:pan-x_pan-y]",
            zoom > 1 && (dragging ? "cursor-grabbing" : "cursor-grab"),
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {fitWidth > 0 && (
            <img
              key={page.src}
              src={page.src}
              alt={page.alt}
              draggable={false}
              data-testid="page-viewer-image"
              style={{ width: imageWidth, height: imageWidth / PAGE_RATIO }}
              className="m-auto max-w-none shrink-0 select-none rounded-lg bg-white"
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-1.5 border-t border-white/10 bg-slate-950 px-3 py-2 sm:px-6">
          <div className="flex items-center gap-1.5">
            <button type="button" aria-label="Página anterior" onClick={() => goTo(index - 1)} className={controlClass}>
              <ChevronLeft className="h-6 w-6" aria-hidden="true" />
            </button>
            <button type="button" aria-label="Próxima página" onClick={() => goTo(index + 1)} className={controlClass}>
              <ChevronRight className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Diminuir zoom"
              onClick={() => changeZoom(zoom - ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              className={controlClass}
            >
              <Minus className="h-5 w-5" aria-hidden="true" />
            </button>
            <span aria-live="polite" data-testid="page-viewer-zoom" className="min-w-[44px] text-center text-[13px] font-bold">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              aria-label="Aumentar zoom"
              onClick={() => changeZoom(zoom + ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              className={controlClass}
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" aria-label="Redefinir zoom" onClick={resetZoom} disabled={zoom === MIN_ZOOM} className={controlClass}>
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Seção "Medicamentos na Prática" da oferta combo. Diferente de
 * ConnectedExtrasSection (adicionais opcionais, + R$ 10), aqui Medicamentos
 * é CONTEÚDO INCLUÍDO no combo — sem selo de "opcional", sem preço
 * separado, sem "grátis". Capa + as quatro páginas de prévia já existentes,
 * cada uma abrindo em visualização grande com zoom.
 */
export function ComboIncludedSection() {
  const [viewerIndex, setViewerIndex] = React.useState<number | null>(null);
  const lastIndex = React.useRef(0);
  const scrollPosition = React.useRef(0);

  const openViewer = (index: number) => {
    scrollPosition.current = window.scrollY;
    lastIndex.current = index;
    setViewerIndex(index);
  };

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    setViewerIndex(null);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollPosition.current, left: 0, behavior: "auto" });
    });
  };

  return (
    <section className="relative overflow-hidden bg-white px-3.5 py-16 sm:px-5 sm:py-24" aria-labelledby="combo-included-title">
      <div className="pointer-events-none absolute -left-32 top-0 h-72 w-72 rounded-full bg-teal-100/60 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-72 w-72 rounded-full bg-emerald-100/60 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto w-full max-w-[1000px]">
        <div className="mx-auto max-w-[720px] text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700">
            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> Incluído no combo
          </span>
          <h2 id="combo-included-title" className="mt-5 font-sans text-[1.85rem] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[2.4rem]">
            Junto com o Guia, você leva <span className="text-teal-600">Medicamentos na Prática</span>
          </h2>
          <p className="mx-auto mt-4 max-w-[60ch] text-[15px] leading-relaxed text-slate-600 sm:text-[16px]">
            Registrar bem e conhecer o medicamento caminham juntos. No combo, os dois materiais chegam no mesmo pedido, por um único valor.
          </p>
        </div>

        <div className="mt-10 grid items-start gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
          <div className="mx-auto flex aspect-[3/4] w-full max-w-[320px] items-center justify-center overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 p-3 shadow-[0_4px_8px_rgba(15,23,42,0.05),0_20px_40px_-20px_rgba(15,23,42,0.16)]">
            <img
              src={MEDICAMENTOS_COVER.src}
              alt={MEDICAMENTOS_COVER.alt}
              loading="lazy"
              className="h-full w-full rounded-[18px] object-contain"
            />
          </div>

          <div className="flex flex-col gap-6">
            <ul className="flex flex-col gap-3">
              {MEDICAMENTOS_POINTS.map((item) => (
                <li key={item} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-[14.5px] font-medium text-slate-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" strokeWidth={2.5} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>

            <div>
              <p className="mb-3 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                Algumas páginas do material · toque para ampliar
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {MEDICAMENTOS_PAGES.map((page, i) => (
                  <button
                    key={page.src}
                    type="button"
                    onClick={() => openViewer(i)}
                    aria-label={`Ampliar página ${i + 1} de Medicamentos na Prática`}
                    className={cn(
                      "group relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-1.5 transition",
                      "shadow-[0_2px_4px_rgba(15,23,42,0.04),0_8px_20px_-14px_rgba(15,23,42,0.12)]",
                      "hover:-translate-y-0.5 hover:border-teal-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/20",
                    )}
                  >
                    <img src={page.src} alt={page.alt} loading="lazy" className="h-full w-full rounded-xl object-contain" />
                    <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/80 text-white shadow-md" aria-hidden="true">
                      <Maximize2 className="h-4 w-4" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <PagePreviewViewer open={viewerIndex !== null} startIndex={viewerIndex ?? lastIndex.current} onOpenChange={handleOpenChange} />
    </section>
  );
}
