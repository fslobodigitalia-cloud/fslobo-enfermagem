/**
 * Página comercial de Medicamentos na Prática — landing dedicada servida em
 * /medicamentos-na-pratica (rota estática declarada em App.tsx).
 *
 * ARQUIVO NOVO E INDEPENDENTE: mesma estrutura comercial e disciplina de
 * checkout já validada em produção por GuiaEvolucaoEnfermagemPage.tsx/
 * MapasMentaisPage.tsx/BalancoHidricoPage.tsx (Hero → conteúdo → oferta/
 * preço/checkout → Pix → confirmação + downloads), mas com copy, seções e
 * Pixel PRÓPRIOS — nenhum arquivo dessas páginas é importado, editado ou de
 * qualquer forma afetado por esta. checkoutAttempt.ts/productCheckout.ts/
 * orderAccess.ts/orderDownloads.ts/TurnstileWidget/useProductCatalog são
 * reaproveitados tal como estão (mesma infraestrutura, contrato
 * inalterado) — a Edge Function create-product-order-efi-prod e a RPC
 * create_or_get_product_order_with_items_efi já são 100% genéricas por
 * productSlugs[], sem qualquer alteração de backend necessária para este
 * produto novo.
 *
 * "medicamentos-na-pratica" era kind='bump' no catálogo até esta landing
 * ser criada — passou a kind='primary' (mudança de dado no Supabase,
 * auditada e aplicada manualmente, fora deste arquivo) para poder ser
 * vendido sozinho por R$10 aqui. Continua funcionando normalmente como
 * adicional no Guia de Evolução e no Mapas Mentais.
 *
 * Sem seção de depoimentos/feedback (pedido explícito): no lugar, a seção
 * "Veja por dentro antes de comprar" dá destaque à prévia real do material
 * (as 4 páginas reais em public/medicamentos-na-pratica/).
 *
 * Sobre duplicação de código: esta página segue deliberadamente o MESMO
 * padrão de duplicação já usado pelas 3 landings citadas acima (Hero/
 * OfferSection/CheckoutForm/PaidPanel/ResultPanel/ErrorPanel locais, não
 * compartilhados). Extrair esses componentes para um módulo comum tocaria
 * as 3 páginas já em produção — fora do escopo desta tarefa (risco
 * desnecessário). A única extração nova e severificadamente segura feita
 * para esta tarefa foi tornar `image` opcional em useDocumentMeta
 * (src/lib/seo.ts) — aditiva, não muda nenhuma página existente que não
 * passa esse campo.
 */
import * as React from "react";
import {
  ArrowRight,
  BadgeCheck,
  Calculator,
  Check,
  Clock,
  Copy,
  Eye,
  FileText,
  GraduationCap,
  HeartPulse,
  HelpCircle,
  Loader2,
  Lock,
  MessageCircle,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Syringe,
  X,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
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
import { medicamentosProduct, medicamentosBumps, formatCents } from "@/config/digitalProducts";
import { buildPixSupportWhatsAppUrl } from "@/lib/whatsapp";
import {
  initMedicamentosPixel,
  trackMedicamentosInitiateCheckout,
  trackMedicamentosPurchase,
} from "@/lib/medicamentosPixel";
import { trackTikTokViewContent, trackTikTokInitiateCheckout, trackTikTokPurchase } from "@/lib/tiktokPixel";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MedicamentosConnectedProducts } from "@/components/medicamentos/MedicamentosConnectedProducts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/checkout/TurnstileWidget";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Precisa ser EXATAMENTE a mesma action já validada pelo backend
 *  (TURNSTILE_EXPECTED_ACTION_PRODUCT_ORDER em create-product-order-efi-prod)
 *  — a mesma usada por todas as outras landings. Nunca inventar uma action nova. */
const TURNSTILE_ACTION = "create_product_order";
const POLL_INTERVAL_MS = 5_000;
const OFFER_SECTION_ID = "comprar";
const PANEL_CONTAINER = "mx-auto w-full max-w-[640px] px-5";
const COVER_SRC = "/medicamentos-na-pratica/capa-medicamentos-na-pratica.webp";
const OG_IMAGE = "https://www.fsloboenfermagem.com.br/medicamentos-na-pratica/capa-medicamentos-na-pratica.webp";

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

