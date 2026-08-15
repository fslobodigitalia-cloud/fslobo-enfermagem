/**
 * Página comercial do Guia de Evolução de Enfermagem — Fase 4 (frontend
 * MVP), fora do funil de tarô. Mobile-first, focada em conversão: Hero →
 * Benefícios → Oferta → Checkout (nome, e-mail, bumps opcionais,
 * Turnstile) → Pix (QR Code + copia e cola) → confirmação + downloads.
 *
 * Preço e itens exibidos vêm de src/config/digitalProducts.ts (só para
 * UX) — o valor REAL cobrado é sempre o que create-product-order devolve
 * (order.amount_cents), calculado no banco pela RPC
 * create_or_get_product_order_with_items(). O total mostrado ao marcar
 * bumps é só uma prévia visual, nunca enviado ao backend.
 */
import * as React from "react";
import { Check, Copy, Download, Loader2, MessageCircle } from "lucide-react";
import { useDocumentMeta } from "@/lib/seo";
import { useCheckoutAttempt } from "@/lib/checkoutAttempt";
import {
  classifyCheckoutErrorCode,
  createProductOrder,
  type ProductCheckoutResult,
  type ProductOrderSummary,
} from "@/lib/productCheckout";
import { getOrderDownloads, type DownloadItem } from "@/lib/orderDownloads";
import { saveOrderAccess, readOrderAccess, clearOrderAccess } from "@/lib/orderAccess";
import { guiaEvolucaoProduct, guiaEvolucaoBumps, formatCents } from "@/config/digitalProducts";
import { buildPixSupportWhatsAppUrl } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/checkout/TurnstileWidget";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TURNSTILE_ACTION = "create_product_order";
const POLL_INTERVAL_MS = 5_000;

interface FormErrors {
  name?: string;
  email?: string;
}

/**
 * Mensagens amigáveis por código de erro — nunca a mensagem crua do
 * servidor, nunca detalhe de SQL/secret/stack trace.
 */
