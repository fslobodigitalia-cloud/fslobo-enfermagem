/**
 * Meta Pixel dedicado à página do Guia de Evolução de Enfermagem —
 * ISOLADO do pixel do funil de tarô (src/lib/metaPixel.ts, que tem um
 * portão de consentimento e um ID próprio ainda em branco em
 * src/config/site.ts). Nada aqui altera metaPixel.ts nem site.ts.
 *
 * Reproduz o comportamento exato da landing page de referência
 * (reference/manual2026.html, /manual2026/, já validada em conversão):
 * pixel carregado e disparando PageView + ViewContent imediatamente ao
 * entrar na página, sem gate de consentimento — a página antiga não
 * tinha esse gate, e a instrução explícita foi preservar o comportamento
 * validado dela. Isso é uma DIFERENÇA deliberada frente à disciplina de
 * privacidade do funil de tarô — sinalizada no relatório desta etapa
 * para decisão futura, não uma omissão silenciosa.
 *
 * ID fixo: 1646677629634348 — o mesmo usado pela página antiga. Nunca
 * confundir com analytics.metaPixelId (funil de tarô, placeholder
 * intocado).
 */

const PIXEL_ID = "1646677629634348";

type FbqParams = Record<string, string | number>;

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
      push?: unknown;
    };
    _fbq?: unknown;
  }
}

let initialized = false;
/** Evita reenviar o mesmo evento único (ex.: init) em re-renders/StrictMode. */
const firedOnce = new Set<string>();

function injectScript(): void {
  if (document.getElementById("guia-meta-pixel-script")) return;

  /* Stub oficial do Meta, escrito de forma explícita — mesmo padrão de metaPixel.ts. */
  const fbq: any = function (...args: unknown[]) {
    fbq.callMethod ? fbq.callMethod.apply(fbq, args) : fbq.queue.push(args);
  };
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.push = fbq;
  window.fbq = window.fbq || fbq;
  window._fbq = window._fbq || window.fbq;

  const script = document.createElement("script");
  script.id = "guia-meta-pixel-script";
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
}

function send(kind: "track" | "trackCustom", event: string, params?: FbqParams): void {
  window.fbq?.(kind, event, params);
  if (import.meta.env.DEV) console.debug("[guiaPixel]", kind, event, params ?? {});
}

function sendOnce(key: string, kind: "track" | "trackCustom", event: string, params?: FbqParams): void {
  if (firedOnce.has(key)) return;
  firedOnce.add(key);
  send(kind, event, params);
}

/** Converte centavos em reais com duas casas, sem artefatos de ponto flutuante. */
function centsToReais(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

/**
 * Injeta o script, inicializa o pixel e dispara PageView + ViewContent —
 * chamado uma vez ao montar a página (guardado por `initialized`, então
 * um segundo useEffect/StrictMode double-invoke não duplica nada).
 */
export function initGuiaPixel(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  injectScript();
  window.fbq?.("init", PIXEL_ID);
  window.fbq?.("track", "PageView");
  window.fbq?.("track", "ViewContent");
}

/** Perfil selecionado ao final do quiz — marco de intenção qualificada (igual à página antiga: valor fixo do produto principal). */
export function trackGuiaLead(priceCents: number): void {
  sendOnce("lead", "track", "Lead", { value: centsToReais(priceCents), currency: "BRL" });
}

/** Clique no CTA "quero os modelos" do resultado do quiz — leva à oferta. */
export function trackGuiaQuizInterest(): void {
  sendOnce("quiz-interest", "trackCustom", "QuizInterest");
}

/**
 * Início efetivo do checkout — disparar quando o formulário é submetido
 * com sucesso (validação + Turnstile ok), logo antes de chamar
 * create-product-order. totalCents aqui é o total calculado no
 * FRONTEND (produto + bumps marcados) só para sinalização de intenção —
 * nunca é usado para cobrança real (isso é sempre decidido pelo
 * backend). Cada envio real do formulário dispara um evento novo — não é
 * deduplicado, pois cada tentativa de checkout é um sinal legítimo.
 */
export function trackGuiaInitiateCheckout(totalCents: number): void {
  send("track", "InitiateCheckout", { value: centsToReais(totalCents), currency: "BRL" });
}

/**
 * Pagamento CONFIRMADO — só deve ser chamada quando get-order-downloads
 * já devolveu status "paid" (nunca em pending_payment, nunca no clique
 * do botão, nunca ao gerar o QR Code). amountCents deve ser sempre
 * order.amountCents devolvido por create-product-order na criação do
 * pedido (nunca recalculado no frontend). O chamador é responsável por
 * garantir uma única invocação por pedido (ver purchaseFiredRef em
 * GuiaEvolucaoEnfermagemPage.tsx).
 */
export function trackGuiaPurchase(amountCents: number): void {
  send("track", "Purchase", { value: centsToReais(amountCents), currency: "BRL" });
}
