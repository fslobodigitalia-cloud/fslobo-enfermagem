/**
 * Página comercial do Mapas Mentais Ilustrados — landing dedicada servida
 * em /produto/concursos-enfermagem (rota estática declarada em App.tsx
 * ANTES de /produto/:slug, que continua servindo qualquer outro slug do
 * catálogo normalmente via ProductPage.tsx).
 *
 * ARQUIVO NOVO E INDEPENDENTE: mesma estrutura comercial e disciplina de
 * checkout já validada em produção por GuiaEvolucaoEnfermagemPage.tsx
 * (Hero → carrossel → prova social → quiz → oferta/preço/checkout → Pix →
 * confirmação + downloads), mas com copy, mídias, quiz e Pixel PRÓPRIOS —
 * nenhum arquivo do Guia é importado, editado ou de qualquer forma
 * afetado por esta página. checkoutAttempt.ts/productCheckout.ts/
 * orderAccess.ts/orderDownloads.ts/TurnstileWidget são reaproveitados tal
 * como estão (mesma infraestrutura, contrato inalterado).
 *
 * Preço exibido: sempre preferindo o catálogo público (RPC
 * get_active_product_catalog(), via useProductCatalog() — mesma fonte de
 * /materiais, /produto/:slug e do Guia). mapasMentaisProduct.priceCents
 * (config estático) só entra como fallback nos poucos instantes antes do
 * catálogo responder, ou se a consulta falhar — nunca é usado para
 * calcular a cobrança real, que continua exclusivamente no backend
 * (create_or_get_product_order_with_items_efi()).
 *
 * Mídias: todas apontam para public/concursos-enfermagem/... (ver
 * docs/MIDIAS_CONCURSOS_ENFERMAGEM.md para a lista completa e orientação
 * de formato/peso). Nenhum arquivo real foi colocado ainda — os
 * componentes MediaImage/MediaVideo abaixo mostram um fallback visual
 * elegante (gradiente + ícone + "Prévia do material", mesma proporção da
 * mídia final) enquanto o arquivo não existir, e passam a mostrar a mídia
 * real automaticamente assim que ela for colocada no caminho exato — sem
 * qualquer alteração de código.
 */
import * as React from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  ImageIcon,
  Loader2,
  Lock,
  MessageCircle,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useDocumentMeta } from "@/lib/seo";
import { useCheckoutAttempt } from "@/lib/checkoutAttempt";
import {
  classifyCheckoutErrorCode,
  createProductOrder,
  type ProductCheckoutResult,
  type ProductOrderSummary,
} from "@/lib/productCheckout";
import { getOrderDownloads, downloadItemKey, type DownloadItem } from "@/lib/orderDownloads";
import { saveOrderAccess, readOrderAccess, clearOrderAccess } from "@/lib/orderAccess";
import { DownloadButton } from "@/components/downloads/DownloadButton";
import { InAppDownloadNotice } from "@/components/downloads/InAppDownloadNotice";
import { useProductCatalog } from "@/hooks/useProductCatalog";
import { useScrollToPixResult } from "@/hooks/useScrollToPixResult";
import { mapasMentaisProduct, mapasMentaisBumps, formatCents } from "@/config/digitalProducts";
import {
  mapasMentaisQuizQuestions,
  mapasMentaisProfileMessages,
  resolveMapasMentaisProfile,
  type StudyProfile,
} from "@/config/mapasMentaisQuiz";
import { buildPixSupportWhatsAppUrl } from "@/lib/whatsapp";
import {
  initMapasMentaisPixel,
  trackMapasMentaisLead,
  trackMapasMentaisQuizInterest,
  trackMapasMentaisInitiateCheckout,
  trackMapasMentaisPurchase,
} from "@/lib/mapasMentaisPixel";
import { trackTikTokViewContent, trackTikTokInitiateCheckout, trackTikTokPurchase } from "@/lib/tiktokPixel";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MapasMentaisConversationSection } from "@/components/mapasMentais/MapasMentaisConversationSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/checkout/TurnstileWidget";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Precisa ser EXATAMENTE a mesma action já validada pelo backend
 *  (TURNSTILE_EXPECTED_ACTION_PRODUCT_ORDER em create-product-order-efi-prod)
 *  — a mesma usada pelo Guia e por ProductCheckout.tsx. Nunca inventar uma
 *  action nova para esta página. */
const TURNSTILE_ACTION = "create_product_order";
const POLL_INTERVAL_MS = 5_000;
const OFFER_SECTION_ID = "comprar";
const PANEL_CONTAINER = "mx-auto w-full max-w-[640px] px-5";

const SHADOW_SOFT = "shadow-[0_2px_4px_rgba(15,23,42,0.04),0_8px_20px_-14px_rgba(15,23,42,0.12)]";
const SHADOW_MEDIUM = "shadow-[0_4px_8px_rgba(15,23,42,0.05),0_20px_40px_-20px_rgba(15,23,42,0.16)]";

const CTA_BUTTON_CLASS = cn(
  "border-transparent bg-teal-600 text-white transition-all duration-200",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_4px_rgba(15,23,42,0.08),0_10px_24px_-10px_rgba(13,148,136,0.55)]",
  "hover:-translate-y-px hover:border-transparent hover:bg-teal-700",
  "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_4px_10px_rgba(15,23,42,0.10),0_18px_34px_-12px_rgba(13,148,136,0.6)]",
  "active:translate-y-px active:shadow-[inset_0_1px_2px_rgba(15,23,42,0.25)]",
  "disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0",
);

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

/** Mensagens amigáveis por código de erro — nunca a mensagem crua do
 *  servidor. Cópia deliberada do mesmo mapa usado pelo Guia (não
 *  importado de lá — página independente), com o rótulo genérico
 *  "pagamento"/"tentativa de compra" (fluxo Efí, nunca menciona Mercado
 *  Pago). */
