import { GuiaConversationSection } from "../components/guia/GuiaConversationSection";
import { ConnectedExtrasSection, CONNECTED_EXTRA_SLUGS } from "@/components/guia/ConnectedExtrasSection";
/**
 * Página comercial do Guia de Evolução de Enfermagem. Estrutura e copy
 * reconstroem a landing de referência já validada em conversão
 * (reference/manual2026.html, /manual2026/): Hero → 3 dores
 * → carrossel de conteúdo → conversas → adicionais →
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
 * Tailwind — teal/slate/emerald), tipografia sans (Manrope). A base global
 * de index.css/tailwind.config.js já é clara — o pequeno ajuste de cor de
 * fundo do <body> só enquanto esta página está montada (ver useEffect
 * abaixo) é mantido por segurança contra bounce/overscroll (ex.: iOS
 * Safari), mesmo sem um tema escuro global para escapar hoje.
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
  ArrowRight,
  Check,
  Clock,
  Copy,
  FileText,
  HeartPulse,
  Loader2,
  Lock,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
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
import { guiaEvolucaoProduct, guiaEvolucaoBumps, formatCents } from "@/config/digitalProducts";
import { buildPixSupportWhatsAppUrl } from "@/lib/whatsapp";
import { initGuiaPixel, trackGuiaInitiateCheckout, trackGuiaPurchase } from "@/lib/guiaPixel";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
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
 * de virarem classe global (@layer components), para não tocar index.css.
 * PANEL_CONTAINER é só para as telas transacionais
 * (Pix pendente / downloads liberados); as seções de marketing usam
 * larguras maiores (definidas em cada componente) para ter presença no
 * desktop.
 */
const PANEL_CONTAINER = "mx-auto w-full max-w-[640px] px-5";

/**
 * Sistema de sombra em 2 níveis — só para esta página (classes locais,
 * repetidas via constante em vez de virar @layer components global).
 * Sempre em camadas (uma sombra de contato curta + uma difusa longa),
 * nunca uma sombra preta única e pesada. SOFT para elementos secundários
 * (badges, ícones, cards do carrossel), MEDIUM para blocos de conteúdo
 * (preço). Os pontos de maior destaque (vídeo do produto, card de
 * checkout) usam sombras dedicadas mais fortes, escritas inline onde
 * aparecem, coerentes com o fundo escuro que os envolve.
 */
const SHADOW_SOFT = "shadow-[0_2px_4px_rgba(15,23,42,0.04),0_8px_20px_-14px_rgba(15,23,42,0.12)]";
const SHADOW_MEDIUM = "shadow-[0_4px_8px_rgba(15,23,42,0.05),0_20px_40px_-20px_rgba(15,23,42,0.16)]";

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
 * pesar no LCP. TEAL_BLOOM para fundos brancos.
 */
