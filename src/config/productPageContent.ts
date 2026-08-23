import type { PublicCatalogProduct } from "@/lib/catalogQueries";

/**
 * Conteúdo editorial das páginas normais de produto (/produto/:slug) — usado
 * por ProductEditorialHero, ProductPurchaseCard e ProductInfoGrid via
 * getProductPageContent(product). NÃO se aplica a /guia-evolucao-enfermagem
 * (landing própria, fora deste sistema).
 *
 * Cada entrada é um ENRIQUECIMENTO opcional, nunca um requisito: um slug sem
 * entrada aqui usa getProductPageContent() → fallback automático baseado só
 * em dados reais da RPC (product.name/category/shortDescription/
 * description) — a página nunca quebra por um produto novo do CRM não estar
 * mapeado. Ver função abaixo.
 *
 * Todo texto curado aqui é reescrita/reorganização de conteúdo REAL já
 * existente no banco (name/category/short_description/description dos
 * produtos ativos, kind='primary', catalog_status='ready', conferidos
 * diretamente via Supabase antes de escrever este arquivo) — nenhuma
 * característica clínica, número (páginas/quantidade), garantia ou
 * certificação foi inventada.
 */

export interface ProductPageContent {
  /** Rótulo pequeno acima do H1 na hero. */
  eyebrow: string;
  /** 4–6 palavras/temas — alimentam o marquee E o painel visual da hero. */
  keywords: string[];
  /** Rótulo curto no topo do painel visual (normalmente a categoria). */
  panelHeading: string;
  /** "Para quem é" — 1 frase curta. */
  audience: string;
  /** Corpo do card "Conteúdo" no grid visual — recorte curto do que o material cobre. */
  contentSummary: string;
}

type CuratedContent = Partial<Omit<ProductPageContent, "panelHeading">>;

/**
 * Produtos "normais" ativos conferidos no catálogo (kind=primary,
 * catalog_status=ready) no momento em que este arquivo foi escrito:
 * medicamentos-na-pratica, exames-laboratoriais, dicionario-termos-tecnicos,
 * concursos-enfermagem, feridas-curativos-coberturas. guia-evolucao-enfermagem
 * também é 'primary' no banco mas tem landing própria — de propósito NÃO
 * recebe entrada aqui (usa o fallback automático, igual a qualquer produto
 * não mapeado; a landing dedicada em /guia-evolucao-enfermagem não é afetada
 * por este arquivo).
 */
const CURATED: Record<string, CuratedContent> = {
  "medicamentos-na-pratica": {
    eyebrow: "GUIA PRÁTICO DE ENFERMAGEM",
    keywords: [
      "MEDICAMENTOS",
      "CLASSES MEDICAMENTOSAS",
      "VIAS DE ADMINISTRAÇÃO",
      "CUIDADOS DE ENFERMAGEM",
      "MONITORIZAÇÃO",
      "CONSULTA RÁPIDA",
    ],
    audience:
      "Para estudantes, técnicos e enfermeiros que precisam identificar rapidamente classes medicamentosas, vias de administração e cuidados de enfermagem.",
    contentSummary:
      "Classes medicamentosas, indicações, vias de administração, cuidados de enfermagem, monitorização, precauções e alertas.",
  },
  "exames-laboratoriais": {
    eyebrow: "GUIA PRÁTICO DE ENFERMAGEM",
    keywords: ["EXAMES LABORATORIAIS", "INTERPRETAÇÃO", "DIAGNÓSTICO", "CONSULTA RÁPIDA"],
    audience:
      "Para estudantes, técnicos e enfermeiros que querem interpretar exames laboratoriais com mais clareza no dia a dia.",
    contentSummary: "Leitura e interpretação dos principais exames laboratoriais, organizada para consulta objetiva.",
  },
  "dicionario-termos-tecnicos": {
    eyebrow: "GUIA PRÁTICO DE ENFERMAGEM",
    keywords: ["TERMOS TÉCNICOS", "DICIONÁRIO", "PRÁTICA CLÍNICA", "CONSULTA RÁPIDA"],
    audience:
      "Para estudantes, técnicos e enfermeiros que precisam consultar rapidamente termos técnicos usados na rotina.",
    contentSummary: "Principais termos técnicos utilizados na rotina de enfermagem, organizados para consulta rápida.",
  },
  "concursos-enfermagem": {
    eyebrow: "MATERIAL DE REVISÃO",
    keywords: ["MAPAS MENTAIS", "REVISÃO VISUAL", "CONCURSOS DE ENFERMAGEM", "CONSULTA RÁPIDA"],
    audience: "Para quem está se preparando para concursos e provas de enfermagem e quer revisar com mais rapidez.",
    contentSummary:
      "Mapas mentais visuais e objetivos para revisar os principais conteúdos cobrados em concursos de enfermagem.",
  },
  "feridas-curativos-coberturas": {
    eyebrow: "GUIA PRÁTICO DE ENFERMAGEM",
    keywords: ["FERIDAS", "CURATIVOS", "COBERTURAS", "CUIDADOS DE ENFERMAGEM", "CONSULTA RÁPIDA"],
    audience: "Para estudantes, técnicos e enfermeiros que atuam ou estudam cuidados com feridas e coberturas.",
    contentSummary: "Tipos de feridas, coberturas e cuidados de enfermagem organizados para consulta na prática.",
  },
};

const DEFAULT_EYEBROW = "MATERIAL DIGITAL";
const DEFAULT_AUDIENCE = "Para estudantes, técnicos e enfermeiros que buscam consulta rápida e objetiva na prática.";
const DEFAULT_CONTENT_SUMMARY = "Consulte os principais tópicos deste material sempre que precisar.";

/** "concursos" → "Concursos"; categorias que já têm alguma maiúscula (ex.: "Exames e diagnóstico") ficam como estão. */
function normalizeCategoryLabel(category: string): string {
  if (category !== category.toLowerCase()) return category;
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/** Fallback seguro para produtos futuros sem entrada em CURATED: só usa categoria/nome reais, nada fabricado. */
function fallbackKeywords(product: PublicCatalogProduct): string[] {
  const words: string[] = [];
  if (product.category) words.push(product.category.toUpperCase());
  words.push("MATERIAL DIGITAL", "PDF DIGITAL", "CONSULTA RÁPIDA");
  return Array.from(new Set(words));
}

/**
 * Resolve o conteúdo editorial de UM produto — sempre retorna um objeto
 * completo e utilizável, exista ou não entrada em CURATED. É a única forma
 * pela qual os componentes de produto devem ler este arquivo.
 */
export function getProductPageContent(product: PublicCatalogProduct): ProductPageContent {
  const curated = CURATED[product.slug] ?? {};
  const panelHeading = product.category ? normalizeCategoryLabel(product.category) : product.name;

  return {
    eyebrow: curated.eyebrow ?? DEFAULT_EYEBROW,
    keywords: curated.keywords && curated.keywords.length > 0 ? curated.keywords : fallbackKeywords(product),
    panelHeading,
    audience: curated.audience ?? DEFAULT_AUDIENCE,
    contentSummary: curated.contentSummary ?? DEFAULT_CONTENT_SUMMARY,
  };
}
