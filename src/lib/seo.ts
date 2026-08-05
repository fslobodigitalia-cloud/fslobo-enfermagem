import * as React from "react";
import { brand, contact, copy, seo } from "@/config/site";

function setMeta(selector: string, attribute: string, value: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement("meta");
    const [name, content] = selector.replace(/^meta\[|\]$/g, "").split("=");
    tag.setAttribute(name, content.replace(/"/g, ""));
    document.head.appendChild(tag);
  }
  tag.setAttribute(attribute, value);
}

function setCanonical(url: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = url;
}

interface DocumentMetaOptions {
  title: string;
  description: string;
  /** Caminho relativo, por exemplo "/privacidade". */
  path?: string;
  /** Páginas legais não precisam ser indexadas com prioridade. */
  noindex?: boolean;
}

/** Atualiza título, descrição e canonical ao navegar entre as rotas. */
export function useDocumentMeta({ title, description, path = "/", noindex }: DocumentMetaOptions) {
  React.useEffect(() => {
    document.title = title;
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:url"]', "content", `${contact.siteUrl}${path}`);
    setCanonical(`${contact.siteUrl}${path}`);

    const robots = noindex ? "noindex, follow" : "index, follow";
    setMeta('meta[name="robots"]', "content", robots);
  }, [title, description, path, noindex]);
}

const SCRIPT_ID = "dados-estruturados";

/**
 * Injeta os schemas ProfessionalService e FAQPage.
 * Nenhum schema de avaliação é gerado — não existem avaliações reais.
 */
export function useStructuredData() {
  React.useEffect(() => {
    const data = [
      {
        "@context": "https://schema.org",
        "@type": "ProfessionalService",
        name: brand.name,
        slogan: brand.tagline,
        description: brand.description,
        url: contact.siteUrl,
        image: `${contact.siteUrl}${seo.ogImage}`,
        logo: `${contact.siteUrl}${brand.logo.png}`,
        areaServed: { "@type": "Country", name: "Brasil" },
        availableLanguage: "pt-BR",
        serviceType: "Leitura de tarô online",
        priceRange: "R$",
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: copy.faq.items.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ];

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);

    return () => {
      document.getElementById(SCRIPT_ID)?.remove();
    };
  }, []);
}
