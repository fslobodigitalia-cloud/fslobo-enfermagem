import * as React from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { OrderBumpCarousel } from "@/components/guia/OrderBumpCarousel";
import { formatCents, type DigitalBump } from "@/config/digitalProducts";
import { buildBumpCheckout } from "@/lib/productBumps";
import { useCheckoutAttempt } from "@/lib/checkoutAttempt";
import {
  classifyCheckoutErrorCode,
  createProductOrder,
  type ProductCheckoutResult,
} from "@/lib/productCheckout";
import { getOrderDownloads, type DownloadItem } from "@/lib/orderDownloads";
import { saveOrderAccess, readOrderAccess, clearOrderAccess } from "@/lib/orderAccess";
import { buildPixSupportWhatsAppUrl } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/checkout/TurnstileWidget";
import { ProductPixResult } from "./ProductPixResult";
import { ProductDownloads } from "./ProductDownloads";

/**
 * Checkout genérico de um produto principal — usado por src/pages/ProductPage.tsx
 * (/produto/:slug). É a versão pequena/reutilizável do mesmo fluxo já
 * validado em produção pelo checkout do Guia de Evolução de Enfermagem
 * (GuiaEvolucaoEnfermagemPage.tsx, NÃO alterado nem importado aqui): mesma
 * infraestrutura (checkoutAttempt/productCheckout/orderAccess/
 * orderDownloads/TurnstileWidget), com adicionais opcionais, sem quiz, sem Pixel —
 * um produto principal com adicionais opcionais explicitamente configurados.
 *
 * Por que nunca vende um `kind='bump'` diretamente: quem resolve o slug é
 * sempre ProductPage, contra o catálogo devolvido por
 * fetchActiveProductCatalog()/get_active_product_catalog() — essa RPC já
 * filtra `kind = 'primary'` no banco (ver src/lib/catalogQueries.ts), então
 * um bump nunca chega a existir como `product` em ProductPage/nunca é
 * passado como `slug` aqui. Nada precisa ser validado de novo neste
 * componente.
 *
 * O preço mostrado antes de comprar vem do catálogo (prop `priceLabel`,
 * só para exibição). O valor realmente cobrado é sempre o que
 * create-product-order-efi-prod devolve (order.amountCents), calculado no
 * banco pela mesma RPC create_or_get_product_order_with_items() usada pelo
 * Guia — este componente nunca envia preço, somente os slugs do produto principal e dos adicionais selecionados.
 */

const NO_BUMPS: readonly DigitalBump[] = [];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TURNSTILE_ACTION = "create_product_order";
const POLL_INTERVAL_MS = 5_000;

interface FormErrors {
  name?: string;
  email?: string;
}

/** Mesmas mensagens amigáveis por código de erro do checkout do Guia — nunca
 *  a mensagem crua do servidor. Copiado deliberadamente em vez de importado
 *  de GuiaEvolucaoEnfermagemPage.tsx (página, não módulo compartilhado; não
 *  deve ser alterada nem depender de outro componente). */