const ERROR_MESSAGES: Record<string, string> = {
  server_misconfigured: "Não foi possível processar sua compra agora. Tente novamente em alguns minutos.",
  origin_not_allowed: "Não foi possível processar sua compra agora. Recarregue a página e tente novamente.",
  payment_provider_configuration_error: "Não foi possível processar o pagamento agora. Tente novamente em instantes.",
  payment_provider_temporarily_unavailable: "O Mercado Pago está temporariamente indisponível. Tente novamente em instantes.",
  payment_provider_error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes.",
  human_verification_failed: "Não foi possível confirmar a verificação de segurança. Tente novamente.",
  human_verification_temporarily_unavailable: "A verificação de segurança está indisponível agora. Tente novamente em instantes.",
  rate_limit_exceeded: "Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.",
  product_not_found_or_inactive: "Um dos itens selecionados não está disponível no momento. Recarregue a página.",
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

export default function GuiaEvolucaoEnfermagemPage() {
  useDocumentMeta({
    title: "Guia de Evolução de Enfermagem | Entre Nós",
    description: "Modelos, exemplos e consulta prática para evoluções de enfermagem — acesso imediato após o pagamento.",
    path: `/${guiaEvolucaoProduct.slug}`,
  });

  const { attempt } = useCheckoutAttempt(guiaEvolucaoProduct.slug);

  const [firstName, setFirstName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [selectedBumps, setSelectedBumps] = React.useState<Set<string>>(new Set());
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

  const totalCents =
    guiaEvolucaoProduct.priceCents +
    guiaEvolucaoBumps.filter((b) => selectedBumps.has(b.slug)).reduce((sum, b) => sum + b.priceCents, 0);

  // ── Retomada: se já existe um pedido salvo (localStorage) para este
  //    produto, consulta get-order-downloads UMA vez ao carregar a página.
  //    Só o caso "já pago" é reconstruído (mostra os downloads direto,
  //    mesmo depois de fechar o navegador) — qualquer outro resultado
  //    (ainda pendente, token inválido) descarta o acesso salvo e volta ao
  //    formulário normal, para não tentar reconstruir uma tela de Pix sem
  //    o QR Code (nunca persistido em localStorage).
  React.useEffect(() => {
    let cancelled = false;
    async function resume() {
      const access = readOrderAccess(guiaEvolucaoProduct.slug);
      if (!access) {
        setResuming(false);
        return;
      }
      const outcome = await getOrderDownloads(access.publicId, access.checkoutAccessToken);
      if (cancelled) return;
      if (outcome.kind === "paid") {
        setDownloads(outcome.downloads);
      } else {
        clearOrderAccess(guiaEvolucaoProduct.slug);
      }
      setResuming(false);
    }
    void resume();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Verificação automática: enquanto houver um pedido criado nesta
  //    sessão e ele ainda não estiver pago, consulta get-order-downloads
  //    periodicamente. Para no primeiro "paid" — nunca continua tentando
  //    depois disso.
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
      // "waiting": continua tentando. "error": falha passageira — nunca
      // pára o polling por causa de um erro isolado.
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

  function toggleBump(slug: string) {
    setSelectedBumps((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function submitOrder(name: string, mail: string, productSlugs: string[]) {
    if (turnstileFailed || !turnstileToken) {
      setTurnstileMissing(true);
      return;
    }

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

    // Token do Turnstile é de uso único — descarta e pede um novo,
    // independentemente do resultado.
    setTurnstileToken(null);
    turnstileRef.current?.reset();

    if (outcome.kind !== "error") {
      saveOrderAccess(guiaEvolucaoProduct.slug, {
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

    const productSlugs = [guiaEvolucaoProduct.slug, ...Array.from(selectedBumps)];
    void submitOrder(trimmedName, trimmedEmail, productSlugs);
  }

  async function handleCopyCode(qrCode: string) {
    try {
      await navigator.clipboard.writeText(qrCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Área de transferência indisponível — o código Pix continua visível
      // na tela para cópia manual.
    }
  }

  if (resuming) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink px-6 text-cream">
        <Loader2 className="h-6 w-6 animate-spin text-gold" aria-hidden="true" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-cream">
      <div className="shell flex flex-col gap-14 py-12">
        {downloads !== null ? (
          <PaidPanel downloads={downloads} />
        ) : showPixResult && result !== null ? (
          <ResultPanel
            result={result}
            copied={copied}
            onCopyCode={handleCopyCode}
          />
        ) : (
          <>
            <Hero />
            <Benefits />
            <Offer />
            {showForm && (
              <CheckoutForm
                firstName={firstName}
                setFirstName={setFirstName}
                email={email}
                setEmail={setEmail}
                errors={errors}
                selectedBumps={selectedBumps}
                onToggleBump={toggleBump}
                totalCents={totalCents}
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
                errorMessage={result?.kind === "error" && errorCategory === "input" ? errorMessageFor(result.code) : null}
              />
            )}
            {result?.kind === "error" && errorCategory !== null && errorCategory !== "input" && (
              <ErrorPanel code={result.code} category={errorCategory} />
            )}
          </>
        )}
      </div>
    </main>
  );
}

/* ────────────────────────────────── Hero ────────────────────────────────── */

function Hero() {
  return (
    <section className="flex flex-col items-center gap-6 text-center">
      <p className="eyebrow">Para técnicos e enfermeiros</p>
      <h1 className="max-w-[20ch] font-display text-[2rem] leading-tight text-cream sm:text-[2.6rem]">
        Cansado(a) de travar na hora de fazer a evolução de enfermagem?
      </h1>
      <p className="max-w-[46ch] text-[15px] leading-relaxed text-dim">
        O <strong className="text-cream">{guiaEvolucaoProduct.name}</strong> reúne modelos, exemplos e uma
        consulta prática para você registrar evoluções com clareza e segurança, no plantão ou nos estudos.
      </p>
      <span className="font-display text-[2.2rem] gold-text">{guiaEvolucaoProduct.priceLabel}</span>
      <Button size="lg" full className="max-w-[360px]" onClick={() => document.getElementById("checkout")?.scrollIntoView({ behavior: "smooth" })}>
        QUERO ACESSAR O GUIA
      </Button>
    </section>
  );
}

/* ──────────────────────────────── Benefícios ────────────────────────────── */

function Benefits() {
  const items = [
    "Modelos prontos de evolução de enfermagem, por situação clínica",
    "Exemplos reais para você adaptar ao seu plantão",
    "Consulta prática e rápida, sem enrolação",
    "Acesso imediato após a confirmação do pagamento",
  ];

  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-center font-display text-[1.4rem] text-cream">O que o guia te ajuda a fazer</h2>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 rounded-2xl border border-gold/20 bg-white/[0.03] p-4">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={2} aria-hidden="true" />
            <span className="text-[14.5px] leading-relaxed text-cream/90">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────────────────────────── Oferta ───────────────────────────────── */

function Offer() {
  return (
    <section className="flex flex-col items-center gap-4 rounded-[24px] border border-gold/25 bg-white/[0.03] p-6 text-center">
      <p className="eyebrow">Oferta</p>
      <h2 className="font-display text-[1.3rem] text-cream">{guiaEvolucaoProduct.name}</h2>
      <span className="font-display text-[1.8rem] gold-text">{guiaEvolucaoProduct.priceLabel}</span>
      <p className="text-[13px] text-dim">Pagamento único via Pix — acesso liberado assim que o pagamento é confirmado.</p>
    </section>
  );
}

/* ─────────────────────────────── Checkout ───────────────────────────────── */

function CheckoutForm({
  firstName,
  setFirstName,
  email,
  setEmail,
  errors,
  selectedBumps,
  onToggleBump,
  totalCents,
  submitting,
  canSubmit,
  onSubmit,
  siteKey,
  turnstileRef,
  turnstileFailed,
  turnstileMissing,
  onTurnstileToken,
  onTurnstileExpire,
  onTurnstileError,
  onRetryVerification,
  errorMessage,
}: {
  firstName: string;
  setFirstName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  errors: FormErrors;
  selectedBumps: Set<string>;
  onToggleBump: (slug: string) => void;
  totalCents: number;
  submitting: boolean;
  canSubmit: boolean;
  onSubmit: (event?: React.FormEvent) => void;
  siteKey: string | undefined;
  turnstileRef: React.RefObject<TurnstileWidgetHandle>;
  turnstileFailed: boolean;
  turnstileMissing: boolean;
  onTurnstileToken: (token: string) => void;
  onTurnstileExpire: () => void;
  onTurnstileError: () => void;
  onRetryVerification: () => void;
  errorMessage: string | null;
}) {
  return (
    <form id="checkout" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <p className="eyebrow">Últimos detalhes</p>
      <h2 className="-mt-3 font-display text-[1.4rem] leading-snug text-cream">Garanta seu acesso</h2>

      <div className="flex flex-col gap-2.5">
        <Label htmlFor="checkout-nome">Nome</Label>
        <Input
          id="checkout-nome"
          autoComplete="given-name"
          placeholder="Como podemos te chamar?"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          aria-invalid={Boolean(errors.name)}
          maxLength={80}
        />
        {errors.name && (
          <p role="alert" className="text-[13px] text-red-300">
            {errors.name}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <Label htmlFor="checkout-email">E-mail</Label>
        <Input
          id="checkout-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="seuemail@exemplo.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(errors.email)}
          maxLength={254}
        />
        {errors.email && (
          <p role="alert" className="text-[13px] text-red-300">
            {errors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-gold/25 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] font-semibold text-cream">{guiaEvolucaoProduct.name}</span>
          <span className="text-[14px] text-dim">{guiaEvolucaoProduct.priceLabel}</span>
        </div>
        <p className="text-[12px] text-dim">Produto principal — sempre incluído.</p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="eyebrow">Quer levar mais? (opcional)</p>
        {guiaEvolucaoBumps.map((bump) => (
          <label
            key={bump.slug}
            htmlFor={`bump-${bump.slug}`}
            className="flex cursor-pointer items-start justify-between gap-3 rounded-2xl border border-gold/20 bg-white/[0.02] p-3.5"
          >
            <span className="flex items-start gap-3">
              <Checkbox
                id={`bump-${bump.slug}`}
                checked={selectedBumps.has(bump.slug)}
                onCheckedChange={() => onToggleBump(bump.slug)}
              />
              <span className="text-[13.5px] leading-snug text-cream/90">{bump.name}</span>
            </span>
            <span className="whitespace-nowrap text-[13px] text-gold-light">+ {bump.priceLabel}</span>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-gold/30 bg-gold/[0.06] px-5 py-4">
        <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-dim">Total</span>
        <span className="font-display text-[1.3rem] gold-text">{formatCents(totalCents)}</span>
      </div>

      {siteKey ? (
        <TurnstileWidget
          ref={turnstileRef}
          siteKey={siteKey}
          action={TURNSTILE_ACTION}
          onToken={onTurnstileToken}
          onExpire={onTurnstileExpire}
          onError={onTurnstileError}
        />
      ) : (
        <p role="alert" className="text-center text-[13px] text-red-300">
          Não foi possível carregar a verificação de segurança. Recarregue a página.
        </p>
      )}
      {turnstileFailed && (
        <div className="flex flex-col items-center gap-2">
          <p role="alert" className="text-center text-[13px] text-red-300">
            Não foi possível carregar a verificação de segurança.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onRetryVerification}>
            Tentar verificação novamente
          </Button>
        </div>
      )}
      {turnstileMissing && !turnstileFailed && (
        <p role="alert" className="text-center text-[13px] text-red-300">
          Aguarde a verificação de segurança terminar antes de continuar.
        </p>
      )}

      {errorMessage && (
        <div role="alert" className="rounded-2xl border border-red-400/40 bg-red-500/[0.06] p-4">
          <p className="text-[14px] leading-relaxed text-cream/90">{errorMessage}</p>
        </div>
      )}

      <Button type="submit" full disabled={submitting || !canSubmit}>
        {submitting ? "Gerando seu Pix..." : "QUERO ACESSAR O GUIA"}
      </Button>
    </form>
  );
}

/* ─────────────────────────── Resultado (Pix) ────────────────────────────── */

function ResultPanel({
  result,
  copied,
  onCopyCode,
}: {
  result: Exclude<ProductCheckoutResult, { kind: "error" }>;
  copied: boolean;
  onCopyCode: (qrCode: string) => void;
}) {
  const order = result.order;

  if (result.kind === "pending") {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <h2 className="font-display text-[1.5rem] leading-tight text-cream">Falta pouco!</h2>
        <p className="max-w-[42ch] text-[14px] leading-relaxed text-dim">
          Escaneie o QR Code ou copie o código Pix abaixo para concluir o pagamento.
        </p>

        {result.pix.qrCodeBase64 && (
          <img
            src={`data:image/png;base64,${result.pix.qrCodeBase64}`}
            alt="QR Code Pix"
            className="h-[220px] w-[220px] rounded-2xl border border-gold/30 bg-white p-2"
          />
        )}

        <div className="w-full text-left">
          <Label htmlFor="pix-copia-cola">Pix copia e cola</Label>
          <textarea
            id="pix-copia-cola"
            readOnly
            value={result.pix.qrCode}
            rows={3}
            className="mt-2 w-full resize-none rounded-2xl border border-gold/25 bg-white/[0.04] p-3 text-[12.5px] leading-relaxed text-cream/85"
          />
          <Button type="button" full variant="outline" className="mt-2.5" onClick={() => onCopyCode(result.pix.qrCode)}>
            <Copy className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            {copied ? "Copiado!" : "Copiar código"}
          </Button>
        </div>

        <OrderSummaryPanel order={order} statusLabel="Aguardando pagamento" />
      </div>
    );
  }

  // "preparing" (shell) e "processing": ainda sem QR Code disponível —
  // a verificação automática (polling de get-order-downloads) continua
  // rodando em segundo plano até o pagamento ser confirmado.
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-gold" aria-hidden="true" />
      <h2 className="font-display text-[1.5rem] leading-tight text-cream">Preparando seu Pix...</h2>
      <p className="max-w-[42ch] text-[14px] leading-relaxed text-dim">
        Estamos confirmando os detalhes do seu pagamento. Isso pode levar alguns instantes.
      </p>
      <OrderSummaryPanel order={order} statusLabel="Aguardando pagamento" />
    </div>
  );
}

function OrderSummaryPanel({ order, statusLabel }: { order: ProductOrderSummary; statusLabel: string }) {
  const rows = [
    { label: "Itens", value: order.items.map((item) => item.name).join(", ") },
    { label: "Valor", value: formatCents(order.amountCents) },
    { label: "Status", value: statusLabel },
  ];

  return (
    <dl className="grid w-full gap-px overflow-hidden rounded-[20px] border border-gold/30 bg-gold/20">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 bg-ink-soft px-5 py-3.5">
          <dt className="text-[12px] font-semibold uppercase tracking-[0.14em] text-dim">{row.label}</dt>
          <dd className="text-right text-[13.5px] font-semibold text-cream">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ──────────────────────────── Pagamento confirmado ──────────────────────── */

function PaidPanel({ downloads }: { downloads: DownloadItem[] }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <span
        aria-hidden="true"
        className="grid h-16 w-16 place-items-center rounded-full border border-gold/45 bg-gold/[0.08] text-gold"
        style={{ boxShadow: "0 0 40px -10px rgba(217,172,91,0.75)" }}
      >
        <Check className="h-7 w-7" strokeWidth={1.8} />
      </span>
      <h2 className="font-display text-[1.5rem] leading-tight text-cream">Pagamento confirmado ✅</h2>
      <p className="max-w-[42ch] text-[14px] leading-relaxed text-dim">Seus materiais estão disponíveis.</p>

      <div className="flex w-full flex-col gap-3">
        {downloads.map((download) => (
          <div
            key={download.slug}
            className="flex items-center justify-between gap-4 rounded-2xl border border-gold/25 bg-white/[0.03] p-4"
          >
            <span className="text-[14px] font-medium text-cream">{download.name}</span>
            <Button asChild size="sm">
              <a href={download.url} target="_blank" rel="noopener noreferrer" download>
                <Download className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                BAIXAR
              </a>
            </Button>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-dim">
        Os links de download expiram após um tempo — se precisar, recarregue esta página para gerar novos.
      </p>
    </div>
  );
}

/* ─────────────────────────────── Erro (contact/restart/temporário) ──────── */

function ErrorPanel({ code, category }: { code: string; category: "temporary" | "contact" | "restart" }) {
  const message = errorMessageFor(code);

  if (category === "contact") {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <div role="alert" className="rounded-2xl border border-red-400/40 bg-red-500/[0.06] p-4">
          <p className="text-[14px] leading-relaxed text-cream/90">{message}</p>
        </div>
        <Button asChild full>
          <a href={buildPixSupportWhatsAppUrl(null)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
            Falar com o suporte
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div role="alert" className="rounded-2xl border border-red-400/40 bg-red-500/[0.06] p-4">
        <p className="text-[14px] leading-relaxed text-cream/90">{message}</p>
      </div>
      <Button type="button" full onClick={() => window.location.reload()}>
        Tentar novamente
      </Button>
    </div>
  );
}
