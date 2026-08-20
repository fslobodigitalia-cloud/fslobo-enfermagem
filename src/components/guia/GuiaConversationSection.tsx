import type { CSSProperties } from "react";
import { Check, Star } from "lucide-react";

/**
 * Prova social do Guia de Evolução de Enfermagem — as 4 conversas, logo
 * depois de "O que você vai ter em mãos" (ModulesSection).
 *
 * Regras desta seção, para qualquer ajuste futuro:
 *   - o TAMANHO e a PROPORÇÃO das 4 imagens nunca mudam: aspect-[9/16]
 *     dentro do grid de 4 colunas no desktop, min-w-[78%] no scroll
 *     horizontal do mobile. Todo o refino visual acontece na MOLDURA
 *     (borda, sombra, apoio no chão) e no FUNDO da seção — nunca no <img>,
 *     que segue com as mesmas classes/width/height de antes;
 *   - nenhuma métrica é afirmada aqui (número de clientes, nota média,
 *     resultado prometido). As estrelas do selo são identificação visual
 *     da seção, não uma avaliação agregada apresentada como dado.
 *
 * Não toca em checkout, pagamento, Pixel/CAPI, Supabase nem em nenhuma
 * outra seção da página.
 */

const conversationCards = [
  {
    src: "/guia-evolucao/conversas/conversa-1.webp",
    alt: "Conversa sobre o Guia de Evolucao de Enfermagem",
  },
  {
    src: "/guia-evolucao/conversas/conversa-2.webp",
    alt: "Conversa sobre os modelos de enfermagem",
  },
  {
    src: "/guia-evolucao/conversas/conversa-3.webp",
    alt: "Conversa sobre o material de enfermagem",
  },
  {
    src: "/guia-evolucao/conversas/conversa-4.webp",
    alt: "Conversa sobre o Guia de Evolucao",
  },
];

/** Linha de confiança acima dos cards — discreta de propósito: nunca deve
 *  competir com as imagens, que são a prova de verdade da seção. */
const TRUST_ITEMS = ["Acesso imediato", "Material digital", "Consulta pelo celular"];

/** Mesma textura de pontos já usada em outras seções da landing (mesma cor
 *  teal, mesma opacidade) — dá profundidade sem virar padrão chamativo. */
const TEXTURE_DOTS: CSSProperties = {
  backgroundImage: "radial-gradient(rgba(13,148,136,0.07) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

export function GuiaConversationSection() {
  return (
    // Mesma família de verde/teal claro de antes (#EAF7F4 continua sendo o
    // tom do meio), agora como gradiente vertical curto em vez de chapado.
    <section className="relative overflow-hidden bg-gradient-to-b from-[#F2FBF8] via-[#EAF7F4] to-[#E3F3EF] py-14 sm:py-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={TEXTURE_DOTS} />

      {/* Fio de luz no topo — separa da seção branca anterior sem borda dura. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/80" />

      {/* Glow lateral: sutil, só para a seção não ter cantos "mortos". */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-28 top-0 h-72 w-72 rounded-full bg-teal-300/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-28 bottom-0 h-80 w-80 rounded-full bg-emerald-300/20 blur-3xl"
      />

      <div className="relative mx-auto max-w-[1240px] px-5 sm:px-7">
        <div className="mx-auto max-w-[680px] text-center">
          {/* Selo compacto: estrelas + rótulo na MESMA linha, para não
              empurrar o título para baixo (a seção precisa ser densa). */}
          <span className="inline-flex items-center gap-2.5 rounded-full border border-teal-200 bg-white/90 px-4 py-1.5 shadow-[0_2px_4px_rgba(15,23,42,0.04),0_8px_20px_-14px_rgba(15,23,42,0.12)] backdrop-blur-sm">
            <span className="flex items-center gap-0.5" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((star) => (
                <Star key={star} className="h-3 w-3 fill-amber-400 text-amber-400" />
              ))}
            </span>
            <span aria-hidden="true" className="h-3 w-px bg-teal-200" />
            <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-teal-700">
              Prova social
            </span>
          </span>

          <h2 className="mt-4 font-sans text-[1.9rem] font-extrabold leading-[1.12] tracking-tight text-slate-900 sm:text-[2.35rem] lg:text-[2.5rem]">
            Veja o que est&atilde;o falando <span className="text-teal-600">sobre o material</span>
          </h2>

          <p className="mx-auto mt-3 max-w-[52ch] text-[15px] leading-relaxed text-slate-600">
            Feedbacks sobre a experi&ecirc;ncia com o Guia de Evolu&ccedil;&atilde;o de Enfermagem.
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

        {/* Mobile: scroll horizontal com snap-START — o próximo card fica
            sempre parcialmente visível (78% de largura por card), sinalizando
            que há mais conteúdo sem precisar de setas nem indicadores.
            Desktop (lg): os 4 lado a lado, exatamente como antes. */}
        <div
          className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [&::-webkit-scrollbar]:hidden sm:mt-9 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:pb-0 lg:grid-cols-4"
          style={{ scrollbarWidth: "none" }}
        >
          {conversationCards.map((card) => (
            <div key={card.src} className="group relative min-w-[78%] snap-start sm:min-w-0">
              {/* Sombra de apoio "no chão", atrás da moldura — é o que dá a
                  sensação de peso/profundidade sem escurecer a imagem. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-4 -bottom-1 h-8 rounded-full bg-teal-950/10 blur-xl transition-opacity duration-300 sm:group-hover:opacity-70"
              />

              <div className="relative overflow-hidden rounded-[28px] border border-white bg-white p-2.5 shadow-[0_2px_6px_rgba(15,23,42,0.05),0_18px_40px_-22px_rgba(13,148,136,0.45)] transition-[transform,box-shadow] duration-300 sm:group-hover:-translate-y-1.5 sm:group-hover:shadow-[0_6px_14px_rgba(15,23,42,0.06),0_30px_58px_-24px_rgba(13,148,136,0.55)]">
                <div className="aspect-[9/16] overflow-hidden rounded-[21px] bg-slate-100 ring-1 ring-slate-900/5">
                  <img
                    src={card.src}
                    alt={card.alt}
                    loading="lazy"
                    width={900}
                    height={1600}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
