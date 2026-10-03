/**
 * Fonte pública do catálogo institucional (Home "/", /materiais,
 * /produto/:slug) — Fase 2.
 *
 * Único ponto de leitura: a RPC pública `get_active_product_catalog()`
 * (`select ... from public.products where active and catalog_status =
 * 'ready' and kind = 'primary'`, já existente no banco). Nunca faz select
 * direto em `public.products` — a RPC é quem decide o que é seguro expor
 * publicamente (produto ativo, pronto, principal) e devolve só colunas de
 * apresentação (slug, name, description, short_description, category,
 * price_cents, currency, cover_url, display_order); nunca
 * storage_object_path, caminhos de PDF ou qualquer coluna administrativa.
 *
 * Usa exclusivamente o cliente de src/lib/supabase.ts (chave
 * publishable/anon do navegador — nunca service_role). Esta é uma leitura
 * pública read-only; não participa do checkout, que continua
 * exclusivamente em src/lib/productCheckout.ts (não alterado por este
 * arquivo).
 */
import { supabase } from "@/lib/supabase";

export interface PublicCatalogProduct {
  slug: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  category: string | null;
  priceCents: number;
  currency: string;
  coverUrl: string | null;
  displayOrder: number;
}

export type CatalogQueryResult =
  | { kind: "success"; products: PublicCatalogProduct[] }
  | { kind: "error" };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function mapRow(row: Record<string, unknown>): PublicCatalogProduct | null {
  if (
    !isNonEmptyString(row.slug) ||
    !isNonEmptyString(row.name) ||
    !isNullableString(row.description) ||
    !isNullableString(row.short_description) ||
    !isNullableString(row.category) ||
    typeof row.price_cents !== "number" ||
    !isNonEmptyString(row.currency) ||
    !isNullableString(row.cover_url) ||
    typeof row.display_order !== "number"
  ) {
    return null;
  }

  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    shortDescription: row.short_description,
    category: row.category,
    priceCents: row.price_cents,
    currency: row.currency,
    coverUrl: row.cover_url,
    displayOrder: row.display_order,
  };
}

/** Busca o catálogo público ativo. Nunca lança — falha vira `{ kind: "error" }`. */
export async function fetchActiveProductCatalog(): Promise<CatalogQueryResult> {
  const { data, error } = await supabase.rpc("get_active_product_catalog");

  if (error || !Array.isArray(data)) {
    return { kind: "error" };
  }

  const products: PublicCatalogProduct[] = [];
  for (const entry of data) {
    if (entry === null || typeof entry !== "object") return { kind: "error" };
    const product = mapRow(entry as Record<string, unknown>);
    if (product === null) return { kind: "error" };
    products.push(product);
  }

  return { kind: "success", products };
}

/** Formata centavos na moeda do produto, em pt-BR — nunca preço hardcoded. */
export function formatPriceCents(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
  } catch {
    // Moeda com código inválido/inesperado — fallback defensivo, nunca quebra a UI.
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  }
}

/**
 * O Guia de Evolução de Enfermagem já tem página própria e validada
 * (GuiaEvolucaoEnfermagemPage, não alterada por este arquivo) — aponta
 * para ela em vez de /produto/:slug, para não existirem duas páginas do
 * mesmo produto. Os demais produtos usam a rota dinâmica padrão.
 */
export function productRoute(slug: string): string {
  if (slug === "guia-evolucao-enfermagem") return "/guia-evolucao-enfermagem";
  // O combo também tem landing exclusiva e aprovada (GuiaEvolucaoMedicamentosPage);
  // /produto/combo-evolucao-medicamentos só redireciona para ela (ver App.tsx).
  if (slug === "combo-evolucao-medicamentos") return "/guia-evolucao-medicamentos";
  return `/produto/${slug}`;
}
