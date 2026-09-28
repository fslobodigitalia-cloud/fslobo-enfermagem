/**
 * Meta Pixel dedicado à landing de Medicamentos na Prática
 * (/medicamentos-na-pratica). ISOLADO de guiaPixel.ts, mapasMentaisPixel.ts,
 * balancoHidricoPixel.ts e cartPixel.ts: módulo próprio, estado
 * module-level próprio (`initialized`/`firedOnce` aqui nunca são os mesmos
 * dos outros quatro), nenhum desses arquivos é importado ou alterado por
 * este.
 *
 * Mesmo Pixel ID já usado pelo projeto (mesma conta de anúncios da FSLobo
 * Enfermagem) — 1646677629634348 — mas o disparo de eventos desta landing
 * é inteiramente independente das demais.
 *
 * content_id próprio desta landing: "medicamentos-na-pratica" (o slug real
 * do produto no catálogo) — nunca reaproveita o content_id de outra
 * landing, mesmo quando o mesmo produto aparece como bump em outra página.
 *
 * Mesma estratégia já validada em produção por trackGuiaPurchase()/
 * trackMapasMentaisPurchase()/trackBalancoHidricoPurchase(): eventID = o
 * MESMO order.publicId usado pelo backend (efi-webhook-prod) como event_id
 * na Meta Conversions API — dedupe browser + servidor —, guardado em
 * sessionStorage por public_id, só marcado como enviado DEPOIS do fbq real
 * disparar.
 */

const PIXEL_ID = "1646677629634348";
const PRODUCT_SLUG = "medicamentos-na-pratica";
const PRODUCT_NAME = "Medicamentos na Prática";
const FBEVENTS_SRC_FRAGMENT = "connect.facebook.net/en_US/fbevents.js";

type FbqParams = Record<string, unknown>;

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

/** Converte centavos em reais com duas casas, sem artefatos de ponto flutuante — mesmo utilitário já usado nos outros módulos de pixel (função própria, não importada, para manter este módulo isolado). */
function centsToReais(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

function isFbeventsScriptPresent(): boolean {
  const scripts = document.getElementsByTagName("script");
  for (let i = 0; i < scripts.length; i++) {
    const src = scripts[i].getAttribute("src");
    if (src && src.includes(FBEVENTS_SRC_FRAGMENT)) return true;
  }
  return false;
}

function injectScript(): void {
  if (typeof window !== "undefined" && window.fbq) return;
  if (isFbeventsScriptPresent()) return;

  /* Stub oficial do Meta, escrito de forma explícita — mesmo padrão dos outros módulos de pixel. */
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
  script.id = "medicamentos-na-pratica-meta-pixel-script";
  script.async = true;
  script.src = `https://${FBEVENTS_SRC_FRAGMENT}`;
  document.head.appendChild(script);
}

/**
 * A chamada real ao fbq é envolvida em try/catch — mesma disciplina
 * defensiva dos outros módulos de pixel: um bloqueador de privacidade nunca
 * pode derrubar o efeito que dispara o Purchase, nem impedir o
 * trackTikTokPurchase IRMÃO de rodar.
 */
function send(kind: "track" | "trackCustom", event: string, params?: FbqParams, options?: Record<string, unknown>): void {
  try {
    if (options) window.fbq?.(kind, event, params, options);
    else window.fbq?.(kind, event, params);
  } catch {
    return;
  }
  if (import.meta.env.DEV) console.debug("[medicamentosPixel]", kind, event, params ?? {}, options ?? {});
}

/** content_ids/content_name/content_type reaproveitados por todo evento com produto identificado — sempre o mesmo produto desta landing. */
function productContentParams(): FbqParams {
  return { content_ids: [PRODUCT_SLUG], content_name: PRODUCT_NAME, content_type: "product" };
}

/**
 * Injeta o script (se necessário), inicializa o pixel e dispara
 * PageView + ViewContent — chamado uma vez ao montar a página (guardado
 * por `initialized`, então um segundo useEffect/StrictMode double-invoke
 * não duplica nada). `priceCents` é o preço de EXIBIÇÃO no momento do
 * carregamento (catálogo já resolvido, ou fallback de
 * medicamentosProduct.priceCents) — só para sinalização em ViewContent,
 * nunca usado para cobrança real.
 */
export function initMedicamentosPixel(priceCents: number): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  injectScript();
  try {
    window.fbq?.("init", PIXEL_ID);
    window.fbq?.("track", "PageView");
  } catch {
    // Mesma disciplina defensiva de send() abaixo — nunca deixa uma falha
    // do pixel interromper a montagem da página.
  }
  send("track", "ViewContent", {
    ...productContentParams(),
    currency: "BRL",
    value: centsToReais(priceCents),
  });
}

