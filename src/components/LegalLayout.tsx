import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, HeartPulse } from "lucide-react";
import { legalLinks } from "@/config/site";
import {
  LEGAL_ADDRESS,
  LEGAL_BRAND_NAME,
  LEGAL_BUSINESS_NAME,
  LEGAL_CNPJ,
  LEGAL_EMAIL,
  LEGAL_SITE_URL,
  LEGAL_SITE_URL_DISPLAY,
  LEGAL_WHATSAPP_DISPLAY,
  LEGAL_WHATSAPP_URL,
  type LegalDocument,
} from "@/config/legal";
import { useDocumentMeta } from "@/lib/seo";
import { withCampaignQuery } from "@/lib/utmTracking";
import { Button } from "@/components/ui/button";

/**
 * Layout das 4 páginas legais (Privacidade/Termos/Entrega/Reembolso) —
 * branco + teal, mesmo universo visual da landing do Guia de Evolução de
 * Enfermagem (src/pages/GuiaEvolucaoEnfermagemPage.tsx).
 *
 * Só a APARÊNCIA muda aqui — o conteúdo legal (src/config/legal.ts)
 * continua exatamente o mesmo, incluindo os dados reais do fornecedor.
 */
export function LegalLayout({ document: doc }: { document: LegalDocument }) {
  useDocumentMeta({
    title: `${doc.title} | ${LEGAL_BRAND_NAME}`,
    description: doc.subtitle,
    path: `/${doc.slug}`,
    noindex: false,
  });

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [doc.slug]);

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur">
        <div className="mx-auto flex h-[72px] w-full max-w-[1180px] items-center justify-between gap-4 px-5">
          <Link
            to={withCampaignQuery("/")}
            aria-label={`${LEGAL_BRAND_NAME} — voltar ao início`}
            className="flex items-center gap-2.5"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
              <HeartPulse className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="font-sans text-[15px] font-extrabold leading-tight text-slate-900">
              FSlobo <span className="text-teal-600">Enfermagem</span>
            </span>
          </Link>

          <Button asChild variant="outline" size="sm" className="border-teal-300 bg-white text-teal-700 hover:border-teal-500 hover:bg-teal-50">
            <Link to={withCampaignQuery("/")}>
              <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              Voltar ao site
            </Link>
          </Button>
        </div>
      </header>

      <main className="pb-20 pt-12 sm:pt-16">
        <article className="mx-auto w-full max-w-[860px] px-5">
          <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700">
            Documento oficial
          </span>
          <h1 className="mt-4 font-sans text-[2rem] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[2.4rem]">
            {doc.title}
          </h1>
          <p className="mt-3 text-[15.5px] leading-relaxed text-slate-600">{doc.subtitle}</p>
          <p className="mt-2 text-[13px] text-slate-400">Última atualização: {doc.updatedAt}</p>

          <hr className="my-9 border-slate-200" />

          <div className="flex flex-col gap-9">
            {doc.blocks.map((block) => (
              <section key={block.heading}>
                <h2 className="font-sans text-[1.3rem] font-bold leading-snug text-slate-900 sm:text-[1.4rem]">
                  {block.heading}
                </h2>
                {block.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mt-3 text-[15.5px] leading-[1.75] text-slate-600">
                    {paragraph}
                  </p>
                ))}
                {block.list && (
                  <ul className="mt-4 flex flex-col gap-3">
                    {block.list.map((item) => (
                      <li key={item} className="flex gap-3 text-[15.5px] leading-[1.75] text-slate-600">
                        <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          {/* Identificação e contato do fornecedor — card em destaque,
              idêntico nas 4 páginas. E-mail e WhatsApp são sempre links
              reais (mailto: / wa.me), nunca texto solto. */}
          <section
            aria-labelledby="identificacao-e-contato"
            className="mt-14 rounded-[24px] border border-teal-200 bg-teal-50/60 p-6 shadow-[0_2px_4px_rgba(13,148,136,0.05),0_12px_28px_-18px_rgba(13,148,136,0.25)] sm:p-8"
          >
            <h2 id="identificacao-e-contato" className="font-sans text-[1.3rem] font-bold leading-snug text-slate-900">
              Identificação e contato
            </h2>
            <p className="mt-3 text-[15px] font-bold text-slate-900">{LEGAL_BRAND_NAME}</p>
            <p className="mt-1 text-[14.5px] leading-relaxed text-slate-600">
              {LEGAL_BUSINESS_NAME}
              <br />
              CNPJ: {LEGAL_CNPJ}
            </p>
            <p className="mt-3 text-[14.5px] leading-relaxed text-slate-600">
              {LEGAL_ADDRESS.street}
              <br />
              {LEGAL_ADDRESS.neighborhoodCity}
              <br />
              {LEGAL_ADDRESS.zip}
            </p>
            <dl className="mt-5 flex flex-col gap-2.5">
              <div className="flex flex-wrap items-baseline gap-x-2 text-[14.5px]">
                <dt className="font-semibold text-slate-500">E-mail:</dt>
                <dd>
                  <a
                    href={`mailto:${LEGAL_EMAIL}`}
                    className="font-semibold text-teal-700 underline-offset-4 transition-colors hover:text-teal-800 hover:underline"
                  >
                    {LEGAL_EMAIL}
                  </a>
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2 text-[14.5px]">
                <dt className="font-semibold text-slate-500">WhatsApp:</dt>
                <dd>
                  <a
                    href={LEGAL_WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-teal-700 underline-offset-4 transition-colors hover:text-teal-800 hover:underline"
                  >
                    {LEGAL_WHATSAPP_DISPLAY}
                  </a>
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2 text-[14.5px]">
                <dt className="font-semibold text-slate-500">Site:</dt>
                <dd>
                  <a
                    href={LEGAL_SITE_URL}
                    className="font-semibold text-teal-700 underline-offset-4 transition-colors hover:text-teal-800 hover:underline"
                  >
                    {LEGAL_SITE_URL_DISPLAY}
                  </a>
                </dd>
              </div>
            </dl>
          </section>

          <nav aria-label="Outros documentos" className="mt-10">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Outros documentos</h2>
            <ul className="mt-4 flex flex-wrap gap-2.5">
              {legalLinks
                .filter((link) => link.href !== `/${doc.slug}`)
                .map((link) => (
                  <li key={link.href}>
                    <Link
                      to={withCampaignQuery(link.href)}
                      className="inline-flex min-h-[44px] items-center rounded-full border border-slate-200 bg-white px-4 text-[14px] font-medium text-slate-700 shadow-sm transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>
        </article>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50 py-10">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-5 text-[12.5px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {LEGAL_BRAND_NAME}. Todos os direitos reservados.</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link
                  to={withCampaignQuery(link.href)}
                  className="text-slate-500 underline-offset-4 transition-colors hover:text-teal-700 hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </div>
  );
}
