import * as React from "react";
import { Link } from "react-router-dom";
import { Loader2, Lock, ShoppingBag, X, Zap } from "lucide-react";
import { useDocumentMeta } from "@/lib/seo";
import { withCampaignQuery } from "@/lib/utmTracking";
import { useCart } from "@/context/CartContext";
import { formatPriceCents } from "@/lib/catalogQueries";
import { useCheckoutAttempt } from "@/lib/checkoutAttempt";
import {
  classifyCheckoutErrorCode,
  createProductOrder,
  type ProductCheckoutResult,
} from "@/lib/productCheckout";
import { getOrderDownloads, type DownloadItem } from "@/lib/orderDownloads";
import { saveOrderAccess, readOrderAccess, clearOrderAccess } from "@/lib/orderAccess";
import { trackCartInitiateCheckout, trackCartPurchase } from "@/lib/cartPixel";
import { trackTikTokInitiateCheckout, trackTikTokPurchase } from "@/lib/tiktokPixel";
import { buildPixSupportWhatsAppUrl } from "@/lib/whatsapp";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Button } from "@/components/ui/button";
import { ProductCover, toneForCategory } from "@/components/catalog/ProductCover";
import { CartCheckoutForm, type FormErrors } from "@/components/cart/CartCheckoutForm";
import { CartPixResult } from "@/components/cart/CartPixResult";
import { CartDownloads } from "@/components/cart/CartDownloads";
import type { TurnstileWidgetHandle } from "@/components/checkout/TurnstileWidget";
import { CardCheckoutPanel } from "@/components/checkout/CardCheckoutPanel";

/**
 * Checkout do carrinho — Etapa 2. Reaproveita EXATAMENTE a mesma
 * infraestrutura já validada em produção (checkoutAttempt/productCheckout/
 * orderAccess/orderDownloads/TurnstileWidget) usada por
 * src/components/product/ProductCheckout.tsx (produto único) e pela
 * página do Guia — nenhum desses arquivos foi alterado por esta página.
 *
 * A única diferença estrutural é a CHAVE usada por useCheckoutAttempt()/
 * orderAccess: aqui é a string constante CART_KEY = "cart", nunca um slug
 * de produto real — por isso nunca colide com a chave do Guia
 * (guiaEvolucaoProduct.slug) nem com a de /produto/:slug (o slug do
 * produto). Os três fluxos guardam tentativa/acesso em compartimentos
 * completamente isolados do localStorage/sessionStorage.
 *
 * O preço mostrado aqui (CartItem.priceCents, via useCart()) é só para
 * exibição. O valor REAL cobrado é sempre o que create-product-order-efi-prod
 * devolve (order.amountCents), calculado no banco a partir de
 * products.price_cents — este arquivo nunca envia preço, só
 * productSlugs: cartItems.map(item => item.slug).
 */

const CART_KEY = "cart";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POLL_INTERVAL_MS = 5_000;

const ERROR_MESSAGES: Record<string, string> = {
  server_misconfigured: "Não foi possível processar sua compra agora. Tente novamente em alguns minutos.",
  origin_not_allowed: "Não foi possível processar sua compra agora. Recarregue a página e tente novamente.",
  payment_provider_configuration_error: "Não foi possível processar o pagamento agora. Tente novamente em instantes.",
  payment_provider_temporarily_unavailable: "O provedor de pagamento está temporariamente indisponível. Tente novamente em instantes.",
  payment_provider_error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes.",
  human_verification_failed: "Não foi possível confirmar a verificação de segurança. Tente novamente.",
  human_verification_temporarily_unavailable: "A verificação de segurança está indisponível agora. Tente novamente em instantes.",
  rate_limit_exceeded: "Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.",
  // Mensagem própria do carrinho (mais acionável que a de /produto/:slug):
  // aqui o cliente PODE remover o item causador direto da lista, que
  // continua visível/editável quando este erro acontece (ver showForm).
  product_not_found_or_inactive:
    "Um dos produtos do seu carrinho não está mais disponível. Remova-o da lista abaixo para continuar.",
  primary_product_required: "Não foi possível montar seu pedido. Recarregue a página e tente novamente.",
  duplicate_product: "Não foi possível montar seu pedido. Recarregue a página e tente novamente.",
  product_currency_mismatch: "Não foi possível calcular o valor da sua compra. Recarregue a página.",
  checkout_conflict: "Esta tentativa de compra não pode mais ser concluída.",
  payment_not_payable: "Este pagamento não pode mais ser concluído.",
  payment_request_rejected: "Não foi possível processar esta solicitação de pagamento.",
  invalid_request: "Não foi possível enviar seus dados. Verifique os campos e tente novamente.",
  download_unavailable: "Seus arquivos estão temporariamente indisponíveis. Tente novamente em instantes.",
};
const GENERIC_ERROR_MESSAGE = "Não foi possível concluir sua solicitação agora. Tente novamente em instantes.";