/**
 * Início efetivo do checkout — disparar quando o formulário é submetido
 * com sucesso (validação + Turnstile ok), logo antes de chamar
 * create-product-order-efi-prod. totalCents é o total calculado no
 * FRONTEND (produto + bumps marcados) só para sinalização de intenção —
 * nunca usado para cobrança real. Cada envio real do formulário dispara
 * um evento novo — não é deduplicado, cada tentativa é um sinal legítimo.
 */
export function trackMedicamentosInitiateCheckout(totalCents: number): void {
  send("track", "InitiateCheckout", { ...productContentParams(), value: centsToReais(totalCents), currency: "BRL" });
}

/** Prefixo de sessionStorage que marca um pedido como já enviado ao Pixel — mesma convenção dos outros módulos de pixel (orderPublicId já garante unicidade por pedido, então reaproveitar o mesmo prefixo entre módulos é seguro). */
const PURCHASE_SENT_PREFIX = "meta_purchase_sent_";

function hasPurchaseBeenSent(orderPublicId: string): boolean {
  try {
    return window.sessionStorage.getItem(PURCHASE_SENT_PREFIX + orderPublicId) === "1";
  } catch {
    return false;
  }
}

function markPurchaseSent(orderPublicId: string): void {
  try {
    window.sessionStorage.setItem(PURCHASE_SENT_PREFIX + orderPublicId, "1");
  } catch {
    // Sem persistência disponível — segue sem marcar, ver hasPurchaseBeenSent.
  }
}

export interface TrackMedicamentosPurchaseInput {
  /** SEMPRE order.publicId — o mesmo valor usado pelo backend (efi-webhook-prod) como event_id na Conversions API. Nunca um UUID novo, checkoutRequestId, txid da Efí ou id interno do banco. */
  orderPublicId: string;
  /** SEMPRE order.amountCents devolvido por create-product-order-efi-prod — nunca recalculado/estimado no frontend. */
  amountCents: number;
}

/**
 * Pagamento CONFIRMADO — único ponto do frontend que pode disparar
 * fbq('track', 'Purchase', ...) para esta landing. Só deve ser chamada
 * quando get-order-downloads já devolveu status "paid" (nunca em
 * pending_payment/waiting, nunca no clique do botão, nunca ao gerar o QR
 * Code, nunca ao reconstruir a tela de downloads após F5 sem um valor real
 * confirmado NESTA sessão).
 *
 * Retorno: true só quando o Purchase foi (ou já tinha sido) realmente
 * enviado pelo fbq — false em qualquer outro caso.
 */
export function trackMedicamentosPurchase({ orderPublicId, amountCents }: TrackMedicamentosPurchaseInput): boolean {
  if (typeof window === "undefined") return false;
  if (typeof orderPublicId !== "string" || orderPublicId.length === 0) return false;
  if (typeof amountCents !== "number" || !Number.isFinite(amountCents) || amountCents <= 0) return false;
  if (hasPurchaseBeenSent(orderPublicId)) return true;
  if (typeof window.fbq !== "function") return false; // não marca como enviado sem realmente disparar

  const value = centsToReais(amountCents);
  const currency = "BRL";
  send("track", "Purchase", { ...productContentParams(), value, currency }, { eventID: orderPublicId });
  markPurchaseSent(orderPublicId);

  return true;
}
