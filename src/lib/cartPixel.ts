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
 * Escopo desta etapa (Etapa 2): somente AddToCart e InitiateCheckout, por
 * instrução explícita. Nenhum Purchase é disparado por este módulo — o
 * Purchase do carrinho fica para uma etapa futura, deliberadamente fora
 * daqui.
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
