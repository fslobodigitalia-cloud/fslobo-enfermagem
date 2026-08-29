/**
 * Detecção pura de navegador interno (in-app browser) do Instagram/
 * Facebook/Messenger + plataforma (iOS/Android), usada só para decidir se
 * mostramos a orientação de download em InAppDownloadNotice.tsx.
 *
 * NUNCA armazena, envia ou registra o User-Agent — a string é lida uma
 * única vez, em memória, só para decidir um resultado booleano/enum
 * descartado ao fim da função; nenhuma chamada de rede, nenhum
 * `console.log`, nenhuma escrita em localStorage/sessionStorage acontece
 * aqui. Todo acesso a `navigator` é protegido (funciona também em SSR/
 * testes onde `navigator` pode não existir).
 *
 * Detecção de in-app browser é inerentemente uma heurística baseada em
 * substrings conhecidas do User-Agent — os identificadores abaixo
 * (Instagram, FBAN/FBAV/FB_IAB para Facebook, Messenger) são os mesmos já
 * documentados publicamente por essas plataformas e amplamente usados
 * para esse fim; navegadores internos futuros ou não listados caem no
 * fallback "navegador interno desconhecido" tratado por
 * OTHER_IN_APP_HINTS, nunca ficam sem tratamento nenhum quando
 * minimamente identificáveis como WebView.
 */

export type InAppBrowserKind = "instagram" | "facebook" | "messenger" | "other" | null;
export type DevicePlatform = "ios" | "android" | "other";

export interface BrowserEnvironment {
  /** null quando NÃO é um navegador interno reconhecido — caso em que a orientação nunca deve aparecer. */
  inAppBrowser: InAppBrowserKind;
  platform: DevicePlatform;
}

const INSTAGRAM_HINTS = ["instagram"];
const FACEBOOK_HINTS = ["fban", "fbav", "fb_iab", "fbios", "fb4a"];
const MESSENGER_HINTS = ["messenger"];
/** Outros WebViews in-app conhecidos que não são Instagram/Facebook/Messenger — tratados como fallback genérico (item 4: "outro navegador interno detectado"). */
const OTHER_IN_APP_HINTS = ["line/", "twitter", "tiktok", "wv)", "; wv"];

function safeLowerUserAgent(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (typeof ua !== "string" || ua.length === 0) return null;
  return ua.toLowerCase();
}

function detectInAppBrowser(uaLower: string): InAppBrowserKind {
  if (INSTAGRAM_HINTS.some((hint) => uaLower.includes(hint))) return "instagram";
  if (FACEBOOK_HINTS.some((hint) => uaLower.includes(hint))) return "facebook";
  if (MESSENGER_HINTS.some((hint) => uaLower.includes(hint))) return "messenger";
  if (OTHER_IN_APP_HINTS.some((hint) => uaLower.includes(hint))) return "other";
  return null;
}

function detectPlatform(uaLower: string): DevicePlatform {
  // iPadOS 13+ costuma se identificar como Macintosh com suporte a touch —
  // maxTouchPoints > 1 é o sinal padrão para diferenciar de um Mac real.
  const isIPadOsDisguisedAsMac =
    uaLower.includes("macintosh") && typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 1;
  if (uaLower.includes("iphone") || uaLower.includes("ipad") || uaLower.includes("ipod") || isIPadOsDisguisedAsMac) {
    return "ios";
  }
  if (uaLower.includes("android")) return "android";
  return "other";
}

/**
 * Lê `navigator.userAgent` UMA vez e devolve a classificação. Fora de um
 * navegador (SSR, testes sem jsdom) devolve `{ inAppBrowser: null,
 * platform: "other" }` — nunca lança.
 */
export function getBrowserEnvironment(): BrowserEnvironment {
  const uaLower = safeLowerUserAgent();
  if (uaLower === null) return { inAppBrowser: null, platform: "other" };
  return { inAppBrowser: detectInAppBrowser(uaLower), platform: detectPlatform(uaLower) };
}

/**
 * `true` somente quando a cliente está em iOS/iPadOS DENTRO do navegador
 * interno do Instagram, Facebook ou Messenger — o único cenário em que o
 * disparo automático de download (`link.click()`) é conhecido por falhar
 * silenciosamente (o WebView exibe/compartilha a signed URL em vez de
 * apresentar o PDF). `false` para Safari/Chrome normais, para Android
 * (mesmo dentro do Instagram/Facebook/Messenger — lá o clique automático
 * funciona), para outros navegadores internos (TikTok, Twitter/X, WebView
 * genérico) e para qualquer ambiente sem `navigator` (SSR/testes).
 *
 * Função pura no sentido de que não lê nada além de `navigator.userAgent`
 * (via getBrowserEnvironment/safeLowerUserAgent, já protegidos) e não
 * produz nenhum efeito colateral (nada é registrado ou armazenado).
 */
export function isMetaInAppIOSBrowser(env: BrowserEnvironment = getBrowserEnvironment()): boolean {
  return (
    env.platform === "ios" &&
    (env.inAppBrowser === "instagram" || env.inAppBrowser === "facebook" || env.inAppBrowser === "messenger")
  );
}
