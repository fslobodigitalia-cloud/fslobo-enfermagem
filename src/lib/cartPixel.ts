/**
 * Meta Pixel do catálogo/carrinho — Etapa 2 (frontend). ISOLADO de
 * src/lib/guiaPixel.ts: módulo próprio, estado module-level próprio
 * (`initialized`/`firedOnce` aqui nunca são os mesmos de guiaPixel.ts),
 * nenhum arquivo do Guia é importado ou alterado por este. Mesmo ID de
 * Pixel (é a mesma conta de anúncios da FSLobo Enfermagem), mas o disparo
 * de eventos é inteiramente independente — visitar o catálogo/carrinho
 * nunca consome a guarda de "já inicializado" do Guia, e vice-versa, então
 * o PageView/ViewContent/Purchase da página do Guia continuam disparando
 * exatamente como antes (não foi tocado por esta etapa).
 *
 * injectScript() verifica `window.fbq` (não só o id do <script>) antes de
 * criar uma tag nova — evita carregar fbevents.js duas vezes se o Guia já
 * tiver carregado o script nesta mesma sessão de navegação (SPA, módulos
 * carregados uma única vez).
 *
 * trackCartPurchase() segue EXATAMENTE a mesma estratégia já validada em
 * produção por trackGuiaPurchase() (src/lib/guiaPixel.ts, não alterado por
 * este arquivo): eventID = order.public_id (o mesmo valor que o webhook
 * efi-webhook-prod já usa como event_id no Purchase da Conversions API —
 * é essa igualdade, e só ela, que permite a Meta deduplicar os dois
 * envios do mesmo evento), guarda em sessionStorage por public_id
 * (sobrevive a polling/re-render/StrictMode/reabertura da tela dentro da
 * mesma aba) e só marca como enviado DEPOIS de o fbq real ter disparado.
 */

const PIXEL_ID = "1646677629634348";

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
  if (typeof window !== "undefined" && window.fbq) return;
  if (document.getElementById("cart-meta-pixel-script")) return;

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
  script.id = "cart-meta-pixel-script";
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

function centsToReais(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

/** Disparado ao adicionar um produto ao carrinho (ProductPage/ProductCard). */
export function trackCartAddToCart(product: { slug: string; priceCents: number }): void {
  ensureInitialized();
  window.fbq?.("track", "AddToCart", {
    content_ids: [product.slug],
    content_type: "product",
    value: centsToReais(product.priceCents),
    currency: "BRL",
  });
}

/** Prefixo da chave de sessionStorage que marca o InitiateCheckout do carrinho como já enviado nesta tentativa. */
const INITIATE_CHECKOUT_SENT_PREFIX = "meta_cart_initiate_checkout_sent_";

/**
 * Disparado exatamente uma vez por tentativa de checkout do carrinho — ao
 * clicar em "Continuar para pagamento" (formulário revelado), antes de
 * chamar create-product-order-efi-prod. `checkoutRequestId` marca a
 * tentativa (mesmo UUID gerado por useCheckoutAttempt) — reabrir a mesma
 * tentativa (retry, F5) não duplica o evento.
 */
export function trackCartInitiateCheckout(checkoutRequestId: string, totalCents: number, slugs: string[]): void {
  if (typeof window === "undefined") return;
  const key = INITIATE_CHECKOUT_SENT_PREFIX + checkoutRequestId;
  try {
    if (window.sessionStorage.getItem(key) === "1") return;
  } catch {
    // sessionStorage indisponível — segue e tenta disparar mesmo assim;
    // pior caso é um evento a mais, nunca uma perda de sinal.
  }

  ensureInitialized();
  window.fbq?.("track", "InitiateCheckout", {
    content_ids: slugs,
    content_type: "product",
    value: centsToReais(totalCents),
    currency: "BRL",
  });

  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // ver nota acima.
  }
}

/** Mesmo prefixo já usado por src/lib/guiaPixel.ts — nunca colide entre os
 * dois fluxos porque a chave inclui orderPublicId, um UUID gerado pelo
 * backend por pedido (nunca reaproveitado entre um pedido do Guia e um
 * pedido do carrinho). */
const PURCHASE_SENT_PREFIX = "meta_purchase_sent_";

function hasCartPurchaseBeenSent(orderPublicId: string): boolean {
  try {
    return window.sessionStorage.getItem(PURCHASE_SENT_PREFIX + orderPublicId) === "1";
  } catch {
    // sessionStorage indisponível — trata como "ainda não enviado"; a
    // dedup real acontece no CAPI via eventID, então o pior caso aqui é um
    // evento de browser a mais, nunca uma perda de conversão.
    return false;
  }
}

function markCartPurchaseSent(orderPublicId: string): void {
  try {
    window.sessionStorage.setItem(PURCHASE_SENT_PREFIX + orderPublicId, "1");
  } catch {
    // Sem persistência disponível — segue sem marcar, ver hasCartPurchaseBeenSent.
  }
}

export interface TrackCartPurchaseInput {
  /** SEMPRE order.publicId devolvido por create-product-order-efi-prod —
   * o MESMO valor usado pelo backend como event_id no Purchase enviado
   * pela Conversions API (efi-webhook-prod). Nunca um UUID novo, nunca
   * checkout_request_id, nunca txid da Efí, nunca id interno do banco. */
  orderPublicId: string;
  /** SEMPRE order.amountCents devolvido por create-product-order-efi-prod
   * (soma de products.price_cents feita no backend) — nunca o subtotal do
   * CartContext/localStorage. */
  amountCents: number;
  /** Slugs efetivamente associados ao pedido (order.items.map(i => i.slug),
   * da resposta de criação do pedido) — nunca os slugs atuais do carrinho
   * (que podem já ter mudado quando o Purchase dispara). */
  productSlugs: string[];
}

/**
 * Pagamento CONFIRMADO — único ponto do frontend que pode disparar
 * fbq('track', 'Purchase', ...) para o carrinho. Só deve ser chamada
 * quando get-order-downloads já devolveu status "paid" (nunca em
 * pending_payment, nunca no clique de "Continuar para pagamento", nunca ao
 * gerar o QR Code).
 *
 * Retorno: true só quando o Purchase foi (ou já tinha sido) realmente
 * enviado pelo fbq — false em qualquer outro caso (dados inválidos, ou fbq
 * indisponível no momento da chamada). O chamador deve usar esse retorno
 * para decidir se pode marcar sua própria guarda de "já disparado": se vier
 * false, uma tentativa futura (ex.: próximo tick do polling) deve poder
 * chamar de novo — mesmo contrato de trackGuiaPurchase().
 */
export function trackCartPurchase({ orderPublicId, amountCents, productSlugs }: TrackCartPurchaseInput): boolean {
  if (typeof window === "undefined") return false;
  if (typeof orderPublicId !== "string" || orderPublicId.length === 0) return false;
  if (typeof amountCents !== "number" || !Number.isFinite(amountCents) || amountCents <= 0) return false;
  if (!Array.isArray(productSlugs) || productSlugs.length === 0) return false;
  if (hasCartPurchaseBeenSent(orderPublicId)) return true;
  if (typeof window.fbq !== "function") return false; // não marca como enviado sem realmente disparar

  const value = centsToReais(amountCents);
  window.fbq(
    "track",
    "Purchase",
    { value, currency: "BRL", content_ids: productSlugs, content_type: "product" },
    { eventID: orderPublicId },
  );
  markCartPurchaseSent(orderPublicId);

  if (import.meta.env.DEV) {
    console.debug("[cartPixel] Purchase enviado", { eventID: orderPublicId, value, content_ids: productSlugs });
  }

  return true;
}