const TEXTURE_TEAL_BLOOM: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(55% 45% at 12% 0%, rgba(13,148,136,0.06), transparent 60%), radial-gradient(45% 40% at 100% 100%, rgba(13,148,136,0.05), transparent 60%)",
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
  // Esta página é servida em "/guia-evolucao-enfermagem" (ver App.tsx) —
  // por isso o canonical/og:url aponta para essa mesma rota. Correção:
  // antes apontava para "/", de quando "/" ainda servia este componente
  // diretamente; "/" agora serve o catálogo (MaterialsPage), então manter
  // o canonical em "/" apontaria para a página errada aos olhos do Google.
  useDocumentMeta({
    title: "Guia de Evolução de Enfermagem | FSlobo Enfermagem",
    description:
      "Mais de 132 modelos prontos de evolução e anotação de enfermagem para consulta prática no plantão e nos estudos. Material digital em PDF.",
    path: "/guia-evolucao-enfermagem",
  });

  // Só enquanto esta página está montada, força um fundo claro no <body>
  // como garantia extra contra qualquer flash escuro em bounce/overscroll
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

  const { ensureAttempt } = useCheckoutAttempt(guiaEvolucaoProduct.slug);
  // checkoutAccessToken usado no polling desta submissão — capturado no
  // momento do envio (ensureAttempt), nunca recalculado depois: garante que
  // o polling sempre consulta o pedido que foi de fato criado, mesmo que
  // nome/e-mail/bumps mudem depois (o que trocaria o fingerprint e geraria
  // outro checkout_request_id, sem relação com o pedido já em andamento).
  const [activeAccessToken, setActiveAccessToken] = React.useState<string | null>(null);

  // Preço exibido: lido do MESMO catálogo público (RPC
  // get_active_product_catalog(), via useProductCatalog()) já usado por
  // /materiais e /produto/:slug — nunca uma segunda fonte. Assim que o
  // preço mudar no banco (CRM), a página reflete automaticamente, sem
  // precisar editar código. guiaEvolucaoProduct.priceCents (config
  // estático) só entra como fallback nos poucos instantes antes do
  // catálogo responder, ou se a consulta falhar — nunca é usado para
  // calcular a cobrança real, que continua exclusivamente no backend
  // (create_or_get_product_order_with_items()).
  const catalog = useProductCatalog();
  const guiaCatalogProduct =
    catalog.status === "success" ? catalog.products.find((p) => p.slug === guiaEvolucaoProduct.slug) ?? null : null;
  const guiaPriceCents = guiaCatalogProduct?.priceCents ?? guiaEvolucaoProduct.priceCents;

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
  // criado NESTA sessão (create-product-order devolveu order.publicId +
  // order.amountCents). No fluxo de retomada (pedido pago encontrado ao
  // recarregar a página), estes valores permanecem null e o Purchase NUNCA
  // dispara — não há como obter o valor real confirmado sem alterar
  // get-order-downloads, e inventar um valor no frontend é exatamente o
  // que foi proibido. A deduplicação entre browser e CAPI (mesmo
  // orderPublicId como eventID) e a proteção contra reenvio por
  // polling/re-render vivem em trackGuiaPurchase (src/lib/guiaPixel.ts) —
  // purchaseFiredRef aqui é só um atalho em memória para não reavaliar a
  // guarda a cada re-render, não a fonte da deduplicação.
  const orderPublicIdRef = React.useRef<string | null>(null);
  const orderAmountCentsRef = React.useRef<number | null>(null);
  const purchaseFiredRef = React.useRef(false);

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  const errorCategory = result?.kind === "error" ? classifyCheckoutErrorCode(result.code) : null;
  const showForm = result === null || (result.kind === "error" && errorCategory === "input");
  const showPixResult = result !== null && result.kind !== "error" && downloads === null;

  const totalCents =
    guiaPriceCents +
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
      if (!activeAccessToken) return;
      const outcome = await getOrderDownloads(order.publicId, activeAccessToken);
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
  }, [result, downloads, activeAccessToken]);

  // ── Purchase: dispara exatamente uma vez, no exato instante em que
  //    "paid" é confirmado (downloads deixa de ser null) DENTRO desta
  //    sessão — nunca no clique do botão, nunca ao gerar o QR Code, nunca
  //    enquanto pending_payment. purchaseFiredRef garante que um
  //    re-render (ou o StrictMode do React em dev, que re-executa efeitos)
  //    nunca duplica o evento.
  React.useEffect(() => {
    if (downloads === null) return;
    if (purchaseFiredRef.current) return;
    const orderPublicId = orderPublicIdRef.current;
    const amountCents = orderAmountCentsRef.current;
    if (orderPublicId === null || amountCents === null) return; // fluxo de retomada — ver comentário acima dos refs.
    // Só marca o atalho em memória se o Purchase foi realmente enviado
    // (ou já tinha sido, via sessionStorage). Se o Pixel ainda não estiver
    // disponível, purchaseFiredRef continua false e uma próxima
    // atualização/polling pode tentar de novo.
    const sent = trackGuiaPurchase({ orderPublicId, amountCents });
    if (sent) purchaseFiredRef.current = true;
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

    // ensureAttempt() decide, no momento do envio, se reaproveita o
    // checkout_request_id salvo (mesmo nome/e-mail/product_slugs — ex.:
    // retry após erro de rede) ou gera um par novo: bump marcado/desmarcado
    // ou nome/e-mail corrigidos depois de um envio anterior mudam o
    // fingerprint, então SEMPRE geram um checkout_request_id novo aqui —
    // nunca mais reaproveitando o de uma tentativa com dados diferentes
    // (era essa reutilização indevida que causava o 409 "checkout_conflict"
    // da RPC create_or_get_product_order_with_items_efi).
    const attempt = ensureAttempt({ name, email: mail, productSlugs });

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
      saveOrderAccess(guiaEvolucaoProduct.slug, {
        publicId: outcome.order.publicId,
        checkoutAccessToken: attempt.checkoutAccessToken,
      });
      // Único momento em que temos o public_id e o valor REAL confirmado
      // pelo backend para este pedido — guardados para o Purchase,
      // disparado só quando o pagamento for de fato confirmado (ver
      // useEffect acima). orderPublicId é o MESMO public_id usado pelo
      // backend como event_id na Conversions API.
      orderPublicIdRef.current = outcome.order.publicId;
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
            <PaidPanel downloads={downloads} orderAccessKey={guiaEvolucaoProduct.slug} />
          </div>
        ) : showPixResult && result !== null ? (
          <div className={cn(PANEL_CONTAINER, "py-16")}>
            <ResultPanel result={result} copied={copied} onCopyCode={handleCopyCode} />
          </div>
        ) : (
          <>
            <Hero priceCents={guiaPriceCents} />
            <ModulesSection priceCents={guiaPriceCents} />
            <GuiaConversationSection />
            <ConnectedExtrasSection />
            <OfferSection priceCents={guiaPriceCents}>
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
  { icon: HeartPulse, label: "Fácil de entender" },
  { icon: ShieldCheck, label: "Mais segurança nos registros" },
  { icon: Clock, label: "Poupa seu tempo" },
];

/**
 * Camada de contraste sobre o vídeo de fundo da Hero — mesmo tom navy do
 * SiteFooter (#0a1622), com as duas luzes teal discretas que já existiam
 * no fundo sólido anterior (identidade visual preservada). Gradiente
 * vertical mais escuro no topo/base (onde ficam badge/título e CTA) e
 * mais transparente no meio, + vinheta lateral — forte o bastante para os
 * textos ficarem perfeitamente legíveis, sem apagar por completo o
 * movimento do vídeo por trás. Só CSS, sem imagem.
 */
const HERO_VIDEO_OVERLAY: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg, rgba(10,22,34,0.82) 0%, rgba(10,22,34,0.6) 45%, rgba(10,22,34,0.88) 100%), linear-gradient(90deg, rgba(10,22,34,0.6) 0%, rgba(10,22,34,0) 22%, rgba(10,22,34,0) 78%, rgba(10,22,34,0.6) 100%), radial-gradient(60% 55% at 14% 8%, rgba(45,212,191,0.16), transparent 62%), radial-gradient(50% 45% at 100% 100%, rgba(13,148,136,0.14), transparent 60%)",
};

