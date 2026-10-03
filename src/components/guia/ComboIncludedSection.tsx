import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const MEDICAMENTOS_COVER = {
  src: "/medicamentos-na-pratica/capa-medicamentos-na-pratica.webp",
  alt: "Capa do material Medicamentos na Prática",
};

const MEDICAMENTOS_PAGES = [1, 2, 3, 4].map((number) => ({
  src: `/medicamentos-na-pratica/modulo-${number}.webp`,
  alt: `Página ${number} de exemplo de Medicamentos na Prática`,
}));

const MEDICAMENTOS_POINTS = [
  "Medicamentos mais utilizados no dia a dia do plantão",
  "Vias de administração e principais cuidados de enfermagem",
  "3 PDFs de Medicamentos na Prática, já incluídos no combo",
];

/**
 * Seção "Medicamentos na Prática" da oferta combo. Diferente de
 * ConnectedExtrasSection (adicionais opcionais, + R$ 10), aqui Medicamentos
 * é CONTEÚDO INCLUÍDO no combo — sem selo de "opcional", sem preço
 * separado, sem "grátis". Capa + as quatro páginas de prévia já existentes.
 */
export function ComboIncludedSection() {
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
              <p className="mb-3 text-[12px] font-bold uppercase tracking-wide text-slate-400">Algumas páginas do material</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {MEDICAMENTOS_PAGES.map((page) => (
                  <div
                    key={page.src}
                    className={cn(
                      "flex aspect-[3/4] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-1.5",
                      "shadow-[0_2px_4px_rgba(15,23,42,0.04),0_8px_20px_-14px_rgba(15,23,42,0.12)]",
                    )}
                  >
                    <img
                      src={page.src}
                      alt={page.alt}
                      loading="lazy"
                      className="h-full w-full rounded-xl object-contain"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
