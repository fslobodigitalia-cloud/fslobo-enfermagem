import * as React from "react";
import type { CSSProperties } from "react";
import { Check, MessageCircleHeart, Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Prova social do Mapas Mentais Ilustrados — landing dedicada em
 * /produto/concursos-enfermagem (MapasMentaisPage.tsx). Estrutura irmã de
 * src/components/guia/GuiaConversationSection.tsx (mesmas proporções,
 * mesmo tratamento visual), mas ARQUIVO INDEPENDENTE — não importa nem
 * altera o componente do Guia, para que a landing de Evolução continue
 * intacta.
 *
 * Regras desta seção, herdadas do componente irmão:
 *   - TAMANHO e PROPORÇÃO das imagens não mudam: aspect-[9/16] no grid de
 *     4 colunas do desktop, min-w-[78%] no scroll horizontal do mobile;
 *   - nenhuma métrica é afirmada (número de compradores, nota média,
 *     depoimento inventado) — as estrelas do selo são identificação
 *     visual da seção, não uma avaliação agregada apresentada como dado;
 *   - fallback elegante quando a imagem real ainda não foi colocada em
 *     public/concursos-enfermagem/conversas/ (arquivo por arquivo, ver
 *     docs/MIDIAS_CONCURSOS_ENFERMAGEM.md): nunca um ícone de imagem
 *     quebrada, sempre um painel com a MESMA proporção final.
 *
 * Não toca em checkout, pagamento, Pixel/CAPI, Supabase nem em nenhuma
 * outra seção da página.
 */

/**
 * 3 prints reais, conversa-1.webp … conversa-3.webp — convertidas via sharp
 * a partir dos PNGs originais (mantidos intactos, ver
 * docs/MIDIAS_CONCURSOS_ENFERMAGEM.md), quality 88. width/height são as
 * dimensões REAIS de cada arquivo (levemente diferentes entre si — nunca
 * idênticas por coincidência), usadas só como hint de proporção para o
 * navegador (evita layout shift); a exibição em si é sempre
 * object-contain dentro do card aspect-[9/16] (ver ConversationImage),
 * então uma pequena diferença entre a proporção real e 9:16 nunca corta a
 * mensagem — só ganha uma margem discreta nas bordas. Ajuste esta lista
 * se mais conversas forem adicionadas depois em
 * public/concursos-enfermagem/conversas/.
 */
const conversationCards = [
  { src: "/concursos-enfermagem/conversas/conversa-1.webp", alt: "Conversa sobre os Mapas Mentais Ilustrados de enfermagem", width: 910, height: 1729 },
  { src: "/concursos-enfermagem/conversas/conversa-2.webp", alt: "Conversa sobre a revisão para concursos de enfermagem", width: 921, height: 1707 },
  { src: "/concursos-enfermagem/conversas/conversa-3.webp", alt: "Conversa sobre o material de revisão de enfermagem", width: 922, height: 1706 },
];

const TRUST_ITEMS = ["Acesso imediato", "Material digital", "Consulta pelo celular"];

const TEXTURE_DOTS: CSSProperties = {
  backgroundImage: "radial-gradient(rgba(13,148,136,0.07) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

/**
 * Painel de fallback — mesma moldura/proporção (aspect-[9/16]) do card
 * final, gradiente teal/navy, ícone e texto discreto. Nunca um ícone de
 * imagem quebrada do navegador.
 */
function ConversationFallback() {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#0a1622] via-[#0d2131] to-teal-900 text-center"
      role="img"
      aria-label="Prévia do material — imagem ainda não disponível"
    >
      <MessageCircleHeart className="h-7 w-7 text-teal-300/70" strokeWidth={1.6} aria-hidden="true" />
      <span className="px-4 text-[11px] font-semibold uppercase tracking-wide text-teal-200/60">Prévia do material</span>
    </div>
  );
}

/**
 * object-contain (nunca object-cover): a mensagem do print precisa
 * aparecer INTEIRA e legível — um recorte (object-cover) cortaria texto
 * nas bordas sempre que a proporção real da imagem não bater exatamente
 * com o aspect-[9/16] do card. O fundo discreto do container-pai
 * (bg-slate-100, ver aspect-[9/16] logo abaixo) preenche a margem que
 * sobra sem chamar atenção.
 */
function ConversationImage({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) {
  const [errored, setErrored] = React.useState(false);
  if (errored) return <ConversationFallback />;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      width={width}
      height={height}
      className="h-full w-full object-contain"
      onError={() => setErrored(true)}
    />
  );
}

export function MapasMentaisConversationSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#F2FBF8] via-[#EAF7F4] to-[#E3F3EF] py-14 sm:py-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={TEXTURE_DOTS} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/80" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-28 top-0 h-72 w-72 rounded-full bg-teal-300/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-28 bottom-0 h-80 w-80 rounded-full bg-emerald-300/20 blur-3xl" />

      <div className="relative mx-auto max-w-[1240px] px-5 sm:px-7">
        <div className="mx-auto max-w-[680px] text-center">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-teal-200 bg-white/90 px-4 py-1.5 shadow-[0_2px_4px_rgba(15,23,42,0.04),0_8px_20px_-14px_rgba(15,23,42,0.12)] backdrop-blur-sm">
            <span className="flex items-center gap-0.5" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((star) => (
                <Star key={star} className="h-3 w-3 fill-amber-400 text-amber-400" />
              ))}
            </span>
          </span>

          <h2 className="mt-4 font-sans text-[1.9rem] font-extrabold leading-[1.12] tracking-tight text-slate-900 sm:text-[2.35rem] lg:text-[2.5rem]">
            Veja o que est&atilde;o falando <span className="text-teal-600">sobre o material</span>
          </h2>

          <p className="mx-auto mt-3 max-w-[52ch] text-[15px] leading-relaxed text-slate-600">
            Feedbacks sobre a experi&ecirc;ncia com os Mapas Mentais Ilustrados de Enfermagem.
          </p>
        </div>

        <ul className="mx-auto mt-6 flex max-w-[720px] flex-wrap items-center justify-center gap-2">
          {TRUST_ITEMS.map((item) => (
            <li
              key={item}
              className="inline-flex items-center gap-1.5 rounded-full border border-white bg-white/70 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-sm"
            >
              <Check className="h-3.5 w-3.5 text-teal-600" strokeWidth={2.5} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>

        <div
          className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [&::-webkit-scrollbar]:hidden sm:mt-9 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:pb-0 lg:grid-cols-3"
          style={{ scrollbarWidth: "none" }}
        >
          {conversationCards.map((card) => (
            <div key={card.src} className="group relative min-w-[78%] snap-start sm:min-w-0">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-4 -bottom-1 h-8 rounded-full bg-teal-950/10 blur-xl transition-opacity duration-300 sm:group-hover:opacity-70"
              />
              <div
                className={cn(
                  "relative overflow-hidden rounded-[28px] border border-white bg-white p-2.5 shadow-[0_2px_6px_rgba(15,23,42,0.05),0_18px_40px_-22px_rgba(13,148,136,0.45)] transition-[transform,box-shadow] duration-300",
                  "sm:group-hover:-translate-y-1.5 sm:group-hover:shadow-[0_6px_14px_rgba(15,23,42,0.06),0_30px_58px_-24px_rgba(13,148,136,0.55)]",
                )}
              >
                <div className="aspect-[9/16] overflow-hidden rounded-[21px] bg-slate-100 ring-1 ring-slate-900/5">
                  <ConversationImage src={card.src} alt={card.alt} width={card.width} height={card.height} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