/**
 * Setores/áreas da enfermagem exibidos na faixa contínua ao final da Hero —
 * puramente ilustrativo (o Guia cobre Clínica Médica, UTI e Emergência;
 * as demais áreas aqui são só contexto visual da profissão, não promessa
 * de conteúdo específico para cada setor).
 */
const SPECIALTY_AREAS = [
  "Clínica Médica",
  "Clínica Cirúrgica",
  "Urgência e Emergência",
  "UTI / CTI",
  "Pronto Atendimento",
  "Centro Cirúrgico",
  "Pediatria",
  "Obstetrícia",
  "Maternidade",
  "Cardiologia",
  "Oncologia",
  "Nefrologia",
  "Ortopedia",
  "Saúde Mental",
  "Atenção Primária",
  "Home Care",
];

/**
 * Faixa/carrossel horizontal infinito de setores, ao final da Hero. Loop
 * puramente em CSS (duas cópias da mesma lista, translateX de 0 a -50%) —
 * sem JS, sem layout shift, sem depender de framer-motion para o
 * movimento contínuo. A cópia duplicada é aria-hidden (mesmo conteúdo
 * textual repetido só para o efeito visual de loop); a lista real (para
 * leitores de tela) é a primeira. prefers-reduced-motion é respeitado via
 * media query no <style> local — para o movimento sem depender de JS.
 */
