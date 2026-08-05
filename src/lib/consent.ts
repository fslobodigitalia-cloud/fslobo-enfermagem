/**
 * Consentimento de medição.
 *
 * O site funciona normalmente sem consentimento: nada de essencial depende
 * desta escolha. O Meta Pixel só é carregado depois de "granted".
 */

export type ConsentStatus = "granted" | "denied" | "unknown";

const STORAGE_KEY = "ent_consent_medicao";
const EVENT = "ent:consent-change";

const safeStorage = (): Storage | null => {
  try {
    const s = window.localStorage;
    const probe = "__ent_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
};

export function getConsent(): ConsentStatus {
  if (typeof window === "undefined") return "unknown";
  const value = safeStorage()?.getItem(STORAGE_KEY);
  return value === "granted" || value === "denied" ? value : "unknown";
}

export function setConsent(status: Exclude<ConsentStatus, "unknown">): void {
  safeStorage()?.setItem(STORAGE_KEY, status);
  window.dispatchEvent(new CustomEvent<ConsentStatus>(EVENT, { detail: status }));
}

export function onConsentChange(handler: (status: ConsentStatus) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<ConsentStatus>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export const hasConsent = (): boolean => getConsent() === "granted";
