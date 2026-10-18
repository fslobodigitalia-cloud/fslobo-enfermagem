import type { DigitalBump } from "@/config/digitalProducts";

/** Display-only total. The backend remains authoritative for price and delivery. */
export function buildBumpCheckout(
  primarySlug: string,
  basePriceCents: number,
  selection: Iterable<string>,
  bumps: readonly DigitalBump[],
): { productSlugs: string[]; totalCents: number } | null {
  if (!primarySlug || !Number.isSafeInteger(basePriceCents) || basePriceCents <= 0) return null;
  const selected = Array.from(selection);
  if (new Set(selected).size !== selected.length) return null;
  const known = new Set(bumps.map(bump => bump.slug));
  if (known.size !== bumps.length || known.has(primarySlug)) return null;
  if (selected.some(slug => !known.has(slug))) return null;
  const chosen = bumps.filter(bump => selected.includes(bump.slug));
  if (chosen.some(bump => !Number.isSafeInteger(bump.priceCents) || bump.priceCents <= 0)) return null;
  const totalCents = chosen.reduce((sum, bump) => sum + bump.priceCents, basePriceCents);
  if (!Number.isSafeInteger(totalCents)) return null;
  // Stable catalog order keeps the checkout fingerprint independent of click order.
  return { productSlugs: [primarySlug, ...chosen.map(bump => bump.slug)], totalCents };
}