interface FormErrors {
  name?: string;
  email?: string;
}

/** Mensagens amigáveis por código de erro — nunca a mensagem crua do servidor. Mesmo mapa (cópia deliberada, não importada) já usado pelas outras landings. */
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

export default function MedicamentosNaPraticaPage() {
  useDocumentMeta({
    title: "Medicamentos na Prática | FSlobo Enfermagem",
    description:
      "Guia visual de cálculo de medicamentos para enfermagem: unidades, diluição, gotejamento, bomba de infusão, doses pediátricas e mais. Material digital em PDF, acesso após confirmação do Pix.",
    path: "/medicamentos-na-pratica",
    image: OG_IMAGE,
  });

  React.useEffect(() => {
    const previous = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#ffffff";
    return () => {
      document.body.style.backgroundColor = previous;
    };
  }, []);

  const { ensureAttempt } = useCheckoutAttempt(medicamentosProduct.slug);

  const catalog = useProductCatalog();
  const catalogProduct =
    catalog.status === "success" ? catalog.products.find((p) => p.slug === medicamentosProduct.slug) ?? null : null;
  const priceCents = catalogProduct?.priceCents ?? medicamentosProduct.priceCents;

  // Pixel (Meta) — script + init + PageView + ViewContent, uma única vez.
  React.useEffect(() => {
    initMedicamentosPixel(priceCents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TikTok ViewContent — só quando o produto REAL do catálogo carrega.
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

  const [activeAccessToken, setActiveAccessToken] = React.useState<string | null>(null);

  // Guardas de disparo do Purchase (Meta + TikTok) — só existe valor real
  // quando o pedido foi criado NESTA sessão. No fluxo de retomada, ficam
  // null e o Purchase nunca dispara.
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

  const totalCents =
    priceCents + medicamentosBumps.filter((b) => selectedBumps.has(b.slug)).reduce((sum, b) => sum + b.priceCents, 0);

  React.useEffect(() => {
    let cancelled = false;
    async function resume() {
      const access = readOrderAccess(medicamentosProduct.slug);
      if (!access) {
        setResuming(false);
        return;
      }
      const outcome = await getOrderDownloads(access.publicId, access.checkoutAccessToken);
      if (cancelled) return;
      if (outcome.kind === "paid") {
        setDownloads(outcome.downloads);
      } else {
        clearOrderAccess(medicamentosProduct.slug);
      }
      setResuming(false);
    }
    void resume();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Purchase (Meta + TikTok): dispara exatamente uma vez, no exato instante
  // em que "paid" é confirmado (downloads deixa de ser null) DENTRO desta
  // sessão.
  React.useEffect(() => {
    if (downloads === null) return;

    const orderPublicId = orderPublicIdRef.current;
    const amountCents = orderAmountCentsRef.current;
    if (orderPublicId === null || amountCents === null) return;

    if (!purchaseFiredRef.current) {
      const sent = trackMedicamentosPurchase({ orderPublicId, amountCents });
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

    const attempt = ensureAttempt({ name, email: mail, productSlugs });

    trackMedicamentosInitiateCheckout(totalCents);
    trackTikTokInitiateCheckout(
      totalCents,
      "BRL",
      productSlugs.map((slug) => {
        if (slug === medicamentosProduct.slug) return { slug, name: medicamentosProduct.name, priceCents };
        const bump = medicamentosBumps.find((b) => b.slug === slug);
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

    setTurnstileToken(null);
    turnstileRef.current?.reset();

    if (outcome.kind !== "error") {
      setActiveAccessToken(attempt.checkoutAccessToken);
      saveOrderAccess(medicamentosProduct.slug, {
        publicId: outcome.order.publicId,
        checkoutAccessToken: attempt.checkoutAccessToken,
      });
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

    const productSlugs = [medicamentosProduct.slug, ...Array.from(selectedBumps)];
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
            <PaidPanel downloads={downloads} orderAccessKey={medicamentosProduct.slug} />
          </div>
        ) : showPixResult && result !== null ? (
          <div className={cn(PANEL_CONTAINER, "py-16")}>
            <ResultPanel result={result} copied={copied} onCopyCode={handleCopyCode} />
          </div>
        ) : (
          <>
            <Hero priceCents={priceCents} />
            <ProblemsSection />
            <BenefitsSection />
            <ModuleMapSection />
            <PreviewSection />
            <AudienceSection />
            <EducationalNoticeSection />
            <GuaranteeSection />
            <FAQSection />
            <MedicamentosConnectedProducts />
            <FinalCtaSection priceCents={priceCents} />
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

function Hero({ priceCents }: { priceCents: number }) {
  const priceLabel = formatCents(priceCents);

  return (
    <section className="relative overflow-hidden px-3.5 pb-14 pt-14 sm:px-5 sm:pb-20 sm:pt-16" style={{ backgroundColor: "#0a1622" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60% 55% at 14% 8%, rgba(45,212,191,0.16), transparent 62%), radial-gradient(50% 45% at 100% 100%, rgba(13,148,136,0.14), transparent 60%)",
        }}
        aria-hidden="true"
      />
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
            Guia visual de cálculo de medicamentos
          </span>
          <h1 className="font-sans text-[2.125rem] font-extrabold leading-[1.1] tracking-tight text-white sm:text-[2.5rem] lg:text-[3.1rem]">
            Medicamentos <span className="text-teal-400">na Prática</span>
          </h1>
          <p className="max-w-[52ch] text-[16px] leading-relaxed text-slate-300 lg:text-[17.5px]">
            Domine cálculos, diluições e cuidados essenciais com um guia visual e direto para a rotina da enfermagem.
          </p>

          <div className="flex w-full flex-col gap-3 lg:hidden">
            <MobileCover />
          </div>

          <Button size="lg" variant="outline" full className={cn("max-w-[360px] lg:w-auto lg:px-12", CTA_BUTTON_CLASS)} onClick={scrollToOffer}>
            QUERO ACESSAR POR {priceLabel.replace("R$", "R$").trim().replace(",00", "")}
          </Button>

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12.5px] font-semibold text-slate-300 lg:justify-start">
            <span className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-teal-400" aria-hidden="true" /> Compra única
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-teal-400" aria-hidden="true" /> Acesso após confirmação do Pix
            </span>
            <span className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-teal-400" aria-hidden="true" /> Material digital em PDF
            </span>
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-teal-400" aria-hidden="true" /> Celular, tablet e computador
            </span>
          </div>
        </div>

        <div className="relative hidden lg:flex lg:justify-end">
          <div className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-[40px] bg-teal-400/15 blur-3xl" aria-hidden="true" />
          <div
            className={cn(
              "relative flex aspect-[3/4] w-full max-w-[380px] items-center justify-center overflow-hidden rounded-[32px] border border-white/15 bg-white p-3",
              "shadow-[0_8px_16px_rgba(0,0,0,0.25),0_40px_80px_-28px_rgba(0,0,0,0.55)]",
            )}
          >
            <img
              src={COVER_SRC}
              alt="Capa do material Medicamentos na Prática — cálculos, diluição e cuidados de enfermagem"
              width={1200}
              height={1600}
              loading="eager"
              className="h-full w-full rounded-[22px] object-contain"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function MobileCover() {
  return (
    <div className="mx-auto w-full max-w-[220px] overflow-hidden rounded-[24px] border border-white/15 bg-white p-2 shadow-[0_8px_16px_rgba(0,0,0,0.25),0_30px_60px_-24px_rgba(0,0,0,0.5)]">
      <img
        src={COVER_SRC}
        alt="Capa do material Medicamentos na Prática — cálculos, diluição e cuidados de enfermagem"
        width={1200}
        height={1600}
        loading="eager"
        className="h-full w-full rounded-[16px] object-contain"
      />
    </div>
  );
}

/* ──────────────────────── Problemas que o material resolve ───────────────── */

const PROBLEMS = [
  {
    icon: Calculator,
    title: "Fórmula na hora H",
    body: "Trava na hora de calcular a dose ou o volume a partir da prescrição, sem lembrar por onde começar.",
  },
  {
    icon: Syringe,
    title: "Gotejamento e bomba de infusão",
    body: "Dúvida entre macrogotas, microgotas e mL/h ao programar a bomba de infusão.",
  },
  {
    icon: ShieldAlert,
    title: "Diluição e reconstituição",
    body: "Insegurança para calcular a concentração final depois de reconstituir um pó ou diluir uma solução.",
  },
  {
    icon: HeartPulse,
    title: "Doses por peso e pediatria",
    body: "Cálculos por kg/superfície corporal em pediatria e neonatologia, onde um erro de casa decimal pesa muito mais.",
  },
];

function ProblemsSection() {
  return (
    <section className="relative bg-white px-5 py-12 sm:py-20" style={TEXTURE_TEAL_BLOOM}>
      <div className="mx-auto w-full max-w-[1000px]">
        <div className="mx-auto max-w-[640px] text-center">
          <span className={cn("inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            Situações comuns no dia a dia
          </span>
          <h2 className="mt-4 font-sans text-[1.75rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.15rem]">
            O que este guia ajuda você a entender
          </h2>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-2">
          {PROBLEMS.map(({ icon: Icon, title, body }) => (
            <div key={title} className={cn("flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5", SHADOW_SOFT)}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600">
                <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
              </span>
              <div>
                <p className="text-[15px] font-bold text-slate-900">{title}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-slate-600">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────── Benefícios ──────────────────────────────── */

const BENEFITS = [
  "Raciocínio explicado passo a passo, com exemplos resolvidos",
  "Tabelas de conversão e fórmulas prontas para consulta rápida",
  "Os 9 certos da administração de medicamentos, organizados em checklist",
  "Seção dedicada a medicamentos de alta vigilância (LASA)",
  "Exercícios com gabarito para você praticar e conferir",
  "Guia de bolso ao final, para revisar em poucos minutos",
];

function BenefitsSection() {
  return (
    <section className="relative bg-slate-50 px-5 py-12 sm:py-20">
      <div className="mx-auto w-full max-w-[900px]">
        <div className="mx-auto max-w-[640px] text-center">
          <span className={cn("inline-flex items-center rounded-full border border-teal-200 bg-white px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            Por que este guia
          </span>
          <h2 className="mt-4 font-sans text-[1.75rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.15rem]">
            Benefícios do material
          </h2>
        </div>

        <ul className="mt-9 grid grid-cols-1 gap-3 sm:mt-12 sm:grid-cols-2">
          {BENEFITS.map((item) => (
            <li key={item} className={cn("flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-[14.5px] font-medium text-slate-700", SHADOW_SOFT)}>
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" strokeWidth={2.5} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ───────────────────────── Mapa do manual (17 módulos) ────────────────────── */

const MODULE_MAP = [
  "Unidades, conversões e leitura de rótulo",
  "Fórmula fundamental: D/H × V",
  "Concentração, porcentagem e proporções",
  "Reconstituição e diluição",
  "Bomba de infusão: mL/h",
  "Gotejamento: macro e microgotas",
  "Dose por peso e superfície corporal",
  "Pediatria e neonatologia: pontos críticos",
  "Insulina e unidades internacionais",
  "Heparina e soluções em UI",
  "Infusões contínuas e mcg/kg/min",
  "Classes farmacológicas essenciais",
  "Vias e formas farmacêuticas",
  "Medicamentos de alta vigilância e LASA",
  "Compatibilidade, estabilidade e prevenção de erros",
  "Exercícios e gabarito",
  "Guia de bolso e referências",
];

function ModuleMapSection() {
  return (
    <section className="relative bg-white px-5 py-12 sm:py-20">
      <div className="mx-auto w-full max-w-[820px]">
        <div className="mx-auto max-w-[640px] text-center">
          <span className={cn("inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            Mapa do manual
          </span>
          <h2 className="mt-4 font-sans text-[1.75rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.15rem]">
            O que você vai dominar — 17 módulos
          </h2>
        </div>

        <div className={cn("mt-9 overflow-hidden rounded-[24px] border border-slate-200 sm:mt-12", SHADOW_MEDIUM)}>
          <ol className="divide-y divide-slate-100 bg-white">
            {MODULE_MAP.map((title, index) => (
              <li key={title} className="flex items-center gap-4 px-5 py-3.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-50 text-[12px] font-extrabold text-teal-700">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-[14px] font-medium text-slate-700 sm:text-[14.5px]">{title}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── Veja por dentro antes de comprar ────────────────── */

interface PreviewPage {
  src: string;
  alt: string;
}

const PREVIEW_PAGES: PreviewPage[] = [1, 2, 3, 4].map((number) => ({
  src: `/medicamentos-na-pratica/modulo-${number}.webp`,
  alt: `Página ${number} de exemplo de Medicamentos na Prática`,
}));

function PreviewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [pageIndex, setPageIndex] = React.useState(0);
  const touchStartX = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (open) setPageIndex(0);
  }, [open]);

  const goToPage = (nextIndex: number) => {
    const total = PREVIEW_PAGES.length;
    setPageIndex((nextIndex + total) % total);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToPage(pageIndex - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goToPage(pageIndex + 1);
    }
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null) return;
    const distance = event.changedTouches[0].clientX - startX;
    if (Math.abs(distance) < 45) return;
    goToPage(distance > 0 ? pageIndex - 1 : pageIndex + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[94svh] max-w-[960px] flex-col overflow-hidden rounded-[26px] border border-white/15 bg-slate-950 text-white shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3.5 sm:px-6">
          <div className="min-w-0">
            <DialogTitle className="truncate text-[15px] font-extrabold sm:text-[18px]">Medicamentos na Prática</DialogTitle>
            <DialogDescription className="mt-1 text-[12.5px] text-slate-300">
              Arraste para o lado ou use as setas para ver algumas páginas.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Fechar visualização"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </DialogClose>
        </div>

        <div
          className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center bg-slate-900/80 p-3 sm:p-6"
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0].clientX;
          }}
          onTouchEnd={handleTouchEnd}
        >
          <img
            key={PREVIEW_PAGES[pageIndex].src}
            src={PREVIEW_PAGES[pageIndex].src}
            alt={PREVIEW_PAGES[pageIndex].alt}
            className="max-h-[64svh] w-full rounded-xl object-contain"
          />
          <button
            type="button"
            aria-label="Página anterior"
            onClick={() => goToPage(pageIndex - 1)}
            className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/75 text-white shadow-lg backdrop-blur transition hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:left-6"
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            aria-label="Próxima página"
            onClick={() => goToPage(pageIndex + 1)}
            className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/75 text-white shadow-lg backdrop-blur transition hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:right-6"
          >
            <ChevronRightIcon />
          </button>
          <span
            aria-live="polite"
            className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/80 px-3 py-1 text-[12px] font-bold text-white backdrop-blur"
          >
            {pageIndex + 1} de {PREVIEW_PAGES.length}
          </span>
        </div>

        <div className="flex gap-2 overflow-x-auto border-t border-white/10 bg-slate-950 p-3 sm:px-6">
          {PREVIEW_PAGES.map((page, index) => (
            <button
              key={page.src}
              type="button"
              aria-label={`Ver página ${index + 1}`}
              aria-current={index === pageIndex ? "true" : undefined}
              onClick={() => setPageIndex(index)}
              className={cn(
                "h-14 w-11 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:h-16 sm:w-12",
                index === pageIndex ? "border-teal-400 opacity-100" : "border-transparent opacity-55 hover:opacity-90",
              )}
            >
              <img src={page.src} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PreviewSection() {
  const [open, setOpen] = React.useState(false);
  const scrollPosition = React.useRef(0);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      scrollPosition.current = window.scrollY;
      setOpen(true);
      return;
    }
    setOpen(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollPosition.current, left: 0, behavior: "auto" });
    });
  };

  return (
    <section className="relative overflow-hidden bg-slate-50 px-5 py-12 sm:py-20">
      <div className="mx-auto w-full max-w-[1100px]">
        <div className="mx-auto max-w-[640px] text-center">
          <span className={cn("inline-flex items-center rounded-full border border-teal-200 bg-white px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            Sem surpresas
          </span>
          <h2 className="mt-4 font-sans text-[1.75rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.15rem]">
            Veja por dentro antes de comprar
          </h2>
          <p className="mx-auto mt-3 max-w-[52ch] text-[15px] text-slate-600">
            Estas são páginas reais do material — toque em qualquer uma para abrir a visualização completa.
          </p>
        </div>

        <div className="mt-9 grid grid-cols-2 gap-3 sm:mt-12 sm:grid-cols-4 sm:gap-5">
          {PREVIEW_PAGES.map((page) => (
            <button
              key={page.src}
              type="button"
              onClick={() => handleOpenChange(true)}
              aria-label="Ver páginas de Medicamentos na Prática"
              className={cn(
                "group relative aspect-[3/4] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 transition duration-200 hover:-translate-y-1 hover:border-teal-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/20",
                SHADOW_SOFT,
              )}
            >
              <img src={page.src} alt={page.alt} loading="lazy" className="h-full w-full rounded-xl object-contain transition duration-300 group-hover:scale-[1.02]" />
              <span className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-slate-950/40 via-transparent to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                <span className="flex items-center gap-1.5 rounded-full bg-slate-950/85 px-3 py-1.5 text-[11px] font-bold text-white">
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Ver
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <PreviewDialog open={open} onOpenChange={handleOpenChange} />
    </section>
  );
}

/* ─────────────────────────── Para quem é este material ───────────────────── */

const AUDIENCE = [
  { icon: GraduationCap, label: "Estudantes de enfermagem que precisam entender o raciocínio por trás dos cálculos" },
  { icon: Stethoscope, label: "Técnicos e técnicas de enfermagem que fazem cálculo e preparo de medicamentos no dia a dia" },
  { icon: HeartPulse, label: "Enfermeiros e enfermeiras que querem uma consulta rápida antes de administrar" },
  { icon: BadgeCheck, label: "Quem está se preparando para provas e concursos com questões de farmacologia/cálculo" },
];

function AudienceSection() {
  return (
    <section className="relative bg-white px-5 py-12 sm:py-20" style={TEXTURE_TEAL_BLOOM}>
      <div className="mx-auto w-full max-w-[900px]">
        <div className="mx-auto max-w-[640px] text-center">
          <span className={cn("inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            Para quem é
          </span>
          <h2 className="mt-4 font-sans text-[1.75rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.15rem]">
            Para quem é este material
          </h2>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-2">
          {AUDIENCE.map(({ icon: Icon, label }) => (
            <div key={label} className={cn("flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-white p-4.5 p-5", SHADOW_SOFT)}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600">
                <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <p className="text-[14.5px] font-medium leading-relaxed text-slate-700">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── Aviso de finalidade educacional ─────────────────── */

function EducationalNoticeSection() {
  return (
    <section className="relative bg-slate-50 px-5 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-[820px]">
        <div className={cn("flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6", SHADOW_SOFT)}>
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="text-[14.5px] font-bold text-amber-900">Finalidade exclusivamente educacional</p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-amber-800">
              Este material ensina o raciocínio matemático e os fundamentos da administração segura de medicamentos.
              Doses, concentrações, diluentes, compatibilidades e velocidades sempre devem ser confirmadas na
              prescrição vigente, na bula/ficha técnica, com a farmácia clínica e conforme o protocolo da sua
              instituição. Ele não substitui o julgamento clínico, a prescrição médica nem os sistemas de prevenção de
              erros já usados no seu serviço.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Garantia e acesso (política do site) ──────────── */

function GuaranteeSection() {
  return (
    <section className="relative bg-white px-5 py-12 sm:py-20">
      <div className="mx-auto w-full max-w-[820px]">
        <div className="mx-auto max-w-[640px] text-center">
          <span className={cn("inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            Compra segura
          </span>
          <h2 className="mt-4 font-sans text-[1.75rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.15rem]">
            Garantia e acesso
          </h2>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-3">
          <div className={cn("flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-center", SHADOW_SOFT)}>
            <Lock className="h-5 w-5 text-teal-600" aria-hidden="true" />
            <p className="text-[13.5px] font-semibold text-slate-700">Pagamento via Pix, 100% seguro</p>
          </div>
          <div className={cn("flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-center", SHADOW_SOFT)}>
            <Zap className="h-5 w-5 text-teal-600" aria-hidden="true" />
            <p className="text-[13.5px] font-semibold text-slate-700">Liberado logo após a confirmação do Pix</p>
          </div>
          <div className={cn("flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-center", SHADOW_SOFT)}>
            <ShieldCheck className="h-5 w-5 text-teal-600" aria-hidden="true" />
            <p className="text-[13.5px] font-semibold text-slate-700">Acesso sem prazo de expiração</p>
          </div>
        </div>

        <p className="mt-6 text-center text-[13px] text-slate-500">
          Veja também nossa{" "}
          <Link to="/entrega" className="font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-800">
            política de entrega
          </Link>{" "}
          e nossa{" "}
          <Link to="/reembolso" className="font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-800">
            política de reembolso
          </Link>{" "}
          — as mesmas que valem para qualquer compra no site.
        </p>
      </div>
    </section>
  );
}

/* ────────────────────────────────── FAQ ──────────────────────────────────── */

const FAQ_ITEMS = [
  {
    q: "Como recebo o material depois da compra?",
    a: "O acesso é liberado automaticamente assim que o pagamento via Pix é confirmado — você recebe os links de download na própria página e também por e-mail.",
  },
  {
    q: "Em qual formato o material é entregue?",
    a: "Arquivo digital em PDF, para consultar no computador, tablet ou celular.",
  },
  {
    q: "O acesso expira?",
    a: "Não. Depois de liberado, o material fica disponível para download sem prazo de expiração.",
  },
  {
    q: "Este material substitui a prescrição ou o protocolo da minha instituição?",
    a: "Não. É um material educacional para praticar e entender o raciocínio dos cálculos — doses, diluições e velocidades reais sempre devem seguir a prescrição vigente e o protocolo institucional.",
  },
  {
    q: "Posso adicionar outros materiais junto com a compra?",
    a: "Sim. No checkout você pode incluir Anotação e Evolução de Enfermagem e/ou Mapas Mentais como adicionais, por + R$10 cada.",
  },
];

function FAQSection() {
  return (
    <section className="border-t border-slate-200 bg-slate-50 py-14 sm:py-16">
      <div className="mx-auto w-full max-w-[820px] px-5 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600">
            <HelpCircle className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <h2 className="text-[1.3rem] font-extrabold tracking-tight text-slate-900">Dúvidas frequentes</h2>
        </div>
        <Accordion type="single" collapsible className="mt-6 flex flex-col gap-3">
          {FAQ_ITEMS.map((item, index) => (
            <AccordionItem key={item.q} value={`item-${index}`}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

/* ───────────────────────────────── CTA final ──────────────────────────────── */

function FinalCtaSection({ priceCents }: { priceCents: number }) {
  return (
    <section className="relative overflow-hidden bg-white px-5 py-14 sm:py-20">
      <div className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-5 rounded-[28px] border border-teal-200 bg-gradient-to-b from-teal-50 to-white p-8 text-center sm:p-12">
        <h2 className="font-sans text-[1.6rem] font-extrabold tracking-tight text-slate-900 sm:text-[2rem]">
          Pronto para calcular com mais segurança?
        </h2>
        <p className="max-w-[48ch] text-[15px] text-slate-600">
          Leve o guia visual de Medicamentos na Prática por {formatCents(priceCents)} e consulte sempre que precisar.
        </p>
        <Button size="lg" variant="outline" className={cn("px-10", CTA_BUTTON_CLASS)} onClick={scrollToOffer}>
          QUERO ACESSAR POR R$10 <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

/* ────────────────────── Oferta principal / preço / compra ────────────────── */

const OFFER_NAVY_BG: React.CSSProperties = {
  backgroundColor: "#0a1622",
  backgroundImage:
    "radial-gradient(60% 50% at 15% 0%, rgba(13,148,136,0.16), transparent 60%), radial-gradient(50% 45% at 100% 100%, rgba(16,185,129,0.12), transparent 60%)",
};

const OFFER_BENEFITS = [
  "17 módulos: da leitura de rótulo aos exercícios com gabarito",
  "Fórmulas e tabelas de conversão prontas para consulta",
  "Os 9 certos da administração, organizados em checklist",
  "Guia de bolso para revisar em poucos minutos",
];

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
          <div className={cn("overflow-hidden rounded-[28px] border border-white/15 bg-white p-3", "shadow-[0_8px_16px_rgba(0,0,0,0.25),0_40px_80px_-28px_rgba(0,0,0,0.55)]")}>
            <img
              src={COVER_SRC}
              alt="Capa do material Medicamentos na Prática"
              className="block aspect-[3/4] w-full rounded-[20px] object-contain"
            />
          </div>
        </div>

        <div className={cn("relative overflow-hidden rounded-[28px] border border-white/10 bg-white p-6 sm:p-10", "shadow-[0_8px_16px_rgba(0,0,0,0.2),0_40px_90px_-30px_rgba(0,0,0,0.6)]")}>
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-teal-50/80 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-emerald-50/70 blur-3xl" aria-hidden="true" />

          <span className={cn("relative inline-flex items-center gap-2 rounded-full bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Acesso imediato
          </span>
          <h2 className="relative mt-5 font-sans text-[1.9rem] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[2.15rem]">
            {medicamentosProduct.name}
          </h2>
          <p className="relative mt-3 text-[15.5px] leading-relaxed text-slate-600">
            Cálculos, diluição e cuidados de enfermagem em um guia visual, direto para a prática.
          </p>

          <ul className="relative mt-7 flex flex-col gap-3">
            {OFFER_BENEFITS.map((item) => (
              <li key={item} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-[14.5px] font-medium text-slate-700">
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
        <Label htmlFor="med-checkout-nome" className="text-slate-500">
          Nome
        </Label>
        <Input
          id="med-checkout-nome"
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
        <Label htmlFor="med-checkout-email" className="text-slate-500">
          E-mail
        </Label>
        <Input
          id="med-checkout-email"
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
          <p className="text-[15px] font-bold text-slate-900">Complete seu kit de enfermagem</p>
          <p className="text-[13px] leading-relaxed text-slate-500">
            Adicione conteúdos que complementam este guia. Você recebe tudo junto após a confirmação do pagamento.
          </p>
        </div>
        {medicamentosBumps.map((bump) => {
          const checked = selectedBumps.has(bump.slug);
          return (
            <label
              key={bump.slug}
              htmlFor={`med-bump-${bump.slug}`}
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
                  id={`med-bump-${bump.slug}`}
                  checked={checked}
                  onCheckedChange={() => onToggleBump(bump.slug)}
                  className="mt-0.5 border-slate-300 bg-white hover:border-teal-500 data-[state=checked]:border-teal-600 data-[state=checked]:bg-teal-600 data-[state=checked]:text-white"
                />
                <span className="flex flex-col gap-1">
                  <span className="text-[14.5px] font-bold leading-snug text-slate-900">{bump.name}</span>
                  <span className="text-[12.5px] leading-snug text-slate-500">{bump.description}</span>
                  <span className={cn("text-[12.5px] font-bold", checked ? "text-teal-700" : "text-teal-600")}>
                    {checked ? "✓ Adicionado — você receberá junto com o material" : "Adicionar por apenas R$ 10"}
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
            <Label htmlFor="med-pix-copia-cola" className="text-slate-500">
              Pix copia e cola
            </Label>
            <textarea
              id="med-pix-copia-cola"
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

/* ──────────────────────────── Pagamento confirmado ─────────────────────── */

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
            href={buildPixSupportWhatsAppUrl(null, { purchaseLabel: "o Medicamentos na Prática" })}
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
          <a href={buildPixSupportWhatsAppUrl(null, { purchaseLabel: "o Medicamentos na Prática" })} target="_blank" rel="noopener noreferrer">
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
