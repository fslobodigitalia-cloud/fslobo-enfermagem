import type { CSSProperties } from "react";
import { Check, Star } from "lucide-react";

/**
 * Prova social do Balanço Hídrico Ilustrado — as 3 conversas, logo depois
 * de "O que você vai ter em mãos" (ModulesSection), em BalancoHidricoPage.
 * Estrutura ANÁLOGA a src/components/guia/GuiaConversationSection.tsx e a
 * src/components/mapasMentais/MapasMentaisConversationSection.tsx (não
 * importadas, não alteradas — arquivo independente, mesma disciplina).
 *
 * Regras desta seção:
 *   - só as 3 imagens reais fornecidas (conversa-1.webp a conversa-3.webp,
 *     em public/balanco-hidrico/conversas/) — nunca dados pessoais dos
 *     prints são transcritos para o HTML; os textos alternativos são
 *     genéricos ("Depoimento sobre o Balanço Hídrico N"), nunca citam
 *     nome, telefone ou conteúdo específico da conversa;
 *   - nenhuma métrica é afirmada aqui (número de clientes, nota média,
 *     resultado prometido). As estrelas do selo são identificação visual
 *     da seção, não uma avaliação agregada apresentada como dado;
 *   - loading="lazy" + decoding="async" em todas as imagens (nunca a
 *     capa/hero, que não aparece aqui).
 *
 * Não toca em checkout, pagamento, Pixel/CAPI, Supabase nem em nenhuma
 * outra seção da página.
 */

const conversationCards = [
  {
    src: "/balanco-hidrico/conversas/conversa-1.webp",
    alt: "Depoimento sobre o Balanço Hídrico Ilustrado 1",
  },
  {
    src: "/balanco-hidrico/conversas/conversa-2.webp",
    alt: "Depoimento sobre o Balanço Hídrico Ilustrado 2",
  },
  {
    src: "/balanco-hidrico/conversas/conversa-3.webp",
    alt: "Depoimento sobre o Balanço Hídrico Ilustrado 3",
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

export function BalancoHidricoConversationSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#F2FBF8] via-[#EAF7F4] to-[#E3F3EF] py-14 sm:py-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={TEXTURE_DOTS} />

      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/80" />

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
            Depoimentos sobre a experi&ecirc;ncia com o Balan&ccedil;o H&iacute;drico Ilustrado.
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

        {/* 3 cards: mobile em scroll horizontal com snap, desktop (sm+) em
            grid de 3 colunas — mesma disciplina de layout do Guia/Mapas
            Mentais, adaptada para 3 itens em vez de 4. */}
        <div
          className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [&::-webkit-scrollbar]:hidden sm:mt-9 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:pb-0"
          style={{ scrollbarWidth: "none" }}
        >
          {conversationCards.map((card) => (
            <div key={card.src} className="group relative min-w-[78%] snap-start sm:min-w-0">
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
                    decoding="async"
                    width={941}
                    height={1672}
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