function errorMessageFor(code: string): string {
  return ERROR_MESSAGES[code] ?? GENERIC_ERROR_MESSAGE;
}

function EmptyCartState() {
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col items-center gap-4 px-5 py-24 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-slate-50 text-slate-400">
        <ShoppingBag className="h-7 w-7" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div>
        <p className="text-[17px] font-bold text-slate-900">Seu carrinho está vazio.</p>
        <p className="mt-1.5 text-[14.5px] text-slate-600">Explore nossos materiais.</p>
      </div>
      <Button asChild size="lg" className="mt-2">
        <Link to={withCampaignQuery("/")}>Ver materiais</Link>
      </Button>
    </div>
  );
}

export default function CartPage() {
  const { items, itemCount, subtotalCents, removeItem, clearCart } = useCart();
  const { ensureAttempt } = useCheckoutAttempt(CART_KEY);
  // checkoutAccessToken usado no polling desta submissão — capturado no
  // momento do envio (ensureAttempt), nunca recalculado depois: o carrinho
  // pode mudar (item adicionado/removido) sem que o pedido já criado mude
  // junto — o polling continua consultando o pedido real, não uma tentativa
  // futura ainda não enviada.
  const [activeAccessToken, setActiveAccessToken] = React.useState<string | null>(null);

  useDocumentMeta({
    title: "Seu carrinho | FSLobo Enfermagem",
    description: "Revise seus materiais e finalize a compra com pagamento via Pix.",
    path: "/carrinho",
    noindex: true,
  });

  const [showForm, setShowForm] = React.useState(false);
  const [firstName, setFirstName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [errors, setErrors] = React.useState<FormErrors>({});

  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);
  const [turnstileMissing, setTurnstileMissing] = React.useState(false);
  const [turnstileFailed, setTurnstileFailed] = React.useState(false);
  const turnstileRef = React.useRef<TurnstileWidgetHandle>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<ProductCheckoutResult | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [downloads, setDownloads] = React.useState<DownloadItem[] | null>(null);
  const [resuming, setResuming] = React.useState(true);

  // Guarda de disparo do Purchase — mesmo padrão de
  // GuiaEvolucaoEnfermagemPage.tsx (não alterado): só existe valor real
  // quando o pedido foi criado NESTA sessão (createProductOrder devolveu
  // order.publicId/amountCents/items). No fluxo de retomada (pedido pago
  // encontrado ao recarregar a página — ver useEffect de retomada acima),
  // estes refs permanecem null e o Purchase NUNCA dispara: não há como
  // obter o valor/itens reais confirmados sem alterar get-order-downloads,
  // e inventar esses dados no frontend é exatamente o que foi proibido. A
  // deduplicação entre browser e CAPI (mesmo orderPublicId como eventID) e
  // a proteção contra reenvio por polling/re-render vivem em
  // trackCartPurchase (src/lib/cartPixel.ts) — purchaseFiredRef aqui é só
  // um atalho em memória para não reavaliar a guarda a cada re-render.
  const orderPublicIdRef = React.useRef<string | null>(null);
  const orderAmountCentsRef = React.useRef<number | null>(null);
  const orderSlugsRef = React.useRef<string[] | null>(null);
  const purchaseFiredRef = React.useRef(false);
  // Espelham exatamente os mesmos dados acima, só que também guardam o
  // nome de cada item e a moeda real — necessários para trackTikTokPurchase
  // (contents com content_name, currency = order.currency). Preenchidos no
  // MESMO ponto de submitOrder, a partir da MESMA resposta de
  // createProductOrder — nunca uma segunda fonte de dados.
  const orderCurrencyRef = React.useRef<string | null>(null);
  const orderItemsRef = React.useRef<{ slug: string; name: string }[] | null>(null);
  const tiktokPurchaseFiredRef = React.useRef(false);

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const errorCategory = result?.kind === "error" ? classifyCheckoutErrorCode(result.code) : null;
  const showResultPanel = result !== null && result.kind !== "error" && downloads === null;

  // ── Retomada: pedido salvo (localStorage, chave CART_KEY) — consulta
  //    get-order-downloads uma vez ao carregar. Só "já pago" é
  //    reconstruído; qualquer outro resultado descarta o acesso salvo.
  React.useEffect(() => {
    let cancelled = false;
    async function resume() {
      const access = readOrderAccess(CART_KEY);
      if (!access) {
        setResuming(false);
        return;
      }
      const outcome = await getOrderDownloads(access.publicId, access.checkoutAccessToken);
      if (cancelled) return;
      if (outcome.kind === "paid") {
        setDownloads(outcome.downloads);
      } else {
        clearOrderAccess(CART_KEY);
      }
      setResuming(false);
    }
    void resume();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Verificação automática (polling) enquanto o pedido não estiver pago.
  React.useEffect(() => {
    if (!result || result.kind === "error" || downloads !== null) return;
    const order = result.order;
    let cancelled = false;

    const interval = window.setInterval(async () => {
      if (!activeAccessToken) return;
      const outcome = await getOrderDownloads(order.publicId, activeAccessToken);
      if (cancelled) return;
      if (outcome.kind === "paid") {
        setDownloads(outcome.downloads);
        window.clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [result, downloads, activeAccessToken]);

  // ── Carrinho só é limpo depois que os downloads estiverem disponíveis
  //    (nunca ao gerar o Pix, nunca em pending_payment) — mesmo instante
  //    em que a tela de downloads passa a ser exibida.
  const cartClearedRef = React.useRef(false);
  React.useEffect(() => {
    if (downloads === null || cartClearedRef.current) return;
    cartClearedRef.current = true;
    clearCart();
  }, [downloads, clearCart]);

  // ── Purchase: dispara exatamente uma vez, no exato instante em que
  //    "paid" é confirmado (downloads deixa de ser null) DENTRO desta
  //    sessão — nunca ao adicionar ao carrinho, nunca ao abrir /carrinho,
  //    nunca ao clicar "Continuar para pagamento", nunca ao gerar o Pix,
  //    nunca enquanto pending_payment. purchaseFiredRef garante que um
  //    re-render (ou o StrictMode do React em dev, que re-executa efeitos)
  //    nunca duplica o evento — mesmo mecanismo de
  //    GuiaEvolucaoEnfermagemPage.tsx, não alterado por este arquivo.
  React.useEffect(() => {
    if (downloads === null) return;
    if (purchaseFiredRef.current) return;
    const orderPublicId = orderPublicIdRef.current;
    const amountCents = orderAmountCentsRef.current;
    const productSlugs = orderSlugsRef.current;
    if (orderPublicId === null || amountCents === null || productSlugs === null) return; // fluxo de retomada — ver comentário acima dos refs.
    // Só marca o atalho em memória se o Purchase foi realmente enviado (ou
    // já tinha sido, via sessionStorage). Se o Pixel ainda não estiver
    // disponível, purchaseFiredRef continua false e uma próxima
    // atualização/polling pode tentar de novo.
    const sent = trackCartPurchase({ orderPublicId, amountCents, productSlugs });
    if (sent) purchaseFiredRef.current = true;

    // Chamada IRMÃ da acima, mesmo instante lógico (downloads confirmados),
    // nunca dentro de trackCartPurchase, nunca substitui o Meta. event_id
    // = orderPublicId — o MESMO valor usado pelo Purchase da TikTok Events
    // API em efi-webhook-prod (não alterado por este arquivo). Guarda
    // própria (tiktokPurchaseFiredRef) independente da guarda do Meta: uma
    // falha/atraso de um pixel nunca impede o outro de tentar de novo no
    // próximo re-render.
    if (!tiktokPurchaseFiredRef.current) {
      const currency = orderCurrencyRef.current;
      const orderItems = orderItemsRef.current;
      if (currency !== null && orderItems !== null) {
        const tiktokSent = trackTikTokPurchase({ orderPublicId, amountCents, currency, items: orderItems });
        if (tiktokSent) tiktokPurchaseFiredRef.current = true;
      }
    }
  }, [downloads]);

  const handleTurnstileToken = React.useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileMissing(false);
    setTurnstileFailed(false);
  }, []);
  const handleTurnstileExpire = React.useCallback(() => {
    setTurnstileToken(null);
    turnstileRef.current?.reset();
  }, []);
  const handleTurnstileError = React.useCallback(() => {
    setTurnstileToken(null);
    setTurnstileFailed(true);
  }, []);
  const handleRetryVerification = React.useCallback(() => {
    setTurnstileFailed(false);
    setTurnstileToken(null);
    turnstileRef.current?.reset();
  }, []);

  async function submitOrder(name: string, mail: string) {
    if (turnstileFailed || !turnstileToken) {
      setTurnstileMissing(true);
      return;
    }

    const productSlugs = items.map((item) => item.slug);
    // ensureAttempt() decide, no momento do envio, se reaproveita o
    // checkout_request_id salvo (mesmo nome/e-mail/product_slugs — ex.:
    // retry após erro de rede) ou gera um par novo: item adicionado ou
    // removido do carrinho (ou nome/e-mail corrigidos) depois de um envio
    // anterior muda o fingerprint, então SEMPRE gera um checkout_request_id
    // novo aqui — nunca mais reaproveitando o de uma tentativa com dados
    // diferentes (era essa reutilização indevida que causava o 409
    // "checkout_conflict" da RPC create_or_get_product_order_with_items_efi).
    const attempt = ensureAttempt({ name, email: mail, productSlugs });

    // InitiateCheckout: uma vez por tentativa de checkout (guardado por
    // checkout_request_id dentro de trackCartInitiateCheckout) — nunca
    // afeta o Pixel isolado do Guia (src/lib/guiaPixel.ts, não alterado).
    trackCartInitiateCheckout(attempt.checkoutRequestId, subtotalCents, productSlugs);
    // Chamada IRMÃ da acima — mesmo ponto exato, mesmo valor de exibição
    // (subtotalCents/CartContext). Nunca reaproveitado depois como fonte
    // de verdade para Purchase (fase futura). Nunca substitui o Meta.
    trackTikTokInitiateCheckout(
      subtotalCents,
      "BRL",
      items.map((item) => ({ slug: item.slug, name: item.name, priceCents: item.priceCents })),
    );

    setSubmitting(true);
    setTurnstileMissing(false);

    const outcome = await createProductOrder({
      checkoutRequestId: attempt.checkoutRequestId,
      checkoutAccessToken: attempt.checkoutAccessToken,
      customerName: name,
      customerEmail: mail,
      productSlugs,
      turnstileToken,
    });

    setSubmitting(false);
    setResult(outcome);
    setTurnstileToken(null);
    turnstileRef.current?.reset();

    if (outcome.kind !== "error") {
      setActiveAccessToken(attempt.checkoutAccessToken);
      saveOrderAccess(CART_KEY, {
        publicId: outcome.order.publicId,
        checkoutAccessToken: attempt.checkoutAccessToken,
      });
      // Único momento em que temos o public_id, o valor REAL confirmado
      // pelo backend e os slugs efetivamente associados a este pedido —
      // guardados para o Purchase, disparado só quando o pagamento for de
      // fato confirmado (ver useEffect acima). orderPublicId é o MESMO
      // public_id usado pelo backend como event_id na Conversions API
      // (efi-webhook-prod, não alterado).
      orderPublicIdRef.current = outcome.order.publicId;
      orderAmountCentsRef.current = outcome.order.amountCents;
      orderSlugsRef.current = outcome.order.items.map((item) => item.slug);
      orderCurrencyRef.current = outcome.order.currency;
      orderItemsRef.current = outcome.order.items.map((item) => ({ slug: item.slug, name: item.name }));
    }
  }

  function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    if (submitting) return;

    const nextErrors: FormErrors = {};
    const trimmedName = firstName.trim();
    if (trimmedName.length < 2) nextErrors.name = "Digite seu nome.";
    const trimmedEmail = email.trim();
    if (!EMAIL_REGEX.test(trimmedEmail)) nextErrors.email = "Digite um e-mail válido.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    void submitOrder(trimmedName, trimmedEmail);
  }

  async function handleCopyCode(qrCode: string) {
    try {
      await navigator.clipboard.writeText(qrCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Área de transferência indisponível — o código Pix continua visível na tela.
    }
  }

  if (resuming) {
    return (
      <div className="min-h-screen bg-white font-sans text-slate-900">
        <SiteHeader />
        <main className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-teal-600" aria-hidden="true" />
        </main>
        <SiteFooter />
      </div>
    );
  }

  // Downloads e Pix ocupam um painel único e centralizado — mesma
  // convenção visual do checkout do Guia (PANEL_CONTAINER).
  if (downloads !== null) {
    return (
      <div className="min-h-screen bg-white font-sans text-slate-900">
        <SiteHeader />
        <main className="mx-auto w-full max-w-[640px] px-5 py-16 sm:py-20">
          <CartDownloads orderAccessKey={CART_KEY} downloads={downloads} />
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (showResultPanel && result) {
    return (
      <div className="min-h-screen bg-white font-sans text-slate-900">
        <SiteHeader />
        <main className="mx-auto w-full max-w-[640px] px-5 py-16 sm:py-20">
          <CartPixResult result={result} copied={copied} onCopyCode={handleCopyCode} />
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (itemCount === 0) {
    return (
      <div className="min-h-screen bg-white font-sans text-slate-900">
        <SiteHeader />
        <main>
          <EmptyCartState />
        </main>
        <SiteFooter />
      </div>
    );
  }

  const errorMessage = result?.kind === "error" ? errorMessageFor(result.code) : null;
  // Erro de "produto indisponível" fica com a lista visível/editável
  // (input category) — qualquer outro erro real de pedido/pagamento
  // substitui o botão por um bloco de erro dedicado.
  const showListEditable = result === null || errorCategory === "input";
  const showNonInputError = result?.kind === "error" && errorCategory !== null && errorCategory !== "input";

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <SiteHeader />

      <main>
        <div className="border-b border-slate-200 bg-slate-50">
          <div className="mx-auto flex w-full max-w-[1200px] items-center gap-1.5 px-5 py-4 text-[13px] text-slate-500 sm:px-6">
            <Link to={withCampaignQuery("/")} className="hover:text-teal-700">
              Início
            </Link>
            <span aria-hidden="true">/</span>
            <span className="font-semibold text-slate-700">Carrinho</span>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1200px] px-5 py-10 sm:px-6 sm:py-14">
          <h1 className="text-[1.9rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.2rem]">
            Seu carrinho
          </h1>

          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-start lg:gap-12">
            {/* ─────────────────────────── Lista ─────────────────────────── */}
            {showListEditable && (
              <div className="flex flex-col gap-4">
                {items.map((item) => (
                  <div
                    key={item.slug}
                    className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
                  >
                    <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      {item.coverUrl ? (
                        <img src={item.coverUrl} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <ProductCover tone={toneForCategory(item.category)} className="h-full w-full rounded-none border-0" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {item.category && (
                        <span className="text-[11px] font-bold uppercase tracking-wide text-teal-700">{item.category}</span>
                      )}
                      <p className="mt-0.5 text-[15px] font-bold leading-snug text-slate-900">{item.name}</p>
                      <p className="mt-1 text-[15px] font-extrabold text-slate-900">
                        {formatPriceCents(item.priceCents, "BRL")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.slug)}
                      aria-label={`Remover ${item.name} do carrinho`}
                      className="shrink-0 rounded-xl border border-slate-200 p-2.5 text-slate-500 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                ))}

                {errorMessage && errorCategory === "input" && (
                  <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <p className="text-[14px] leading-relaxed text-rose-800">{errorMessage}</p>
                  </div>
                )}

                <Link
                  to={withCampaignQuery("/")}
                  className="mt-1 inline-flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-slate-500 transition-colors hover:text-teal-700"
                >
                  Continuar comprando
                </Link>
              </div>
            )}

            {showNonInputError && result?.kind === "error" && (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 text-center">
                <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-[14px] leading-relaxed text-rose-800">{errorMessageFor(result.code)}</p>
                </div>
                {classifyCheckoutErrorCode(result.code) === "contact" ? (
                  <Button asChild full>
                    <a href={buildPixSupportWhatsAppUrl(null, { purchaseLabel: "sua compra" })} target="_blank" rel="noopener noreferrer">
                      Falar com o suporte
                    </a>
                  </Button>
                ) : (
                  <Button type="button" full onClick={() => window.location.reload()}>
                    Tentar novamente
                  </Button>
                )}
              </div>
            )}

            {/* ─────────────────────────── Resumo ─────────────────────────── */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 lg:sticky lg:top-24">
              <h2 className="text-[1.05rem] font-extrabold text-slate-900">Resumo da compra</h2>
              <div className="mt-4 flex items-center justify-between text-[14px] text-slate-600">
                <span>
                  {itemCount} {itemCount === 1 ? "produto" : "produtos"}
                </span>
                <span className="text-[1.4rem] font-extrabold text-slate-900">{formatPriceCents(subtotalCents, "BRL")}</span>
              </div>

              <div className="mt-4 flex flex-col gap-1.5 border-t border-slate-200 pt-4 text-[12.5px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Pagamento via Pix
                </span>
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" /> Liberação automática após confirmação
                </span>
              </div>

              {!showForm ? (
                <Button size="lg" full className="mt-5" onClick={() => setShowForm(true)}>
                  Continuar para pagamento
                </Button>
              ) : (
                <div className="mt-5 border-t border-slate-200 pt-5">
                  <CartCheckoutForm
                    firstName={firstName}
                    setFirstName={setFirstName}
                    email={email}
                    setEmail={setEmail}
                    errors={errors}
                    submitting={submitting}
                    canSubmit={Boolean(turnstileToken) && !submitting && !turnstileFailed}
                    onSubmit={handleSubmit}
                    siteKey={siteKey}
                    turnstileRef={turnstileRef}
                    turnstileFailed={turnstileFailed}
                    turnstileMissing={turnstileMissing}
                    onTurnstileToken={handleTurnstileToken}
                    onTurnstileExpire={handleTurnstileExpire}
                    onTurnstileError={handleTurnstileError}
                    onRetryVerification={handleRetryVerification}
                    // O erro de categoria "input" já é mostrado acima, junto
                    // da lista editável (para o cliente remover o item
                    // causador) — o formulário nunca duplica essa mensagem.
                    errorMessage={null}
                  />
                  <CardCheckoutPanel storageKey={CART_KEY} productName="materiais do carrinho"
                    productSlugs={items.map((item) => item.slug)} />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
