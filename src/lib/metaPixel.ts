/**
 * Meta Pixel — carregamento condicionado ao consentimento.
 *
 * Regras de privacidade aplicadas neste arquivo:
 *  • O script só é injetado depois de "Aceitar métricas".
 *  • Somente parâmetros comerciais são enviados (pacote, quantidade, valor).
 *  • Nunca são enviados: perguntas da consulta, nome de terceiros, tema íntimo
 *    detalhado, conteúdo da conversa, dados de saúde, texto da leitura,
 *    respostas abertas ou qualquer dado pessoal sensível.
 *  • Purchase permanece desativado: só pode ser registrado após confirmação
 *    real do pagamento, fora do clique do WhatsApp.
 */
import { analytics, isPlaceholder } from "@/config/site";
import { hasConsent } from "./consent";

type FbqParams = Record<string, string | number>;

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
    _fbq?: unknown;
  }
}

const PIXEL_ID = analytics.metaPixelId;
const isConfigured = !isPlaceholder(PIXEL_ID);

let initialized = false;
/** Evita eventos duplicados (ex.: ViewContent ao rolar de volta aos pacotes). */
const firedOnce = new Set<string>();

function injectScript(): void {
  if (document.getElementById("meta-pixel-script")) return;

  /* Stub oficial do Meta, escrito de forma explícita. */
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
  script.id = "meta-pixel-script";
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
}

/** Inicializa o pixel e dispara o PageView. Chamado apenas após consentimento. */
export function initMetaPixel(): void {
  if (initialized || typeof window === "undefined") return;
  if (!hasConsent()) return;
  if (!isConfigured) {
    if (import.meta.env.DEV) {
      console.info("[metaPixel] ID não configurado — nenhum evento será enviado.");
    }
    return;
  }

  injectScript();
  window.fbq?.("init", PIXEL_ID);
  window.fbq?.("track", "PageView");
  initialized = true;
}

function send(kind: "track" | "trackCustom", event: string, params?: FbqParams): void {
  if (!hasConsent() || !isConfigured) return;
  if (!initialized) initMetaPixel();
  window.fbq?.(kind, event, params);
  if (import.meta.env.DEV) console.debug("[metaPixel]", kind, event, params ?? {});
}

function sendOnce(key: string, kind: "track" | "trackCustom", event: string, params?: FbqParams): void {
  if (firedOnce.has(key)) return;
  firedOnce.add(key);
  send(kind, event, params);
}

/* ─────────────────────────────── Eventos ───────────────────────────────── */

/** Visualização da seção de pacotes. */
export function trackViewPackages(): void {
  sendOnce("view-packages", "track", "ViewContent", {
    content_name: "pacotes_consulta_tarot",
    content_category: "consulta_tarot",
  });
}

export interface PackageEventData {
  packageName: string;
  questions: number;
  value: number;
}

/** Seleção de um pacote (evento personalizado). */
export function trackSelectPackage({ packageName, questions, value }: PackageEventData): void {
  send("trackCustom", "SelectPackage", {
    package_name: packageName,
    question_quantity: questions,
    value,
    currency: "BRL",
  });
}

/** Início da qualificação, logo após a seleção do pacote. */
export function trackInitiateCheckout({ packageName, questions, value }: PackageEventData): void {
  send("track", "InitiateCheckout", {
    content_name: packageName,
    num_items: questions,
    value,
    currency: "BRL",
  });
}

export type LeadStage =
  | "pacote_confirmado"
  | "valor_confirmado"
  | "prazo_confirmado"
  | "tela_final_whatsapp";

/** Marcos de qualificação. Nunca inclui respostas abertas do visitante. */
export function trackLead(stage: LeadStage, data: PackageEventData): void {
  send("track", "Lead", {
    content_name: data.packageName,
    lead_stage: stage,
    num_items: data.questions,
    value: data.value,
    currency: "BRL",
  });
}

/** Clique final que abre o WhatsApp. */
export function trackContact(data: PackageEventData): void {
  send("track", "Contact", {
    content_name: data.packageName,
    value: data.value,
    currency: "BRL",
  });
}

/**
 * DESATIVADO — Purchase só pode ser disparado após a confirmação real do
 * pagamento (back-office ou API de Conversões), nunca no clique do WhatsApp.
 *
 * Para ativar no futuro: chame esta função a partir do fluxo que confirma o
 * pagamento e troque `PURCHASE_ENABLED` para true.
 */
const PURCHASE_ENABLED = false;

export function trackPurchase(data: PackageEventData): void {
  if (!PURCHASE_ENABLED) {
    if (import.meta.env.DEV) {
      console.warn("[metaPixel] Purchase está desativado até a confirmação real do pagamento.");
    }
    return;
  }
  send("track", "Purchase", {
    content_name: data.packageName,
    value: data.value,
    currency: "BRL",
  });
}
