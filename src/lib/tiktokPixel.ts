/**
 * TikTok Pixel — Fase 1 (frontend). ISOLADO de src/lib/cartPixel.ts e
 * src/lib/guiaPixel.ts: módulo próprio, nenhum desses arquivos é
 * importado/alterado por este, e nenhuma chamada TikTok foi colocada
 * dentro deles — em todo ponto de disparo, o TikTok é sempre uma chamada
 * IRMÃ do trackCart.../trackGuia... já existente, nunca uma substituição.
 *
 * O código base do TikTok Pixel (ttq.load + ttq.page(), Pixel ID
 * DA54HFRC77U74C4QRNKG, público) já está em index.html — este módulo NUNCA
 * carrega o script nem chama ttq.load/ttq.page de novo, só lê
 * `window.ttq` (que o SDK oficial substitui pelo objeto real assim que
 * events.js termina de carregar) e chama `ttq.track(...)`.
 *
 * PageView: cuidado inteiramente pelo próprio SDK do TikTok em mudanças de
 * rota do SPA a partir da única chamada `ttq.page()` em index.html — este
 * módulo não dispara PageView.
 *
 * Escopo até a Fase 1: ViewContent, AddToCart, InitiateCheckout. A Fase 2
 * final acrescenta Purchase (browser) — SEMPRE com event_id = order.public_id
 * (idêntico ao Purchase enviado pela TikTok Events API em
 * efi-webhook-prod, para dedupe) — deduplicado via sessionStorage no mesmo
 * padrão já validado por trackCartPurchase (src/lib/cartPixel.ts). Nunca
 * PlaceAnOrder/CompletePayment. Advanced Matching
 * (ttclid/_ttp/IP/User-Agent/e-mail/ttq.identify) segue fora do escopo.
 *
 * Todos os wrappers são defensivos: se `window.ttq` ainda não existir
 * (script bloqueado, ainda carregando, SSR/testes), a chamada é
 * simplesmente ignorada — nunca lança, nunca quebra a UX. `ttq` empilha
 * chamadas internamente antes do SDK real carregar (mesmo padrão de fila
 * do fbq), mas como o objeto stub só existe dentro do script inline de
 * index.html (não replicado aqui), esses wrappers preferem checar a
 * presença de `window.ttq` explicitamente antes de chamar.
 *
 * Sintaxe de event_id confirmada na documentação oficial do TikTok Pixel:
 * terceiro argumento de `ttq.track(event, properties, { event_id })` — é
 * essa assinatura (não um campo dentro de `properties`) que o SDK usa para
 * a dedupe entre Pixel (browser) e Events API (servidor).
 */

export interface TikTokContentItem {
  content_id: string;
  content_name: string;
  content_category?: string;
  quantity: number;
  /** Opcional: no Purchase, a resposta de createProductOrder só traz slug/name por item (nunca preço individual) — omitido em vez de inventado. */
  price?: number;
}

declare global {
  interface Window {
    ttq?: {
      (...args: unknown[]): void;
      track?: (event: string, params?: Record<string, unknown>, options?: Record<string, unknown>) => void;
      page?: (...args: unknown[]) => void;
      methods?: string[];
    };
  }
}

function hasTikTokPixel(): boolean {
  return typeof window !== "undefined" && typeof window.ttq?.track === "function";
}

