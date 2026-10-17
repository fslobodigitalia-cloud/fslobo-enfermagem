import { ArrowDown, BookOpen, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { useDocumentMeta } from "@/lib/seo";
import { useProductCatalog } from "@/hooks/useProductCatalog";
import { formatPriceCents } from "@/lib/catalogQueries";
import { ProductCheckout } from "@/components/product/ProductCheckout";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";

const PRODUCT_SLUG = "resumo-ilustrado-enfermagem";
const COVER_IMAGE = "/resumo-ilustrado-enfermagem/capa-resumo-ilustrado-enfermagem.webp";
const PREVIEW_IMAGES = Array.from({ length: 9 }, (_, index) =>
  `/resumo-ilustrado-enfermagem/previas/pagina-${index + 1}.webp`,
);

const points = [
  {
    icon: BookOpen,
    title: "Revisão mais organizada",
    text: "Consulte os assuntos do material em uma apresentação visual e estruturada.",
  },
  {
    icon: Smartphone,
    title: "Acesso digital",
    text: "Leia o PDF pelo celular, tablet ou computador, no seu ritmo.",
  },
  {
    icon: Sparkles,
    title: "Feito para retomar",
    text: "Volte aos pontos estudados sempre que precisar revisar o conteúdo.",
  },
];

const steps = [
  "Abra o arquivo e escolha o assunto que deseja revisar.",
  "Use os resumos visuais para organizar a leitura e retomar os pontos principais.",
  "Consulte o material novamente durante sua rotina de estudos.",
];

export default function ResumoIlustradoEnfermagemPage() {
  const { status, products, retry } = useProductCatalog();
  const product = products?.find((item) => item.slug === PRODUCT_SLUG);

  useDocumentMeta({
    title: "Resumo Ilustrado de Enfermagem | FSlobo Enfermagem",
    description:
      "Apostila digital HUBRASIL com 108 páginas de conteúdo ilustrado para apoiar a revisão dos estudos de enfermagem.",
    path: `/produto/${PRODUCT_SLUG}`,
  });

  const isReady = status === "success" && Boolean(product);
  const priceLabel = product ? formatPriceCents(product.priceCents, product.currency) : null;

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <SiteHeader />
      <main>
        <section className="overflow-hidden bg-[#0a1622] text-white">
          <div className="mx-auto grid w-full max-w-[1200px] items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-teal-300">Material digital de enfermagem</p>
              <h1 className="mt-5 max-w-[720px] text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                Revise enfermagem com mais <span className="text-teal-300">clareza</span> e organização.
              </h1>
              <p className="mt-6 max-w-[610px] text-base leading-7 text-slate-300 sm:text-lg">
                Um resumo ilustrado em PDF para apoiar seus estudos e facilitar a retomada dos conteúdos no seu ritmo.
              </p>
              <a
                href="#comprar"
                className="mt-8 inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-teal-400 px-7 text-base font-bold text-slate-950 transition hover:bg-teal-300 focus:outline-none focus:ring-4 focus:ring-teal-200/40"
              >
                Ver o material <ArrowDown className="h-5 w-5" aria-hidden="true" />
              </a>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
                <span>108 páginas de conteúdo ilustrado</span><span aria-hidden="true">·</span><span>PDF digital</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[420px]">
              <div className="absolute -inset-8 rounded-full bg-teal-400/10 blur-3xl" aria-hidden="true" />
              <img
                src={COVER_IMAGE}
                alt="Capa da Apostila de Resumos de Enfermagem HUBRASIL"
                className="relative mx-auto max-h-[680px] w-full rounded-2xl object-contain shadow-2xl"
                fetchPriority="high"
              />
              <p className="mt-4 text-center text-xs text-slate-400">Capa da apostila digital em PDF</p>
            </div>
          </div>
        </section>

        <section className="bg-white px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto w-full max-w-[1200px]">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div className="max-w-[720px]">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Veja por dentro</p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Prévia das páginas ilustradas</h2>
                <p className="mt-4 leading-7 text-slate-600">Veja imagens ilustrativas do acervo de Mapas Mentais para conhecer o estilo visual dos materiais de enfermagem.</p>
              </div>
              <span className="text-sm font-semibold text-slate-500">108 páginas no PDF</span>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
              {PREVIEW_IMAGES.map((src, index) => (
                <a
                  key={src}
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-sm transition hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-teal-200"
                  aria-label={`Abrir imagem ilustrativa ${index + 1} em tamanho maior`}
                >
                  <img
                    src={src}
                    alt={`Imagem ilustrativa ${index + 1} do acervo de Mapas Mentais de enfermagem`}
                    className="aspect-[4/5] w-full rounded-xl object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1200px] px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-[720px]">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Estude com mais organização</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Um material para acompanhar sua rotina de estudos</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">A proposta é tornar a revisão mais simples de retomar, com conteúdo digital reunido em um só lugar.</p>
          </div>
          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {points.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-teal-50 text-teal-700"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <h3 className="mt-5 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Como usar</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight">Consulte quando precisar retomar um assunto</h2>
              <p className="mt-4 text-base leading-7 text-slate-600">O arquivo digital fica disponível para você estudar e revisar em diferentes momentos.</p>
            </div>
            <ol className="space-y-4">
              {steps.map((step, index) => (
                <li key={step} className="flex gap-4 rounded-2xl bg-white p-5 shadow-sm">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-700 text-sm font-bold text-white">{index + 1}</span>
                  <span className="pt-1 text-sm leading-6 text-slate-700">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[900px] px-5 py-16 sm:px-8 sm:py-20">
          <div className="rounded-3xl border border-teal-100 bg-teal-50/60 p-7 sm:p-10">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-teal-700"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span>
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight">Para quem é</h2>
                <p className="mt-3 leading-7 text-slate-700">Para estudantes, técnicos e enfermeiros que desejam um apoio digital para organizar a revisão dos estudos de enfermagem.</p>
                <p className="mt-4 text-sm leading-6 text-slate-600">Material educacional. Não substitui avaliação profissional, protocolos institucionais ou orientações atualizadas para o cuidado ao paciente.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="comprar" className="scroll-mt-24 bg-[#0a1622] px-5 py-16 text-white sm:px-8 sm:py-20">
          <div className="mx-auto w-full max-w-[680px] rounded-3xl bg-white p-6 text-slate-900 shadow-2xl sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Acesso digital</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight">Resumo Ilustrado de Enfermagem</h2>
            <p className="mt-3 leading-6 text-slate-600">PDF digital. Após a confirmação do pagamento, o acesso é liberado conforme o cadastro do produto.</p>

            {status === "loading" && <p className="mt-7 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Carregando as informações do produto…</p>}
            {status === "error" && (
              <div className="mt-7 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                Não foi possível consultar a disponibilidade agora. <button type="button" onClick={retry} className="font-bold underline">Tentar novamente</button>
              </div>
            )}
            {status === "success" && !product && (
              <p className="mt-7 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">A página está em preparação. A compra será liberada quando o produto e o arquivo de entrega estiverem ativos no catálogo.</p>
            )}
            {isReady && product && (
              <>
                <div className="mt-7 flex items-center justify-between rounded-2xl border border-teal-100 bg-teal-50/70 p-5">
                  <span className="text-sm font-bold uppercase tracking-wide text-slate-600">Pagamento único</span>
                  <span className="text-3xl font-extrabold text-teal-800">{priceLabel}</span>
                </div>
                <div className="mt-6"><ProductCheckout slug={product.slug} name={product.name} /></div>
                <p className="mt-4 text-center text-xs text-slate-500">O valor é consultado no catálogo e calculado pelo sistema de pagamento.</p>
              </>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
