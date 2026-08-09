/**
 * Checkout Pix transparente da Leitura Essencial — substitui a etapa final
 * de WhatsApp por um pagamento Pix direto no site, via
 * public.create-pix-order (Edge Function já implantada).
 *
 * Fluxo: formulário (nome, e-mail, 3 perguntas, Turnstile) → "Gerar meu
 * Pix" → QR Code + Copia e Cola (pendente) | "sendo processado" | "pagamento
 * confirmado" | erro. Nunca redireciona para o WhatsApp, nunca marca como
 * pago no frontend — o status exibido é sempre o que a Edge Function
 * devolveu na última chamada.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Copy, MessageCircle } from "lucide-react";
import { copy, type ReadingPackage } from "@/config/site";
import { useCheckoutAttempt } from "@/lib/checkoutAttempt";
import { classifyCheckoutErrorCode, createPixOrder, type OrderSummary, type PixCheckoutResult } from "@/lib/pixCheckout";
import { buildPixSupportWhatsAppUrl } from "@/lib/whatsapp";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { TurnstileWidget, type TurnstileWidgetHandle } from "./TurnstileWidget";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_QUESTION_LENGTH = 2000;
const TURNSTILE_ACTION = "create_pix_order";

interface FormErrors {
  name?: string;
  email?: string;
  questions?: string;
  consent?: string;
}

function parseQuestions(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function formatAmount(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export function PixEssentialCheckout({
  pkg,
  onChangePackage,
}: {
  pkg: ReadingPackage;
  onChangePackage: () => void;
}) {
  const t = copy.pixCheckout;
  const pixSlug = pkg.pixCheckoutSlug;

  const { attempt, resetAttempt } = useCheckoutAttempt(pixSlug ?? pkg.id);

  const [firstName, setFirstName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [questionsText, setQuestionsText] = React.useState("");
  const [consentPrice, setConsentPrice] = React.useState(false);
  const [consentDeadline, setConsentDeadline] = React.useState(false);
  const [consentAge, setConsentAge] = React.useState(false);
  const [consentTerms, setConsentTerms] = React.useState(false);
  const [errors, setErrors] = React.useState<FormErrors>({});

  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);
  const [turnstileMissing, setTurnstileMissing] = React.useState(false);
  const [turnstileFailed, setTurnstileFailed] = React.useState(false);
  const turnstileRef = React.useRef<TurnstileWidgetHandle>(null);

  const [locked, setLocked] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<PixCheckoutResult | null>(null);
  const [copied, setCopied] = React.useState(false);

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  const errorCategory = result?.kind === "error" ? classifyCheckoutErrorCode(result.code) : null;

  /* Turnstile precisa continuar disponível (e produzindo um token novo,
     de uso único) sempre que uma NOVA chamada à Edge Function ainda pode
     acontecer: primeiro envio, formulário reaberto por erro de entrada,
     "verificar novamente" em preparing/pending/processing, ou retry de
     erro temporário. Nunca nos estados finais (processed) nem quando a
     orientação é parar de tentar sozinha (contact/restart). */
  const needsTurnstile =
    !locked ||
    result?.kind === "pending" ||
    result?.kind === "preparing" ||
    result?.kind === "processing" ||
    errorCategory === "temporary";

  // Exige token não vazio, nenhum envio em curso E nenhuma falha do
  // Turnstile ainda não resolvida — um token obtido ANTES de um erro
  // posterior do widget nunca autoriza envio sozinho.
  const canSubmit = Boolean(turnstileToken) && !submitting && !turnstileFailed;

  /* Handlers reutilizáveis do Turnstile — os DOIS widgets (formulário e
     tela de resultado/retry) usam exatamente os mesmos, para que o ciclo
     token → expiração/erro → bloqueio de envio se comporte de forma
     idêntica nos dois lugares. */
  const handleTurnstileToken = React.useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileMissing(false);
    setTurnstileFailed(false);
  }, []);

  const handleTurnstileExpire = React.useCallback(() => {
    setTurnstileToken(null);
    // Expiração é um evento normal do ciclo de vida do widget (~5 min) —
    // pede um token novo proativamente, sem esperar a cliente notar.
    turnstileRef.current?.reset();
  }, []);

  const handleTurnstileError = React.useCallback(() => {
    setTurnstileToken(null);
    setTurnstileFailed(true);
    // NUNCA chama reset() automaticamente aqui: um erro persistente (rede,
    // extensão de navegador bloqueando o widget) resetaria e falharia de
    // novo em loop. A nova tentativa só acontece quando a cliente clica
    // explicitamente em "Tentar verificação novamente".
  }, []);

  const handleRetryVerification = React.useCallback(() => {
    setTurnstileFailed(false);
    setTurnstileToken(null);
    turnstileRef.current?.reset();
  }, []);

  async function submitOrder(name: string, mail: string, questions: string[]) {
    if (turnstileFailed || !turnstileToken) {
      setTurnstileMissing(true);
      return;
    }
    if (!pixSlug) {
      // Nunca deveria acontecer — este componente só é usado para o
      // pacote com checkout Pix habilitado.
      return;
    }

    setSubmitting(true);
    setTurnstileMissing(false);

    const outcome = await createPixOrder({
      checkoutRequestId: attempt.checkoutRequestId,
      checkoutAccessToken: attempt.checkoutAccessToken,
      packageSlug: pixSlug,
      customerName: name,
      customerEmail: mail,
      questions,
      turnstileToken,
    });

    setSubmitting(false);
    setResult(outcome);

    // Token consumido nesta chamada — descarta e pede um novo,
    // independentemente do resultado (tokens do Turnstile são de uso único).
    setTurnstileToken(null);
    turnstileRef.current?.reset();

    if (outcome.kind === "error" && classifyCheckoutErrorCode(outcome.code) === "input") {
      // Nenhum pedido foi criado no servidor — mantém o formulário
      // editável para a cliente corrigir e reenviar.
      setLocked(false);
      return;
    }
    setLocked(true);
  }

  function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    if (submitting) return;

    const nextErrors: FormErrors = {};
    const trimmedName = firstName.trim();
    if (trimmedName.length < 2) nextErrors.name = t.nameError;

    const trimmedEmail = email.trim();
    if (!EMAIL_REGEX.test(trimmedEmail)) nextErrors.email = t.emailError;

    const parsedQuestions = parseQuestions(questionsText);
    if (parsedQuestions.length !== pkg.questions) {
      nextErrors.questions = t.questionsError;
    } else if (parsedQuestions.some((q) => q.length > MAX_QUESTION_LENGTH)) {
      nextErrors.questions = t.questionsTooLongError;
    }

    if (!consentPrice || !consentDeadline || !consentAge || !consentTerms) {
      nextErrors.consent = t.consentError;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    void submitOrder(trimmedName, trimmedEmail, parsedQuestions);
  }

  function handleRetry() {
    // Reenvia com os MESMOS dados já validados (nome/e-mail/perguntas não
    // mudaram) — só o turnstile_token é novo.
    handleSubmit();
  }

  function handleStartOver() {
    resetAttempt();
    setResult(null);
    setLocked(false);
    setErrors({});
    setConsentPrice(false);
    setConsentDeadline(false);
    setConsentAge(false);
    setConsentTerms(false);
    setTurnstileToken(null);
    setTurnstileMissing(false);
    setTurnstileFailed(false);
    turnstileRef.current?.reset();
  }

  async function handleCopyCode(qrCode: string) {
    try {
      await navigator.clipboard.writeText(qrCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Área de transferência indisponível — sem feedback de sucesso; o
      // código Pix continua visível na tela para cópia manual.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-gold/25 bg-white/[0.03] p-4">
        <span>
          <span className="block font-display text-[1.1rem] text-cream">{pkg.name}</span>
          <span className="text-[12.5px] text-dim">{pkg.questions} perguntas</span>
        </span>
        <span className="font-display text-[1.3rem] gold-text">{pkg.priceLabel}</span>
      </div>
      {!locked && (
        <button
          type="button"
          onClick={onChangePackage}
          className="-mt-3 text-left text-[12.5px] text-dim underline underline-offset-4 transition-colors hover:text-gold-light"
        >
          {t.changePackage}
        </button>
      )}

      {!locked && (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <p className="eyebrow">{t.detailsEyebrow}</p>
          <h2 className="-mt-3 font-display text-[1.4rem] leading-snug text-cream">{t.detailsTitle}</h2>

          <div className="flex flex-col gap-2.5">
            <Label htmlFor="pix-nome">{t.nameLabel}</Label>
            <Input
              id="pix-nome"
              autoComplete="given-name"
              placeholder={t.namePlaceholder}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              aria-invalid={Boolean(errors.name)}
              maxLength={40}
            />
            {errors.name && (
              <p role="alert" className="text-[13px] text-red-300">
                {errors.name}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <Label htmlFor="pix-email">{t.emailLabel}</Label>
            <Input
              id="pix-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t.emailPlaceholder}
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

          <div className="flex flex-col gap-2.5">
            <Label htmlFor="pix-perguntas">{t.questionsLabel}</Label>
            <textarea
              id="pix-perguntas"
              value={questionsText}
              onChange={(event) => setQuestionsText(event.target.value)}
              placeholder={t.questionsPlaceholder}
              rows={5}
              aria-invalid={Boolean(errors.questions)}
              className="w-full rounded-2xl border border-gold/25 bg-white/[0.04] p-4 text-[15px] leading-relaxed text-cream placeholder:text-dim/50 transition-colors focus:border-gold/70 focus:bg-white/[0.06]"
            />
            {errors.questions && (
              <p role="alert" className="text-[13px] text-red-300">
                {errors.questions}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <label htmlFor="pix-consent-price" className="flex cursor-pointer items-start gap-3">
              <Checkbox
                id="pix-consent-price"
                checked={consentPrice}
                onCheckedChange={(value) => setConsentPrice(value === true)}
                aria-describedby={errors.consent ? "pix-consent-error" : undefined}
              />
              <span className="text-[13.5px] leading-snug text-cream/90">{t.consentPriceLabel}</span>
            </label>
            <label htmlFor="pix-consent-deadline" className="flex cursor-pointer items-start gap-3">
              <Checkbox
                id="pix-consent-deadline"
                checked={consentDeadline}
                onCheckedChange={(value) => setConsentDeadline(value === true)}
                aria-describedby={errors.consent ? "pix-consent-error" : undefined}
              />
              <span className="text-[13.5px] leading-snug text-cream/90">{t.consentDeadlineLabel}</span>
            </label>
            <label htmlFor="pix-consent-age" className="flex cursor-pointer items-start gap-3">
              <Checkbox
                id="pix-consent-age"
                checked={consentAge}
                onCheckedChange={(value) => setConsentAge(value === true)}
                aria-describedby={errors.consent ? "pix-consent-error" : undefined}
              />
              <span className="text-[13.5px] leading-snug text-cream/90">{t.consentAgeLabel}</span>
            </label>
            <label htmlFor="pix-consent-terms" className="flex cursor-pointer items-start gap-3">
              <Checkbox
                id="pix-consent-terms"
                checked={consentTerms}
                onCheckedChange={(value) => setConsentTerms(value === true)}
                aria-describedby={errors.consent ? "pix-consent-error" : undefined}
              />
              <span className="text-[13.5px] leading-snug text-cream/90">
                {t.consentTermsBeforeLink}
                <Link to="/termos" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-gold-light">
                  {t.consentTermsLinkLabel}
                </Link>
                {t.consentTermsBetweenLinks}
                <Link to="/privacidade" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-gold-light">
                  {t.consentPrivacyLinkLabel}
                </Link>
                {t.consentTermsAfterLink}
              </span>
            </label>
            {errors.consent && (
              <p id="pix-consent-error" role="alert" className="text-[13px] text-red-300">
                {errors.consent}
              </p>
            )}
          </div>

          {needsTurnstile &&
            (siteKey ? (
              <TurnstileWidget
                ref={turnstileRef}
                siteKey={siteKey}
                action={TURNSTILE_ACTION}
                onToken={handleTurnstileToken}
                onExpire={handleTurnstileExpire}
                onError={handleTurnstileError}
              />
            ) : (
              <p role="alert" className="text-center text-[13px] text-red-300">
                {t.turnstileLoadError}
              </p>
            ))}
          {turnstileFailed && <TurnstileFailedNotice onRetryVerification={handleRetryVerification} />}
          {turnstileMissing && !turnstileFailed && (
            <p role="alert" className="text-center text-[13px] text-red-300">
              {t.turnstileRequiredError}
            </p>
          )}

          {result?.kind === "error" && errorCategory === "input" && (
            <ErrorNotice message={errorMessageFor(result.code)} />
          )}

          <Button type="submit" full disabled={submitting || !canSubmit}>
            {submitting ? t.submittingCta : t.submitCta}
          </Button>
        </form>
      )}

      {locked && result && (
        <ResultPanel
          result={result}
          errorCategory={errorCategory}
          submitting={submitting}
          canSubmit={canSubmit}
          onRetry={handleRetry}
          onStartOver={handleStartOver}
          onCopyCode={handleCopyCode}
          copied={copied}
        />
      )}

      {locked && needsTurnstile && (
        <div className="flex flex-col items-center gap-2">
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
            <p role="alert" className="text-center text-[13px] text-red-300">
              {t.turnstileLoadError}
            </p>
          )}
          {turnstileFailed && <TurnstileFailedNotice onRetryVerification={handleRetryVerification} />}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── Falha do Turnstile ─────────────────────────── */

function TurnstileFailedNotice({ onRetryVerification }: { onRetryVerification: () => void }) {
  const t = copy.pixCheckout;
  return (
    <div className="flex flex-col items-center gap-2">
      <p role="alert" className="text-center text-[13px] text-red-300">
        {t.turnstileLoadError}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRetryVerification}>
        {t.turnstileRetryCta}
      </Button>
    </div>
  );
}

/* ─────────────────────────── Mensagens de erro ─────────────────────────── */

function errorMessageFor(code: string): string {
  const messages = copy.pixCheckout.errorMessages as Record<string, string>;
  return messages[code] ?? copy.pixCheckout.genericError;
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-400/40 bg-red-500/[0.06] p-4">
      <p className="text-[14px] leading-relaxed text-cream/90">{message}</p>
    </div>
  );
}

/* ────────────────────────────── Resultado ──────────────────────────────── */

function ResultPanel({
  result,
  errorCategory,
  submitting,
  canSubmit,
  onRetry,
  onStartOver,
  onCopyCode,
  copied,
}: {
  result: PixCheckoutResult;
  errorCategory: ReturnType<typeof classifyCheckoutErrorCode> | null;
  submitting: boolean;
  canSubmit: boolean;
  onRetry: () => void;
  onStartOver: () => void;
  onCopyCode: (qrCode: string) => void;
  copied: boolean;
}) {
  const t = copy.pixCheckout;

  if (result.kind === "pending") {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <h2 className="font-display text-[1.5rem] leading-tight text-cream">{t.pendingTitle}</h2>
        <p className="max-w-[42ch] text-[14px] leading-relaxed text-dim">{t.pendingText}</p>

        {result.pix.qrCodeBase64 && (
          <img
            src={`data:image/png;base64,${result.pix.qrCodeBase64}`}
            alt={t.qrCodeAlt}
            className="h-[220px] w-[220px] rounded-2xl border border-gold/30 bg-white p-2"
          />
        )}

        <div className="w-full text-left">
          <Label htmlFor="pix-copia-cola">{t.copyCodeLabel}</Label>
          <div className="mt-2 flex items-stretch gap-2">
            <textarea
              id="pix-copia-cola"
              readOnly
              value={result.pix.qrCode}
              rows={3}
              className="w-full resize-none rounded-2xl border border-gold/25 bg-white/[0.04] p-3 text-[12.5px] leading-relaxed text-cream/85"
            />
          </div>
          <Button
            type="button"
            full
            variant="outline"
            className="mt-2.5"
            onClick={() => onCopyCode(result.pix.qrCode)}
          >
            <Copy className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            {copied ? t.copyCodeCopied : t.copyCodeButton}
          </Button>
        </div>

        <OrderDetails order={result.order} statusLabel="Aguardando pagamento" />

        <Button type="button" full onClick={onRetry} disabled={submitting || !canSubmit}>
          {submitting ? t.checkingPaymentCta : t.checkPaymentCta}
        </Button>
      </div>
    );
  }

  if (result.kind === "preparing") {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <h2 className="font-display text-[1.5rem] leading-tight text-cream">{t.preparingTitle}</h2>
        <p className="max-w-[42ch] text-[14px] leading-relaxed text-dim">{t.preparingText}</p>
        <OrderDetails order={result.order} statusLabel={t.preparingStatusLabel} />
        <Button type="button" full onClick={onRetry} disabled={submitting || !canSubmit}>
          {submitting ? t.checkingPaymentCta : t.preparingCheckCta}
        </Button>
      </div>
    );
  }

  if (result.kind === "processing") {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <h2 className="font-display text-[1.5rem] leading-tight text-cream">{t.processingTitle}</h2>
        <p className="max-w-[42ch] text-[14px] leading-relaxed text-dim">{t.processingText}</p>
        <OrderDetails order={result.order} statusLabel={t.processingStatusLabel} />
        <Button type="button" full onClick={onRetry} disabled={submitting || !canSubmit}>
          {submitting ? t.checkingPaymentCta : t.checkPaymentCta}
        </Button>
      </div>
    );
  }

  if (result.kind === "processed") {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <span
          aria-hidden="true"
          className="grid h-16 w-16 place-items-center rounded-full border border-gold/45 bg-gold/[0.08] text-gold"
          style={{ boxShadow: "0 0 40px -10px rgba(217,172,91,0.75)" }}
        >
          <Check className="h-7 w-7" strokeWidth={1.8} />
        </span>
        <h2 className="font-display text-[1.5rem] leading-tight text-cream">{t.processedTitle}</h2>
        <p className="max-w-[42ch] text-[14px] leading-relaxed text-dim">{t.processedText}</p>
        <OrderDetails order={result.order} statusLabel="Pago" />
      </div>
    );
  }

  // result.kind === "error"
  const message = errorMessageFor(result.code);

  if (errorCategory === "contact") {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <ErrorNotice message={t.blockedRetryMessage} />
        <Button asChild full>
          <a href={buildPixSupportWhatsAppUrl(null)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
            {t.contactSupportCta}
          </a>
        </Button>
      </div>
    );
  }

  if (errorCategory === "restart") {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <ErrorNotice message={message} />
        <Button type="button" full onClick={onStartOver}>
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          {t.startOverCta}
        </Button>
      </div>
    );
  }

  // "temporary" (categoria "input" nunca chega aqui — o formulário some do
  // estado travado antes disso).
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <ErrorNotice message={message} />
      <Button type="button" full onClick={onRetry} disabled={submitting || !canSubmit}>
        {submitting ? t.submittingCta : t.retryCta}
      </Button>
    </div>
  );
}

function OrderDetails({ order, statusLabel }: { order: OrderSummary; statusLabel: string }) {
  const t = copy.pixCheckout;
  const rows = [
    { label: t.orderPackageLabel, value: order.packageName },
    { label: t.orderAmountLabel, value: formatAmount(order.amountCents, order.currency) },
    { label: t.orderStatusLabel, value: statusLabel },
  ];

  return (
    <dl className="grid w-full gap-px overflow-hidden rounded-[20px] border border-gold/30 bg-gold/20">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 bg-ink-soft px-5 py-3.5">
          <dt className="text-[12px] font-semibold uppercase tracking-[0.14em] text-dim">{row.label}</dt>
          <dd className="text-right text-[15px] font-semibold text-cream">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
