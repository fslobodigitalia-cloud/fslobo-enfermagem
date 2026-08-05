import * as React from "react";
import { useLocation } from "react-router-dom";
import { brand, seo } from "@/config/site";
import { useDocumentMeta, useStructuredData } from "@/lib/seo";
import { useSelection } from "@/context/SelectionContext";
import { scrollToId } from "@/lib/scroll";

import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { QuickProductsBanner } from "@/components/QuickProductsBanner";
import { ReadingThemes } from "@/components/ReadingThemes";
import { HowItWorks } from "@/components/HowItWorks";
import { ReadingPreview } from "@/components/ReadingPreview";
import { Differentials } from "@/components/Differentials";
import { FAQ } from "@/components/FAQ";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";
import { MobileStickyCTA } from "@/components/MobileStickyCTA";
import { ConsentBanner } from "@/components/ConsentBanner";

/** O modal só é baixado quando o visitante seleciona um pacote. */
const QualificationModal = React.lazy(() => import("@/components/QualificationModal"));

export default function Index() {
  useDocumentMeta({ title: seo.title, description: seo.description, path: "/" });
  useStructuredData();

  const { selectedPackage } = useSelection();

  /* Chegando de outra página com um #âncora (ex.: "voltar aos temas" a
     partir de uma experiência rápida), rola até a seção assim que ela pinta. */
  const { hash } = useLocation();
  React.useEffect(() => {
    if (!hash) return;
    const id = hash.replace(/^#/, "");
    const timer = window.setTimeout(() => scrollToId(id), 80);
    return () => window.clearTimeout(timer);
  }, [hash]);

  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-gold focus:px-4 focus:py-3 focus:text-ink"
      >
        Ir para o conteúdo
      </a>

      <Header />

      <main id="conteudo">
        <Hero />
        <QuickProductsBanner />
        <ReadingThemes />
        <HowItWorks />
        {/*
          A seção de pacotes saiu da home: os valores passam a viver dentro das
          páginas de cada tema (src/pages/ThemeReading.tsx).
          "O que você pode perguntar?" e "O que esperar da experiência" também
          saíram da home a pedido — os componentes continuam disponíveis em
          src/components/QuestionExamples.tsx e src/components/WhatToExpect.tsx.
        */}
        <ReadingPreview />
        <Differentials />
        <FAQ />
        <FinalCTA />
      </main>

      <Footer />

      <MobileStickyCTA />
      <ConsentBanner />

      {selectedPackage && (
        <React.Suspense fallback={null}>
          <QualificationModal />
        </React.Suspense>
      )}

      {/* Descrição institucional acessível a leitores de tela e mecanismos de busca. */}
      <p className="sr-only">{brand.description}</p>
    </>
  );
}
