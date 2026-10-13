/**
 * Regra de seleção e preço (VISUAL) dos adicionais do Guia, incluindo a oferta
 * "Kit Completo". Funções puras — sem React, sem rede, sem acesso a navegador —
 * para a página e para scripts de verificação (scripts/verify-guia-kit.mjs).
 *
 * IMPORTANTE: isto NÃO é a fonte do preço cobrado. O valor real é sempre
 * derivado e validado pelo servidor (RPC create_or_get_product_order_with_items_efi);
 * aqui só se calcula a prévia exibida ao cliente, e nenhuma função recebe preço
 * vindo do navegador além da configuração estática (digitalProducts.ts) e do
 * preço base do produto principal.
 *
 * Regra de exclusividade: a seleção (selectedBumps) contém produtos
 * individuais OU somente o slug do kit — nunca o kit junto de individuais.
 */
import type { BundleOffer, DigitalBump } from "@/config/digitalProducts";

export type SelectionError =
  | "invalid_base_price"
  | "duplicate_slug"
  | "unknown_slug"
  | "kit_with_individual";

export type ValidSelection = {
  ok: true;
  /** true quando a seleção é exatamente o kit. */
  kitSelected: boolean;
  /** Slugs individuais (vazio quando o kit está selecionado). */
  individuals: string[];
};

export type SelectionValidation = ValidSelection | { ok: false; reason: SelectionError };

export type TotalResult = { ok: true; totalCents: number } | { ok: false; reason: SelectionError };

/** Valida uma seleção de adicionais (aceita arrays, para detectar slugs repetidos). */
export function validateSelection(
  selection: Iterable<string>,
  bumps: readonly DigitalBump[],
  kit: BundleOffer,
): SelectionValidation {
  const slugs = Array.from(selection);
  if (new Set(slugs).size !== slugs.length) return { ok: false, reason: "duplicate_slug" };

  const known = new Set(bumps.map((bump) => bump.slug));
  let kitSelected = false;
  const individuals: string[] = [];
  for (const slug of slugs) {
    if (slug === kit.slug) kitSelected = true;
    else if (known.has(slug)) individuals.push(slug);
    else return { ok: false, reason: "unknown_slug" };
  }
  if (kitSelected && individuals.length > 0) return { ok: false, reason: "kit_with_individual" };
  return { ok: true, kitSelected, individuals };
}

/** Total (centavos) = preço base + (kit OU soma dos individuais). */
export function computeTotalCents(
  basePriceCents: number,
  selection: Iterable<string>,
  bumps: readonly DigitalBump[],
  kit: BundleOffer,
): TotalResult {
  if (!Number.isSafeInteger(basePriceCents) || basePriceCents <= 0) return { ok: false, reason: "invalid_base_price" };
  const checked = validateSelection(selection, bumps, kit);
  if (!checked.ok) return checked;
  if (checked.kitSelected) return { ok: true, totalCents: basePriceCents + kit.priceCents };

  const priceBySlug = new Map(bumps.map((bump) => [bump.slug, bump.priceCents] as const));
  const extras = checked.individuals.reduce((sum, slug) => sum + (priceBySlug.get(slug) ?? 0), 0);
  return { ok: true, totalCents: basePriceCents + extras };
}

export function isKitSelected(selection: ReadonlySet<string>, kit: BundleOffer): boolean {
  return selection.has(kit.slug);
}

/**
 * Alterna um produto INDIVIDUAL. Com o kit ativo, ou para um slug desconhecido,
 * devolve a MESMA instância (nada muda — evita re-render e seleção ambígua).
 */
export function toggleIndividual(
  current: Set<string>,
  slug: string,
  bumps: readonly DigitalBump[],
  kit: BundleOffer,
): Set<string> {
  if (current.has(kit.slug)) return current;
  if (!bumps.some((bump) => bump.slug === slug)) return current;
  const next = new Set(current);
  if (next.has(slug)) next.delete(slug);
  else next.add(slug);
  return next;
}

/** Adicionar o kit substitui qualquer escolha individual (seleção = só o kit). */
export function addKit(kit: BundleOffer): Set<string> {
  return new Set([kit.slug]);
}

/** Remover o kit volta a nenhum adicional — nunca restaura escolhas antigas. */
export function removeKit(): Set<string> {
  return new Set();
}

/**
 * Slugs enviados ao checkout: [principal, ...individuais] ou [principal, kit].
 * Nunca inclui os seis membros junto do kit. Devolve null se a seleção for inválida.
 */
export function buildProductSlugs(
  primarySlug: string,
  selection: Iterable<string>,
  bumps: readonly DigitalBump[],
  kit: BundleOffer,
): string[] | null {
  const checked = validateSelection(selection, bumps, kit);
  if (!checked.ok) return null;
  if (checked.kitSelected) return [primarySlug, kit.slug];
  return [primarySlug, ...checked.individuals];
}

/**
 * Valores exibidos na promoção do pacote (Guia principal + kit), SEMPRE derivados
 * do preço base do produto principal e da configuração do kit — nunca números
 * duplicados. O cliente vê o pacote como um todo: normal = base + soma dos seis
 * separados; total = base + preço do kit (igual ao total do checkout).
 */
export interface BundleDisplay {
  /** Valor normal dos 7 materiais (centavos). */
  normalCents: number;
  /** Total promocional do pedido com o pacote (centavos). */
  totalCents: number;
  /** Economia total (centavos). */
  savingsCents: number;
}

export function getBundleDisplay(basePriceCents: number, kit: BundleOffer): BundleDisplay | null {
  if (!Number.isSafeInteger(basePriceCents) || basePriceCents <= 0) return null;
  const normalCents = basePriceCents + kit.originalPriceCents;
  const totalCents = basePriceCents + kit.priceCents;
  return { normalCents, totalCents, savingsCents: normalCents - totalCents };
}