const ERROR_MESSAGES: Record<string, string> = {
  server_misconfigured: "Não foi possível processar sua compra agora. Tente novamente em alguns minutos.",
  origin_not_allowed: "Não foi possível processar sua compra agora. Recarregue a página e tente novamente.",
  payment_provider_configuration_error: "Não foi possível processar o pagamento agora. Tente novamente em instantes.",
  payment_provider_temporarily_unavailable: "O Mercado Pago está temporariamente indisponível. Tente novamente em instantes.",
  payment_provider_error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes.",
  human_verification_failed: "Não foi possível confirmar a verificação de segurança. Tente novamente.",
  human_verification_temporarily_unavailable: "A verificação de segurança está indisponível agora. Tente novamente em instantes.",
  rate_limit_exceeded: "Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.",
  product_not_found_or_inactive: "Este material não está disponível no momento. Recarregue a página.",
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

const INPUT_CLASS =
  "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-teal-400 focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20";

interface ProductCheckoutProps {
  slug: string;
  name: string;
  inline?: boolean;
  canPurchase?: boolean;
  priceLabel?: string;
  availabilityMessage?: string;
  bumps?: readonly DigitalBump[];
  basePriceCents?: number;
  bumpIntroduction?: string;
  /**
   * Opcional (rastreamento): chamado quando o formulário foi validado
   * (inclui Turnstile) e logo antes de criar o pedido — mesmo ponto do
   * InitiateCheckout do Guia. `totalCents` é o total do frontend, só
   * sinalização. Sem esta prop o comportamento não muda.
   */
  onInitiateCheckout?: (info: { totalCents: number; productSlugs: string[] }) => void;
  /**
   * Opcional (rastreamento): chamado uma vez quando o backend confirma o
   * pagamento de um pedido criado NESTA sessão, com os valores devolvidos
   * pelo backend. Nunca é chamado ao retomar um pedido antigo. Devolver
   * `false` indica que o envio não ocorreu e permite nova tentativa.
   */
  onPurchaseConfirmed?: (info: { orderPublicId: string; amountCents: number; productSlugs: string[] }) => boolean | void;
}

export function ProductCheckout({ slug, name, inline = false, canPurchase = true, priceLabel, availabilityMessage, bumps = NO_BUMPS, basePriceCents, bumpIntroduction, onInitiateCheckout, onPurchaseConfirmed }: ProductCheckoutProps) {
  const { ensureAttempt } = useCheckoutAttempt(slug);
  // checkoutAccessToken usado no polling/retomada desta submissão — capturado
  // no momento do envio (ensureAttempt), nunca recalculado por engano depois
  // (a tentativa "atual" pode já ter mudado se o formulário for reaberto).
  const [activeAccessToken, setActiveAccessToken] = React.useState<string | null>(null);

  const [open, setOpen] = React.useState(inline);
  const [firstName, setFirstName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [selectedBumps, setSelectedBumps] = React.useState<Set<string>>(() => new Set());
  const hasBumps = bumps.length > 0;
  const bumpCheckout = hasBumps
    ? buildBumpCheckout(slug, basePriceCents ?? 0, selectedBumps, bumps)
    : null;
  const selectionValid = !hasBumps || bumpCheckout !== null;
  const displayedPriceLabel = hasBumps
    ? (bumpCheckout ? formatCents(bumpCheckout.totalCents) : undefined)
    : priceLabel;

  function toggleBump(bumpSlug: string) {
    if (submitting || !bumps.some(bump => bump.slug === bumpSlug)) return;
    setSelectedBumps(previous => {
      const next = new Set(previous);
      if (next.has(bumpSlug)) next.delete(bumpSlug);
      else next.add(bumpSlug);
      return next;
    });
  }

  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);
  const [turnstileMissing, setTurnstileMissing] = React.useState(false);
  const [turnstileFailed, setTurnstileFailed] = React.useState(false);
  const turnstileRef = React.useRef<TurnstileWidgetHandle>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<ProductCheckoutResult | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [downloads, setDownloads] = React.useState<DownloadItem[] | null>(null);
  const [resuming, setResuming] = React.useState(true);

  // Guarda do Purchase (mesma regra do Guia): só existe valor confirmado
  // quando o pedido foi criado NESTA sessão. Na retomada de um pedido
  // antigo estes refs ficam null e o Purchase nunca é disparado.
  const purchaseOrderRef = React.useRef<{ orderPublicId: string; amountCents: number; productSlugs: string[] } | null>(null);
  const purchaseFiredRef = React.useRef(false);

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  const errorCategory = result?.kind === "error" ? classifyCheckoutErrorCode(result.code) : null;
  const showForm = result === null || (result.kind === "error" && errorCategory === "input");
  const showPixResult = result !== null && result.kind !== "error" && downloads === null;

  // ── Retomada: se já existe um pedido salvo (localStorage) para este
  //    produto, consulta get-order-downloads UMA vez ao carregar. Só o
  //    caso "já pago" é reconstruído — qualquer outro resultado descarta o
  //    acesso salvo (mesmo comportamento do Guia, ver orderAccess.ts).
  React.useEffect(() => {
    let cancelled = false;
    async function resume() {
      const access = readOrderAccess(slug);
      if (!access) {
        setResuming(false);
        return;
      }
      const outcome = await getOrderDownloads(access.publicId, access.checkoutAccessToken);
      if (cancelled) return;
      if (outcome.kind === "paid") {
        setDownloads(outcome.downloads);
        setOpen(true);
      } else {
        clearOrderAccess(slug);
      }
      setResuming(false);
    }
    void resume();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // ── Verificação automática: enquanto houver um pedido criado nesta
  //    sessão e ele ainda não estiver pago, consulta get-order-downloads
  //    periodicamente. Para no primeiro "paid".
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

  // ── Purchase: uma vez, no instante em que "paid" é confirmado (downloads
  //    deixa de ser null) para um pedido criado nesta sessão.
  React.useEffect(() => {
    if (downloads === null || purchaseFiredRef.current) return;
    const order = purchaseOrderRef.current;
    if (!order || !onPurchaseConfirmed) return;
    if (onPurchaseConfirmed(order) !== false) purchaseFiredRef.current = true;
  }, [downloads, onPurchaseConfirmed]);

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

  async function submitOrder(nm: string, mail: string) {
    if (submitting || !canPurchase || !selectionValid) return;
    const productSlugs = hasBumps ? bumpCheckout?.productSlugs : [slug];
    if (!productSlugs) return;
    if (turnstileFailed || !turnstileToken) {
      setTurnstileMissing(true);
      return;
    }

    onInitiateCheckout?.({ totalCents: bumpCheckout?.totalCents ?? basePriceCents ?? 0, productSlugs });

    setSubmitting(true);
    setTurnstileMissing(false);

    // ensureAttempt() decide, no momento do envio, se reaproveita o
    // checkout_request_id salvo (mesmo nome/e-mail/slug — ex.: retry após
    // erro de rede) ou gera um par novo (nada salvo ainda, ou dados
    // diferentes de um envio anterior).
    const attempt = ensureAttempt({ name: nm, email: mail, productSlugs });

    const outcome = await createProductOrder({
      checkoutRequestId: attempt.checkoutRequestId,
      checkoutAccessToken: attempt.checkoutAccessToken,
      customerName: nm,
      customerEmail: mail,
      productSlugs,
      turnstileToken,
    });

    setSubmitting(false);
    setResult(outcome);

    setTurnstileToken(null);
    turnstileRef.current?.reset();

    if (outcome.kind !== "error") {
      purchaseOrderRef.current = {
        orderPublicId: outcome.order.publicId,
        amountCents: outcome.order.amountCents,
        productSlugs: outcome.order.items.map(item => item.slug),
      };
      purchaseFiredRef.current = false;
      setActiveAccessToken(attempt.checkoutAccessToken);
      saveOrderAccess(slug, {
        publicId: outcome.order.publicId,
        checkoutAccessToken: attempt.checkoutAccessToken,
      });
    }
  }

  function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    if (submitting || !canPurchase || !selectionValid) return;

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
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-teal-600" aria-hidden="true" />
      </div>
    );
  }

  if (downloads !== null) {
    return <ProductDownloads productName={name} productSlug={slug} downloads={downloads} />;
  }

  if (showPixResult && result) {
    return <ProductPixResult result={result} copied={copied} onCopyCode={handleCopyCode} />;
  }

  if (!open) {
    return (
      <Button size="lg" full className="sm:w-auto" onClick={() => setOpen(true)}>
        Comprar agora
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {showForm && (
        <form onSubmit={handleSubmit} noValidate className={inline ? "flex flex-col gap-5 text-left" : "flex flex-col gap-4 text-left"}>
          {hasBumps && (
            <fieldset disabled={submitting} className="min-w-0 border-0 p-0">
              <legend className="sr-only">Materiais adicionais opcionais</legend>
              <OrderBumpCarousel
                bumps={bumps}
                selectedBumps={selectedBumps}
                onToggle={toggleBump}
                copy={bumpIntroduction ? { introduction: bumpIntroduction } : undefined}
              />
            </fieldset>
          )}
          {hasBumps && !selectionValid && (
            <p role="alert" className="text-sm text-rose-700">Não foi possível calcular os adicionais. Recarregue a página.</p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor={`checkout-nome-${slug}`} className="text-slate-500">
              Nome
            </Label>
            <Input
              id={`checkout-nome-${slug}`}
              autoComplete="given-name"
              placeholder="Como podemos te chamar?"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              aria-invalid={Boolean(errors.name)}
              maxLength={80}
              className={INPUT_CLASS}
            />
            {errors.name && (
              <p role="alert" className="text-[13px] text-rose-600">
                {errors.name}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`checkout-email-${slug}`} className="text-slate-500">
              E-mail
            </Label>
            <Input
              id={`checkout-email-${slug}`}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="seuemail@exemplo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(errors.email)}
              maxLength={254}
              className={INPUT_CLASS}
            />
            {inline && (
              <p className="text-[12.5px] leading-relaxed text-slate-500">
                Use um e-mail que você acessa: ele ficará vinculado ao seu pedido.
              </p>
            )}
            {errors.email && (
              <p role="alert" className="text-[13px] text-rose-600">
                {errors.email}
              </p>
            )}
          </div>

          {displayedPriceLabel && (
            <div className="relative flex items-center justify-between overflow-hidden rounded-2xl border border-teal-200 bg-gradient-to-b from-teal-50 to-white px-5 py-4 shadow-[0_2px_4px_rgba(15,23,42,0.04),0_8px_20px_-14px_rgba(15,23,42,0.12)]">
              <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-slate-500">Total</span>
              <span className="font-sans text-[1.55rem] font-extrabold text-teal-700" role="status" aria-live="polite" aria-atomic="true">{displayedPriceLabel}</span>
            </div>
          )}
          {availabilityMessage && <p role="status" className="text-[13px] leading-relaxed text-slate-600">{availabilityMessage}</p>}

          {siteKey ? (
            <TurnstileWidget
              ref={turnstileRef}
              siteKey={siteKey}
              action={TURNSTILE_ACTION}
              onToken={handleTurnstileToken}
              onExpire={handleTurnstileExpire}
              onError={handleTurnstileError}
            />
          ) : (
            <p role="alert" className="text-center text-[13px] text-rose-600">
              Não foi possível carregar a verificação de segurança. Recarregue a página.
            </p>
          )}
          {turnstileFailed && (
            <div className="flex flex-col items-center gap-2">
              <p role="alert" className="text-center text-[13px] text-rose-600">
                Não foi possível carregar a verificação de segurança.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={handleRetryVerification}>
                Tentar verificação novamente
              </Button>
            </div>
          )}
          {turnstileMissing && !turnstileFailed && (
            <p role="alert" className="text-center text-[13px] text-rose-600">
              Aguarde a verificação de segurança terminar antes de continuar.
            </p>
          )}

          {result?.kind === "error" && errorCategory === "input" && (
            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-[14px] leading-relaxed text-rose-800">{errorMessageFor(result.code)}</p>
            </div>
          )}

          {inline && (
            <p className="text-center text-[13px] leading-relaxed text-slate-600">Após a confirmação do Pix, os arquivos ficam disponíveis para download nesta página.</p>
          )}

          <Button type="submit" size="lg" full disabled={!canPurchase || !selectionValid || submitting || !turnstileToken || turnstileFailed} className={inline ? "border-transparent bg-teal-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_4px_rgba(15,23,42,0.08),0_10px_24px_-10px_rgba(13,148,136,0.55)] hover:bg-teal-700" : undefined}>
            {submitting ? "Gerando seu Pix..." : "Gerar meu Pix e receber o material"}
          </Button>
        </form>
      )}

      {result?.kind === "error" && errorCategory !== null && errorCategory !== "input" && (
        <ProductCheckoutErrorBlock code={result.code} category={errorCategory} productName={name} />
      )}
    </div>
  );
}

function ProductCheckoutErrorBlock({
  code,
  category,
  productName,
}: {
  code: string;
  category: "temporary" | "contact" | "restart";
  productName: string;
}) {
  const message = errorMessageFor(code);

  if (category === "contact") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-[14px] leading-relaxed text-rose-800">{message}</p>
        </div>
        <Button asChild full>
          <a href={buildPixSupportWhatsAppUrl(null, { purchaseLabel: productName })} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
            Falar com o suporte
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-[14px] leading-relaxed text-rose-800">{message}</p>
      </div>
      <Button type="button" full onClick={() => window.location.reload()}>
        Tentar novamente
      </Button>
    </div>
  );
}