const ERROR_MESSAGES: Record<string, string> = {
  server_misconfigured: "Não foi possível processar sua compra agora. Tente novamente em alguns minutos.",
  origin_not_allowed: "Não foi possível processar sua compra agora. Recarregue a página e tente novamente.",
  payment_provider_configuration_error: "Não foi possível processar o pagamento agora. Tente novamente em instantes.",
  payment_provider_temporarily_unavailable: "O sistema de pagamento está temporariamente indisponível. Tente novamente em instantes.",
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

/* ───────────────────── Mídia com fallback (sem arquivo quebrado) ─────────── */

/**
 * Painel de fallback compartilhado por imagem/vídeo — gradiente
 * teal/navy, ícone, texto discreto "Prévia do material". Preenche 100%
 * do espaço do pai (o pai já define a proporção/aspect-ratio final), para
 * nunca colapsar layout nem mostrar ícone de mídia quebrada do navegador.
 */
function MediaFallback({ icon: Icon = ImageIcon, label = "Prévia do material" }: { icon?: typeof ImageIcon; label?: string }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2.5 bg-gradient-to-br from-[#0a1622] via-[#0d2131] to-teal-900"
      role="img"
      aria-label={label}
    >
      <Icon className="h-8 w-8 text-teal-300/70" strokeWidth={1.6} aria-hidden="true" />
      <span className="px-4 text-center text-[11px] font-semibold uppercase tracking-wide text-teal-200/60">{label}</span>
    </div>
  );
}

/** <img> com fallback automático via onError — assim que o arquivo real existir no caminho exato, passa a exibi-lo sem nenhuma mudança de código. */
function MediaImage({
  src,
  alt,
  className,
  width,
  height,
  loading = "lazy",
}: {
  src: string;
  alt: string;
  className?: string;
  width: number;
  height: number;
  loading?: "lazy" | "eager";
}) {
  const [errored, setErrored] = React.useState(false);
  if (errored) return <MediaFallback />;
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      className={className}
      onError={() => setErrored(true)}
    />
  );
}

/**
 * Vídeo demonstrativo (seção de oferta) — arquivo real é 720×1280 (9:16).
 * object-contain (nunca object-cover): o vídeo precisa aparecer INTEIRO,
 * sem cortar conteúdo, mesmo que o card não seja exatamente 9:16 em algum
 * breakpoint — a margem que sobrar é preenchida pelo fundo navy/preto do
 * próprio <video> (bg-[#060d18], mesma família de cor da Hero), nunca
 * branco/transparente. Sem autoplay (controle sempre nas mãos da
 * usuária) e preload="metadata" (carrega só o suficiente para mostrar a
 * primeira frame/duração, sem baixar o vídeo inteiro antes do clique).
 * Em erro, mostra um painel de fallback com a MESMA moldura/proporção do
 * vídeo real.
 */
function DemoVideo({ src, className }: { src: string; className?: string }) {
  const [errored, setErrored] = React.useState(false);
  if (errored) {
    return (
      <div className={className}>
        <MediaFallback icon={PlayCircle} label="Prévia do vídeo do material" />
      </div>
    );
  }
  return (
    <video
      src={src}
      controls
      playsInline
      preload="metadata"
      className={className}
      onError={() => setErrored(true)}
    />
  );
}