/** Converte centavos em reais com duas casas, sem artefatos de ponto flutuante — mesmo utilitário já usado em cartPixel.ts/guiaPixel.ts. */
function centsToReais(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

/**
 * `options` (terceiro argumento) carrega `{ event_id }` quando presente —
 * usado hoje só por trackTikTokPurchase. Retorna se a chamada real ao SDK
 * aconteceu (mesmo contrato de trackCartPurchase/trackGuiaPurchase): quem
 * chama decide, a partir disso, se pode marcar sua própria guarda de
 * "já enviado".
 */
function track(event: string, params: Record<string, unknown>, options?: Record<string, unknown>): boolean {
  if (!hasTikTokPixel()) return false;
  try {
    if (options) window.ttq!.track!(event, params, options);
    else window.ttq!.track!(event, params);
    if (import.meta.env.DEV) console.debug("[tiktokPixel]", event, params, options ?? {});
    return true;
  } catch {
    // Nunca deixa uma falha do pixel (extensão bloqueando, SDK inconsistente
    // etc.) quebrar a UX — mesma disciplina defensiva de cartPixel.ts.
    return false;
  }
}

/**
 * Guarda em memória (não sessionStorage) contra ViewContent duplicado
 * causado por dupla-execução de efeito em desenvolvimento (React
 * StrictMode) DENTRO do mesmo carregamento lógico da ProductPage. Chave =
 * slug do produto. Uma nova visita/navegação para a mesma página (ex.:
 * sair e voltar) É um carregamento lógico novo e deve poder disparar de
 * novo — por isso a guarda não usa sessionStorage (que sobreviveria entre
 * navegações) e o chamador (ProductPage) é responsável por resetar/permitir
 * novo disparo a cada montagem real do componente (ver comentário em
 * ProductPage.tsx).
 */
const viewContentFiredForSlug = new Set<string>();

/**
 * Disparado quando uma ProductPage normal termina de carregar um produto
 * real (nunca em loading/erro/"não encontrado"). Dados sempre reais, vindos
 * da RPC pública — content_category é omitido quando product.category é
 * null (nunca inventado).
 */
export function trackTikTokViewContent(product: {
  slug: string;
  name: string;
  category: string | null;
  priceCents: number;
  currency: string;
}): void {
  if (viewContentFiredForSlug.has(product.slug)) return;
  viewContentFiredForSlug.add(product.slug);

  const price = centsToReais(product.priceCents);
  const content: TikTokContentItem = {
    content_id: product.slug,
    content_name: product.name,
    quantity: 1,
    price,
  };
  if (product.category) content.content_category = product.category;

  track("ViewContent", {
    contents: [content],
    content_type: "product",
    value: price,
    currency: product.currency,
  });
}

/**
 * Disparado exatamente nos mesmos pontos onde trackCartAddToCart (Meta) já
 * dispara com sucesso — ProductCard e o card de compra de ProductPage.
 * Nunca chamado quando o produto já estava no carrinho (o chamador decide
 * isso, mesma condição que já guarda o trackCartAddToCart existente).
 */
export function trackTikTokAddToCart(product: {
  slug: string;
  name: string;
  category: string | null;
  priceCents: number;
  currency: string;
}): void {
  const price = centsToReais(product.priceCents);
  const content: TikTokContentItem = {
    content_id: product.slug,
    content_name: product.name,
    quantity: 1,
    price,
  };
  if (product.category) content.content_category = product.category;

  track("AddToCart", {
    contents: [content],
    content_type: "product",
    value: price,
    currency: product.currency,
  });
}

/**
 * Disparado no mesmo ponto onde trackCartInitiateCheckout (Meta) já
 * dispara — clique em "Continuar para pagamento" no carrinho, antes de
 * chamar create-product-order-efi-prod. `totalCents`/`items` são os
 * mesmos valores de EXIBIÇÃO já usados pelo trackCartInitiateCheckout
 * existente (subtotal do CartContext) — nunca reaproveitados depois como
 * fonte de verdade para Purchase (que só existirá numa fase futura, com
 * o valor confirmado pelo backend).
 */
export function trackTikTokInitiateCheckout(
  totalCents: number,
  currency: string,
  items: { slug: string; name: string; priceCents: number }[],
): void {
  const contents: TikTokContentItem[] = items.map((item) => ({
    content_id: item.slug,
    content_name: item.name,
    quantity: 1,
    price: centsToReais(item.priceCents),
  }));

  track("InitiateCheckout", {
    contents,
    content_type: "product",
    value: centsToReais(totalCents),
    currency,
  });
}

/** Prefixo de sessionStorage próprio do TikTok — nunca colide com "meta_purchase_sent_" (cartPixel.ts/guiaPixel.ts), chave sempre inclui orderPublicId (UUID por pedido). */
const TIKTOK_PURCHASE_SENT_PREFIX = "tiktok_purchase_sent_";

function hasTikTokPurchaseBeenSent(orderPublicId: string): boolean {
  try {
    return window.sessionStorage.getItem(TIKTOK_PURCHASE_SENT_PREFIX + orderPublicId) === "1";
  } catch {
    // sessionStorage indisponível — trata como "ainda não enviado"; a
    // dedup real acontece no TikTok via event_id, então o pior caso aqui é
    // um evento de browser a mais, nunca uma perda de conversão.
    return false;
  }
}

function markTikTokPurchaseSent(orderPublicId: string): void {
  try {
    window.sessionStorage.setItem(TIKTOK_PURCHASE_SENT_PREFIX + orderPublicId, "1");
  } catch {
    // Sem persistência disponível — segue sem marcar, ver hasTikTokPurchaseBeenSent.
  }
}

export interface TrackTikTokPurchaseInput {
  /** SEMPRE order.publicId devolvido por create-product-order-efi-prod — o
   * MESMO valor usado pelo servidor (sendTikTokPurchase em
   * efi-webhook-prod) como event_id do Purchase da Events API. Nunca um
   * UUID novo, nunca checkoutRequestId, nunca txid da Efí. */
  orderPublicId: string;
  /** SEMPRE order.amountCents devolvido por create-product-order-efi-prod — nunca o subtotal do CartContext/localStorage. */
  amountCents: number;
  /** SEMPRE order.currency devolvido por create-product-order-efi-prod. */
  currency: string;
  /** SEMPRE order.items da resposta de createProductOrder (slug + name reais). Sem preço individual — não inventado (ver TikTokContentItem). */
  items: { slug: string; name: string }[];
}

/**
 * Pagamento CONFIRMADO — único ponto do frontend que pode disparar
 * ttq.track('Purchase', ...) para o carrinho. Só deve ser chamada quando
 * get-order-downloads já devolveu status "paid" (nunca em
 * pending_payment, nunca ao clicar "Continuar para pagamento"/"Gerar meu
 * Pix", nunca ao gerar o QR Code) — mesmo gatilho exato de
 * trackCartPurchase (src/lib/cartPixel.ts), chamada como IRMÃ dela no
 * mesmo useEffect de CartPage.tsx.
 *
 * Deduplicação com o Purchase da TikTok Events API (efi-webhook-prod):
 *  1. event_id = orderPublicId — terceiro argumento de ttq.track, EXATAMENTE
 *     o mesmo public_id usado pelo servidor;
 *  2. sessionStorage guarda, por public_id, que este pedido já disparou
 *     Purchase neste navegador — sobrevive a polling, re-render, remount
 *     (StrictMode) e reabertura da tela de downloads na mesma aba. Só é
 *     marcado DEPOIS de o ttq.track real ter sido chamado.
 *
 * Retorno: true só quando o Purchase foi (ou já tinha sido) realmente
 * enviado — false em qualquer outro caso (dados inválidos, ttq
 * indisponível). O chamador usa isso para decidir se pode marcar sua
 * própria guarda em memória — mesmo contrato de trackCartPurchase.
 */
export function trackTikTokPurchase({ orderPublicId, amountCents, currency, items }: TrackTikTokPurchaseInput): boolean {
  if (typeof window === "undefined") return false;
  if (typeof orderPublicId !== "string" || orderPublicId.length === 0) return false;
  if (typeof amountCents !== "number" || !Number.isFinite(amountCents) || amountCents <= 0) return false;
  if (!Array.isArray(items) || items.length === 0) return false;
  if (hasTikTokPurchaseBeenSent(orderPublicId)) return true;

  const contents: TikTokContentItem[] = items.map((item) => ({
    content_id: item.slug,
    content_name: item.name,
    quantity: 1,
  }));

  const sent = track(
    "Purchase",
    {
      contents,
      content_type: "product",
      value: centsToReais(amountCents),
      currency,
    },
    { event_id: orderPublicId },
  );
  if (sent) markTikTokPurchaseSent(orderPublicId);

  return sent;
}
