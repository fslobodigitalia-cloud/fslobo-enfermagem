import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BrandSettings = { name: string; primary_hex: string };
export type HeroSettings = {
  badge: string;
  title: string;
  subtitle: string;
  cta_label: string;
  cta_href: string;
  image_url: string;
};
export type LabelsSettings = {
  search_placeholder: string;
  bestsellers_title: string;
  launches_title: string;
  greeting: string;
};

export type SiteContent = {
  brand: BrandSettings;
  hero: HeroSettings;
  labels: LabelsSettings;
};

export const SITE_CONTENT_DEFAULTS: SiteContent = {
  brand: { name: "FSLobo", primary_hex: "#2563EB" },
  hero: {
    badge: "Novidade",
    title: "Prepare-se para o ENARE 2026",
    subtitle: "Combo completo com 35% off por tempo limitado.",
    cta_label: "Explorar",
    cta_href: "/categorias",
    image_url: "",
  },
  labels: {
    search_placeholder: "Pesquisar materiais...",
    bestsellers_title: "Mais vendidos",
    launches_title: "Lançamentos",
    greeting: "Olá,",
  },
};

export const SITE_CONTENT_KEYS = [
  "site.brand",
  "site.home.hero",
  "site.home.labels",
] as const;

export async function fetchSiteContent(): Promise<SiteContent> {
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", SITE_CONTENT_KEYS as unknown as string[])
    .eq("is_public", true)
    .is("deleted_at", null);

  const map = new Map<string, Record<string, unknown>>();
  for (const row of data ?? []) {
    map.set(row.key as string, (row.value ?? {}) as Record<string, unknown>);
  }
  return {
    brand: { ...SITE_CONTENT_DEFAULTS.brand, ...(map.get("site.brand") ?? {}) } as BrandSettings,
    hero: { ...SITE_CONTENT_DEFAULTS.hero, ...(map.get("site.home.hero") ?? {}) } as HeroSettings,
    labels: { ...SITE_CONTENT_DEFAULTS.labels, ...(map.get("site.home.labels") ?? {}) } as LabelsSettings,
  };
}

export function useSiteContent() {
  return useQuery({
    queryKey: ["site-content"],
    queryFn: fetchSiteContent,
    staleTime: 60_000,
    placeholderData: SITE_CONTENT_DEFAULTS,
  });
}