import { Calculator, ClipboardCheck, Lightbulb, type LucideIcon } from "lucide-react";

/**
 * Metadados das 3 ferramentas gratuitas — única fonte compartilhada entre
 * a seção da home (ToolsSection), o hub (/ferramentas) e os breadcrumbs
 * das páginas individuais. Nada aqui vem do Supabase: são páginas
 * estáticas do site, não produtos do catálogo.
 */

export const TOOLS_HUB_PATH = "/ferramentas";

export interface ToolMeta {
  slug: string;
  path: string;
  name: string;
  /** Rótulo curto para superfícies compactas (menu da home/hub) — nunca
   * usado nos títulos H1 das páginas próprias, só no menu. */
  menuLabel: string;
  /** Linha curtíssima (1 linha) para o menu compacto. */
  menuHint: string;
  shortDescription: string;
  longDescription: string;
  ctaLabel: string;
  icon: LucideIcon;
}

export const TOOLS: ToolMeta[] = [
  {
    slug: "calculadora-enfermagem",
    path: "/ferramentas/calculadora-enfermagem",
    name: "Calculadora de Enfermagem",
    menuLabel: "Calculadora",
    menuHint: "Cálculos rápidos",
    shortDescription: "Cálculos rápidos de medicação, infusão, gotejamento, diluição e conversões.",
    longDescription:
      "Seis ferramentas de cálculo em um só lugar: volume por hora, tempo de infusão, gotejamento, dose-volume, concentração após diluição e conversões de unidade. Cada resultado mostra a fórmula usada, para você conferir a conta — não para decidir a dose.",
    ctaLabel: "Abrir calculadora",
    icon: Calculator,
  },
  {
    slug: "checklist-plantao",
    path: "/ferramentas/checklist-plantao",
    name: "Checklist de Plantão",
    menuLabel: "Checklist",
    menuHint: "Organize o plantão",
    shortDescription: "Organize os principais pontos do plantão e acompanhe suas pendências em um só lugar.",
    longDescription:
      "Um checklist interativo dividido por etapa do plantão — início, avaliação e dispositivos, medicações, registros e final do turno — com progresso em porcentagem e espaço para adicionar seus próprios itens. Tudo fica salvo só no seu navegador.",
    ctaLabel: "Abrir checklist",
    icon: ClipboardCheck,
  },
  {
    slug: "dicas-de-plantao",
    path: "/ferramentas/dicas-de-plantao",
    name: "Dicas de Plantão",
    menuLabel: "Dicas de Plantão",
    menuHint: "Consulta rápida",
    shortDescription: "Orientações rápidas para organização, registros, comunicação e rotina assistencial.",
    longDescription:
      "Uma pequena biblioteca de dicas curtas, organizadas por categoria — organização, comunicação, registros, medicações, segurança e passagem de plantão — para consultar rapidamente durante o turno.",
    ctaLabel: "Ver dicas",
    icon: Lightbulb,
  },
];

export function getToolBySlug(slug: string | undefined): ToolMeta | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}
