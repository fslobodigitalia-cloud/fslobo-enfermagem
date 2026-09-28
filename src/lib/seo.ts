import * as React from "react";
import { contact } from "@/config/site";

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
  /**
   * URL absoluta de uma imagem própria para og:image/twitter:image (ex.: a
   * capa do produto). Opcional e aditivo — quando omitido, o comportamento
   * é IDÊNTICO ao de antes desta adição: og:image/twitter:image continuam
   * intocados, com o valor estático já definido em index.html (usado hoje
   * por toda página que não passa este campo).
   */
  image?: string;
}

/** Atualiza título, descrição e canonical ao navegar entre as rotas. */
export function useDocumentMeta({ title, description, path = "/", noindex, image }: DocumentMetaOptions) {
  React.useEffect(() => {
    document.title = title;
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:url"]', "content", `${contact.siteUrl}${path}`);
    setCanonical(`${contact.siteUrl}${path}`);
    if (image) {
      setMeta('meta[property="og:image"]', "content", image);
      setMeta('meta[name="twitter:image"]', "content", image);
    }

    const robots = noindex ? "noindex, follow" : "index, follow";
    setMeta('meta[name="robots"]', "content", robots);
  }, [title, description, path, noindex, image]);
}

/**
 * Nenhum schema estruturado (JSON-LD) é gerado nesta etapa. Um schema
 * apropriado para a FSLobo Enfermagem (Product/Course ou similar) fica
 * para a etapa de SEO definitivo, fora do escopo atual.
 */