function SpecialtyMarquee() {
  return (
    <div
      className="relative left-1/2 mt-12 w-screen -translate-x-1/2 overflow-hidden border-t border-white/10 py-5 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)] sm:mt-16"
      aria-label="Áreas e setores da enfermagem"
    >
      <div className="guia-marquee-track flex w-max items-center">
        {[0, 1].map((copyIndex) => (
          <ul
            key={copyIndex}
            aria-hidden={copyIndex === 1 ? "true" : undefined}
            className="flex shrink-0 items-center gap-8 pr-8"
          >
            {SPECIALTY_AREAS.map((area) => (
              <li
                key={area}
                className="flex shrink-0 items-center gap-8 whitespace-nowrap text-[12.5px] font-bold uppercase tracking-[0.08em] text-slate-300/85"
              >
                {area}
                <span className="h-1 w-1 shrink-0 rounded-full bg-teal-400/50" aria-hidden="true" />
              </li>
            ))}
          </ul>
        ))}
      </div>
      <style>{`
        .guia-marquee-track { animation: guia-marquee-scroll 38s linear infinite; }
        @keyframes guia-marquee-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .guia-marquee-track { animation: none; }
        }
      `}</style>
    </div>
  );
}

function Hero({ priceCents }: { priceCents: number }) {
  // Vídeo de fundo só entra em prefers-reduced-motion: reduce nunca é
  // renderizado — o overlay + backgroundColor do <section> (navy sólido)
  // cobrem esse caso sozinhos, sem precisar pausar/tocar vídeo nenhum.
  const reducedMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden px-3.5 pb-16 pt-14 text-white sm:px-5 sm:pb-20 sm:pt-16 lg:pb-24 lg:pt-20" style={{ backgroundColor: "#0a1622" }}>
      {!reducedMotion && (
        <video
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          src="/guia-evolucao/hero-enfermagem.mp4"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        />
      )}
      {/* Camada de contraste — sempre presente (com ou sem vídeo), garante
          leitura dos textos em qualquer cenário. */}
      <div className="pointer-events-none absolute inset-0" style={HERO_VIDEO_OVERLAY} aria-hidden="true" />

      {/* Fio de luz no topo/base — separa das seções claras vizinhas sem borda dura. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/[0.08]" aria-hidden="true" />

      <div className="relative mx-auto grid w-full max-w-[1180px] items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        {/* Coluna esquerda. No mobile (< lg), um painel translúcido elevado
            sobre o navy (sensação de camada, não um card branco destoando
            do fundo escuro). No desktop (lg+), texto solto ao lado do
            mockup do produto. */}
        <div
          className={cn(
            "flex flex-col items-center gap-6 rounded-[30px] border border-white/10 bg-white/[0.04] p-6 text-center backdrop-blur-sm sm:p-8",
            "shadow-[0_2px_4px_rgba(0,0,0,0.2),0_28px_56px_-24px_rgba(0,0,0,0.5)]",
            "lg:items-start lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:text-left lg:shadow-none lg:backdrop-blur-none",
          )}
        >
          <span className="inline-flex items-center rounded-full border border-teal-400/30 bg-teal-400/10 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-300">
            Feito de colega para colega
          </span>
          <h1 className="font-sans text-[2.125rem] font-extrabold leading-[1.1] tracking-tight text-white sm:text-[2.5rem] lg:text-[3.25rem] xl:text-[3.75rem]">
            Saiba exatamente o que escrever no prontuário e{" "}
            <span className="text-teal-400">vá para casa em paz</span>
          </h1>
          <p className="max-w-[52ch] text-[16px] leading-relaxed text-slate-300 lg:text-[17.5px]">
            Você cuida do paciente com todo o carinho, mas trava na hora de registrar? Aqui é só consultar:
            manual ilustrado + modelos prontos por situação clínica para adaptar ao seu paciente, sem sair tarde do plantão.
          </p>
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[14.5px] font-bold text-white lg:justify-start lg:text-[15.5px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-teal-200">
              <FileText className="h-4 w-4" aria-hidden="true" /> PDF com mais de 132 modelos
            </span>
            <span className="text-slate-200">
              por <span className="text-teal-300">{formatCents(priceCents)}</span> · pagamento único
            </span>
          </p>

          {/* Benefícios — no mobile, "pills" empilhados; no desktop, badges
              compactos. Mesma hierarquia de antes, adaptada ao fundo escuro. */}
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

          <Button size="lg" variant="outline" full className={cn("max-w-[400px] lg:w-auto lg:px-12", CTA_BUTTON_CLASS)} onClick={scrollToOffer}>
            Quero acessar o guia por {formatCents(priceCents)}
          </Button>
        </div>

        {/* Coluna direita — composição editorial do produto (capa real, sem
            depender de cover_url do catálogo: este hero é próprio da página
            e usa o asset dedicado do Guia). Só no desktop (lg+). */}
        <div className="relative hidden lg:flex lg:justify-end">
          <div className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-[40px] bg-teal-400/15 blur-3xl" aria-hidden="true" />
          <div
            className={cn(
              "relative flex aspect-[3/4] w-full max-w-[380px] items-center justify-center overflow-hidden rounded-[32px] border border-white/15 bg-white p-3",
              "shadow-[0_8px_16px_rgba(0,0,0,0.25),0_40px_80px_-28px_rgba(0,0,0,0.55)]",
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

      <SpecialtyMarquee />
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
  { src: "/guia-evolucao/modulo-6.webp", alt: "Página de exemplo do Guia de Evolução de Enfermagem — modelo 6, roteiro de anotação de enfermagem" },
  { src: "/guia-evolucao/modulo-7.webp", alt: "Página de exemplo do Guia de Evolução de Enfermagem — modelo 7, roteiro de anotação de enfermagem" },
  { src: "/guia-evolucao/modulo-8.webp", alt: "Página de exemplo do Guia de Evolução de Enfermagem — modelo 8, roteiro de anotação de enfermagem" },
];

function ModulesSection({ priceCents }: { priceCents: number }) {
  return (
    <section className="relative bg-white px-5 py-12 sm:py-24" style={TEXTURE_TEAL_BLOOM}>
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="mx-auto max-w-[640px] text-center">
          <span className={cn("inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            O acervo completo
          </span>
          <h2 className="mt-4 font-sans text-[1.9rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.35rem] lg:text-[2.65rem]">
            O que você vai <span className="text-teal-600">ter em mãos</span>
          </h2>
        </div>

        {/* Prova visual central do produto, antes do carrossel — badge com leve brilho de superfície. */}
        <div
          className={cn(
            "relative mx-auto mt-6 flex w-fit items-center gap-3 overflow-hidden rounded-full border border-teal-200 bg-gradient-to-b from-teal-50 to-white px-6 py-3 sm:mt-10",
            SHADOW_SOFT,
          )}
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/70 to-transparent" aria-hidden="true" />
          <Sparkles className="relative h-5 w-5 text-teal-600" aria-hidden="true" />
          <span className="relative font-sans text-[1.05rem] font-extrabold text-teal-800">+132 modelos para consultar</span>
        </div>

        <div className="mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto px-1 pb-6 [&::-webkit-scrollbar]:hidden sm:mt-12" style={{ scrollbarWidth: "none" }}>
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
        <div className="mt-8 flex justify-center">
          <Button size="lg" variant="outline" full className={cn("max-w-[400px] sm:w-auto sm:px-12", CTA_BUTTON_CLASS)} onClick={scrollToOffer}>
            Quero este guia por {formatCents(priceCents)}
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────── Oferta principal / preço / compra ────────────────── */

/**
 * Fundo cinematográfico do checkout — mesmo navy profundo da Hero, com
 * glows teal/emerald em camadas (mais presença que o TEXTURE_TEAL_BLOOM
 * plano usado nas seções claras). Só CSS, sem imagem. O CARTÃO do
 * formulário em si continua claro por cima (ver className mais abaixo) —
 * é só o ENTORNO da seção que ganha profundidade, para não perder
 * legibilidade nos campos/preço/bumps.
 */
const OFFER_NAVY_BG: React.CSSProperties = {
  backgroundColor: "#0a1622",
  backgroundImage:
    "radial-gradient(60% 50% at 15% 0%, rgba(13,148,136,0.16), transparent 60%), radial-gradient(50% 45% at 100% 100%, rgba(16,185,129,0.12), transparent 60%)",
};

function OfferSection({ children, priceCents }: { children: React.ReactNode; priceCents: number }) {
  const priceDigits = formatCents(priceCents).replace("R$", "").trim();

  return (
    <section id={OFFER_SECTION_ID} className="relative scroll-mt-[76px] overflow-hidden px-5 py-16 sm:py-28" style={OFFER_NAVY_BG}>
      {/* Fio de luz no topo — separa da seção clara anterior sem borda dura, mesmo tratamento da Hero. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08]" aria-hidden="true" />
      {/* Vinheta lateral sutil, só para os cantos não ficarem "mortos". */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative mx-auto w-full max-w-[680px]">
        {/* Cartão único e centralizado: nome → descrição → preço → adicionais → formulário. */}
        <div className={cn("relative overflow-hidden rounded-[28px] border border-white/10 bg-white p-6 sm:p-10", "shadow-[0_8px_16px_rgba(0,0,0,0.2),0_40px_90px_-30px_rgba(0,0,0,0.6)]")}>
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-teal-50/80 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-emerald-50/70 blur-3xl" aria-hidden="true" />

          <span className={cn("relative inline-flex items-center gap-2 rounded-full bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Acesso imediato
          </span>
          <h2 className="relative mt-5 font-sans text-[1.9rem] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[2.15rem]">
            {guiaEvolucaoProduct.name}
          </h2>
          <p className="relative mt-3 text-[15.5px] leading-relaxed text-slate-600">
            Guia digital de anotação e evolução com exemplos e modelos para consultar e adaptar aos registros do plantão.
          </p>

          {/* Bloco do preço — mais presença: gradiente mais rico, borda dupla
              (anel + borda), glow por trás, número maior. Preço/produto em si
              (priceDigits, priceLabel) inalterados — só o invólucro visual. */}
          <div
            className={cn(
              "relative mt-7 flex flex-col items-center gap-1 overflow-hidden rounded-[24px] border-2 border-teal-200 bg-gradient-to-b from-teal-50 via-white to-white py-8 text-center ring-1 ring-teal-100",
              SHADOW_MEDIUM,
            )}
          >
            <div className="pointer-events-none absolute -top-10 left-1/2 h-24 w-48 -translate-x-1/2 rounded-full bg-teal-300/25 blur-3xl" aria-hidden="true" />
            <span className="relative text-[13px] font-semibold text-slate-500 line-through">De R$ 47,90 por apenas:</span>
            <span className="relative flex items-start font-sans text-[3.5rem] font-extrabold leading-none text-slate-900 sm:text-[3.75rem]">
              <span className="mr-1 mt-2.5 text-[1.4rem] text-teal-600">R$</span>
              {priceDigits}
            </span>
            <span className="relative mt-2 text-[12px] font-bold uppercase tracking-wide text-slate-500">
              Pagamento único · sem mensalidade
            </span>
            <span className="relative text-[13px] font-medium text-slate-500">
              Material digital em PDF · acesso após a confirmação do Pix
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
      <div className="flex flex-col gap-3 rounded-2xl border border-teal-100 bg-teal-50/80 p-3 sm:p-4">
        <div className="flex flex-col gap-1">
          <p className="text-[15.5px] font-extrabold text-slate-900">Complete seu kit de enfermagem</p>
          <p className="text-[13px] leading-relaxed text-slate-700">
            Adicione conteúdos que complementam seu Guia. Você recebe tudo junto após a confirmação do pagamento.
          </p>
        </div>
        {guiaEvolucaoBumps.map((bump) => {
          const checked = selectedBumps.has(bump.slug);
          // Só os adicionais realmente exibidos em ConnectedExtrasSection
          // (antes do checkout) ganham o selo "Você viu acima".
          const previewedAbove = CONNECTED_EXTRA_SLUGS.includes(bump.slug);
          return (
            <label
              key={bump.slug}
              htmlFor={`bump-${bump.slug}`}
              className={cn(
                "group relative flex cursor-pointer items-start justify-between gap-3 rounded-2xl border p-3.5 transition-colors duration-150",
                // Selecionado: fundo verde claro + borda verde forte (ring evita
                // deslocar o layout). Não selecionado: sempre neutro — o hover
                // (só em dispositivos com mouse) nunca usa verde, para não
                // parecer selecionado.
                checked
                  ? "border-teal-600 bg-emerald-50 ring-1 ring-teal-600"
                  : "border-slate-300 bg-white [@media(hover:hover)]:hover:border-slate-400",
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
                  className="mt-0.5 border-slate-400 bg-white hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 data-[state=checked]:border-teal-600 data-[state=checked]:bg-teal-600 data-[state=checked]:text-white"
                />
                <span className="flex flex-col gap-1">
                  <span className="w-fit rounded-full bg-white px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-teal-700 ring-1 ring-teal-200">
                    {previewedAbove ? "Você viu acima" : "Oferta adicional"}
                  </span>
                  <span className="text-[15px] font-extrabold leading-snug text-slate-900">{bump.name}</span>
                  <span className="text-[13px] leading-snug text-slate-700">{bump.description}</span>
                  {checked && (
                    <span className="text-[12.5px] font-extrabold text-teal-800">✓ Adicionado — você receberá junto com o Guia</span>
                  )}
                </span>
              </span>
              <span className="whitespace-nowrap text-[14px] font-extrabold text-teal-800">+ {bump.priceLabel}</span>
            </label>
          );
        })}
      </div>

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
          className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-teal-400 focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
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
          className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-teal-400 focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
        />
        <p className="text-[12.5px] leading-relaxed text-slate-500">
          Use um e-mail que você acessa: ele fica vinculado ao seu pedido. Depois da confirmação do Pix, o material é liberado nesta mesma página.
        </p>
        {errors.email && (
          <p role="alert" className="text-[13px] text-rose-600">
            {errors.email}
          </p>
        )}
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

/**
 * Link de suporte pelo WhatsApp da tela de download — número dedicado do
 * atendimento do Guia (diferente de contact.whatsappNumber em
 * src/config/site.ts, usado só pelo suporte de checkout via
 * buildPixSupportWhatsAppUrl — ver aviso em src/config/site.ts), por isso
 * montado diretamente aqui em vez de via src/lib/whatsapp.ts. Mensagem
 * pré-preenchida e segura via encodeURIComponent; abre em nova aba. É um
 * elemento SECUNDÁRIO — nunca compete com os botões de download.
 */
const GUIA_SUPPORT_WHATSAPP_URL = `https://wa.me/5521979199008?text=${encodeURIComponent(
  "Olá! Preciso de ajuda para acessar meu material do Guia de Evolução de Enfermagem.",
)}`;

/** Sombra em camadas dos painéis transacionais (contato curto + difusa longa
 *  + leve glow teal), no mesmo sistema da landing — nunca um shadow-xl chapado. */
const PANEL_SHADOW =
  "shadow-[0_2px_6px_rgba(15,23,42,0.05),0_28px_60px_-30px_rgba(13,148,136,0.4)]";

type AppearTag = "div" | "li";

/**
 * Entrada suave (fade + leve subida + escala 0.98→1) no mount, reutilizando o
 * framer-motion já presente no projeto. Desativada em prefers-reduced-motion
 * (e o index.css global também zera durações de animação nesse modo).
 */
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

/**
 * Enfeites de fundo do pós-compra — puramente decorativos (aria-hidden), nunca
 * cobrem texto/botão. Blobs suaves + poucos ícones que flutuam pouquíssimos
 * pixels, bem devagar. Reduzidos no mobile (ícones só em sm+) e totalmente
 * parados em prefers-reduced-motion.
 */
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
            <Label htmlFor="pix-copia-cola" className="text-slate-500">
              Pix copia e cola
            </Label>
            <textarea
              id="pix-copia-cola"
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

  // "preparing" (shell) e "processing": ainda sem QR Code disponível —
  // a verificação automática (polling de get-order-downloads) continua
  // rodando em segundo plano até o pagamento ser confirmado.
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
        {/* Ícone de sucesso com glow verde/teal e entrada em escala. */}
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
                    Consulta rápida no plantão
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

        {/* Suporte — secundário, nunca compete com os botões de download. */}
        <div className="mt-1 w-full border-t border-slate-100 pt-5">
          <p className="text-[13px] text-slate-500">Precisa de ajuda com o acesso?</p>
          <a
            href={GUIA_SUPPORT_WHATSAPP_URL}
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
