/**
 * Página comercial do Guia de Evolução de Enfermagem — fora do funil de
 * tarô. Estrutura e copy reconstroem a landing de referência já validada
 * em conversão (reference/manual2026.html, /manual2026/): Hero → 3 dores
 * → carrossel de conteúdo → quiz (perguntas → perfil → resultado) →
 * oferta/preço/checkout → Pix → confirmação + downloads.
 *
 * O CHECKOUT em si (Turnstile, create-product-order, get-order-downloads,
 * polling, orderAccess/checkoutAttempt, slugs e order bumps) é o MESMO já
 * aprovado em TEST — só a apresentação visual e a estrutura comercial ao
 * redor dele mudaram nesta etapa. Preço e itens exibidos vêm de
 * src/config/digitalProducts.ts (só para UX) — o valor REAL cobrado é
 * sempre o que create-product-order devolve (order.amount_cents),
 * calculado no banco pela RPC create_or_get_product_order_with_items().
 * O total mostrado ao marcar bumps é só uma prévia visual, nunca enviado
 * ao backend.
 *
 * Visual: branco + verde-azulado profissional (paleta padrão do
 * Tailwind — teal/slate/emerald), tipografia sans (Manrope), sem nenhum
 * traço da identidade dark/dourada do tarô. Nenhuma alteração em
 * tailwind.config.js nem em src/index.css — só classes locais a este
 * arquivo, mais um pequeno ajuste de cor de fundo do <body> só enquanto
 * esta página está montada (ver useEffect abaixo), para não deixar
 * escapar o fundo escuro global em bounce/overscroll.
 *
 * Cronômetro de urgência da página antiga: DELIBERADAMENTE não
 * reimplementado aqui. Não existe nenhuma regra comercial real por trás
 * dele (preço fixo, sem validade) — reintroduzir um cronômetro sem uma
 * condição real seria falsa escassez.
 *
 * Imagens reais (capa + 5 páginas do carrossel) vivem em
 * public/guia-evolucao/*.webp — convertidas via sharp (já era
 * devDependency do projeto, nenhuma lib nova) a partir dos PNGs
 * originais fornecidos (mantidos intactos em public/guia-evolucao/*.png,
 * nunca servidos diretamente). object-contain em toda parte: a imagem
 * inteira é sempre preservada, nunca cortada.
 */
import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  HeartPulse,
  Hourglass,
  Loader2,
  Lock,
  MessageCircle,
  PenLine,
  ShieldCheck,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import {
  guiaQuizQuestions,
  guiaProfileOptions,
  guiaProfileMessages,
  guiaQuizPerformanceMessage,
  type NursingProfile,
} from "@/config/guiaQuiz";
import { buildPixSupportWhatsAppUrl } from "@/lib/whatsapp";
import { initGuiaPixel, trackGuiaLead, trackGuiaQuizInterest, trackGuiaInitiateCheckout, trackGuiaPurchase } from "@/lib/guiaPixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/checkout/TurnstileWidget";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TURNSTILE_ACTION = "create_product_order";
const POLL_INTERVAL_MS = 5_000;
const OFFER_SECTION_ID = "comprar";
/**
 * Larguras de conteúdo locais a esta página — repetidas em classes em vez
 * de virarem classe global (@layer components), para não tocar index.css
 * nem afetar o tarô. PANEL_CONTAINER é só para as telas transacionais
 * (Pix pendente / downloads liberados); as seções de marketing usam
 * larguras maiores (definidas em cada componente) para ter presença no
 * desktop.
 */
const PANEL_CONTAINER = "mx-auto w-full max-w-[640px] px-5";

/**
 * Sistema de sombra em 3 níveis — só para esta página (classes locais,
 * repetidas via constante em vez de virar @layer components global).
 * Sempre em camadas (uma sombra de contato curta + uma difusa longa),
 * nunca uma sombra preta única e pesada. SOFT para elementos secundários
 * (badges, ícones, cards do carrossel), MEDIUM para blocos de conteúdo
 * (quiz, dores), STRONG só para os pontos de maior destaque (mockup do
 * produto, card de checkout).
 */
const SHADOW_SOFT = "shadow-[0_2px_4px_rgba(15,23,42,0.04),0_8px_20px_-14px_rgba(15,23,42,0.12)]";
const SHADOW_MEDIUM = "shadow-[0_4px_8px_rgba(15,23,42,0.05),0_20px_40px_-20px_rgba(15,23,42,0.16)]";
const SHADOW_STRONG = "shadow-[0_8px_16px_rgba(15,23,42,0.06),0_30px_60px_-24px_rgba(15,23,42,0.22)]";

/**
 * Botão CTA "premium": sombra de contato + realce interno sutil no topo
 * (sensação de superfície real, não retângulo chapado), elevação de 1px
 * no hover, afundamento de 1px no active — sem 3D exagerado, sem dourado.
 * Reaproveitado em TODOS os CTAs principais da página para manter um
 * sistema único e consistente.
 */
