import * as React from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { brand, copy, getThemeBySlug, themePath, themes, type ReadingTheme } from "@/config/site";
import { useDocumentMeta } from "@/lib/seo";
import { scrollToId } from "@/lib/scroll";
import { withCampaignQuery } from "@/lib/utmTracking";

import { Logo } from "@/components/common/Logo";
import { Button } from "@/components/ui/button";
import { RevealGroup, RevealItem } from "@/components/common/Reveal";
import { SectionHeading } from "@/components/common/SectionHeading";
import { ThemeFunnel } from "@/components/ThemeFunnel";
import { Footer } from "@/components/Footer";
import { ConsentBanner } from "@/components/ConsentBanner";

export default function ThemeReading() {
  const { slug } = useParams<{ slug: string }>();
  const theme = slug ? getThemeBySlug(slug) : undefined;

  if (!theme) return <Navigate to="/404" replace />;
  return <ThemePage theme={theme} />;
}

function ThemePage({ theme }: { theme: ReadingTheme }) {
  useDocumentMeta({
    title: theme.page.seoTitle,
    description: theme.page.seoDescription,
    path: themePath(theme),
  });

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [theme.id]);

  const others = themes.filter((item) => item.id !== theme.id);

  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-gold focus:px-4 focus:py-3 focus:text-ink"
      >
        Ir para o conteúdo
      </a>

      <header className="fixed inset-x-0 top-0 z-50 border-b border-gold/20 bg-ink/80 backdrop-blur-xl">
        <div className="shell flex h-[72px] items-center justify-between gap-4">
          <Link to={withCampaignQuery("/")} aria-label={`${brand.name} — voltar ao início`}>
            <Logo size={34} className="sm:hidden" />
            <Logo size={42} className="hidden sm:inline-flex" />
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to={withCampaignQuery("/")}
              className="hidden min-h-[44px] items-center gap-2 rounded-2xl border border-gold/25 bg-white/[0.03] px-4 text-[14px] text-cream transition-colors hover:border-gold/55 sm:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
              {copy.themePage.backToHome}
            </Link>
            <Button size="sm" onClick={() => scrollToId("funil-tema")}>
              {copy.themePage.heroCta}
            </Button>
          </div>
        </div>
      </header>

      <main id="conteudo">
        {/* Introdução, quiz emocional, resumo, pacotes e envio pelo WhatsApp —
            tudo dentro de um único funil, com a foto da carta ao fundo.
            A key força o React a remontar o funil (reiniciando do zero) ao
            navegar de um tema para outro, em vez de manter o estado antigo. */}
        <ThemeFunnel key={theme.id} theme={theme} />

        {/* ── Outros temas ── */}
        <section aria-labelledby="outros-temas-titulo" className="relative py-16 sm:py-20">
          <div className="shell relative z-10">
            <SectionHeading
              eyebrow="Continue explorando"
              title={copy.themePage.otherThemesTitle}
              titleId="outros-temas-titulo"
            />

            <RevealGroup as="ul" className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-3">
              {others.map((item) => (
                <RevealItem as="li" key={item.id}>
                  <Link
                    to={withCampaignQuery(themePath(item))}
                    className="group relative block overflow-hidden rounded-[22px] border border-gold/25 transition-colors duration-500 hover:border-gold/60"
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-plum sm:aspect-[4/5]">
                      <img
                        src={item.image.small}
                        alt=""
                        width={540}
                        height={675}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-105"
                      />
                      <span
                        aria-hidden="true"
                        className="absolute inset-0"
                        style={{
                          background:
                            "linear-gradient(180deg, rgba(7,4,13,0.15) 0%, rgba(7,4,13,0.75) 68%, rgba(7,4,13,0.96) 100%)",
                        }}
                      />
                      <div className="absolute inset-x-0 bottom-0 p-5">
                        <h3 className="font-display text-[1.3rem] leading-tight text-cream">
                          {item.title}
                        </h3>
                        <span className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-gold-light">
                          Ver esta leitura
                          <ArrowUpRight
                            className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                        </span>
                      </div>
                    </div>
                  </Link>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>
      </main>

      <Footer />
      <ConsentBanner />
    </>
  );
}
