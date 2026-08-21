import * as React from "react";
import { Loader2, MessageCircle } from "lucide-react";
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
 * Checkout genérico de UM produto — usado por src/pages/ProductPage.tsx
 * (/produto/:slug). É a versão pequena/reutilizável do mesmo fluxo já
 * validado em produção pelo checkout do Guia de Evolução de Enfermagem
 * (GuiaEvolucaoEnfermagemPage.tsx, NÃO alterado nem importado aqui): mesma
 * infraestrutura (checkoutAttempt/productCheckout/orderAccess/
 * orderDownloads/TurnstileWidget), sem order bumps, sem quiz, sem Pixel —
 * só o essencial para vender um produto `kind='primary'`.
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
 * Guia — este componente nunca envia preço, só productSlugs: [slug].
 */

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

export function ProductCheckout({ slug, name }: { slug: string; name: string }) {
  const { attempt } = useCheckoutAttempt(slug);

  const [open, setOpen] = React.useState(false);
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
      const outcome = await getOrderDownloads(order.publicId, attempt.checkoutAccessToken);
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
  }, [result, downloads, attempt.checkoutAccessToken]);

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
    if (turnstileFailed || !turnstileToken) {
      setTurnstileMissing(true);
      return;
    }

    setSubmitting(true);
    setTurnstileMissing(false);

    const outcome = await createProductOrder({
      checkoutRequestId: attempt.checkoutRequestId,
      checkoutAccessToken: attempt.checkoutAccessToken,
      customerName: nm,
      customerEmail: mail,
      productSlugs: [slug],
      turnstileToken,
    });

    setSubmitting(false);
    setResult(outcome);

    setTurnstileToken(null);
    turnstileRef.current?.reset();

    if (outcome.kind !== "error") {
      saveOrderAccess(slug, {
        publicId: outcome.order.publicId,
        checkoutAccessToken: attempt.checkoutAccessToken,
      });
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
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-teal-600" aria-hidden="true" />
      </div>
    );
  }

  if (downloads !== null) {
    return <ProductDownloads productName={name} downloads={downloads} />;
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
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 text-left">
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
            {errors.email && (
              <p role="alert" className="text-[13px] text-rose-600">
                {errors.email}
              </p>
            )}
          </div>

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

          <Button type="submit" size="lg" full disabled={submitting || !turnstileToken || turnstileFailed}>
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
