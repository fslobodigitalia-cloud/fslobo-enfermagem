import { type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type ProductCoverTone = "navy" | "teal" | "slate" | "paper";

/** Nunca branco puro — mesmo "paper" carrega um tom fora do fundo da página. */
const TONE_CLASS: Record<ProductCoverTone, string> = {
  navy: "bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-white",
  teal: "bg-gradient-to-br from-teal-600 via-teal-700 to-teal-900 text-white",
  slate: "bg-gradient-to-br from-slate-500 via-slate-600 to-slate-800 text-white",
  paper: "bg-gradient-to-br from-slate-100 via-slate-100 to-slate-200 text-slate-900",
};

const ACCENT_CLASS: Record<ProductCoverTone, string> = {
  navy: "bg-teal-400/80",
  teal: "bg-white/70",
  slate: "bg-teal-300/80",
  paper: "bg-teal-600/70",
};

/** Luz diagonal — dá volume sem virar ilustração. */
const SHEEN: Record<ProductCoverTone, CSSProperties> = {
  navy: { backgroundImage: "radial-gradient(65% 55% at 22% 0%, rgba(45,212,191,0.20), transparent 70%)" },
  teal: { backgroundImage: "radial-gradient(65% 55% at 22% 0%, rgba(255,255,255,0.18), transparent 70%)" },
  slate: { backgroundImage: "radial-gradient(65% 55% at 22% 0%, rgba(255,255,255,0.14), transparent 70%)" },
  paper: { backgroundImage: "radial-gradient(65% 55% at 22% 0%, rgba(15,23,42,0.07), transparent 70%)" },
};

const TONE_ROTATION: ProductCoverTone[] = ["navy", "teal", "slate", "paper"];

/**
 * Atribui um tom discreto por categoria — variação visual, sem virar
 * arco-íris. A categoria agora vem como texto livre do catálogo real
 * (coluna `category` da RPC pública, ver src/lib/catalogQueries.ts), não
 * mais um slug fixo predefinido — por isso o tom é derivado por hash do
 * próprio texto: mesma categoria sempre cai no mesmo tom, sem precisar
 * manter uma lista hardcoded de categorias conhecidas.
 */
export function toneForCategory(category: string | null | undefined): ProductCoverTone {
  if (!category) return "navy";
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) | 0;
  }
  return TONE_ROTATION[Math.abs(hash) % TONE_ROTATION.length];
}

/**
 * Mockup editorial de capa (livro/PDF) — placeholder até existirem capas
 * reais dos produtos. Usado por ProductCard, PopularProducts, HomeHero e
 * ProductPage: um único lugar define a textura (lombada, borda de
 * "páginas", marca gráfica abstrata), evitando repetir ícone de documento
 * centralizado.
 *
 * A "textura de livro" (lombada + borda de páginas) vive num overlay
 * interno separado da sombra de ELEVAÇÃO do card (className/style, cada
 * chamador define a sua) — de propósito, para uma nunca apagar a outra:
 * as duas são a mesma propriedade CSS (box-shadow), e um `className` com
 * `shadow-[...]` passado por fora substituiria por completo qualquer
 * box-shadow definido no elemento raiz.
 */
export function ProductCover({
  tone = "navy",
  label,
  subtitle,
  eyebrow = "FSLobo Enfermagem",
  className,
  style,
}: {
  tone?: ProductCoverTone;
  /** Título curto, estilo lombada/capa de livro. Omitir para uma capa "em branco". */
  label?: string;
  /** Linha curta abaixo do título — omitida se não fizer sentido no contexto. */
  subtitle?: string;
  eyebrow?: string;
  /** Shadow de elevação do card fica aqui (ex.: "shadow-[...] hover:shadow-[...]"). */
  className?: string;
  /** Posição/rotação/sombra custom (ver HomeHero) — nunca sobrescreve a textura interna. */
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-xl border border-black/[0.08]", TONE_CLASS[tone], className)}
      style={{ ...SHEEN[tone], ...style }}
    >
      {/* Textura de livro: lombada (esquerda) + borda de páginas (direita) —
          overlay interno próprio, para nunca disputar box-shadow com a
          sombra de elevação do elemento raiz acima. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_-8px_0_0_-5px_rgba(15,23,42,0.10),inset_-13px_0_0_-10px_rgba(15,23,42,0.06),inset_5px_0_10px_-6px_rgba(0,0,0,0.35)]"
      />

      {/* Marca gráfica abstrata (não é ícone de documento): grade de pontos discreta no canto superior. */}
      <div
        aria-hidden="true"
        className="absolute right-4 top-4 h-14 w-14 opacity-[0.14]"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1.4px)",
          backgroundSize: "7px 7px",
        }}
      />

      <div className="relative flex h-full flex-col justify-end p-5">
        <span aria-hidden="true" className={cn("mb-3 h-[3px] w-8 rounded-full", ACCENT_CLASS[tone])} />

        {label && (
          <>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] opacity-70">{eyebrow}</span>
            <span className="mt-2 text-[15px] font-bold leading-snug">{label}</span>
            {subtitle && <span className="mt-1.5 text-[12px] leading-snug opacity-75">{subtitle}</span>}
          </>
        )}
      </div>
    </div>
  );
}
