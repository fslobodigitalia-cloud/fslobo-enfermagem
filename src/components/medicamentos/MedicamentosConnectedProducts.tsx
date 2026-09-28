import * as React from "react";
import { ChevronLeft, ChevronRight, Eye, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Seção "Adicionais conectados" da landing de Medicamentos na Prática
 * (/medicamentos-na-pratica). ARQUIVO NOVO E ISOLADO: mesmo padrão visual
 * de src/components/guia/ConnectedExtrasSection.tsx (capa + botão "Ver
 * páginas" abrindo modal, sem sair da página), mas com sua PRÓPRIA lista
 * de produtos e cópia — nunca importa nem altera o arquivo do Guia, então
 * a seção de adicionais da página de Evolução não é afetada por este
 * componente.
 *
 * Mostra só os 2 produtos pedidos (Anotação e Evolução + Mapas Mentais) —
 * de propósito, Medicamentos na Prática nunca aparece aqui (é o produto
 * principal desta própria página) e Balanço Hídrico não é incluído sem
 * autorização.
 */

interface PreviewPage {
  src: string;
  alt: string;
}

interface ConnectedProduct {
  slug: string;
  name: string;
  description: string;
  cover: PreviewPage;
  pages: PreviewPage[];
}

const CONNECTED_PRODUCTS: ConnectedProduct[] = [
  {
    slug: "guia-evolucao-enfermagem",
    name: "Anotação e Evolução de Enfermagem",
    description: "Manual ilustrado + modelos prontos de evolução e anotação de enfermagem para consultar no plantão.",
    cover: {
      src: "/guia-evolucao/capa-guia.webp",
      alt: "Capa do Guia de Anotação e Evolução de Enfermagem",
    },
    pages: [1, 2, 3, 4, 5].map((number) => ({
      src: `/guia-evolucao/modulo-${number}.webp`,
      alt: `Página ${number} de exemplo do Guia de Anotação e Evolução de Enfermagem`,
    })),
  },
  {
    slug: "concursos-enfermagem",
    name: "Mapas Mentais",
    description: "Revise os principais assuntos de enfermagem de forma visual, rápida e organizada.",
    cover: {
      src: "/concursos-enfermagem/capa-mapas-mentais.webp",
      alt: "Capa dos Mapas Mentais de Enfermagem",
    },
    pages: [1, 2, 3, 4, 5].map((number) => ({
      src: `/concursos-enfermagem/modulo-${number}.webp`,
      alt: `Página ${number} de exemplo dos Mapas Mentais`,
    })),
  },
];

function ProductPreviewDialog({
  product,
  open,
  onOpenChange,
}: {
  product: ConnectedProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pageIndex, setPageIndex] = React.useState(0);
  const touchStartX = React.useRef<number | null>(null);

  React.useEffect(() => {
    setPageIndex(0);
  }, [product?.slug]);

  if (!product) return null;

  const goToPage = (nextIndex: number) => {
    const total = product.pages.length;
    setPageIndex((nextIndex + total) % total);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToPage(pageIndex - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goToPage(pageIndex + 1);
    }
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null) return;
    const distance = event.changedTouches[0].clientX - startX;
    if (Math.abs(distance) < 45) return;
    goToPage(distance > 0 ? pageIndex - 1 : pageIndex + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[94svh] max-w-[960px] flex-col overflow-hidden rounded-[26px] border border-white/15 bg-slate-950 text-white shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3.5 sm:px-6">
          <div className="min-w-0">
            <DialogTitle className="truncate text-[15px] font-extrabold sm:text-[18px]">{product.name}</DialogTitle>
            <DialogDescription className="mt-1 text-[12.5px] text-slate-300">
              Arraste para o lado ou use as setas para ver algumas páginas.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Fechar visualização"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </DialogClose>
        </div>

        <div
          className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center bg-slate-900/80 p-3 sm:p-6"
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0].clientX;
          }}
          onTouchEnd={handleTouchEnd}
        >
          <img
            key={product.pages[pageIndex].src}
            src={product.pages[pageIndex].src}
            alt={product.pages[pageIndex].alt}
            className="max-h-[64svh] w-full rounded-xl object-contain"
          />

          <button
            type="button"
            aria-label="Página anterior"
            onClick={() => goToPage(pageIndex - 1)}
            className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/75 text-white shadow-lg backdrop-blur transition hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:left-6"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Próxima página"
            onClick={() => goToPage(pageIndex + 1)}
            className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/75 text-white shadow-lg backdrop-blur transition hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:right-6"
          >
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </button>

          <span
            aria-live="polite"
            className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/80 px-3 py-1 text-[12px] font-bold text-white backdrop-blur"
          >
            {pageIndex + 1} de {product.pages.length}
          </span>
        </div>

        <div className="flex gap-2 overflow-x-auto border-t border-white/10 bg-slate-950 p-3 sm:px-6">
          {product.pages.map((page, index) => (
            <button
              key={page.src}
              type="button"
              aria-label={`Ver página ${index + 1}`}
              aria-current={index === pageIndex ? "true" : undefined}
              onClick={() => setPageIndex(index)}
              className={cn(
                "h-14 w-11 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:h-16 sm:w-12",
                index === pageIndex ? "border-teal-400 opacity-100" : "border-transparent opacity-55 hover:opacity-90",
              )}
            >
              <img src={page.src} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MedicamentosConnectedProducts() {
  const [selectedProduct, setSelectedProduct] = React.useState<ConnectedProduct | null>(null);
  const scrollPosition = React.useRef(0);

  const openPreview = (product: ConnectedProduct) => {
    scrollPosition.current = window.scrollY;
    setSelectedProduct(product);
  };

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    setSelectedProduct(null);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollPosition.current, left: 0, behavior: "auto" });
    });
  };

  return (
    <section className="relative overflow-hidden bg-white px-3.5 py-16 sm:px-5 sm:py-24" aria-labelledby="medicamentos-connected-title">
      <div className="pointer-events-none absolute -left-32 top-0 h-72 w-72 rounded-full bg-teal-100/60 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-72 w-72 rounded-full bg-emerald-100/60 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto w-full max-w-[720px]">
        <div className="mx-auto max-w-[640px] text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Conteúdos extras
          </span>
          <h2 id="medicamentos-connected-title" className="mt-5 font-sans text-[1.85rem] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[2.4rem]">
            Complete seus estudos com conteúdos que se conectam.
          </h2>
          <p className="mx-auto mt-4 max-w-[58ch] text-[15px] leading-relaxed text-slate-600 sm:text-[16px]">
            Além dos cálculos, você pode reforçar o registro no plantão e a revisão para provas. Conheça os materiais disponíveis como adicionais no checkout.
          </p>
        </div>

        <div className="mt-9 grid grid-cols-2 gap-2.5 sm:mt-12 sm:gap-6">
          {CONNECTED_PRODUCTS.map((product) => (
            <button
              key={product.slug}
              type="button"
              onClick={() => openPreview(product)}
              aria-label={`Ver páginas de ${product.name}`}
              className="group flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white text-left shadow-[0_4px_8px_rgba(15,23,42,0.04),0_20px_40px_-22px_rgba(15,23,42,0.2)] transition duration-200 hover:-translate-y-1 hover:border-teal-300 hover:shadow-[0_8px_16px_rgba(15,23,42,0.06),0_28px_50px_-24px_rgba(13,148,136,0.32)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/20 sm:rounded-[28px]"
            >
              <span className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden bg-slate-50 p-1.5 sm:p-4">
                <img
                  src={product.cover.src}
                  alt={product.cover.alt}
                  className="h-full w-full rounded-[14px] object-contain transition duration-300 group-hover:scale-[1.02] sm:rounded-[18px]"
                  loading="lazy"
                />
                <span className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-950/85 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-lg backdrop-blur sm:bottom-5 sm:px-4 sm:py-2 sm:text-[12.5px]">
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Ver páginas
                </span>
              </span>

              <span className="flex flex-1 flex-col p-3 sm:p-6">
                <span className="text-[12.5px] font-extrabold leading-snug text-slate-900 sm:text-[18px]">{product.name}</span>
                <span className="mt-2 hidden text-[13.5px] leading-relaxed text-slate-600 sm:block">{product.description}</span>
                <span className="mt-3 text-[10.5px] font-bold text-teal-700 sm:mt-5 sm:text-[13px]">
                  Toque para ver algumas páginas
                </span>
                <span className="mt-2 inline-flex w-fit rounded-full bg-teal-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-700 sm:px-3 sm:text-[11px]">
                  Opcional · + R$ 10,00
                </span>
              </span>
            </button>
          ))}
        </div>

        <p className="mx-auto mt-6 max-w-[60ch] text-center text-[12.5px] leading-relaxed text-slate-500 sm:text-[13.5px]">
          Os materiais são opcionais. Você poderá escolher no checkout quais deseja receber junto com Medicamentos na Prática.
        </p>
      </div>

      <ProductPreviewDialog product={selectedProduct} open={selectedProduct !== null} onOpenChange={handleOpenChange} />
    </section>
  );
}
