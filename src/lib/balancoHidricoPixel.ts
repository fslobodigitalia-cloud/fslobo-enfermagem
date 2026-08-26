/**
 * Meta Pixel dedicado à landing do Balanço Hídrico Ilustrado
 * (/balanco-hidrico). ISOLADO de src/lib/guiaPixel.ts, src/lib/cartPixel.ts
 * e src/lib/mapasMentaisPixel.ts: módulo próprio, estado module-level
 * próprio (`initialized`/`firedOnce` aqui nunca são os mesmos dos outros
 * três), nenhum desses arquivos é importado ou alterado por este — mesmo
 * padrão comprovado de src/lib/mapasMentaisPixel.ts (copiado
 * deliberadamente, não reaproveitado por import).
 *
 * Mesmo Pixel ID já usado pelo projeto (mesma conta de anúncios da FSLobo
 * Enfermagem) — 1646677629634348 — mas o disparo de eventos desta landing
 * é inteiramente independente: visitar esta página nunca consome a guarda
 * de "já inicializado" do Guia/carrinho/Mapas Mentais, e vice-versa.
 *
 * injectScript() evita uma segunda cópia do script fbevents.js de duas
 * formas, na ordem: (1) se `window.fbq` já existe (outra landing já
 * carregou nesta sessão de navegação), não faz nada; (2) varre
 * document.scripts procurando qualquer <script> cujo src já contenha
 * "connect.facebook.net/en_US/fbevents.js" — só insere uma tag nova se
 * nenhuma das duas condições for verdadeira.
 *
 * trackBalancoHidricoPurchase() segue a mesma estratégia já validada em
 * produção por trackGuiaPurchase()/trackCartPurchase()/
 * trackMapasMentaisPurchase(): eventID = o MESMO order.publicId usado pelo
 * backend como event_id na Conversions API (dedupe browser + servidor),
 * guarda em sessionStorage por public_id (prefixo "meta_purchase_sent_"
 * REAPROVEITADO de propósito — mesma convenção de mapasMentaisPixel.ts:
 * orderPublicId já garante unicidade por pedido entre landings, então
 * reaproveitar o prefixo é seguro), só marcada como enviada DEPOIS do fbq
 * real disparar.
 */

const PIXEL_ID = "1646677629634348";
const PRODUCT_SLUG = "balanco-hidrico";
const PRODUCT_NAME = "Balanço Hídrico Ilustrado";
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
/** Evita reenviar o mesmo evento único (ex.: Lead, QuizInterest) em re-renders/StrictMode. */
const firedOnce = new Set<string>();

/** Converte centavos em reais com duas casas, sem artefatos de ponto flutuante — mesmo utilitário já usado em guiaPixel.ts/cartPixel.ts/mapasMentaisPixel.ts (função própria, não importada, para manter este módulo isolado). */
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

  /* Stub oficial do Meta, escrito de forma explícita — mesmo padrão dos outros três módulos de pixel. */
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
  script.id = "balanco-hidrico-meta-pixel-script";
  script.async = true;
  script.src = `https://${FBEVENTS_SRC_FRAGMENT}`;
  document.head.appendChild(script);
}

/**
 * A chamada real ao fbq é envolvida em try/catch — mesma disciplina
 * defensiva de mapasMentaisPixel.ts/tiktokPixel.ts: um bloqueador de
 * privacidade que substitui window.fbq por um stub que lança exceção ao
 * ser chamado nunca pode derrubar o efeito que dispara o Purchase, o que
 * impediria o trackTikTokPurchase IRMÃO de rodar (ver useEffect de
 * Purchase em BalancoHidricoPage.tsx — Meta e TikTok precisam de guardas
 * totalmente independentes).
 */
function send(kind: "track" | "trackCustom", event: string, params?: FbqParams, options?: Record<string, unknown>): void {
  try {
    if (options) window.fbq?.(kind, event, params, options);
    else window.fbq?.(kind, event, params);
  } catch {
    // Nunca deixa uma falha do pixel (extensão bloqueando, SDK inconsistente
    // etc.) quebrar a UX nem interromper outro rastreamento independente.
    return;
  }
  if (import.meta.env.DEV) console.debug("[balancoHidricoPixel]", kind, event, params ?? {}, options ?? {});
}