const CTA_BUTTON_CLASS = cn(
  "border-transparent bg-teal-600 text-white transition-all duration-200",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_4px_rgba(15,23,42,0.08),0_10px_24px_-10px_rgba(13,148,136,0.55)]",
  "hover:-translate-y-px hover:border-transparent hover:bg-teal-700",
  "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_4px_10px_rgba(15,23,42,0.10),0_18px_34px_-12px_rgba(13,148,136,0.6)]",
  "active:translate-y-px active:shadow-[inset_0_1px_2px_rgba(15,23,42,0.25)]",
  "disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0",
);

/**
 * Texturas de fundo — só CSS (radial-gradient), sem imagem/biblioteca,
 * opacidades muito baixas (5-6%) para não competir com o conteúdo nem
 * pesar no LCP. TEAL_BLOOM para fundos brancos, DOTS para fundos slate.
 */
const TEXTURE_TEAL_BLOOM: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(55% 45% at 12% 0%, rgba(13,148,136,0.06), transparent 60%), radial-gradient(45% 40% at 100% 100%, rgba(13,148,136,0.05), transparent 60%)",
};
const TEXTURE_DOTS: React.CSSProperties = {
  backgroundImage: "radial-gradient(rgba(13,148,136,0.06) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

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

function scrollToOffer() {
  document.getElementById(OFFER_SECTION_ID)?.scrollIntoView({ behavior: "smooth" });
}

export default function GuiaEvolucaoEnfermagemPage() {
  useDocumentMeta({
    title: "Guia de Evolução de Enfermagem — Modelos Prontos para o Plantão",
    description:
      "Mais de 130 modelos prontos de evolução e anotação de enfermagem, em PDF, para Clínica Médica, UTI e Emergência. Acesso imediato via Pix.",
    path: `/${guiaEvolucaoProduct.slug}`,
  });

  // Fundo do <body> é escuro globalmente (tema do tarô, em src/index.css,
  // não alterado). Só enquanto esta página está montada, força um fundo
  // claro no <body> para não deixar o escuro escapar em bounce/overscroll
  // (ex.: iOS Safari) — desfeito automaticamente ao sair da página.
  React.useEffect(() => {
    const previous = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#ffffff";
    return () => {
      document.body.style.backgroundColor = previous;
    };
  }, []);

  // Pixel do Guia — script + init + PageView + ViewContent, uma única vez.
  React.useEffect(() => {
    initGuiaPixel();
  }, []);

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

  // Guarda de disparo do Purchase: só existe valor real quando o pedido foi
  // criado NESTA sessão (create-product-order devolveu order.amountCents).
  // No fluxo de retomada (pedido pago encontrado ao recarregar a página),
  // este valor permanece null e o Purchase NUNCA dispara — não há como
  // obter o valor real confirmado sem alterar get-order-downloads, e
  // inventar um valor no frontend é exatamente o que foi proibido.
  const orderAmountCentsRef = React.useRef<number | null>(null);
  const purchaseFiredRef = React.useRef(false);

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

  // ── Purchase: dispara exatamente uma vez, no exato instante em que
  //    "paid" é confirmado (downloads deixa de ser null) DENTRO desta
  //    sessão — nunca no clique do botão, nunca ao gerar o QR Code, nunca
  //    enquanto pending_payment. purchaseFiredRef garante que um
  //    re-render (ou o StrictMode do React em dev, que re-executa efeitos)
  //    nunca duplica o evento.
  React.useEffect(() => {
    if (downloads === null) return;
    if (purchaseFiredRef.current) return;
    const amountCents = orderAmountCentsRef.current;
    if (amountCents === null) return; // fluxo de retomada — ver comentário acima do ref.
    purchaseFiredRef.current = true;
    trackGuiaPurchase(amountCents);
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

    // InitiateCheckout: início efetivo do checkout — Turnstile já validou,
    // prestes a chamar create-product-order. Valor de sinalização, vindo
    // do total calculado no frontend (produto + bumps); nunca usado para
    // cobrança real.
    trackGuiaInitiateCheckout(totalCents);

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
      // Único momento em que temos o valor REAL confirmado pelo backend
      // para este pedido — guardado para o Purchase, disparado só quando
      // o pagamento for de fato confirmado (ver useEffect acima).
      orderAmountCentsRef.current = outcome.order.amountCents;
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

  function handleQuizProfileSelected() {
    trackGuiaLead(guiaEvolucaoProduct.priceCents);
  }

  function handleQuizResultCta() {
    trackGuiaQuizInterest();
    scrollToOffer();
  }

  if (resuming) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" aria-hidden="true" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white font-sans text-slate-900">
      {downloads !== null ? (
        <div className={cn(PANEL_CONTAINER, "py-16")}>
          <PaidPanel downloads={downloads} />
        </div>
      ) : showPixResult && result !== null ? (
        <div className={cn(PANEL_CONTAINER, "py-16")}>
          <ResultPanel result={result} copied={copied} onCopyCode={handleCopyCode} />
        </div>
      ) : (
        <>
          <Hero />
          <PainSection />
          <ModulesSection />
          <QuizSection onProfileSelected={handleQuizProfileSelected} onResultCta={handleQuizResultCta} />
          <OfferSection>
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
          </OfferSection>
        </>
      )}
    </main>
  );
}

/* ────────────────────────────────── Hero ────────────────────────────────── */

const TRUST_ITEMS = [
  { icon: HeartPulse, label: "Fácil de entender" },
  { icon: ShieldCheck, label: "Mais segurança nos registros" },
  { icon: Clock, label: "Poupa seu tempo" },
];

function Hero() {
  return (
    <section
      className="relative overflow-hidden bg-white px-3.5 pb-16 pt-14 sm:px-5 sm:pb-20 sm:pt-16 lg:pb-24 lg:pt-20"
      style={TEXTURE_TEAL_BLOOM}
    >
      {/* Manchas de luz decorativas — só CSS (blur + opacidade baixa), nunca imagem. */}
      <div className="pointer-events-none absolute -left-24 top-6 h-72 w-72 rounded-full bg-teal-100/30 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-16 top-1/3 hidden h-80 w-80 rounded-full bg-teal-50/70 blur-3xl lg:block" aria-hidden="true" />

      <div className="relative mx-auto grid w-full max-w-[1180px] items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        {/* Coluna esquerda. No mobile (< lg), vira um grande card branco
            elevado (sensação de camada sobre o fundo texturizado da seção
            — referência de profundidade do Anexo 2, sem copiar cores nem
            o cronômetro dele). No desktop (lg+), volta a ser texto solto
            ao lado do mockup, exatamente como já aprovado. */}
        <div
          className={cn(
            "flex flex-col items-center gap-6 rounded-[30px] border border-white bg-white p-6 text-center sm:p-8",
            SHADOW_STRONG,
            "lg:items-start lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:text-left lg:shadow-none",
          )}
        >
          <span className={cn("inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            Feito de colega para colega
          </span>
          <h1 className="font-sans text-[2.125rem] font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-[2.5rem] lg:text-[3.25rem] xl:text-[3.75rem]">
            Saiba exatamente o que escrever no prontuário e{" "}
            <span className="text-teal-600">vá para casa em paz</span>
          </h1>
          <p className="max-w-[52ch] text-[16px] leading-relaxed text-slate-600 lg:text-[17.5px]">
            Você cuida do paciente com todo carinho, mas sente aquele frio na barriga na hora de fazer a evolução?
            Tenha em mãos roteiros simples e práticos para registrar seu plantão sem medo de errar.
          </p>

          {/* Benefícios — no mobile, "pills" empilhados e elevados (Anexo 2);
              no desktop, os badges compactos que já estavam aprovados. */}
          <div className="flex w-full flex-col gap-3 lg:hidden">
            {TRUST_ITEMS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className={cn(
                  "flex min-h-[56px] items-center gap-3 rounded-2xl border border-teal-100 bg-gradient-to-b from-teal-50/70 to-white px-5 py-3.5 text-left",
                  SHADOW_SOFT,
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-teal-600 shadow-sm">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="text-[14.5px] font-bold text-slate-800">{label}</span>
              </div>
            ))}
          </div>
          <div className="hidden lg:flex lg:flex-wrap lg:items-center lg:justify-start lg:gap-3">
            {TRUST_ITEMS.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className={cn("flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-[13px] font-semibold text-slate-700", SHADOW_SOFT)}
              >
                <Icon className="h-4 w-4 text-teal-600" strokeWidth={2} aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>

          <Button size="lg" variant="outline" full className={cn("max-w-[360px] lg:w-auto lg:px-12", CTA_BUTTON_CLASS)} onClick={scrollToOffer}>
            Quero acessar o guia
          </Button>
        </div>

        {/* Coluna direita — capa real do produto. Só no desktop (lg+):
            o Anexo 2 pede a remoção da capa no hero mobile. */}
        <div className="relative hidden lg:flex lg:justify-end">
          <div className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-[40px] bg-teal-100/40 blur-3xl" aria-hidden="true" />
          <div
            className={cn(
              "relative flex aspect-[3/4] w-full max-w-[380px] items-center justify-center overflow-hidden rounded-[32px] border border-white bg-white p-3",
              SHADOW_STRONG,
            )}
          >
            <img
              src="/guia-evolucao/capa-guia.webp"
              alt="Capa do Guia de Evolução de Enfermagem, material digital com modelos prontos de anotação e evolução de enfermagem"
              width={1086}
              height={1448}
              loading="eager"
              className="h-full w-full rounded-[22px] object-contain"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── Três dores ──────────────────────────────── */

const PAIN_POINTS = [
  {
    icon: PenLine,
    title: "O medo de travar",
    text: "Chegar no final do turno cansado, olhar para o prontuário em branco e não lembrar o termo certo para descrever o que você acabou de fazer.",
  },
  {
    icon: AlertTriangle,
    title: "Insegurança constante",
    text: "O receio de esquecer de anotar algo importante, usar a palavra errada e acabar se complicando com a supervisão ou em alguma auditoria.",
  },
  {
    icon: Hourglass,
    title: "Sair tarde do plantão",
    text: "Ficar horas a mais no setor só porque você demorou para conseguir organizar as ideias e escrever tudo o que aconteceu com o paciente.",
  },
];

function PainSection() {
  return (
    <section className="relative bg-slate-50 px-5 py-20 sm:py-24" style={TEXTURE_DOTS}>
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="mx-auto max-w-[640px] text-center">
          <span className={cn("inline-flex items-center rounded-full border border-teal-200 bg-white px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            Por que isso pesa tanto
          </span>
          <h2 className="mt-4 font-sans text-[1.9rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.35rem] lg:text-[2.65rem]">
            Não leve preocupação <span className="text-teal-600">para casa</span>
          </h2>
          <p className="mx-auto mt-3 max-w-[56ch] text-[15.5px] text-slate-600">
            A rotina do hospital já é pesada. Você não precisa transformar a anotação em mais um peso:
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3 lg:gap-8">
          {PAIN_POINTS.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className={cn(
                "relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-8 transition-all duration-200 hover:-translate-y-1",
                SHADOW_SOFT,
                "hover:shadow-[0_4px_8px_rgba(15,23,42,0.05),0_28px_50px_-22px_rgba(15,23,42,0.22)]",
              )}
            >
              {/* Detalhe teal muito sutil no fundo do card, para não deixar o bloco totalmente plano. */}
              <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-teal-50/70 blur-2xl" aria-hidden="true" />
              <span className={cn("relative flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-600", SHADOW_SOFT)}>
                <Icon className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <h3 className="relative mt-6 font-sans text-[1.2rem] font-bold text-slate-900">{title}</h3>
              <p className="relative mt-2.5 text-[15px] leading-relaxed text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── Demonstração do conteúdo (carrossel) ────────────── */

const MODULE_PAGES = [
  { src: "/guia-evolucao/modulo-1.webp", alt: "Página de exemplo do Guia de Evolução de Enfermagem — modelo 1, roteiro de anotação de enfermagem" },
  { src: "/guia-evolucao/modulo-2.webp", alt: "Página de exemplo do Guia de Evolução de Enfermagem — modelo 2, roteiro de anotação de enfermagem" },
  { src: "/guia-evolucao/modulo-3.webp", alt: "Página de exemplo do Guia de Evolução de Enfermagem — modelo 3, roteiro de anotação de enfermagem" },
  { src: "/guia-evolucao/modulo-4.webp", alt: "Página de exemplo do Guia de Evolução de Enfermagem — modelo 4, roteiro de anotação de enfermagem" },
  { src: "/guia-evolucao/modulo-5.webp", alt: "Página de exemplo do Guia de Evolução de Enfermagem — modelo 5, roteiro de anotação de enfermagem" },
];

function ModulesSection() {
  return (
    <section className="relative bg-white px-5 py-20 sm:py-24" style={TEXTURE_TEAL_BLOOM}>
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="mx-auto max-w-[640px] text-center">
          <span className={cn("inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            O acervo completo
          </span>
          <h2 className="mt-4 font-sans text-[1.9rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.35rem] lg:text-[2.65rem]">
            O que você vai <span className="text-teal-600">ter em mãos</span>
          </h2>
          <p className="mx-auto mt-3 max-w-[60ch] text-[15.5px] text-slate-600">
            Um acervo completo de roteiros amigáveis para Clínica Médica, UTI e Emergência. É só consultar e adaptar
            para o seu paciente.
          </p>
        </div>

        {/* Prova visual central do produto, antes do carrossel — badge com leve brilho de superfície. */}
        <div
          className={cn(
            "relative mx-auto mt-10 flex w-fit items-center gap-3 overflow-hidden rounded-full border border-teal-200 bg-gradient-to-b from-teal-50 to-white px-6 py-3",
            SHADOW_SOFT,
          )}
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/70 to-transparent" aria-hidden="true" />
          <Sparkles className="relative h-5 w-5 text-teal-600" aria-hidden="true" />
          <span className="relative font-sans text-[1.05rem] font-extrabold text-teal-800">+132 modelos prontos</span>
        </div>

        <div className="mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-1 pb-6 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          {MODULE_PAGES.map((page, i) => (
            <div
              key={page.src}
              className={cn(
                "flex aspect-[3/4] w-[85vw] shrink-0 snap-center items-center justify-center overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 p-3 transition-transform duration-200 hover:-translate-y-1.5 hover:rotate-0 sm:w-[280px] lg:w-[300px]",
                SHADOW_SOFT,
                // Rotação alternada extremamente sutil (~0.6°) — sensação de
                // folhas físicas empilhadas, não thumbnails chapados.
                i % 2 === 0 ? "rotate-[0.6deg]" : "-rotate-[0.6deg]",
              )}
            >
              <img
                src={page.src}
                alt={page.alt}
                width={1200}
                height={1600}
                loading="lazy"
                className="h-full w-full rounded-[16px] object-contain"
              />
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center justify-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> Arraste para ver o conteúdo
        </p>
      </div>
    </section>
  );
}

/* ────────────────────────────────── Quiz ─────────────────────────────────── */

type QuizPhase = "questions" | "profile" | "result";

function QuizSection({
  onProfileSelected,
  onResultCta,
}: {
  onProfileSelected: () => void;
  onResultCta: () => void;
}) {
  const [phase, setPhase] = React.useState<QuizPhase>("questions");
  const [index, setIndex] = React.useState(0);
  const [score, setScore] = React.useState(0);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [profile, setProfile] = React.useState<NursingProfile | null>(null);

  const question = guiaQuizQuestions[index];
  const isLast = index === guiaQuizQuestions.length - 1;

  function handleAnswer(optionIndex: number) {
    if (selected !== null) return;
    setSelected(optionIndex);
    if (optionIndex === question.answerIndex) setScore((s) => s + 1);
  }

  function handleNext() {
    if (isLast) {
      setPhase("profile");
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
  }

  function handleProfile(id: NursingProfile) {
    setProfile(id);
    setPhase("result");
    onProfileSelected();
  }

  // Só visual: progresso da BARRA (não da lógica) — conta a pergunta atual
  // como "concluída" assim que ela é respondida, para o preenchimento
  // acompanhar o feedback antes do clique em "Próxima questão".
  const progressPercent =
    phase === "questions"
      ? ((index + (selected !== null ? 1 : 0)) / guiaQuizQuestions.length) * 100
      : 100;

  return (
    <section id="quiz" className="relative bg-slate-50 px-5 py-20 sm:py-28" style={TEXTURE_DOTS}>
      <div className="mx-auto w-full max-w-[820px]">
        {phase !== "result" && (
          <div className="mb-10 text-center">
            <span className={cn("inline-flex items-center rounded-full border border-teal-200 bg-white px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
              Teste rápido
            </span>
            <h2 className="mt-4 font-sans text-[1.9rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.35rem]">
              Será que você está <span className="text-teal-600">registrando certo?</span>
            </h2>
            <p className="mx-auto mt-3 max-w-[52ch] text-[15.5px] text-slate-600">
              Pequenos detalhes fazem toda a diferença na proteção do seu COREN. Faça o teste rápido:
            </p>
          </div>
        )}

        <div className={cn("relative rounded-[32px] border border-slate-200 bg-white p-7 sm:p-10", SHADOW_MEDIUM)}>
          {/* Realce sutil no topo do card — sensação de superfície levemente convexa. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-[32px] bg-gradient-to-r from-transparent via-white to-transparent" aria-hidden="true" />

          {phase === "questions" && (
            <div className="flex flex-col gap-7">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between text-[12px] font-bold uppercase tracking-wide text-slate-400">
                  <span>
                    Pergunta {index + 1} de {guiaQuizQuestions.length}
                  </span>
                  <span className="text-teal-600">{Math.round(progressPercent)}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 shadow-inner">
                  <div
                    className="h-full rounded-full bg-teal-600 shadow-[0_1px_2px_rgba(13,148,136,0.5)] transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-[1.25rem] font-bold leading-snug text-slate-900 sm:text-[1.4rem]">{question.question}</p>
              </div>

              <div className="flex flex-col gap-3">
                {question.options.map((option, i) => {
                  const isCorrectOption = i === question.answerIndex;
                  const isSelectedOption = i === selected;
                  const answered = selected !== null;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleAnswer(i)}
                      disabled={answered}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-2xl border-2 px-5 py-4 text-left text-[15.5px] font-semibold transition-all duration-200",
                        !answered && cn("border-slate-200 bg-white text-slate-800 hover:-translate-y-0.5 hover:border-teal-400 hover:bg-teal-50/60", SHADOW_SOFT),
                        answered && isCorrectOption && "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-[0_4px_12px_-4px_rgba(16,185,129,0.35)]",
                        answered && isSelectedOption && !isCorrectOption && "border-rose-400 bg-rose-50 text-rose-800 shadow-[0_4px_12px_-4px_rgba(244,63,94,0.3)]",
                        answered && !isSelectedOption && !isCorrectOption && "border-slate-200 bg-white text-slate-400",
                      )}
                    >
                      <span>{option}</span>
                      {answered && isCorrectOption && (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                      )}
                      {answered && isSelectedOption && !isCorrectOption && (
                        <XCircle className="h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>

              {selected !== null && (
                <div className={cn("rounded-2xl border-l-4 border-teal-500 bg-teal-50/60 p-6", SHADOW_SOFT)}>
                  <p className="flex items-center gap-2 text-[15px] font-bold text-slate-900">
                    {selected === question.answerIndex ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" /> Resposta correta!
                      </>
                    ) : (
                      <>
                        <XCircle className="h-5 w-5 text-rose-600" aria-hidden="true" /> Incorreto.
                      </>
                    )}
                  </p>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600">{question.explanation}</p>
                  <Button type="button" variant="outline" full className={cn("mt-6", CTA_BUTTON_CLASS)} onClick={handleNext}>
                    {isLast ? "Ver meu resultado" : "Próxima questão"}
                    <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {phase === "profile" && (
            <div className="flex flex-col items-center gap-7 text-center">
              <h3 className="font-sans text-[1.5rem] font-extrabold text-slate-900 sm:text-[1.7rem]">
                🎯 Você acertou <span className="text-teal-600">{score}</span> de {guiaQuizQuestions.length} questões!
              </h3>
              <p className={cn("rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-4 text-[15px] font-semibold text-emerald-800", SHADOW_SOFT)}>
                {guiaQuizPerformanceMessage(score, guiaQuizQuestions.length)}
              </p>
              <p className="text-[15px] text-slate-600">
                Responda uma pergunta rápida para receber uma análise personalizada do seu resultado.
              </p>
              <p className="text-[13px] font-bold uppercase tracking-wide text-slate-500">
                Em qual etapa da sua jornada na enfermagem você está?
              </p>
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                {guiaProfileOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleProfile(option.id)}
                    className={cn(
                      "rounded-2xl border-2 border-slate-200 bg-white px-5 py-5 text-[15px] font-bold text-slate-800 transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-400 hover:bg-teal-50/60",
                      SHADOW_SOFT,
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {phase === "result" && profile && (
            <div className="flex flex-col gap-6 text-center">
              <h3 className="font-sans text-[1.5rem] font-extrabold text-slate-900 sm:text-[1.7rem]">
                {guiaProfileMessages[profile].title}
              </h3>
              <p className={cn("rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-4 text-[14.5px] font-semibold text-emerald-800", SHADOW_SOFT)}>
                🎯 Seu desempenho final: {score}/{guiaQuizQuestions.length} questões
              </p>
              <p className="text-left text-[15.5px] leading-relaxed text-slate-600">{guiaProfileMessages[profile].body}</p>
              <Button type="button" variant="outline" size="lg" full className={CTA_BUTTON_CLASS} onClick={onResultCta}>
                Quero os modelos prontos agora
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────── Oferta principal / preço / compra ────────────────── */

const OFFER_BENEFITS = [
  "+132 modelos prontos, por situação clínica",
  "Diferentes setores: Clínica Médica, UTI, Emergência",
  "Material em PDF, consulta rápida no plantão",
  "Organização didática, fácil de adaptar",
];

function OfferSection({ children }: { children: React.ReactNode }) {
  const priceDigits = guiaEvolucaoProduct.priceLabel.replace("R$", "").trim();

  return (
    <section id={OFFER_SECTION_ID} className="relative scroll-mt-6 bg-white px-5 py-20 sm:py-28" style={TEXTURE_TEAL_BLOOM}>
      <div className="relative mx-auto grid w-full max-w-[1100px] gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
        {/* Coluna esquerda — mockup + prova, fixa ao rolar no desktop. */}
        <div className="flex flex-col items-center gap-6 lg:sticky lg:top-10 lg:items-start lg:self-start">
          <div className="relative">
            <div className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-[40px] bg-teal-100/40 blur-3xl" aria-hidden="true" />
            <div
              className={cn(
                "relative flex aspect-[3/4] w-full max-w-[320px] items-center justify-center overflow-hidden rounded-[28px] border border-white bg-white p-3",
                SHADOW_STRONG,
              )}
            >
              <img
                src="/guia-evolucao/capa-guia.webp"
                alt="Capa do Guia de Evolução de Enfermagem, material digital com modelos prontos de anotação e evolução de enfermagem"
                width={1086}
                height={1448}
                loading="lazy"
                className="h-full w-full rounded-[20px] object-contain"
              />
            </div>
          </div>
          <div className="grid w-full max-w-[320px] grid-cols-3 gap-3 text-center">
            <div className={cn("rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4", SHADOW_SOFT)}>
              <span className="block font-sans text-[1.2rem] font-extrabold text-teal-700">+132</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Modelos</span>
            </div>
            <div className={cn("rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4", SHADOW_SOFT)}>
              <span className="block font-sans text-[1.2rem] font-extrabold text-teal-700">PDF</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Formato</span>
            </div>
            <div className={cn("rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4", SHADOW_SOFT)}>
              <span className="block font-sans text-[1.2rem] font-extrabold text-teal-700">Na hora</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Acesso</span>
            </div>
          </div>
        </div>

        {/* Coluna direita — nome, benefícios, preço, bumps, checkout: o ponto
            mais "premium" da página — produto + checkout dentro de um bloco
            seguro e valioso. */}
        <div className={cn("relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-7 sm:p-10", SHADOW_STRONG)}>
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-teal-50/80 blur-3xl" aria-hidden="true" />

          <span className={cn("relative inline-flex items-center gap-2 rounded-full bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Acesso imediato
          </span>
          <h2 className="relative mt-5 font-sans text-[1.9rem] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[2.15rem]">
            {guiaEvolucaoProduct.name}
          </h2>
          <p className="relative mt-3 text-[15.5px] leading-relaxed text-slate-600">
            Escreva suas anotações com confiança, ganhe tempo livre e proteja o seu nome profissional.
          </p>

          <ul className="relative mt-7 flex flex-col gap-3">
            {OFFER_BENEFITS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-[14.5px] font-medium text-slate-700"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" strokeWidth={2.5} aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>

          <div className={cn("relative mt-8 flex flex-col items-center gap-1 rounded-2xl border border-teal-100 bg-teal-50/60 py-7 text-center", SHADOW_SOFT)}>
            <span className="text-[13px] font-semibold text-slate-500 line-through">De R$ 47,90 por apenas:</span>
            <span className="flex items-start font-sans text-[3.25rem] font-extrabold leading-none text-slate-900">
              <span className="mr-1 mt-2 text-[1.35rem] text-teal-600">R$</span>
              {priceDigits}
            </span>
            <span className="mt-2 text-[12px] font-bold uppercase tracking-wide text-slate-500">
              Pagamento único · sem mensalidade
            </span>
          </div>

          <div className="relative mt-8">{children}</div>

          <div className="relative mt-6 flex flex-wrap items-center justify-center gap-5 text-[12.5px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Compra 100% segura
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" /> Libera na hora com Pix
            </span>
          </div>
        </div>
      </div>
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
    <form id="checkout" onSubmit={onSubmit} noValidate className="flex flex-col gap-5 text-left">
      <div className="flex flex-col gap-2.5">
        <Label htmlFor="checkout-nome" className="text-slate-500">
          Nome
        </Label>
        <Input
          id="checkout-nome"
          autoComplete="given-name"
          placeholder="Como podemos te chamar?"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          aria-invalid={Boolean(errors.name)}
          maxLength={80}
          className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 hover:border-teal-400 focus:border-teal-600 focus:bg-white"
        />
        {errors.name && (
          <p role="alert" className="text-[13px] text-rose-600">
            {errors.name}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <Label htmlFor="checkout-email" className="text-slate-500">
          E-mail
        </Label>
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
          className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 hover:border-teal-400 focus:border-teal-600 focus:bg-white"
        />
        {errors.email && (
          <p role="alert" className="text-[13px] text-rose-600">
            {errors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-bold text-slate-900">Complete seu material por apenas +R$10 cada</p>
          <p className="text-[13px] leading-relaxed text-slate-500">
            Leve conteúdos complementares para consultar no plantão, revisar nos estudos e aproveitar melhor seu
            aprendizado.
          </p>
        </div>
        {guiaEvolucaoBumps.map((bump) => {
          const checked = selectedBumps.has(bump.slug);
          return (
            <label
              key={bump.slug}
              htmlFor={`bump-${bump.slug}`}
              className={cn(
                "relative flex cursor-pointer items-start justify-between gap-3 rounded-2xl border p-3.5 transition-all duration-200",
                checked
                  ? cn("border-teal-300 bg-teal-50/70", "shadow-[0_4px_14px_-6px_rgba(13,148,136,0.35)]")
                  : "border-slate-200 bg-slate-50",
              )}
            >
              {checked && (
                <span
                  aria-hidden="true"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-white shadow-sm"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
              <span className="flex items-start gap-3">
                <Checkbox
                  id={`bump-${bump.slug}`}
                  checked={checked}
                  onCheckedChange={() => onToggleBump(bump.slug)}
                  className="mt-0.5 border-slate-300 bg-white hover:border-teal-500 data-[state=checked]:border-teal-600 data-[state=checked]:bg-teal-600 data-[state=checked]:text-white"
                />
                <span className="flex flex-col gap-1">
                  <span className="text-[14.5px] font-bold leading-snug text-slate-900">{bump.name}</span>
                  <span className="text-[12.5px] leading-snug text-slate-500">{bump.description}</span>
                  <span className={cn("text-[12.5px] font-bold", checked ? "text-teal-700" : "text-teal-600")}>
                    {checked ? "✓ Adicionado ao seu pedido" : `Adicionar por + ${bump.priceLabel}`}
                  </span>
                </span>
              </span>
              <span className="whitespace-nowrap text-[13px] font-semibold text-teal-700">+ {bump.priceLabel}</span>
            </label>
          );
        })}
      </div>

      <div className={cn("flex items-center justify-between rounded-2xl border border-teal-200 bg-teal-50 px-5 py-4", SHADOW_SOFT)}>
        <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-slate-500">Total</span>
        <span className="text-[1.3rem] font-extrabold text-teal-700">{formatCents(totalCents)}</span>
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
        <p role="alert" className="text-center text-[13px] text-rose-600">
          Não foi possível carregar a verificação de segurança. Recarregue a página.
        </p>
      )}
      {turnstileFailed && (
        <div className="flex flex-col items-center gap-2">
          <p role="alert" className="text-center text-[13px] text-rose-600">
            Não foi possível carregar a verificação de segurança.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-slate-300 bg-white text-slate-700 hover:border-teal-400 hover:bg-teal-50"
            onClick={onRetryVerification}
          >
            Tentar verificação novamente
          </Button>
        </div>
      )}
      {turnstileMissing && !turnstileFailed && (
        <p role="alert" className="text-center text-[13px] text-rose-600">
          Aguarde a verificação de segurança terminar antes de continuar.
        </p>
      )}

      {errorMessage && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-[14px] leading-relaxed text-rose-800">{errorMessage}</p>
        </div>
      )}

      <Button type="submit" variant="outline" size="lg" full disabled={submitting || !canSubmit} className={CTA_BUTTON_CLASS}>
        {submitting ? "Gerando seu Pix..." : "Quero meu plantão mais tranquilo"}
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
        <h2 className="font-sans text-[1.5rem] font-extrabold leading-tight text-slate-900">Falta pouco!</h2>
        <p className="max-w-[42ch] text-[14px] leading-relaxed text-slate-600">
          Escaneie o QR Code ou copie o código Pix abaixo para concluir o pagamento.
        </p>

        {result.pix.qrCodeBase64 && (
          <img
            src={`data:image/png;base64,${result.pix.qrCodeBase64}`}
            alt="QR Code Pix"
            className="h-[220px] w-[220px] rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
          />
        )}

        <div className="w-full text-left">
          <Label htmlFor="pix-copia-cola" className="text-slate-500">
            Pix copia e cola
          </Label>
          <textarea
            id="pix-copia-cola"
            readOnly
            value={result.pix.qrCode}
            rows={3}
            className="mt-2 w-full resize-none rounded-2xl border border-slate-300 bg-slate-50 p-3 text-[12.5px] leading-relaxed text-slate-700"
          />
          <Button
            type="button"
            full
            variant="outline"
            className="mt-2.5 border-slate-300 bg-white text-slate-700 hover:border-teal-400 hover:bg-teal-50"
            onClick={() => onCopyCode(result.pix.qrCode)}
          >
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
      <Loader2 className="h-8 w-8 animate-spin text-teal-600" aria-hidden="true" />
      <h2 className="font-sans text-[1.5rem] font-extrabold leading-tight text-slate-900">Preparando seu Pix...</h2>
      <p className="max-w-[42ch] text-[14px] leading-relaxed text-slate-600">
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
    <dl className="grid w-full gap-px overflow-hidden rounded-[20px] border border-slate-200 bg-slate-200">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 bg-white px-5 py-3.5">
          <dt className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500">{row.label}</dt>
          <dd className="text-right text-[13.5px] font-semibold text-slate-900">{row.value}</dd>
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
        className="grid h-16 w-16 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600"
      >
        <Check className="h-7 w-7" strokeWidth={1.8} />
      </span>
      <h2 className="font-sans text-[1.5rem] font-extrabold leading-tight text-slate-900">Pagamento confirmado ✅</h2>
      <p className="max-w-[42ch] text-[14px] leading-relaxed text-slate-600">Seus materiais estão disponíveis.</p>

      <div className="flex w-full flex-col gap-3">
        {downloads.map((download) => (
          <div
            key={download.slug}
            className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <span className="text-[14px] font-medium text-slate-900">{download.name}</span>
            <Button asChild size="sm" variant="outline" className={CTA_BUTTON_CLASS}>
              <a href={download.url} target="_blank" rel="noopener noreferrer" download>
                <Download className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                Baixar
              </a>
            </Button>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-slate-500">
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
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-[14px] leading-relaxed text-rose-800">{message}</p>
        </div>
        <Button asChild full variant="outline" className={CTA_BUTTON_CLASS}>
          <a href={buildPixSupportWhatsAppUrl(null, { purchaseLabel: "o Guia de Evolução de Enfermagem" })} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
            Falar com o suporte
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-[14px] leading-relaxed text-rose-800">{message}</p>
      </div>
      <Button type="button" full variant="outline" className={CTA_BUTTON_CLASS} onClick={() => window.location.reload()}>
        Tentar novamente
      </Button>
    </div>
  );
}