export default function MapasMentaisPage() {
  useDocumentMeta({
    title: "Mapas Mentais Ilustrados para Enfermagem | FSlobo Enfermagem",
    description:
      "Mapas mentais ilustrados para organizar e revisar conteúdos de enfermagem de forma visual e prática. Material digital com acesso após a confirmação do Pix.",
    path: "/produto/concursos-enfermagem",
  });

  React.useEffect(() => {
    const previous = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#ffffff";
    return () => {
      document.body.style.backgroundColor = previous;
    };
  }, []);

  const { ensureAttempt } = useCheckoutAttempt(mapasMentaisProduct.slug);

  const catalog = useProductCatalog();
  const catalogProduct =
    catalog.status === "success" ? catalog.products.find((p) => p.slug === mapasMentaisProduct.slug) ?? null : null;
  const priceCents = catalogProduct?.priceCents ?? mapasMentaisProduct.priceCents;

  // Pixel do Mapas Mentais — script + init + PageView + ViewContent, uma
  // única vez, assim que houver um preço de exibição (catálogo resolvido
  // ou fallback estático — nunca bloqueia esperando a rede).
  React.useEffect(() => {
    initMapasMentaisPixel(priceCents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TikTok ViewContent — só quando o produto REAL do catálogo carrega
  // (nunca em loading/erro), mesmo padrão de ProductPage.tsx.
  React.useEffect(() => {
    if (!catalogProduct) return;
    trackTikTokViewContent({
      slug: catalogProduct.slug,
      name: catalogProduct.name,
      category: catalogProduct.category,
      priceCents: catalogProduct.priceCents,
      currency: catalogProduct.currency,
    });
  }, [catalogProduct]);

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

  // checkoutAccessToken usado no polling desta submissão — capturado no
  // momento do envio (ensureAttempt), nunca recalculado depois: garante
  // que o polling sempre consulta o pedido que foi de fato criado, mesmo
  // que nome/e-mail/bumps mudem depois (o que trocaria o fingerprint e
  // geraria outro checkout_request_id, sem relação com o pedido em
  // andamento). Mesmo padrão já corrigido em GuiaEvolucaoEnfermagemPage.tsx
  // (não alterado por este arquivo).
  const [activeAccessToken, setActiveAccessToken] = React.useState<string | null>(null);

  // Guardas de disparo do Purchase (Meta + TikTok) — só existe valor real
  // quando o pedido foi criado NESTA sessão (create-product-order-efi-prod
  // devolveu order.publicId/amountCents/items/currency). No fluxo de
  // retomada (pedido pago encontrado ao recarregar a página), estes
  // valores permanecem null e o Purchase NUNCA dispara.
  const orderPublicIdRef = React.useRef<string | null>(null);
  const orderAmountCentsRef = React.useRef<number | null>(null);
  const orderCurrencyRef = React.useRef<string | null>(null);
  const orderItemsRef = React.useRef<{ slug: string; name: string }[] | null>(null);
  const purchaseFiredRef = React.useRef(false);
  const tiktokPurchaseFiredRef = React.useRef(false);

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  const errorCategory = result?.kind === "error" ? classifyCheckoutErrorCode(result.code) : null;
  const showForm = result === null || (result.kind === "error" && errorCategory === "input");
  const showPixResult = result !== null && result.kind !== "error" && downloads === null;
  // Rola até o resultado do Pix uma vez por pedido novo (ver useScrollToPixResult).
  const pixResultRef = useScrollToPixResult(
    result !== null && result.kind !== "error" && downloads === null ? result.order.publicId : null,
  );

  const totalCents =
    priceCents + mapasMentaisBumps.filter((b) => selectedBumps.has(b.slug)).reduce((sum, b) => sum + b.priceCents, 0);

  // ── Retomada: se já existe um pedido salvo (localStorage) para este
  //    produto, consulta get-order-downloads UMA vez ao carregar a
  //    página. Só o caso "já pago" é reconstruído — qualquer outro
  //    resultado descarta o acesso salvo. Mesmo comportamento do Guia.
  React.useEffect(() => {
    let cancelled = false;
    async function resume() {
      const access = readOrderAccess(mapasMentaisProduct.slug);
      if (!access) {
        setResuming(false);
        return;
      }
      const outcome = await getOrderDownloads(access.publicId, access.checkoutAccessToken);
      if (cancelled) return;
      if (outcome.kind === "paid") {
        setDownloads(outcome.downloads);
      } else {
        clearOrderAccess(mapasMentaisProduct.slug);
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

  // ── Purchase (Meta + TikTok): dispara exatamente uma vez, no exato
  //    instante em que "paid" é confirmado (downloads deixa de ser null)
  //    DENTRO desta sessão — nunca no clique do botão, nunca ao gerar o
  //    QR Code, nunca enquanto pending_payment/waiting.
  React.useEffect(() => {
    if (downloads === null) return;

    const orderPublicId = orderPublicIdRef.current;
    const amountCents = orderAmountCentsRef.current;
    if (orderPublicId === null || amountCents === null) return; // fluxo de retomada — ver comentário acima dos refs.

    if (!purchaseFiredRef.current) {
      const sent = trackMapasMentaisPurchase({ orderPublicId, amountCents });
      if (sent) purchaseFiredRef.current = true;
    }

    if (!tiktokPurchaseFiredRef.current) {
      const currency = orderCurrencyRef.current;
      const items = orderItemsRef.current;
      if (currency !== null && items !== null) {
        const tiktokSent = trackTikTokPurchase({ orderPublicId, amountCents, currency, items });
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

    // ensureAttempt() decide, no momento do envio, se reaproveita o
    // checkout_request_id salvo (mesmo nome/e-mail/product_slugs — ex.:
    // retry após erro de rede) ou gera um par novo: bump marcado/
    // desmarcado ou nome/e-mail corrigidos depois de um envio anterior
    // mudam o fingerprint, então SEMPRE geram um checkout_request_id novo
    // aqui — nunca reaproveitando o de uma tentativa com dados diferentes
    // (é isso que impede o 409 "checkout_conflict" da RPC
    // create_or_get_product_order_with_items_efi).
    const attempt = ensureAttempt({ name, email: mail, productSlugs });

    // InitiateCheckout (Meta + TikTok): início efetivo do checkout —
    // Turnstile já validou, prestes a chamar create-product-order-efi-prod.
    // Valores de sinalização, vindos do total calculado no frontend
    // (produto + bumps); nunca usados para cobrança real.
    trackMapasMentaisInitiateCheckout(totalCents);
    trackTikTokInitiateCheckout(
      totalCents,
      "BRL",
      productSlugs.map((slug) => {
        if (slug === mapasMentaisProduct.slug) return { slug, name: mapasMentaisProduct.name, priceCents };
        const bump = mapasMentaisBumps.find((b) => b.slug === slug);
        return { slug, name: bump?.name ?? slug, priceCents: bump?.priceCents ?? 0 };
      }),
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

    // Token do Turnstile é de uso único — descarta e pede um novo,
    // independentemente do resultado.
    setTurnstileToken(null);
    turnstileRef.current?.reset();

    if (outcome.kind !== "error") {
      setActiveAccessToken(attempt.checkoutAccessToken);
      saveOrderAccess(mapasMentaisProduct.slug, {
        publicId: outcome.order.publicId,
        checkoutAccessToken: attempt.checkoutAccessToken,
      });
      // Único momento em que temos o public_id e o valor REAL confirmado
      // pelo backend para este pedido — guardados para o Purchase,
      // disparado só quando o pagamento for de fato confirmado.
      orderPublicIdRef.current = outcome.order.publicId;
      orderAmountCentsRef.current = outcome.order.amountCents;
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

    const productSlugs = [mapasMentaisProduct.slug, ...Array.from(selectedBumps)];
    void submitOrder(trimmedName, trimmedEmail, productSlugs);
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

  function handleQuizProfileSelected() {
    trackMapasMentaisLead(priceCents);
  }

  function handleQuizResultCta() {
    trackMapasMentaisQuizInterest();
    scrollToOffer();
  }

  if (resuming) {
    return (
      <div className="min-h-screen bg-white font-sans text-slate-900">
        <SiteHeader />
        <main className="flex min-h-[70vh] items-center justify-center px-6">
          <Loader2 className="h-6 w-6 animate-spin text-teal-600" aria-hidden="true" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <SiteHeader />
      <main>
        {downloads !== null ? (
          <div className={cn(PANEL_CONTAINER, "py-16")}>
            <PaidPanel downloads={downloads} orderAccessKey={mapasMentaisProduct.slug} />
          </div>
        ) : showPixResult && result !== null ? (
          <div className={cn(PANEL_CONTAINER, "py-16")}>
            <div ref={pixResultRef} role="region" aria-label="Pagamento via Pix" tabIndex={-1} className="scroll-mt-20 focus:outline-none">
              <ResultPanel result={result} copied={copied} onCopyCode={handleCopyCode} />
            </div>
          </div>
        ) : (
          <>
            <Hero />
            <ModulesSection />
            <MapasMentaisConversationSection />
            <QuizSection onProfileSelected={handleQuizProfileSelected} onResultCta={handleQuizResultCta} priceCents={priceCents} />
            <OfferSection priceCents={priceCents}>
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
      <SiteFooter />
    </div>
  );
}

/* ────────────────────────────────── Hero ────────────────────────────────── */

const TRUST_ITEMS = [
  { icon: Target, label: "Revisão mais organizada" },
  { icon: BookOpen, label: "Conteúdo visual e ilustrado" },
  { icon: Clock, label: "Consulta rápida pelo celular" },
];

const HERO_VIDEO_OVERLAY: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg, rgba(10,22,34,0.82) 0%, rgba(10,22,34,0.6) 45%, rgba(10,22,34,0.88) 100%), linear-gradient(90deg, rgba(10,22,34,0.6) 0%, rgba(10,22,34,0) 22%, rgba(10,22,34,0) 78%, rgba(10,22,34,0.6) 100%), radial-gradient(60% 55% at 14% 8%, rgba(45,212,191,0.16), transparent 62%), radial-gradient(50% 45% at 100% 100%, rgba(13,148,136,0.14), transparent 60%)",
};

/** Temas de estudo/concurso — puramente ilustrativo do universo de revisão de enfermagem, nunca promessa de conteúdo específico coberto pelo material. */
const STUDY_TOPICS = [
  "Fundamentos de Enfermagem",
  "Legislação em Enfermagem",
  "Saúde Coletiva",
  "SUS",
  "Ética Profissional",
  "Processo de Enfermagem",
  "Semiologia e Semiotécnica",
  "Farmacologia",
  "Saúde da Mulher",
  "Saúde da Criança",
  "Vigilância em Saúde",
  "Revisão para Concursos",
];

function StudyTopicsMarquee() {
  return (
    <div
      className="relative left-1/2 mt-12 w-screen -translate-x-1/2 overflow-hidden border-t border-white/10 py-5 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)] sm:mt-16"
      aria-label="Temas de estudo e revisão para concursos de enfermagem"
    >
      <div className="mm-marquee-track flex w-max items-center">
        {[0, 1].map((copyIndex) => (
          <ul
            key={copyIndex}
            aria-hidden={copyIndex === 1 ? "true" : undefined}
            className="flex shrink-0 items-center gap-8 pr-8"
          >
            {STUDY_TOPICS.map((topic) => (
              <li
                key={topic}
                className="flex shrink-0 items-center gap-8 whitespace-nowrap text-[12.5px] font-bold uppercase tracking-[0.08em] text-slate-300/85"
              >
                {topic}
                <span className="h-1 w-1 shrink-0 rounded-full bg-teal-400/50" aria-hidden="true" />
              </li>
            ))}
          </ul>
        ))}
      </div>
      <style>{`
        .mm-marquee-track { animation: mm-marquee-scroll 38s linear infinite; }
        @keyframes mm-marquee-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .mm-marquee-track { animation: none; }
        }
      `}</style>
    </div>
  );
}

/**
 * Hero SEM vídeo/imagem de fundo, de propósito — só fundo navy sólido +
 * gradientes/glows em CSS (HERO_VIDEO_OVERLAY, mantido pelo nome
 * histórico mas hoje puramente decorativo: nunca existiu vídeo nesta
 * landing, o overlay sozinho já dá a profundidade visual pretendida,
 * mesmo tratamento que OFFER_NAVY_BG já usa mais abaixo na página, sem
 * nenhuma mídia). Nenhum espaço é reservado para vídeo — a altura da
 * section vem só do conteúdo (padding + grid), como em qualquer section
 * CSS normal.
 */
function Hero() {
  return (
    <section
      className="relative overflow-hidden px-3.5 pb-16 pt-14 text-white sm:px-5 sm:pb-20 sm:pt-16 lg:pb-24 lg:pt-20"
      style={{ backgroundColor: "#0a1622" }}
    >
      <div className="pointer-events-none absolute inset-0" style={HERO_VIDEO_OVERLAY} aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/[0.08]" aria-hidden="true" />

      <div className="relative mx-auto grid w-full max-w-[1180px] items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div
          className={cn(
            "flex flex-col items-center gap-6 rounded-[30px] border border-white/10 bg-white/[0.04] p-6 text-center backdrop-blur-sm sm:p-8",
            "shadow-[0_2px_4px_rgba(0,0,0,0.2),0_28px_56px_-24px_rgba(0,0,0,0.5)]",
            "lg:items-start lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:text-left lg:shadow-none lg:backdrop-blur-none",
          )}
        >
          <span className="inline-flex items-center rounded-full border border-teal-400/30 bg-teal-400/10 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-300">
            Revisão visual para concursos de enfermagem
          </span>
          <h1 className="font-sans text-[2.125rem] font-extrabold leading-[1.1] tracking-tight text-white sm:text-[2.5rem] lg:text-[3.25rem] xl:text-[3.75rem]">
            Revise conteúdos de enfermagem de forma{" "}
            <span className="text-teal-400">visual, organizada e muito mais rápida</span>
          </h1>
          <p className="max-w-[52ch] text-[16px] leading-relaxed text-slate-300 lg:text-[17.5px]">
            Transforme conteúdos extensos em mapas mentais ilustrados para organizar sua revisão, encontrar
            rapidamente os pontos importantes e estudar pelo celular, tablet ou computador, no seu tempo.
          </p>

          <div className="flex w-full flex-col gap-3 lg:hidden">
            {TRUST_ITEMS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-teal-300">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="text-[14.5px] font-bold text-white">{label}</span>
              </div>
            ))}
          </div>
          <div className="hidden lg:flex lg:flex-wrap lg:items-center lg:justify-start lg:gap-3">
            {TRUST_ITEMS.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-[13px] font-semibold text-slate-200"
              >
                <Icon className="h-4 w-4 text-teal-300" strokeWidth={2} aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>

          <Button size="lg" variant="outline" full className={cn("max-w-[360px] lg:w-auto lg:px-12", CTA_BUTTON_CLASS)} onClick={scrollToOffer}>
            Quero estudar com os mapas mentais
          </Button>
        </div>

        {/* Capa do produto — só no desktop (lg+), mesmo tratamento visual do Guia. */}
        <div className="relative hidden lg:flex lg:justify-end">
          <div className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-[40px] bg-teal-400/15 blur-3xl" aria-hidden="true" />
          <div
            className={cn(
              "relative flex aspect-[3/4] w-full max-w-[380px] items-center justify-center overflow-hidden rounded-[32px] border border-white/15 bg-white p-3",
              "shadow-[0_8px_16px_rgba(0,0,0,0.25),0_40px_80px_-28px_rgba(0,0,0,0.55)]",
            )}
          >
            <MediaImage
              src="/concursos-enfermagem/capa-mapas-mentais.webp"
              alt="Capa dos Mapas Mentais Ilustrados de Enfermagem, material digital para revisão visual de concursos de enfermagem"
              width={1080}
              height={1350}
              loading="eager"
              className="h-full w-full rounded-[22px] object-contain"
            />
          </div>
        </div>
      </div>

      <StudyTopicsMarquee />
    </section>
  );
}

/* ─────────────────────── Demonstração do conteúdo (carrossel) ────────────── */

/** 9 páginas de exemplo reais, modulo-1.webp … modulo-9.webp — convertidas via sharp a partir dos PNGs originais (mantidos intactos, ver docs/MIDIAS_CONCURSOS_ENFERMAGEM.md), quality 88, 1080×1350. */
const MODULE_PAGES = Array.from({ length: 9 }, (_, i) => ({
  src: `/concursos-enfermagem/modulo-${i + 1}.webp`,
  alt: `Página de exemplo dos Mapas Mentais Ilustrados de Enfermagem — modelo ${i + 1}, revisão visual para concursos`,
}));

function ModulesSection() {
  return (
    <section className="relative bg-white px-5 py-12 sm:py-24" style={TEXTURE_TEAL_BLOOM}>
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="mx-auto max-w-[640px] text-center">
          <span className={cn("inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            O material completo
          </span>
          <h2 className="mt-4 font-sans text-[1.9rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.35rem] lg:text-[2.65rem]">
            O que você vai <span className="text-teal-600">ter em mãos</span>
          </h2>
        </div>

        <div
          className={cn(
            "relative mx-auto mt-6 flex w-fit items-center gap-3 overflow-hidden rounded-full border border-teal-200 bg-gradient-to-b from-teal-50 to-white px-6 py-3 sm:mt-10",
            SHADOW_SOFT,
          )}
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/70 to-transparent" aria-hidden="true" />
          <Sparkles className="relative h-5 w-5 text-teal-600" aria-hidden="true" />
          <span className="relative font-sans text-[1.05rem] font-extrabold text-teal-800">Mapas mentais ilustrados para consultar</span>
        </div>

        <div className="mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto px-1 pb-6 [&::-webkit-scrollbar]:hidden sm:mt-12" style={{ scrollbarWidth: "none" }}>
          {MODULE_PAGES.map((page, i) => (
            <div
              key={page.src}
              className={cn(
                "flex aspect-[3/4] w-[85vw] shrink-0 snap-center items-center justify-center overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 p-3 transition-transform duration-200 hover:-translate-y-1.5 hover:rotate-0 sm:w-[280px] lg:w-[300px]",
                SHADOW_SOFT,
                i % 2 === 0 ? "rotate-[0.6deg]" : "-rotate-[0.6deg]",
              )}
            >
              <MediaImage
                src={page.src}
                alt={page.alt}
                width={1080}
                height={1350}
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

function QuizSection({
  onProfileSelected,
  onResultCta,
  priceCents,
}: {
  onProfileSelected: () => void;
  onResultCta: () => void;
  priceCents: number;
}) {
  const [index, setIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<StudyProfile[]>([]);
  const [phase, setPhase] = React.useState<"questions" | "result">("questions");
  const [profile, setProfile] = React.useState<StudyProfile | null>(null);

  const question = mapasMentaisQuizQuestions[index];
  const isLast = index === mapasMentaisQuizQuestions.length - 1;
  const progressPercent = ((index + (phase === "result" ? 1 : 0)) / mapasMentaisQuizQuestions.length) * 100;

  function handleAnswer(selectedProfile: StudyProfile) {
    const nextAnswers = [...answers, selectedProfile];
    if (isLast) {
      const resolved = resolveMapasMentaisProfile(nextAnswers);
      setProfile(resolved);
      setPhase("result");
      onProfileSelected();
    } else {
      setAnswers(nextAnswers);
      setIndex((i) => i + 1);
    }
  }

  return (
    <section id="quiz" className="relative bg-slate-50 px-5 py-20 sm:py-28" style={TEXTURE_DOTS}>
      <div className="mx-auto w-full max-w-[820px]">
        {phase !== "result" && (
          <div className="mb-10 text-center">
            <span className={cn("inline-flex items-center rounded-full border border-teal-200 bg-white px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
              Teste rápido
            </span>
            <h2 className="mt-4 font-sans text-[1.9rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.35rem]">
              Em que momento da <span className="text-teal-600">sua revisão você está?</span>
            </h2>
            <p className="mx-auto mt-3 max-w-[52ch] text-[15.5px] text-slate-600">
              Responda 4 perguntas rápidas e descubra como organizar sua revisão de forma mais visual e objetiva.
            </p>
          </div>
        )}

        <div className={cn("relative rounded-[32px] border border-slate-200 bg-white p-7 sm:p-10", SHADOW_MEDIUM)}>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-[32px] bg-gradient-to-r from-transparent via-white to-transparent" aria-hidden="true" />

          {phase === "questions" && (
            <div className="flex flex-col gap-7">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between text-[12px] font-bold uppercase tracking-wide text-slate-400">
                  <span>
                    Pergunta {index + 1} de {mapasMentaisQuizQuestions.length}
                  </span>
                  <span className="text-teal-600">{Math.round(progressPercent)}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 shadow-inner">
                  <div
                    className="h-full rounded-full bg-teal-600 shadow-[0_1px_2px_rgba(13,148,136,0.5)] transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col gap-6"
                >
                  <p className="text-[1.25rem] font-bold leading-snug text-slate-900 sm:text-[1.4rem]">{question.question}</p>

                  <div className="flex flex-col gap-3">
                    {question.options.map((option, i) => {
                      const letter = String.fromCharCode(65 + i);
                      return (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => handleAnswer(option.profile)}
                          className={cn(
                            "flex items-center gap-3.5 rounded-2xl border-2 border-slate-200 bg-white px-5 py-4 text-left text-[15.5px] font-semibold text-slate-800 transition-all duration-200",
                            "hover:-translate-y-0.5 hover:border-teal-400 hover:bg-teal-50/60",
                            SHADOW_SOFT,
                          )}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[13px] font-extrabold text-slate-500" aria-hidden="true">
                            {letter}
                          </span>
                          <span className="flex-1">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          )}

          {phase === "result" && profile && (
            <div className="flex flex-col gap-6 text-center">
              <span className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Resultado do seu teste
              </span>
              <h3 className="font-sans text-[1.5rem] font-extrabold text-slate-900 sm:text-[1.7rem]">
                {mapasMentaisProfileMessages[profile].title}
              </h3>
              <p className="text-left text-[15.5px] leading-relaxed text-slate-600">{mapasMentaisProfileMessages[profile].body}</p>
              <Button type="button" variant="outline" size="lg" full className={CTA_BUTTON_CLASS} onClick={onResultCta}>
                Quero estudar com os mapas mentais por {formatCents(priceCents)}
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
  "Conteúdo organizado visualmente em mapas mentais ilustrados",
  "Material 100% digital, para consultar quando precisar",
  "Revisão pelo celular, tablet ou computador",
  "Acesso liberado automaticamente após a confirmação do Pix",
];

const OFFER_NAVY_BG: React.CSSProperties = {
  backgroundColor: "#0a1622",
  backgroundImage:
    "radial-gradient(60% 50% at 15% 0%, rgba(13,148,136,0.16), transparent 60%), radial-gradient(50% 45% at 100% 100%, rgba(16,185,129,0.12), transparent 60%)",
};

function OfferSection({ children, priceCents }: { children: React.ReactNode; priceCents: number }) {
  const priceDigits = formatCents(priceCents).replace("R$", "").trim();

  return (
    <section id={OFFER_SECTION_ID} className="relative scroll-mt-[76px] overflow-hidden px-5 py-16 sm:py-28" style={OFFER_NAVY_BG}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08]" aria-hidden="true" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative mx-auto grid w-full max-w-[1100px] gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
        <div className="relative lg:sticky lg:top-10 lg:self-start">
          <div className="pointer-events-none absolute inset-0 -z-10 scale-105 rounded-[32px] bg-teal-400/15 blur-2xl" aria-hidden="true" />
          <div className={cn("overflow-hidden rounded-[28px] border border-white/15 bg-[#060d18]", "shadow-[0_8px_16px_rgba(0,0,0,0.25),0_40px_80px_-28px_rgba(0,0,0,0.55)]")}>
            <DemoVideo src="/concursos-enfermagem/video-mapas-mentais-otimizado.mp4" className="block aspect-[9/16] w-full object-contain" />
          </div>
        </div>

        <div className={cn("relative overflow-hidden rounded-[28px] border border-white/10 bg-white p-6 sm:p-10", "shadow-[0_8px_16px_rgba(0,0,0,0.2),0_40px_90px_-30px_rgba(0,0,0,0.6)]")}>
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-teal-50/80 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-emerald-50/70 blur-3xl" aria-hidden="true" />

          <span className={cn("relative inline-flex items-center gap-2 rounded-full bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Acesso imediato
          </span>
          <h2 className="relative mt-5 font-sans text-[1.9rem] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[2.15rem]">
            {mapasMentaisProduct.name}
          </h2>
          <p className="relative mt-3 text-[15.5px] leading-relaxed text-slate-600">
            Revisão visual e organizada para consultar sempre que precisar, sem depender de reler tudo do zero.
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

          <div
            className={cn(
              "relative mt-8 flex flex-col items-center gap-1 overflow-hidden rounded-[24px] border-2 border-teal-200 bg-gradient-to-b from-teal-50 via-white to-white py-8 text-center ring-1 ring-teal-100",
              SHADOW_MEDIUM,
            )}
          >
            <div className="pointer-events-none absolute -top-10 left-1/2 h-24 w-48 -translate-x-1/2 rounded-full bg-teal-300/25 blur-3xl" aria-hidden="true" />
            <span className="relative flex items-start font-sans text-[3.5rem] font-extrabold leading-none text-slate-900 sm:text-[3.75rem]">
              <span className="mr-1 mt-2.5 text-[1.4rem] text-teal-600">R$</span>
              {priceDigits}
            </span>
            <span className="relative mt-2 text-[12px] font-bold uppercase tracking-wide text-slate-500">
              Pagamento único · sem mensalidade
            </span>
          </div>

          <div className="relative mt-8">{children}</div>

          <div className="relative mt-6 flex flex-wrap items-center justify-center gap-5 text-[12.5px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Pagamento via Pix, 100% seguro
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" /> Liberado logo após a confirmação do Pix
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
        <Label htmlFor="mm-checkout-nome" className="text-slate-500">
          Nome
        </Label>
        <Input
          id="mm-checkout-nome"
          autoComplete="given-name"
          placeholder="Como podemos te chamar?"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          aria-invalid={Boolean(errors.name)}
          maxLength={80}
          className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-teal-400 focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
        />
        {errors.name && (
          <p role="alert" className="text-[13px] text-rose-600">
            {errors.name}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <Label htmlFor="mm-checkout-email" className="text-slate-500">
          E-mail
        </Label>
        <Input
          id="mm-checkout-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="seuemail@exemplo.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(errors.email)}
          maxLength={254}
          className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-teal-400 focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
        />
        {errors.email && (
          <p role="alert" className="text-[13px] text-rose-600">
            {errors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-bold text-slate-900">Complete sua revisão por + R$ 10,00 cada</p>
          <p className="text-[13px] leading-relaxed text-slate-500">
            Materiais extras para revisar e praticar. Marque só o que quiser levar.
          </p>
        </div>
        {mapasMentaisBumps.map((bump) => {
          const checked = selectedBumps.has(bump.slug);
          return (
            <label
              key={bump.slug}
              htmlFor={`mm-bump-${bump.slug}`}
              className={cn(
                "group relative flex cursor-pointer items-start justify-between gap-3 rounded-2xl border p-3.5 transition-all duration-200",
                checked
                  ? "border-teal-400 bg-teal-50/70 shadow-[0_4px_14px_-6px_rgba(13,148,136,0.35)] ring-2 ring-teal-500/15"
                  : "border-slate-200 bg-slate-50 hover:-translate-y-0.5 hover:border-teal-200 hover:bg-white hover:shadow-[0_6px_16px_-10px_rgba(15,23,42,0.25)]",
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
                  id={`mm-bump-${bump.slug}`}
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

      <div className={cn("relative flex items-center justify-between overflow-hidden rounded-2xl border border-teal-200 bg-gradient-to-b from-teal-50 to-white px-5 py-4", SHADOW_SOFT)}>
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/70 to-transparent" />
        <span className="relative text-[13px] font-semibold uppercase tracking-[0.1em] text-slate-500">Total</span>
        <span className="relative font-sans text-[1.55rem] font-extrabold text-teal-700">{formatCents(totalCents)}</span>
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
        {submitting ? "Gerando seu Pix..." : "Gerar meu Pix e receber o material"}
      </Button>
    </form>
  );
}

/* ───────────────────── Suporte + animações (pós-compra) ──────────────────── */

const PANEL_SHADOW = "shadow-[0_2px_6px_rgba(15,23,42,0.05),0_28px_60px_-30px_rgba(13,148,136,0.4)]";

type AppearTag = "div" | "li";

function Appear({
  children,
  className,
  delay = 0,
  y = 14,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: AppearTag;
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  const MotionTag = motion[as] as typeof motion.div;
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionTag>
  );
}

function PaidDecor() {
  const reduced = useReducedMotion();
  const float = (duration: number, dist: number) =>
    reduced
      ? {}
      : { animate: { y: [0, -dist, 0] }, transition: { duration, repeat: Infinity, ease: "easeInOut" as const } };

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-20 -top-16 h-52 w-52 rounded-full bg-teal-200/25 blur-3xl" />
      <div className="absolute -right-24 top-24 h-60 w-60 rounded-full bg-emerald-200/20 blur-3xl" />
      <motion.span className="absolute left-6 top-24 hidden text-teal-300/50 sm:block" {...float(6, 8)}>
        <FileText className="h-6 w-6" />
      </motion.span>
      <motion.span className="absolute right-9 top-40 hidden text-emerald-300/50 sm:block" {...float(7.5, 10)}>
        <Check className="h-5 w-5" strokeWidth={2.5} />
      </motion.span>
      <motion.span className="absolute bottom-16 right-16 hidden text-teal-300/45 sm:block" {...float(8.5, 7)}>
        <Sparkles className="h-5 w-5" />
      </motion.span>
      <span className="absolute bottom-24 left-10 h-1.5 w-1.5 rounded-full bg-teal-300/60" />
      <span className="absolute right-1/3 top-14 h-1 w-1 rounded-full bg-emerald-300/70" />
    </div>
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
      <Appear className={cn("relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 sm:p-9", PANEL_SHADOW)}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-teal-100/60 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 bottom-0 h-48 w-48 rounded-full bg-emerald-100/40 blur-3xl" />

        <div className="relative flex flex-col items-center gap-5 text-center">
          <span
            role="status"
            className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-[12.5px] font-semibold text-amber-700"
          >
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Aguardando confirmação do Pix
          </span>

          <h2 className="font-sans text-[1.5rem] font-extrabold leading-tight text-slate-900 sm:text-[1.7rem]">
            Pagamento quase concluído
          </h2>
          <p className="max-w-[42ch] text-[14.5px] leading-relaxed text-slate-600">
            Escaneie o QR Code ou copie o código Pix para concluir o pagamento.
          </p>

          {result.pix.qrCodeBase64 && (
            <div className={cn("rounded-3xl border border-slate-200 bg-white p-3", PANEL_SHADOW)}>
              <img
                src={`data:image/png;base64,${result.pix.qrCodeBase64}`}
                alt="QR Code Pix"
                className="h-[220px] w-[220px] rounded-2xl"
              />
            </div>
          )}

          <div className="w-full text-left">
            <Label htmlFor="mm-pix-copia-cola" className="text-slate-500">
              Pix copia e cola
            </Label>
            <textarea
              id="mm-pix-copia-cola"
              readOnly
              value={result.pix.qrCode}
              rows={3}
              className="mt-2 w-full resize-none rounded-2xl border border-slate-300 bg-slate-50 p-3 text-[12.5px] leading-relaxed text-slate-700 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
            <Button
              type="button"
              full
              variant="outline"
              className={cn("mt-2.5", CTA_BUTTON_CLASS)}
              onClick={() => onCopyCode(result.pix.qrCode)}
            >
              <Copy className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              {copied ? "Código copiado!" : "Copiar código Pix"}
            </Button>
          </div>

          <div className="flex w-full items-start gap-2.5 rounded-2xl border border-teal-100 bg-teal-50/60 px-4 py-3 text-left">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
            <p className="text-[13px] leading-relaxed text-slate-600">
              <span className="font-semibold text-slate-800">Não precisa enviar comprovante.</span> A confirmação
              acontece automaticamente e o material é liberado assim que o Pix é confirmado.
            </p>
          </div>

          <OrderSummaryPanel order={order} statusLabel="Aguardando pagamento" />
        </div>
      </Appear>
    );
  }

  return (
    <Appear className={cn("relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 sm:p-9", PANEL_SHADOW)}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-teal-100/60 blur-3xl" />
      <div className="relative flex flex-col items-center gap-5 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full border border-teal-100 bg-teal-50" aria-hidden="true">
          <Loader2 className="h-7 w-7 animate-spin text-teal-600" />
        </span>
        <h2 className="font-sans text-[1.5rem] font-extrabold leading-tight text-slate-900">Preparando seu Pix...</h2>
        <p className="max-w-[42ch] text-[14.5px] leading-relaxed text-slate-600">
          Estamos confirmando os detalhes do seu pagamento. Isso pode levar alguns instantes.
        </p>
        <OrderSummaryPanel order={order} statusLabel="Aguardando pagamento" />
      </div>
    </Appear>
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

function PaidPanel({ downloads, orderAccessKey }: { downloads: DownloadItem[]; orderAccessKey: string }) {
  return (
    <Appear className={cn("relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 sm:p-9", PANEL_SHADOW)}>
      <PaidDecor />

      <div className="relative flex flex-col items-center gap-6 text-center">
        <Appear delay={0.05} y={0} className="relative">
          <span aria-hidden="true" className="absolute inset-0 scale-150 rounded-full bg-emerald-300/40 blur-2xl" />
          <span className="relative grid h-16 w-16 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-[0_2px_6px_rgba(15,23,42,0.05),0_16px_34px_-18px_rgba(16,185,129,0.6)]">
            <Check className="h-8 w-8" strokeWidth={2} />
          </span>
        </Appear>

        <div>
          <h2 className="font-sans text-[1.6rem] font-extrabold leading-tight text-slate-900 sm:text-[1.9rem]">
            Pagamento confirmado!
          </h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600">Seus materiais já estão liberados.</p>
        </div>

        <InAppDownloadNotice className="w-full" />

        <ul role="list" className="flex w-full flex-col gap-3.5 text-left">
          {downloads.map((download, index) => (
            <Appear
              as="li"
              key={downloadItemKey(download, index)}
              delay={0.12 + index * 0.08}
              className={cn(
                "group relative flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 transition-[transform,box-shadow] duration-300 sm:flex-row sm:items-center sm:p-5",
                PANEL_SHADOW,
                "sm:hover:-translate-y-0.5 sm:hover:shadow-[0_6px_14px_rgba(15,23,42,0.06),0_34px_66px_-30px_rgba(13,148,136,0.5)]",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-600 ring-1 ring-teal-100">
                  <FileText className="h-6 w-6" strokeWidth={1.9} aria-hidden="true" />
                  <span
                    aria-hidden="true"
                    className="absolute -left-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-teal-600 text-[10px] font-extrabold text-white shadow-sm"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="text-[14.5px] font-bold leading-snug text-slate-900">{download.name}</p>
                  <p className="mt-1 flex items-center gap-2 text-[12px] text-slate-500">
                    <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700">
                      PDF
                    </span>
                    Revisão rápida pelo celular
                  </p>
                </div>
              </div>
              <DownloadButton
                orderAccessKey={orderAccessKey}
                fileKey={downloadItemKey(download, index)}
                label="Baixar material"
                variant="outline"
                className={cn("w-full shrink-0 sm:w-auto", CTA_BUTTON_CLASS)}
              />
            </Appear>
          ))}
        </ul>

        <p className="text-[12px] leading-relaxed text-slate-500">
          Os links de download expiram após um tempo — se precisar, recarregue esta página para gerar novos.
        </p>

        <div className="mt-1 w-full border-t border-slate-100 pt-5">
          <p className="text-[13px] text-slate-500">Precisa de ajuda com o acesso?</p>
          <a
            href={buildPixSupportWhatsAppUrl(null, { purchaseLabel: "os Mapas Mentais Ilustrados" })}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13.5px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30"
          >
            <MessageCircle className="h-4 w-4 text-teal-600" strokeWidth={1.9} aria-hidden="true" />
            Falar com o suporte
          </a>
        </div>
      </div>
    </Appear>
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
          <a href={buildPixSupportWhatsAppUrl(null, { purchaseLabel: "os Mapas Mentais Ilustrados" })} target="_blank" rel="noopener noreferrer">
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
