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

/**
 * Nenhum schema estruturado (JSON-LD) é gerado nesta etapa. Um schema
 * apropriado para a FSLobo Enfermagem (Product/Course ou similar) fica
 * para a etapa de SEO definitivo, fora do escopo atual.
 */
