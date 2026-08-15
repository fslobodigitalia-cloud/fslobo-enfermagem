/**
 * Catálogo do Guia de Evolução de Enfermagem (produto principal) e seus
 * order bumps opcionais — Fase 4 (frontend), fora do funil de tarô.
 *
 * Estes valores são só para EXIBIÇÃO/UX (preço mostrado na página, total
 * calculado ao marcar bumps). A fonte real de verdade para o valor
 * cobrado é sempre public.products, lida pela RPC
 * create_or_get_product_order_with_items() no momento da compra — o
 * frontend nunca envia preço, só os slugs marcados. Se o catálogo mudar no
 * banco (preço, produto ativo/inativo), este arquivo precisa ser
 * atualizado manualmente para continuar refletindo a mesma coisa — não há
 * leitura dinâmica do catálogo nesta etapa.
 *
 * legislacao-sus-ilustrada existe no banco (active=false) mas NUNCA
 * aparece aqui de propósito — produto removido da oferta.
 */

export const guiaEvolucaoProduct = {
  slug: "guia-evolucao-enfermagem",
  name: "Guia de Evolução de Enfermagem",
  priceCents: 1700,
  priceLabel: "R$ 17,00",
};

export interface DigitalBump {
  slug: string;
  name: string;
  /** Descrição curta exibida no card do order bump — só copy, não afeta preço/lógica. */
  description: string;
  priceCents: number;
  priceLabel: string;
}

export const guiaEvolucaoBumps: DigitalBump[] = [
  {
    slug: "guia-ilustrado-enfermagem",
    name: "Guia Ilustrado de Enfermagem",
    description: "Transforme conteúdos difíceis em consultas rápidas e visuais para o dia a dia.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
  },
  {
    slug: "2000-questoes-enfermagem",
    name: "2000 Questões de Enfermagem",
    description: "Pare de só ler: pratique com questões e descubra exatamente o que ainda precisa revisar.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
  },
  {
    slug: "guia-feridas-cronicas",
    name: "Guia de Feridas Crônicas",
    description: "Tenha à mão um guia prático para consultar quando surgir dúvida sobre os principais tipos de feridas.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
  },
];

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
