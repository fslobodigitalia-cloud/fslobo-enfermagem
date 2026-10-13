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
  /** Capa exibida no carrossel de adicionais (OrderBumpCarousel) — só apresentação. */
  image?: string;
}

/**
 * Adicionais do Guia (carrossel OrderBumpCarousel). Preço/label são só
 * exibição — o valor cobrado é sempre o do backend (ver cabeçalho do arquivo).
 * image: capa do material (arquivo local em public/). "guia-feridas-cronicas" e "2000-questoes-enfermagem"
 * ficam de fora de propósito: o primeiro é o mesmo material comercial de
 * "feridas-curativos-coberturas" (nunca juntos) e o segundo não é oferecido aqui.
 */
export const guiaEvolucaoBumps: DigitalBump[] = [
  {
    slug: "medicamentos-na-pratica",
    name: "Medicamentos na Prática",
    description: "Consulte os principais medicamentos com mais segurança e agilidade.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
    image: "/medicamentos-na-pratica/capa-medicamentos-na-pratica.webp",
  },
  {
    slug: "mapa-mental-ilustrado",
    name: "Mapas Mentais",
    description: "Revise conteúdos essenciais de enfermagem de forma visual e rápida.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
    image: "/concursos-enfermagem/capa-mapas-mentais.webp",
  },
  {
    slug: "balanco-hidrico-bump",
    name: "Balanço Hídrico Ilustrado",
    description: "Aprenda registros e cálculos do balanço hídrico na prática.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
    image: "/balanco-hidrico/capa-balanco-hidrico.webp",
  },
  {
    slug: "exames-laboratoriais",
    name: "Interpretação de Exames Laboratoriais",
    description: "Entenda os principais exames e valores laboratoriais da rotina clínica.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
    image: "/order-bumps/capa-exames-laboratoriais.webp",
  },
  {
    slug: "dicionario-termos-tecnicos",
    name: "Dicionário de Termos Técnicos",
    description: "Consulte rapidamente os termos mais utilizados na enfermagem.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
    image: "/order-bumps/capa-dicionario-termos-tecnicos.webp",
  },
  {
    slug: "feridas-curativos-coberturas",
    name: "Feridas, Curativos e Coberturas",
    description: "Conheça os cuidados e coberturas indicados para diferentes feridas.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
    image: "/order-bumps/capa-feridas-curativos-coberturas.webp",
  },
];

/**
 * Oferta "Kit Completo" do carrossel de adicionais do Guia — em conjunto, os
 * mesmos seis materiais de guiaEvolucaoBumps. É um produto SEPARADO (o slug
 * abaixo é o slug definitivo do futuro SKU no catálogo) e NÃO entra no array
 * dos seis cards. Nesta etapa é só configuração local de desenvolvimento: o
 * SKU ainda não existe no banco, então o preço cobrado de verdade continuará
 * sendo o do servidor quando o cadastro existir. priceCents/originalPriceCents
 * servem apenas para exibição e para a prévia do total (src/lib/guiaKit.ts).
 */
export interface BundleOffer {
  slug: string;
  name: string;
  /** Descrição curta — só copy. */
  description: string;
  /** Preço do kit (centavos). */
  priceCents: number;
  /** Soma dos itens comprados separadamente (centavos) — base do "De R$ 60". */
  originalPriceCents: number;
  /** Slugs dos produtos que o kit inclui. */
  memberSlugs: readonly string[];
}

export const GUIA_KIT_SLUG = "kit-completo-enfermagem-bump";

export const guiaKitOffer: BundleOffer = {
  slug: GUIA_KIT_SLUG,
  name: "Kit Completo de Enfermagem",
  description: "Os 6 materiais para apoiar seus estudos, concursos e rotina de enfermagem.",
  priceCents: 3990,
  originalPriceCents: 6000,
  memberSlugs: [
    "medicamentos-na-pratica",
    "mapa-mental-ilustrado",
    "balanco-hidrico-bump",
    "exames-laboratoriais",
    "dicionario-termos-tecnicos",
    "feridas-curativos-coberturas",
  ],
};

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

