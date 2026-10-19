/**
 * Meta Pixel da landing do Resumo Ilustrado HUBRASIL — módulo próprio, no
 * mesmo padrão de src/lib/guiaPixel.ts e src/lib/cartPixel.ts (nenhum dos
 * dois é alterado aqui). Mesmo Pixel ID das demais páginas de produto e,
 * como elas, sem portão de consentimento: pixel carregado e PageView +
 * ViewContent disparados ao entrar na página.
 *
 * Eventos: PageView, ViewContent (ao entrar), InitiateCheckout (envio do
 * formulário) e Purchase (somente com pagamento confirmado pelo backend,
 * eventID = public_id do pedido, o mesmo event_id do Purchase da CAPI).
 */

const PIXEL_ID = "1646677629634348";
const PRODUCT_SLUG = "resumo-ilustrado-enfermagem";
const PRODUCT_NAME = "Apostila de Resumos de Enfermagem HUBRASIL";

type FbqParams = Record<string, string | number | string[]>;

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
      push?: unknown;
    };
    _fbq?: unknown;
  }
}

let initialized = false;

function injectScript(): void {
  if (window.fbq) return; // outro módulo de pixel (Guia/carrinho) já carregou o fbq
  if (document.getElementById("hubrasil-meta-pixel-script")) return;

  const fbq: any = function (...args: unknown[]) {
    fbq.callMethod ? fbq.callMethod.apply(fbq, args) : fbq.queue.push(args);
  };
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.push = fbq;
  window.fbq = window.fbq || fbq;
  window._fbq = window._fbq || window.fbq;

  const script = document.createElement("script");
  script.id = "hubrasil-meta-pixel-script";
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
}

function ensureInitialized(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  injectScript();
  window.fbq?.("init", PIXEL_ID);
}

function send(event: string, params?: FbqParams, options?: { eventID: string }): void {
  try {
    if (options) window.fbq?.("track", event, params, options);
    else window.fbq?.("track", event, params);
  } catch {
    // Uma falha do pixel nunca pode interromper a página nem o checkout.
  }
  if (import.meta.env.DEV) console.debug("[hubrasilPixel]", event, params ?? {}, options ?? {});
}

/** Converte centavos em reais com duas casas, sem artefatos de ponto flutuante. */
function centsToReais(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

/**
 * Identifica a "visita" atual: cada navegação do React Router grava uma
 * `key` em history.state, então re-execuções do efeito na MESMA entrada
 * (StrictMode, re-render) não duplicam eventos, enquanto voltar à página
 * por outra navegação conta como nova visualização (mesma regra do Guia).
 */
function currentVisitKey(): string {
  const stateKey = (window.history.state as { key?: string } | null)?.key;
  return `${window.location.pathname}|${stateKey ?? "initial"}`;
}

const trackedVisits = new Set<string>();

/**
 * Chamado ao montar a página. Script + fbq("init") acontecem uma vez por
 * carregamento do app; PageView + ViewContent, uma vez por visita.
 * `priceCents` é o preço de exibição no momento (catálogo ou fallback) —
 * só sinalização, nunca usado para cobrança.
 */
export function initHubrasilPixel(priceCents: number): void {
  if (typeof window === "undefined") return;
  ensureInitialized();

  const visit = currentVisitKey();
  if (trackedVisits.has(visit)) return;
  trackedVisits.add(visit);

  send("PageView");
  send("ViewContent", {
    content_ids: [PRODUCT_SLUG],
    content_name: PRODUCT_NAME,
    content_type: "product",
    value: centsToReais(priceCents),
    currency: "BRL",
  });
}

/**
 * Início efetivo do checkout — chamado quando o formulário foi validado
 * (inclui Turnstile) e antes de criar o pedido. `totalCents` é o total do
 * frontend (apostila + adicionais marcados), só sinalização. Cada envio
 * real do formulário é um sinal novo, como no Guia.
 */
export function trackHubrasilInitiateCheckout(totalCents: number, productSlugs: string[]): void {
  if (typeof window === "undefined") return;
  ensureInitialized();
  send("InitiateCheckout", {
    content_ids: productSlugs,
    content_type: "product",
    value: centsToReais(totalCents),
    currency: "BRL",
  });
}

/** Mesmo prefixo de guiaPixel/cartPixel: a chave inclui o public_id, único por pedido. */
const PURCHASE_SENT_PREFIX = "meta_purchase_sent_";

function hasPurchaseBeenSent(orderPublicId: string): boolean {
  try {
    return window.sessionStorage.getItem(PURCHASE_SENT_PREFIX + orderPublicId) === "1";
  } catch {
    // Sem sessionStorage a dedup real fica por conta do eventID (CAPI);
    // pior caso, um evento de navegador a mais, nunca uma conversão perdida.
    return false;
  }
}

function markPurchaseSent(orderPublicId: string): void {
  try {
    window.sessionStorage.setItem(PURCHASE_SENT_PREFIX + orderPublicId, "1");
  } catch {
    // Ver hasPurchaseBeenSent.
  }
}

export interface TrackHubrasilPurchaseInput {
  /** SEMPRE o public_id do pedido — o mesmo event_id do Purchase da CAPI. */
  orderPublicId: string;
  /** SEMPRE order.amountCents devolvido pelo backend ao criar o pedido. */
  amountCents: number;
  /** Slugs reais do pedido (order.items), apostila + adicionais. */
  productSlugs: string[];
}

/**
 * Pagamento CONFIRMADO pelo backend (get-order-downloads devolveu "paid").
 * Retorna true quando o Purchase foi (ou já tinha sido) enviado; false se
 * os dados forem inválidos ou o fbq não estiver disponível, caso em que
 * nada é marcado e uma nova tentativa é possível.
 */
export function trackHubrasilPurchase({ orderPublicId, amountCents, productSlugs }: TrackHubrasilPurchaseInput): boolean {
  if (typeof window === "undefined") return false;
  if (typeof orderPublicId !== "string" || orderPublicId.length === 0) return false;
  if (typeof amountCents !== "number" || !Number.isFinite(amountCents) || amountCents <= 0) return false;
  if (hasPurchaseBeenSent(orderPublicId)) return true;
  ensureInitialized();
  if (typeof window.fbq !== "function") return false;

  send(
    "Purchase",
    {
      content_ids: productSlugs,
      content_type: "product",
      value: centsToReais(amountCents),
      currency: "BRL",
    },
    { eventID: orderPublicId },
  );
  markPurchaseSent(orderPublicId);
  return true;
}
