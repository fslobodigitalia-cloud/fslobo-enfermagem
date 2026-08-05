/**
 * Captura e preservação de parâmetros de campanha.
 *
 * Os parâmetros são lidos da URL na primeira visita da sessão e guardados no
 * sessionStorage, de modo que sobrevivem à navegação interna (páginas legais)
 * e continuam disponíveis no momento do clique para o WhatsApp.
 */

export const TRACKED_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
] as const;

export type TrackedParam = (typeof TRACKED_PARAMS)[number];
export type CampaignParams = Partial<Record<TrackedParam, string>>;

const STORAGE_KEY = "ent_campanha";

const safeSession = (): Storage | null => {
  try {
    const s = window.sessionStorage;
    const probe = "__ent_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
};

function read(): CampaignParams {
  try {
    const raw = safeSession()?.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CampaignParams) : {};
  } catch {
    return {};
  }
}

/**
 * Lê a URL atual e mescla os parâmetros encontrados com os já armazenados.
 * Deve ser chamada uma vez no carregamento da aplicação.
 */
export function captureCampaignParams(): CampaignParams {
  if (typeof window === "undefined") return {};

  const stored = read();
  const url = new URLSearchParams(window.location.search);
  let changed = false;

  for (const key of TRACKED_PARAMS) {
    const value = url.get(key);
    if (value && value !== stored[key]) {
      // Limite defensivo de tamanho para evitar lixo em query strings.
      stored[key] = value.slice(0, 200);
      changed = true;
    }
  }

  if (changed) {
    try {
      safeSession()?.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      /* Armazenamento indisponível: seguimos apenas com os dados em memória. */
    }
  }

  return stored;
}

export const getCampaignParams = (): CampaignParams => read();

/** Aplica os parâmetros preservados a uma URL de saída. */
export function appendCampaignParams(url: string): string {
  const params = getCampaignParams();
  const entries = Object.entries(params).filter(([, v]) => Boolean(v));
  if (entries.length === 0) return url;

  const target = new URL(url);
  for (const [key, value] of entries) target.searchParams.set(key, value as string);
  return target.toString();
}

/** Mantém os parâmetros ao navegar entre rotas internas (páginas legais). */
export function withCampaignQuery(path: string): string {
  const params = getCampaignParams();
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