/**
 * Catálogo de Medicamentos na Prática (produto principal, slug
 * "medicamentos-na-pratica") e seus order bumps — landing dedicada em
 * /medicamentos-na-pratica (MedicamentosNaPraticaPage.tsx). Independente
 * dos blocos acima (nenhum deles foi alterado por este) — mesma disciplina
 * de preço, só que para outro produto/rota.
 *
 * "medicamentos-na-pratica" era kind='bump' no banco até esta landing ser
 * criada — passou a kind='primary' (mudança de dado, não de código) para
 * poder ser vendido sozinho por R$10 aqui. Continua funcionando normalmente
 * como adicional no Guia de Evolução e no Mapas Mentais (a RPC de checkout
 * aceita 1+ produtos kind='primary' no mesmo pedido).
 *
 * Os dois bumps aqui ("guia-evolucao-enfermagem" e "concursos-enfermagem")
 * são os mesmos produtos PRINCIPAIS de suas próprias landings — igual ao
 * padrão já usado em mapasMentaisBumps/guiaEvolucaoBumps, que também citam
 * produtos primary de outras landings como bump em contextos diferentes.
 */
export const medicamentosProduct = {
  slug: "medicamentos-na-pratica",
  name: "Medicamentos na Prática",
  priceCents: 1000,
  priceLabel: "R$ 10,00",
};

export const medicamentosBumps: DigitalBump[] = [
  {
    slug: "guia-evolucao-enfermagem",
    name: "Anotação e Evolução de Enfermagem",
    description: "Modelos prontos de evolução e anotação de enfermagem para consultar no plantão.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
  },
  {
    slug: "concursos-enfermagem",
    name: "Mapas Mentais",
    description: "Revise os principais assuntos de enfermagem de forma visual, rápida e organizada.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
  },
];

/**
 * Oferta combo "Guia de Anotação e Evolução + Medicamentos na Prática" —
 * landing dedicada em /guia-evolucao-medicamentos
 * (GuiaEvolucaoMedicamentosPage.tsx). Independente de guiaEvolucaoProduct/
 * guiaEvolucaoBumps e medicamentosProduct/medicamentosBumps acima (nenhum
 * foi alterado por este bloco).
 *
 * "combo-evolucao-medicamentos" é um produto PRINCIPAL próprio no banco,
 * com entrega vinculada (2 PDFs do Guia + 3 PDFs de Medicamentos). O
 * checkout desta landing envia SOMENTE [combo, ...bumps] — nunca os slugs
 * individuais do Guia/Medicamentos junto, senão o cliente seria cobrado
 * (e receberia) em duplicidade.
 *
 * comboEvolucaoMedicamentosProduct.priceCents é só FALLBACK visual. O preço
 * exibido prefere o catálogo público (get_active_product_catalog(), que só
 * lista produto active + catalog_status='ready'); o valor REALMENTE
 * cobrado é sempre o order.amountCents devolvido pelo backend.
 */
export const comboEvolucaoMedicamentosProduct = {
  slug: "combo-evolucao-medicamentos",
  name: "Guia de Anotação e Evolução + Medicamentos na Prática",
  priceCents: 1700,
  priceLabel: "R$ 17,00",
};

export const comboEvolucaoMedicamentosBumps: DigitalBump[] = [
  {
    slug: "mapa-mental-ilustrado",
    name: "Mapas Mentais para Concursos de Enfermagem",
    description: "Revise os principais assuntos de enfermagem de forma visual, rápida e organizada.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
  },
  {
    slug: "balanco-hidrico-bump",
    name: "Balanço Hídrico Ilustrado",
    description: "Aprenda a registrar entradas, saídas e calcular o saldo com exemplos práticos e modelos preenchidos.",
    priceCents: 1000,
    priceLabel: "R$ 10,00",
  },
];