function sendOnce(key: string, kind: "track" | "trackCustom", event: string, params?: FbqParams): void {
  if (firedOnce.has(key)) return;
  firedOnce.add(key);
  send(kind, event, params);
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
 * carregamento (fallback estático, já que o produto está inativo no
 * catálogo público — ver comentário em digitalProducts.ts) — só para
 * sinalização em ViewContent, nunca usado para cobrança real.
 */
export function initBalancoHidricoPixel(priceCents: number): void {
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

/** Perfil identificado ao final do quiz — marco de intenção qualificada. */
export function trackBalancoHidricoLead(priceCents: number): void {
  sendOnce("lead", "track", "Lead", { ...productContentParams(), value: centsToReais(priceCents), currency: "BRL" });
}

/** Clique no CTA do resultado do quiz — leva à oferta. */
export function trackBalancoHidricoQuizInterest(): void {
  sendOnce("quiz-interest", "trackCustom", "QuizInterest", productContentParams());
}

/**
 * Início efetivo do checkout — disparar quando o formulário é submetido
 * com sucesso (validação + Turnstile ok), logo antes de chamar
 * create-product-order-efi-prod. totalCents é o total calculado no
 * FRONTEND (produto + bumps marcados) só para sinalização de intenção —
 * nunca usado para cobrança real. Cada envio real do formulário dispara
 * um evento novo — não é deduplicado, cada tentativa é um sinal legítimo.
 */
export function trackBalancoHidricoInitiateCheckout(totalCents: number): void {
  send("track", "InitiateCheckout", { ...productContentParams(), value: centsToReais(totalCents), currency: "BRL" });
}

/** Prefixo de sessionStorage que marca um pedido como já enviado ao Pixel — mesma convenção de guiaPixel.ts/cartPixel.ts/mapasMentaisPixel.ts (orderPublicId já garante unicidade por pedido, então reaproveitar o mesmo prefixo entre módulos é seguro). */
const PURCHASE_SENT_PREFIX = "meta_purchase_sent_";

function hasPurchaseBeenSent(orderPublicId: string): boolean {
  try {
    return window.sessionStorage.getItem(PURCHASE_SENT_PREFIX + orderPublicId) === "1";
  } catch {
    // sessionStorage indisponível — trata como "ainda não enviado"; a dedup
    // real acontece no CAPI via eventID, então o pior caso é um evento de
    // browser a mais, nunca uma perda de conversão.
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

export interface TrackBalancoHidricoPurchaseInput {
  /** SEMPRE order.publicId — o mesmo valor usado pelo backend como event_id na Conversions API. Nunca um UUID novo, checkoutRequestId, txid da Efí ou id interno do banco. */
  orderPublicId: string;
  /** SEMPRE order.amountCents devolvido por create-product-order-efi-prod — nunca recalculado/estimado no frontend. */
  amountCents: number;
}

/**
 * Pagamento CONFIRMADO — único ponto do frontend que pode disparar
 * fbq('track', 'Purchase', ...) para esta landing. Só deve ser chamada
 * quando get-order-downloads já devolveu status "paid" (nunca em
 * pending_payment/waiting, nunca no clique do botão, nunca ao gerar o QR
 * Code).
 *
 * Retorno: true só quando o Purchase foi (ou já tinha sido) realmente
 * enviado pelo fbq — false em qualquer outro caso. O chamador deve usar
 * esse retorno para decidir se pode marcar sua própria guarda de "já
 * disparado": se vier false, uma tentativa futura (próximo tick do
 * polling) deve poder chamar de novo — impede Purchase duplicado na mesma
 * sessão sem nunca perder um envio legítimo.
 */
export function trackBalancoHidricoPurchase({ orderPublicId, amountCents }: TrackBalancoHidricoPurchaseInput): boolean {
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
