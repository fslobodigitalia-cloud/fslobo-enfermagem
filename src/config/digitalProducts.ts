/**
 * Catálogo do Guia de Evolução de Enfermagem (produto principal) e seus
 * order bumps opcionais — Fase 4 (frontend).
 *
 * A fonte real de verdade para o valor cobrado é sempre public.products,
 * lida pela RPC create_or_get_product_order_with_items() no momento da
 * compra — o frontend nunca envia preço, só os slugs marcados.
 *
 * guiaEvolucaoProduct.priceCents/priceLabel: desde a correção de preço
 * (2026-08), GuiaEvolucaoEnfermagemPage NÃO usa mais esses dois campos
 * para exibição — o preço mostrado na página vem do catálogo público
 * (RPC get_active_product_catalog(), via useProductCatalog(), mesma fonte
 * de /materiais e /produto/:slug), então mudanças de preço no banco/CRM
 * aparecem sozinhas, sem precisar editar código. priceCents aqui
 * permanece só como FALLBACK para os poucos instantes antes do catálogo
 * responder, ou se a consulta falhar — mantenha sincronizado com o preço
 * real de vez em quando, mas nunca é a fonte usada em condições normais.
 * guiaEvolucaoBumps abaixo continua sem leitura dinâmica (fora do escopo
 * desta correção).
 *
 * legislacao-sus-ilustrada existe no banco (active=false) mas NUNCA
 * aparece aqui de propósito — produto removido da oferta.
 */

export const guiaEvolucaoProduct = {
  slug: "guia-evolucao-enfermagem",
  name: "Guia de Evolução de Enfermagem",
  priceCents: 1000,
  priceLabel: "R$ 10,00",
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
    slug: "mapa-mental-ilustrado",
    name: "Guia Ilustrado para Concursos e Processos Seletivos",
    description: "Reforce os temas mais cobrados com uma revisão visual para provas e processos seletivos.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
  },
  {
    slug: "medicamentos-na-pratica",
    name: "Medicamentos na Prática",
    description: "Consulte classes, vias, cálculos e cuidados de enfermagem com mais segurança na prática.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
  },
  {
    slug: "balanco-hidrico-bump",
    name: "Balanço Hídrico Ilustrado",
    description: "Aprenda a registrar entradas e saídas, calcular o saldo e interpretar o balanço no plantão.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
  },
];

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/**
 * Catálogo do Mapas Mentais Ilustrados (produto principal, slug de catálogo
 * "concursos-enfermagem") e seus order bumps — landing dedicada em
 * /produto/concursos-enfermagem (MapasMentaisPage.tsx). Independente de
 * guiaEvolucaoProduct/guiaEvolucaoBumps acima (não alterados por este
 * bloco) — mesma disciplina de preço, só que para outro produto/rota.
 *
 * mapasMentaisProduct.priceCents/priceLabel e mapasMentaisBumps[].priceCents/
 * priceLabel são SOMENTE fallback visual/UX: o preço realmente exibido
 * prefere sempre o catálogo público (RPC get_active_product_catalog(), via
 * useProductCatalog() — mesma fonte de /materiais, /produto/:slug e do
 * Guia), usado só nos poucos instantes antes do catálogo responder ou se a
 * consulta falhar. O valor REALMENTE cobrado nunca vem daqui nem do
 * catálogo lido no frontend — é sempre o que create-product-order-efi-prod
 * devolve (order.amountCents), calculado no banco pela RPC
 * create_or_get_product_order_with_items_efi(). O checkout desta página
 * envia exclusivamente productSlugs (array de strings) — nunca um campo de
 * preço.
 */
export const mapasMentaisProduct = {
  slug: "concursos-enfermagem",
  name: "Mapas Mentais Ilustrados",
  priceCents: 1000,
  priceLabel: "R$ 10,00",
};

export const mapasMentaisBumps: DigitalBump[] = [
  {
    slug: "medicamentos-na-pratica",
    name: "Medicamentos na Prática",
    description: "Revise os principais medicamentos e cuidados de enfermagem de forma prática e organizada.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
  },
  {
    slug: "2000-questoes-enfermagem",
    name: "2000 Questões de Enfermagem",
    description: "Pratique com questões e descubra quais conteúdos ainda precisam de mais atenção.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
  },
  {
    slug: "guia-feridas-cronicas",
    name: "Guia de Feridas Crônicas",
    description: "Material prático e ilustrado para revisar os principais tipos de feridas e cuidados de enfermagem.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
  },
];

/**
 * Catálogo do Balanço Hídrico Ilustrado (produto principal, slug
 * "balanco-hidrico") e seus order bumps — landing dedicada em
 * /balanco-hidrico (BalancoHidricoPage.tsx). Independente de
 * guiaEvolucaoProduct/guiaEvolucaoBumps e mapasMentaisProduct/
 * mapasMentaisBumps acima (não alterados por este bloco) — mesma
 * disciplina de preço, só que para outro produto/rota.
 *
 * IMPORTANTE: "balanco-hidrico" é o produto PRINCIPAL da landing própria.
 * Ele deve permanecer kind=primary e ativo. Quando o mesmo material for
 * oferecido como adicional do Guia de Evolução, o slug usado é a variante
 * separada "balanco-hidrico-bump", vinculada ao mesmo PDF no banco. Nunca
 * transforme este registro principal em bump: isso retiraria o produto do
 * catálogo e quebraria sua compra individual.
 *
 * balancoHidricoBumps nunca inclui "balanco-hidrico" (o próprio produto
 * principal) — mesma disciplina de guiaEvolucaoBumps/mapasMentaisBumps.
 * A composição desta landing é independente dos adicionais exibidos no
 * Guia de Evolução; por isso "medicamentos-na-pratica" não é incluído aqui.
 */
export const balancoHidricoProduct = {
  slug: "balanco-hidrico",
  name: "Balanço Hídrico Ilustrado",
  description:
    "Guia visual para registrar entradas e saídas, calcular o saldo parcial e de 24 horas, e interpretar o balanço hídrico com segurança no plantão.",
  priceCents: 1000,
  priceLabel: "R$ 10,00",
};

export const balancoHidricoBumps: DigitalBump[] = [
  {
    slug: "2000-questoes-enfermagem",
    name: "2000 Questões de Enfermagem",
    description: "Pratique com questões e descubra quais conteúdos ainda precisam de mais atenção.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
  },
  {
    slug: "guia-feridas-cronicas",
    name: "Guia de Feridas Crônicas",
    description: "Material prático e ilustrado para revisar os principais tipos de feridas e cuidados de enfermagem.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
  },
  {
    slug: "mapa-mental-ilustrado",
    name: "Mapa Mental para Concursos de Enfermagem",
    description: "Conteúdos difíceis viram consulta rápida e visual para o dia a dia e para os estudos.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
  },
];
