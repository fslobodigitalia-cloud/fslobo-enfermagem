import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { brand, contact, legalLinks } from "@/config/site";
import type { LegalDocument } from "@/config/legal";
import { useDocumentMeta } from "@/lib/seo";
import { withCampaignQuery } from "@/lib/utmTracking";
import { Logo } from "./common/Logo";
import { CosmicBackdrop } from "./common/CosmicBackdrop";
import { Footer } from "./Footer";

export function LegalLayout({ document: doc }: { document: LegalDocument }) {
  useDocumentMeta({
    title: `${doc.title} | ${brand.name}`,
    description: doc.subtitle,
    path: `/${doc.slug}`,
    noindex: false,
  });

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [doc.slug]);

  return (
    <div className="relative min-h-screen bg-ink">
      <header className="sticky top-0 z-50 border-b border-gold/20 bg-ink/85 backdrop-blur-xl">
        <div className="shell flex h-[72px] items-center justify-between gap-4">
          <Link to={withCampaignQuery("/")} aria-label={`${brand.name} — voltar ao início`}>
            <Logo size={34} className="sm:hidden" />
            <Logo size={42} className="hidden sm:inline-flex" />
          </Link>
          <Link
            to={withCampaignQuery("/")}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-gold/25 bg-white/[0.03] px-4 text-[14px] font-medium text-cream transition-colors hover:border-gold/55"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
            Voltar ao site
          </Link>
        </div>
      </header>

      <main className="relative overflow-hidden pb-16 pt-12 sm:pt-16">
        <CosmicBackdrop variant="section" />

        <article className="shell relative z-10 max-w-3xl">
          <p className="eyebrow">Documento oficial</p>
          <h1 className="mt-4 font-display text-[clamp(2rem,7vw,3.1rem)] leading-[1.08] text-cream">
            {doc.title}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-dim">{doc.subtitle}</p>
          <p className="mt-3 text-[13px] text-dim/70">Última atualização: {doc.updatedAt}</p>

          <span aria-hidden="true" className="my-9 block h-px w-full gold-rule opacity-60" />

          <div className="flex flex-col gap-9">
            {doc.blocks.map((block) => (
              <section key={block.heading}>
                <h2 className="font-display text-[1.45rem] leading-snug text-cream sm:text-[1.6rem]">
                  {block.heading}
                </h2>
                {block.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mt-3 text-[15px] leading-relaxed text-dim">
                    {paragraph}
                  </p>
                ))}
                {block.list && (
                  <ul className="mt-4 flex flex-col gap-2.5">
                    {block.list.map((item) => (
                      <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-dim">
                        <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold/70" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <nav aria-label="Outros documentos" className="mt-14">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold/85">
              Outros documentos
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2.5">
              {legalLinks
                .filter((link) => link.href !== `/${doc.slug}`)
                .map((link) => (
                  <li key={link.href}>
                    <Link
                      to={withCampaignQuery(link.href)}
                      className="inline-flex min-h-[44px] items-center rounded-2xl border border-gold/25 bg-white/[0.03] px-4 text-[14px] text-cream transition-colors hover:border-gold/55"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>

          <p className="mt-10 text-[13px] leading-relaxed text-dim/80">
            {brand.name} — {contact.siteUrl.replace(/^https?:\/\//, "")}
          </p>
        </article>
      </main>

      <Footer />
    </div>
  );
}
