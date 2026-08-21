import { ProductCover, toneForCategory } from "@/components/catalog/ProductCover";
import { cn } from "@/lib/utils";

/**
 * Mockup 3D de produto — Etapa 2 (redesign da ProductPage). Transforma a
 * capa 4:3 do catálogo (cover_url) numa peça editorial com sensação de
 * guia/livro digital flutuando: perspectiva CSS + leve inclinação + lombada
 * lateral + sombra em camadas. Nenhuma imagem externa, nenhum corte da
 * capa original — a imagem inteira sempre aparece (object-contain dentro
 * do compartimento 4:3), só o CONTAINER ganha volume.
 *
 * Reaproveita ProductCover (já existente) como fallback quando cover_url
 * é null — mesmo tratamento 3D ao redor, para nunca haver dois estilos de
 * mockup diferentes dependendo de o produto ter capa ou não.
 */
export function ProductMockup({
  coverUrl,
  name,
  category,
  className,
}: {
  coverUrl: string | null;
  name: string;
  category?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-visible rounded-[36px] bg-gradient-to-b from-slate-50 to-white p-8 sm:p-12",
        className,
      )}
    >
      {/* Glow ambiente atrás do mockup — teal muito discreto, nunca chamativo. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-10 rounded-[40px] bg-teal-100/40 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-900/[0.03] blur-2xl"
      />

      {/* Container de perspectiva — o filho é quem recebe a rotação 3D. */}
      <div className="relative w-full max-w-[380px]" style={{ perspective: "1600px" }}>
        <div
          className={cn(
            // Base e hover como classes (não inline style): um `transform`
            // em `style` teria especificidade maior que QUALQUER classe,
            // inclusive `hover:`, e a rotação nunca mudaria ao passar o
            // mouse. Com as duas como classes, `:hover` naturalmente vence.
            "relative transition-transform duration-500 ease-out",
            "[transform:rotateY(-11deg)_rotateX(4deg)]",
            "hover:[transform:rotateY(-6deg)_rotateX(2deg)]",
          )}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Corpo do "livro": lombada + capa lado a lado, uma peça só. */}
          <div
            className={cn(
              "relative flex overflow-hidden rounded-[18px]",
              "shadow-[0_2px_4px_rgba(15,23,42,0.10),0_20px_36px_-12px_rgba(15,23,42,0.28),0_48px_80px_-32px_rgba(15,23,42,0.35)]",
            )}
          >
            {/* Lombada — dá a sensação de espessura/encadernação. */}
            <div
              aria-hidden="true"
              className="w-[11px] shrink-0 bg-gradient-to-b from-slate-700 via-slate-800 to-slate-950"
              style={{ boxShadow: "inset -2px 0 3px rgba(0,0,0,0.35)" }}
            />

            <div className="relative aspect-[4/3] w-full bg-white">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={name}
                  className="h-full w-full object-cover"
                  loading="eager"
                />
              ) : (
                <ProductCover
                  tone={toneForCategory(category)}
                  label={name}
                  subtitle={category ?? undefined}
                  className="h-full w-full rounded-none border-0"
                />
              )}

              {/* Sheen de vidro — luz diagonal muito sutil, dá volume sem esconder a capa. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black/[0.06] to-transparent"
              />
            </div>
          </div>

          {/* "Espessura" inferior — páginas empilhadas, sugere profundidade sem 3D exagerado. */}
          <div
            aria-hidden="true"
            className="absolute -bottom-[6px] left-[11px] right-[3px] h-[10px] rounded-b-[14px] bg-gradient-to-b from-slate-300 to-slate-400/70"
            style={{ transform: "translateZ(-8px)" }}
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-3 left-[13px] right-[6px] h-[8px] rounded-b-[12px] bg-slate-300/40 blur-[2px]"
          />
        </div>
      </div>
    </div>
  );
}
