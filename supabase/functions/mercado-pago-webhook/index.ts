// ════════════════════════════════════════════════════════════════════════════
//  ENTRE NÓS TARÔ — FASE 3: EDGE FUNCTION "mercado-pago-webhook"
//
//  Recebe notificações assíncronas do Mercado Pago (topic/type = "order") e,
//  quando confirmam processed/accredited, persiste isso via a MESMA RPC
//  public.mark_order_paid() já usada por create-pix-order — nunca uma segunda
//  lógica de "o que significa pago".
//
//  Esta função NUNCA confia no corpo da notificação para decidir estado —
//  o corpo só carrega data.id (qual Order olhar). O estado real vem sempre de
//  um GET /v1/orders/{data.id} feito por nós, validado com a MESMA disciplina
//  de identidade+estado já usada em create-pix-order (validateMercadoPago
//  OrderIdentity/validateMercadoPagoOrderShell/classifyPaymentState/
//  evaluateMercadoPagoOrderBody) — funções COPIADAS aqui de propósito nesta
//  primeira versão (ver decisão registrada na auditoria: nenhum refactor
//  compartilhado agora, para não arriscar create-pix-order, já em produção).
//
//  Descoberta do pedido local: NUNCA exige mercado_pago_order_id já vinculado
//  antes do GET. O fluxo é sempre GET primeiro (por data.id da query, que é o
//  único identificador que a notificação garante) → extrai external_reference
//  do corpo devolvido → localiza public.orders por public_id = external_
//  reference. Isso cobre o caso em que o webhook é o PRIMEIRO observador de
//  uma Order que a cliente nunca chegou a confirmar via retry síncrono.
//
//  Autenticação: verify_jwt=false (ver supabase/config.toml) — quem chama é o
//  servidor do Mercado Pago, que nunca envia um JWT do Supabase. A autenticação
//  real é a validação de x-signature via WebhookSignatureValidator.validate(),
//  do SDK oficial npm:mercadopago@3.2.1 (troca da implementação HMAC manual
//  anterior — ver "Validação de x-signature" abaixo para o motivo da troca e
//  a ressalva sobre verificação independente antes de qualquer deploy).
//  Diferente de create-pix-order: esta função nunca é chamada por um
//  navegador — não há CORS, não há OPTIONS a tratar.
//
//  Processamento é SÍNCRONO do início ao fim (sem EdgeRuntime.waitUntil):
//  só respondemos 200 depois que a persistência necessária (ou a decisão de
//  que nada precisa ser persistido) já aconteceu. Timeout curto no GET ao
//  Mercado Pago mantém o total confortavelmente abaixo dos 22s que o Mercado
//  Pago espera antes de considerar a entrega falha e reagendar.
//
//  Política de resposta HTTP (o único critério é "um reenvio idêntico tem
//  chance de mudar o resultado?", já que o Mercado Pago não diferencia
//  códigos de erro — só 2xx interrompe o reenvio):
//    - 5xx: falha temporária (rede/timeout ao Mercado Pago, erro de banco) —
//      NUNCA marca payment_events.processed_at nesse caminho, para o próximo
//      reenvio encontrar o evento ainda "em aberto" e tentar de novo.
//    - 401: assinatura ausente/malformada/inválida.
//    - 200: sucesso, OU qualquer condição definitiva que um reenvio nunca
//      resolveria (pedido não é nosso, ambiente divergente, conflito de
//      identidade, estado terminal/não reconhecido) — sempre com
//      payment_events atualizado e processed_at preenchido.
//
//  Não implantada em nenhum projeto Supabase por este arquivo — apenas o
//  código local da função, pronto para revisão manual. Não altera
//  create-pix-order nem draw-cards.
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2.112.0";
import { WebhookSignatureValidator, InvalidWebhookSignatureError } from "npm:mercadopago@3.2.1";

// ─────────────────────────────── Configuração ───────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MERCADO_PAGO_ACCESS_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
const MERCADO_PAGO_ENVIRONMENT = Deno.env.get("MERCADO_PAGO_ENVIRONMENT");
// Secret exclusivo desta função — obtido em "Your integrations" → app →
// Webhooks → "Configure notification", painel do Mercado Pago. NUNCA
// confundir com MERCADO_PAGO_ACCESS_TOKEN (autentica chamadas NOSSAS à API
// do MP) — este aqui autentica chamadas DELES para nós.
const MERCADO_PAGO_WEBHOOK_SECRET = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET");

const MERCADO_PAGO_ORDERS_URL = "https://api.mercadopago.com/v1/orders";
const MERCADO_PAGO_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 32 * 1024; // 32 KB — notificações de webhook são pequenas

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Estados terminais documentados — idêntico a create-pix-order (COPIADO, não
// compartilhado, por decisão desta fase).
const TERMINAL_STATUS_VALUES = new Set(["canceled", "expired", "failed", "refunded", "charged_back"]);

// ────────────────────────────── Respostas JSON ──────────────────────────────
// Sem CORS/origin: esta função nunca é chamada por um navegador.
function jsonResponse(status: number, body: unknown, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(status: number, code: string, message: string, extraHeaders?: Record<string, string>): Response {
  return jsonResponse(status, { ok: false, error: { code, message } }, extraHeaders);
}

function okResponse(outcome: string, extra?: Record<string, unknown>): Response {
  return jsonResponse(200, { ok: true, outcome, ...extra });
}

// ─────────────────────────── Fetch com timeout ───────────────────────────────
// Copiado de create-pix-order/index.ts — idêntico.
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 408, 423, 429 e qualquer 5xx são sempre tratados como temporários. */
function isTemporaryStatus(status: number): boolean {
  return status === 408 || status === 423 || status === 429 || (status >= 500 && status <= 599);
}

function isUuidString(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// ───────────────────────── Integração Mercado Pago ───────────────────────────
// Copiado de create-pix-order/index.ts — idêntico.
function centsToAmountString(cents: number): string {
  const abs = Math.abs(Math.trunc(cents));
  const reais = Math.floor(abs / 100);
  const centavos = abs % 100;
  const sign = cents < 0 ? "-" : "";
  return `${sign}${reais}.${String(centavos).padStart(2, "0")}`;
}

type MercadoPagoEnvironment = "test" | "production";

function mpAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Authorization": `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
    ...extra,
  };
}

type MpFetchResult =
  | { kind: "ok"; body: unknown }
  | { kind: "http_error"; status: number; retryAfter: string | null; body: unknown }
  | { kind: "network_error" };

async function mpFetchJson(url: string, init: RequestInit): Promise<MpFetchResult> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, init, MERCADO_PAGO_TIMEOUT_MS);
  } catch {
    return { kind: "network_error" };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    return { kind: "http_error", status: response.status, retryAfter: response.headers.get("retry-after"), body };
  }
  return { kind: "ok", body };
}

// ─────────────── Identidade da Order (independente do estado) ───────────────
// Copiado de create-pix-order/index.ts — idêntico, incluindo comentários.
interface IdentityExpected {
  externalReference: string;
  amountString: string;
  expectedMercadoPagoOrderId?: string;
  expectedMercadoPagoPaymentId?: string | null;
}

interface OrderIdentity {
  mercadoPagoOrderId: string;
  mercadoPagoPaymentId: string;
  status: string;
  statusDetail: string;
  paymentStatus: string;
  paymentStatusDetail: string;
  paymentMethodRecord: Record<string, unknown> | undefined;
  totalPaidAmount: unknown;
  paymentPaidAmount: unknown;
}

function validateMercadoPagoOrderIdentity(mpBody: unknown, expected: IdentityExpected): OrderIdentity | null {
  if (mpBody === null || typeof mpBody !== "object") return null;
  const record = mpBody as Record<string, unknown>;

  const id = record.id;
  if ((typeof id !== "string" && typeof id !== "number") || String(id).length === 0) return null;
  if (expected.expectedMercadoPagoOrderId !== undefined && String(id) !== expected.expectedMercadoPagoOrderId) {
    return null;
  }

  if (record.external_reference !== expected.externalReference) return null;
  if (record.type !== "online") return null;
  if (record.processing_mode !== "automatic") return null;
  if (record.total_amount !== expected.amountString) return null;
  if (record.currency !== undefined && record.currency !== "BRL") return null;

  const status = record.status;
  const statusDetail = record.status_detail;
  if (typeof status !== "string" || typeof statusDetail !== "string") return null;

  const transactions = record.transactions as Record<string, unknown> | undefined;
  const payments = transactions?.payments;
  if (!Array.isArray(payments) || payments.length !== 1) return null;

  const payment = payments[0] as Record<string, unknown> | null;
  if (payment === null || typeof payment !== "object") return null;

  const paymentId = payment.id;
  if ((typeof paymentId !== "string" && typeof paymentId !== "number") || String(paymentId).length === 0) {
    return null;
  }
  if (
    expected.expectedMercadoPagoPaymentId !== undefined &&
    expected.expectedMercadoPagoPaymentId !== null &&
    String(paymentId) !== expected.expectedMercadoPagoPaymentId
  ) {
    return null;
  }
  if (payment.amount !== expected.amountString) return null;
  if (payment.currency !== undefined && payment.currency !== "BRL") return null;

  const paymentStatus = payment.status;
  const paymentStatusDetail = payment.status_detail;
  if (typeof paymentStatus !== "string" || typeof paymentStatusDetail !== "string") return null;

  const paymentMethod = payment.payment_method as Record<string, unknown> | undefined;
  if (paymentMethod?.id !== "pix") return null;
  if (paymentMethod?.type !== "bank_transfer") return null;

  return {
    mercadoPagoOrderId: String(id),
    mercadoPagoPaymentId: String(paymentId),
    status,
    statusDetail,
    paymentStatus,
    paymentStatusDetail,
    paymentMethodRecord: paymentMethod,
    totalPaidAmount: record.total_paid_amount,
    paymentPaidAmount: payment.paid_amount,
  };
}

interface OrderShellIdentity {
  mercadoPagoOrderId: string;
  status: string;
  statusDetail: string;
}

function validateMercadoPagoOrderShell(mpBody: unknown, expected: IdentityExpected): OrderShellIdentity | null {
  if (mpBody === null || typeof mpBody !== "object") return null;
  const record = mpBody as Record<string, unknown>;

  const id = record.id;
  if ((typeof id !== "string" && typeof id !== "number") || String(id).length === 0) return null;
  if (expected.expectedMercadoPagoOrderId !== undefined && String(id) !== expected.expectedMercadoPagoOrderId) {
    return null;
  }

  if (record.external_reference !== expected.externalReference) return null;
  if (record.type !== "online") return null;
  if (record.processing_mode !== "automatic") return null;
  if (record.total_amount !== expected.amountString) return null;
  if (record.currency !== undefined && record.currency !== "BRL") return null;

  const status = record.status;
  const statusDetail = record.status_detail;
  if (typeof status !== "string" || typeof statusDetail !== "string") return null;

  const isValidShellState =
    (status === "created" && statusDetail === "created") ||
    (status === "processing" && statusDetail === "in_process");
  if (!isValidShellState) return null;

  const transactions = record.transactions;
  if (transactions !== undefined && transactions !== null) {
    if (typeof transactions !== "object" || Array.isArray(transactions)) return null;
    const payments = (transactions as Record<string, unknown>).payments;
    if (payments !== undefined) {
      if (!Array.isArray(payments)) return null;
      for (const p of payments) {
        if (p !== null && typeof p === "object") {
          const pRecord = p as Record<string, unknown>;
          const looksComplete =
            (typeof pRecord.id === "string" || typeof pRecord.id === "number") &&
            typeof pRecord.status === "string" &&
            typeof pRecord.status_detail === "string" &&
            pRecord.amount !== undefined;
          if (looksComplete) return null;
        }
      }
    }
  }

  return { mercadoPagoOrderId: String(id), status, statusDetail };
}

const MONETARY_AMOUNT_REGEX = /^\d+\.\d{2}$/;
function isValidNonNegativeMonetaryString(value: unknown): value is string {
  return typeof value === "string" && MONETARY_AMOUNT_REGEX.test(value) && Number(value) >= 0;
}

type PaymentStateClassification =
  | { kind: "pending_pix"; qrCode: string; qrCodeBase64: string | null; ticketUrl: string | null }
  | { kind: "processing"; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string }
  | { kind: "processed" }
  | { kind: "terminal"; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string }
  | { kind: "unknown_state" };

function classifyPaymentState(identity: OrderIdentity, amountString: string): PaymentStateClassification {
  const isPendingPix =
    identity.status === "action_required" &&
    identity.statusDetail === "waiting_transfer" &&
    identity.paymentStatus === "action_required" &&
    identity.paymentStatusDetail === "waiting_transfer";

  if (isPendingPix) {
    const qrCode = identity.paymentMethodRecord?.qr_code;
    if (typeof qrCode !== "string" || qrCode.length === 0) return { kind: "unknown_state" };

    const qrCodeBase64Raw = identity.paymentMethodRecord?.qr_code_base64;
    const qrCodeBase64 = typeof qrCodeBase64Raw === "string" && qrCodeBase64Raw.length > 0 ? qrCodeBase64Raw : null;

    const ticketUrlRaw = identity.paymentMethodRecord?.ticket_url;
    const ticketUrl = typeof ticketUrlRaw === "string" && ticketUrlRaw.length > 0 ? ticketUrlRaw : null;

    if (qrCodeBase64 === null && ticketUrl === null) return { kind: "unknown_state" };
    return { kind: "pending_pix", qrCode, qrCodeBase64, ticketUrl };
  }

  const isCreatedCreated =
    identity.status === "created" &&
    identity.statusDetail === "created" &&
    identity.paymentStatus === "created" &&
    identity.paymentStatusDetail === "created";

  const isProcessingInProcess =
    identity.status === "processing" &&
    identity.statusDetail === "in_process" &&
    identity.paymentStatus === "processing" &&
    identity.paymentStatusDetail === "in_process";

  const isProcessingManualReview =
    identity.status === "processing" &&
    identity.statusDetail === "in_process" &&
    identity.paymentStatus === "processing" &&
    identity.paymentStatusDetail === "pending_review_manual";

  const isProcessingInReview =
    identity.status === "processing" &&
    identity.statusDetail === "in_process" &&
    identity.paymentStatus === "processing" &&
    identity.paymentStatusDetail === "in_review";

  const isInReviewInReview =
    identity.status === "processing" &&
    identity.statusDetail === "in_process" &&
    identity.paymentStatus === "in_review" &&
    identity.paymentStatusDetail === "in_review";

  if (isCreatedCreated || isProcessingInProcess || isProcessingManualReview || isProcessingInReview || isInReviewInReview) {
    return {
      kind: "processing",
      orderStatus: identity.status,
      orderStatusDetail: identity.statusDetail,
      paymentStatus: identity.paymentStatus,
      paymentStatusDetail: identity.paymentStatusDetail,
    };
  }

  const isProcessedApproved =
    identity.status === "processed" &&
    identity.statusDetail === "accredited" &&
    identity.paymentStatus === "processed" &&
    identity.paymentStatusDetail === "accredited";

  if (isProcessedApproved) {
    if (identity.totalPaidAmount !== amountString) return { kind: "unknown_state" };
    if (identity.paymentPaidAmount !== undefined && identity.paymentPaidAmount !== null) {
      if (!isValidNonNegativeMonetaryString(identity.paymentPaidAmount)) return { kind: "unknown_state" };
    }
    return { kind: "processed" };
  }

  if (TERMINAL_STATUS_VALUES.has(identity.status) || TERMINAL_STATUS_VALUES.has(identity.paymentStatus)) {
    return {
      kind: "terminal",
      orderStatus: identity.status,
      orderStatusDetail: identity.statusDetail,
      paymentStatus: identity.paymentStatus,
      paymentStatusDetail: identity.paymentStatusDetail,
    };
  }

  return { kind: "unknown_state" };
}

type EvaluatedOrder =
  | { kind: "pending"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; qrCode: string; qrCodeBase64: string | null; ticketUrl: string | null }
  | { kind: "processing"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string }
  | { kind: "shell"; mercadoPagoOrderId: string; orderStatus: string; orderStatusDetail: string }
  | { kind: "incomplete_provider_response"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string }
  | { kind: "processed"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string }
  | { kind: "terminal"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string }
  | { kind: "state_conflict_with_identity"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string }
  | { kind: "identity_invalid" };

function evaluateMercadoPagoOrderBody(mpBody: unknown, expected: IdentityExpected): EvaluatedOrder {
  const identity = validateMercadoPagoOrderIdentity(mpBody, expected);
  if (identity !== null) {
    const state = classifyPaymentState(identity, expected.amountString);
    if (state.kind === "pending_pix") {
      return {
        kind: "pending",
        mercadoPagoOrderId: identity.mercadoPagoOrderId,
        mercadoPagoPaymentId: identity.mercadoPagoPaymentId,
        qrCode: state.qrCode,
        qrCodeBase64: state.qrCodeBase64,
        ticketUrl: state.ticketUrl,
      };
    }
    if (state.kind === "processing") {
      return {
        kind: "processing",
        mercadoPagoOrderId: identity.mercadoPagoOrderId,
        mercadoPagoPaymentId: identity.mercadoPagoPaymentId,
        orderStatus: state.orderStatus,
        orderStatusDetail: state.orderStatusDetail,
        paymentStatus: state.paymentStatus,
        paymentStatusDetail: state.paymentStatusDetail,
      };
    }
    if (state.kind === "processed") {
      return {
        kind: "processed",
        mercadoPagoOrderId: identity.mercadoPagoOrderId,
        mercadoPagoPaymentId: identity.mercadoPagoPaymentId,
      };
    }
    if (state.kind === "terminal") {
      return {
        kind: "terminal",
        mercadoPagoOrderId: identity.mercadoPagoOrderId,
        mercadoPagoPaymentId: identity.mercadoPagoPaymentId,
        orderStatus: state.orderStatus,
        orderStatusDetail: state.orderStatusDetail,
        paymentStatus: state.paymentStatus,
        paymentStatusDetail: state.paymentStatusDetail,
      };
    }
    return {
      kind: "state_conflict_with_identity",
      mercadoPagoOrderId: identity.mercadoPagoOrderId,
      mercadoPagoPaymentId: identity.mercadoPagoPaymentId,
    };
  }

  const shell = validateMercadoPagoOrderShell(mpBody, expected);
  if (shell !== null) {
    if (expected.expectedMercadoPagoPaymentId !== undefined && expected.expectedMercadoPagoPaymentId !== null) {
      return {
        kind: "incomplete_provider_response",
        mercadoPagoOrderId: shell.mercadoPagoOrderId,
        mercadoPagoPaymentId: expected.expectedMercadoPagoPaymentId,
      };
    }
    return { kind: "shell", mercadoPagoOrderId: shell.mercadoPagoOrderId, orderStatus: shell.status, orderStatusDetail: shell.statusDetail };
  }

  return { kind: "identity_invalid" };
}

// ────────────────────── Vinculação (via RPC, nunca UPDATE direto) ───────────
// Copiado de create-pix-order/index.ts — idêntico.
interface LinkRow {
  order_id: string;
  mercado_pago_order_id: string;
  mercado_pago_payment_id: string | null;
  was_already_linked: boolean;
}

function isValidLinkResultShape(data: unknown): data is [LinkRow] {
  if (!Array.isArray(data) || data.length !== 1) return false;
  const row = data[0];
  if (row === null || typeof row !== "object") return false;
  const record = row as Record<string, unknown>;
  return (
    isUuidString(record.order_id) &&
    isNonEmptyString(record.mercado_pago_order_id) &&
    (record.mercado_pago_payment_id === null || isNonEmptyString(record.mercado_pago_payment_id)) &&
    typeof record.was_already_linked === "boolean"
  );
}

type LinkResult =
  | { kind: "linked" }
  | { kind: "conflict" }
  | { kind: "temporary_error" };

async function linkMercadoPagoOrder(
  orderId: string,
  mercadoPagoOrderId: string,
  mercadoPagoPaymentId: string | null,
): Promise<LinkResult> {
  try {
    const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: linkData, error: linkError } = await supabase.rpc("link_mercado_pago_order", {
      p_order_id: orderId,
      p_mercado_pago_order_id: mercadoPagoOrderId,
      p_mercado_pago_payment_id: mercadoPagoPaymentId,
    });

    if (linkError) {
      const isConflictMessage = typeof linkError.message === "string" && linkError.message.includes("já está vinculado");
      const isUniqueViolation = linkError.code === "23505";
      const isConflict = isConflictMessage || isUniqueViolation;
      console.error("[mercado-pago-webhook] Falha ao vincular o ID da Order do Mercado Pago ao pedido.", {
        category: isConflict ? "order_link_conflict" : "order_link_rpc_error",
        postgres_code: linkError.code ?? null,
      });
      return { kind: isConflict ? "conflict" : "temporary_error" };
    }

    if (!isValidLinkResultShape(linkData)) {
      console.error("[mercado-pago-webhook] Resposta da RPC de vinculação em formato inesperado.", {
        category: "invalid_link_rpc_response",
      });
      return { kind: "temporary_error" };
    }

    const link = linkData[0];
    if (
      link.order_id !== orderId ||
      link.mercado_pago_order_id !== mercadoPagoOrderId ||
      (mercadoPagoPaymentId !== null && link.mercado_pago_payment_id !== mercadoPagoPaymentId)
    ) {
      console.error("[mercado-pago-webhook] Resposta da RPC de vinculação não confere com os IDs solicitados.", {
        category: "link_rpc_value_mismatch",
      });
      return { kind: "conflict" };
    }

    return { kind: "linked" };
  } catch (caught) {
    console.error("[mercado-pago-webhook] Exceção inesperada ao vincular o ID da Order ao pedido.", {
      category: "order_link_thrown_exception",
      error_type: caught instanceof Error ? caught.name : "unknown",
    });
    return { kind: "temporary_error" };
  }
}

// ─────────── Persistência do pagamento confirmado (via RPC, nunca UPDATE direto) ──
// Copiado de create-pix-order/index.ts — idêntico.
type MarkOrderPaidResult =
  | { kind: "paid"; status: string }
  | { kind: "conflict" }
  | { kind: "temporary_error" };

interface MarkOrderPaidRow {
  order_id: string;
  status: string;
  was_already_paid: boolean;
}

const MARK_ORDER_PAID_SUCCESS_STATUSES = new Set([
  "paid",
  "drawing_cards",
  "generating",
  "awaiting_review",
  "in_review",
  "approved",
  "released",
]);

function isValidMarkOrderPaidResultShape(data: unknown): data is [MarkOrderPaidRow] {
  if (!Array.isArray(data) || data.length !== 1) return false;
  const row = data[0];
  if (row === null || typeof row !== "object") return false;
  const record = row as Record<string, unknown>;
  return (
    isUuidString(record.order_id) &&
    typeof record.status === "string" &&
    MARK_ORDER_PAID_SUCCESS_STATUSES.has(record.status) &&
    typeof record.was_already_paid === "boolean"
  );
}

async function markOrderPaid(
  orderId: string,
  mercadoPagoOrderId: string,
  mercadoPagoPaymentId: string,
  paidAmountCents: number,
): Promise<MarkOrderPaidResult> {
  try {
    const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: markData, error: markError } = await supabase.rpc("mark_order_paid", {
      p_order_id: orderId,
      p_mercado_pago_order_id: mercadoPagoOrderId,
      p_mercado_pago_payment_id: mercadoPagoPaymentId,
      p_paid_amount_cents: paidAmountCents,
    });

    if (markError) {
      const isConflictMessage =
        typeof markError.message === "string" &&
        (markError.message.includes("não confere") ||
          markError.message.includes("estado terminal") ||
          markError.message.includes("não reconhecido") ||
          markError.message.includes("não encontrado"));
      console.error("[mercado-pago-webhook] Falha ao persistir a confirmação de pagamento.", {
        category: isConflictMessage ? "mark_order_paid_conflict" : "mark_order_paid_rpc_error",
        postgres_code: markError.code ?? null,
      });
      return { kind: isConflictMessage ? "conflict" : "temporary_error" };
    }

    if (!isValidMarkOrderPaidResultShape(markData)) {
      console.error("[mercado-pago-webhook] Resposta da RPC de confirmação de pagamento em formato inesperado.", {
        category: "invalid_mark_order_paid_response",
      });
      return { kind: "temporary_error" };
    }

    const mark = markData[0];
    if (mark.order_id !== orderId) {
      console.error("[mercado-pago-webhook] Resposta da RPC de confirmação de pagamento não confere com o pedido solicitado.", {
        category: "mark_order_paid_value_mismatch",
      });
      return { kind: "conflict" };
    }

    return { kind: "paid", status: mark.status };
  } catch (caught) {
    console.error("[mercado-pago-webhook] Exceção inesperada ao persistir a confirmação de pagamento.", {
      category: "mark_order_paid_thrown_exception",
      error_type: caught instanceof Error ? caught.name : "unknown",
    });
    return { kind: "temporary_error" };
  }
}

// ══════════════════════════ Validação de x-signature ═══════════════════════
// Usa o SDK oficial (WebhookSignatureValidator.validate(), de
// npm:mercadopago@3.2.1) em vez da implementação HMAC manual anterior — troca
// pedida explicitamente depois que a implementação manual (testada com as
// duas variantes de case plausíveis para data.id) rejeitava notificações
// reais de Order em modo TEST mesmo com o secret confirmado correto.
//
// RESSALVA DE PROVENIÇÃO (não escondida): uma inspeção anterior, nesta mesma
// sessão, do pacote mercadopago via git clone produziu conteúdo que não foi
// possível confirmar como genuíno (git clone suspeitosamente silencioso,
// comentário internamente inconsistente sobre unidade de ts, datas de
// changelog alinhadas de forma suspeita com a data simulada do sandbox) — ver
// nota de auditoria registrada nesta conversa. A troca abaixo segue a
// instrução explícita e informada de usar o SDK oficial (o pacote npm
// "mercadopago" existe de fato; o que não pôde ser confirmado nesta sessão
// foi o conteúdo específico lido via clone). Antes de qualquer deploy,
// confirmar de forma independente (fora deste sandbox) que
// WebhookSignatureValidator/InvalidWebhookSignatureError são exports reais de
// mercadopago@3.2.1 com esta assinatura — um import quebrado impediria a
// função inteira de subir, o que é pior do que o 401 atual.
//
// parseXSignatureHeader e buildSignatureManifest (abaixo) ficaram sem
// nenhuma chamada depois desta troca — o parsing do header e o cálculo do
// manifesto agora são inteiramente responsabilidade do SDK. Não foram
// removidas nesta etapa (só computeHmacHex/constantTimeEqualsHex foram, por
// instrução explícita); ambas continuam disponíveis para uma limpeza futura
// se confirmado que não têm mais uso.

/**
 * SEM CHAMADORES no momento (ver nota acima, na troca para
 * WebhookSignatureValidator do SDK oficial — o parsing do header agora é
 * responsabilidade dele). Mantida apenas para não exceder o escopo desta
 * troca; não usada na decisão de aceitar/rejeitar uma notificação.
 *
 * Extrai ts e v1 do header x-signature (formato "ts=...,v1=..."). Ausência de
 * QUALQUER um dos dois é reportada explicitamente (null) — nunca omitida
 * silenciosamente. Chaves desconhecidas (ex.: v2 de uma futura versão do
 * esquema) são ignoradas, mas não fazem esta função inventar um v1.
 */
function parseXSignatureHeader(header: string): { ts: string | null; v1: string | null } {
  let ts: string | null = null;
  let v1: string | null = null;
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "ts" && value.length > 0) ts = value;
    else if (key === "v1" && value.length > 0) v1 = value;
  }
  return { ts, v1 };
}

/**
 * SEM CHAMADORES no momento (mesmo motivo de parseXSignatureHeader acima —
 * o cálculo do manifesto agora é responsabilidade do WebhookSignatureValidator
 * do SDK oficial). Mantida apenas para não exceder o escopo desta troca; não
 * usada na decisão de aceitar/rejeitar uma notificação. A antiga observação
 * "STATUS EM INVESTIGAÇÃO" sobre qual case o Mercado Pago espera para
 * data.id no manifesto fica sem efeito prático agora — quem decide isso é o
 * SDK, não mais este código.
 *
 * Manifesto EXATO exigido pela documentação oficial:
 *   id:{data.id};request-id:{x-request-id};ts:{ts};
 * dataId entra aqui como o chamador decidir passar — esta função não aplica
 * nenhuma transformação própria de case.
 */
function buildSignatureManifest(dataId: string, requestId: string, ts: string): string {
  return `id:${dataId};request-id:${requestId};ts:${ts};`;
}

// ═════════════════════════ payment_events (claim + update) ═════════════════

/**
 * Hash SHA-256 hex de uma string arbitrária — usado SOMENTE para gerar uma
 * chave de fallback determinística para provider_event_id quando o corpo da
 * notificação não traz um campo `id` de nível superior (payloads reais de
 * Order do Mercado Pago, vistos no simulador, não o trazem). NÃO é HMAC —
 * não há segredo envolvido nem precisa haver: o objetivo aqui é só
 * determinismo (o mesmo material sempre produz a mesma chave, então
 * reenvios do MESMO evento caem na mesma linha de payment_events), nunca
 * autenticidade — a autenticidade do corpo já foi garantida pela validação
 * de x-signature antes de chegarmos aqui.
 */
async function computeSha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface PaymentEventClaimRow {
  id: string;
  attempts: number;
  processed_at: string | null;
}

type ClaimResult =
  | { kind: "new"; eventId: string }
  | { kind: "retry"; eventId: string }
  | { kind: "already_processed" }
  | { kind: "error" };

/**
 * Reivindica (ou recupera) a linha de payment_events para este
 * provider_event_id, via INSERT ... ON CONFLICT DO NOTHING (ignoreDuplicates
 * do PostgREST) seguido de SELECT quando o insert não inseriu nada — mesmo
 * padrão de "claim atômico + leitura do estado final" já usado em
 * record_checkout_attempt(), adaptado para uma tabela simples (não precisa de
 * FOR UPDATE aqui: o verdadeiro gate de correção é mark_order_paid, que já
 * trava a linha do pedido — uma corrida rara neste claim, na pior hipótese,
 * gera trabalho duplicado (um GET a mais ao Mercado Pago), nunca um estado
 * incorreto em orders).
 */
async function claimPaymentEvent(providerEventId: string, eventType: string): Promise<ClaimResult> {
  try {
    const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: inserted, error: insertError } = await supabase
      .from("payment_events")
      .upsert(
        { provider: "mercado_pago", provider_event_id: providerEventId, event_type: eventType },
        { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();

    if (insertError) {
      console.error("[mercado-pago-webhook] Falha ao reivindicar payment_events.", {
        category: "payment_event_claim_error",
        postgres_code: insertError.code ?? null,
      });
      return { kind: "error" };
    }

    if (inserted && isUuidString((inserted as Record<string, unknown>).id)) {
      return { kind: "new", eventId: (inserted as { id: string }).id };
    }

    // ignoreDuplicates: já existia — busca a linha existente para decidir
    // entre "já processado" (fast-path) e "retry" (tentativa anterior não
    // concluiu).
    const { data: existing, error: selectError } = await supabase
      .from("payment_events")
      .select("id, attempts, processed_at")
      .eq("provider", "mercado_pago")
      .eq("provider_event_id", providerEventId)
      .maybeSingle();

    if (selectError || !existing) {
      console.error("[mercado-pago-webhook] Falha ao recuperar payment_events existente após conflito.", {
        category: "payment_event_claim_lookup_error",
        postgres_code: selectError?.code ?? null,
      });
      return { kind: "error" };
    }

    const existingRow = existing as PaymentEventClaimRow;
    if (existingRow.processed_at !== null) {
      return { kind: "already_processed" };
    }

    const { error: attemptsUpdateError } = await supabase
      .from("payment_events")
      .update({ attempts: existingRow.attempts + 1 })
      .eq("id", existingRow.id);

    if (attemptsUpdateError) {
      console.error("[mercado-pago-webhook] Falha ao incrementar attempts em payment_events.", {
        category: "payment_event_attempts_update_error",
      });
      return { kind: "error" };
    }

    return { kind: "retry", eventId: existingRow.id };
  } catch (caught) {
    console.error("[mercado-pago-webhook] Exceção inesperada ao reivindicar payment_events.", {
      category: "payment_event_claim_thrown_exception",
      error_type: caught instanceof Error ? caught.name : "unknown",
    });
    return { kind: "error" };
  }
}

type FinalizePaymentEventResult =
  | { kind: "finalized" }
  | { kind: "already_finalized" }
  | { kind: "error" };

/**
 * Marca a linha de payment_events como concluída (processed_at preenchido).
 * SÓ deve ser chamada quando o desfecho é definitivo (sucesso OU uma
 * condição que retry nunca resolveria) — NUNCA num caminho de falha
 * temporária (ver política de resposta no cabeçalho do arquivo).
 *
 * NUNCA void: supabase-js normalmente devolve {data,error} em vez de lançar
 * — um UPDATE que falhou silenciosamente (erro em `error`, não em exceção)
 * nunca pode ser confundido com sucesso pelo chamador.
 *
 * O UPDATE só afeta a linha se processed_at ainda for NULL (.is("processed_at",
 * null)) — evita que duas execuções concorrentes para o MESMO eventId
 * sobrescrevam uma à outra: só a primeira a chegar aqui de fato grava; a
 * segunda encontra 0 linhas afetadas e, ao verificar por SELECT, vê que já
 * foi finalizada por outra execução (kind: "already_finalized"), nunca
 * repete o UPDATE.
 */
async function finalizePaymentEvent(
  eventId: string,
  fields: { orderId: string | null; paymentId: string | null; status: string; errorMessage: string | null },
): Promise<FinalizePaymentEventResult> {
  try {
    const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: updated, error: updateError } = await supabase
      .from("payment_events")
      .update({
        order_id: fields.orderId,
        payment_id: fields.paymentId,
        status: fields.status,
        error_message: fields.errorMessage,
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .is("processed_at", null)
      .select("id");

    if (updateError) {
      console.error("[mercado-pago-webhook] Falha ao finalizar payment_events (UPDATE).", {
        category: "payment_event_finalize_update_error",
      });
      return { kind: "error" };
    }

    if (Array.isArray(updated) && updated.length === 1) {
      return { kind: "finalized" };
    }

    // Nenhuma linha afetada pelo UPDATE (processed_at já não era NULL, ou o
    // id não existe) — verifica qual dos dois casos é, via SELECT.
    const { data: existing, error: selectError } = await supabase
      .from("payment_events")
      .select("id, processed_at")
      .eq("id", eventId)
      .maybeSingle();

    if (selectError) {
      console.error("[mercado-pago-webhook] Falha ao verificar payment_events após UPDATE sem efeito.", {
        category: "payment_event_finalize_verify_error",
      });
      return { kind: "error" };
    }

    if (existing && (existing as { processed_at: string | null }).processed_at !== null) {
      return { kind: "already_finalized" };
    }

    // Não existe, ou existe mas processed_at continua NULL apesar do UPDATE
    // não ter afetado nenhuma linha — estado inconsistente, nunca presumido
    // como sucesso.
    console.error("[mercado-pago-webhook] payment_events não encontrado ou não finalizado após UPDATE sem efeito.", {
      category: "payment_event_finalize_inconsistent",
    });
    return { kind: "error" };
  } catch {
    // Catch NUNCA engole o erro: loga só uma categoria segura (nenhum dado
    // do evento, nenhuma mensagem de exceção) e sempre retorna "error" —
    // nunca finge sucesso.
    console.error("[mercado-pago-webhook] Exceção inesperada ao finalizar payment_events.", {
      category: "payment_event_finalize_thrown_exception",
    });
    return { kind: "error" };
  }
}

/**
 * Finaliza payment_events e só então decide a resposta HTTP — único ponto de
 * decisão para todo o arquivo, de propósito: garante estruturalmente que
 * NENHUM 200 é enviado ao Mercado Pago sem que a finalização tenha
 * sucedido (finalized ou already_finalized). Se a finalização falhar
 * (kind: "error"), responde 500 — o Mercado Pago reenvia, e o reenvio
 * encontra a linha ainda com processed_at NULL, tentando de novo.
 */
async function respondAfterFinalizing(
  eventId: string,
  fields: { orderId: string | null; paymentId: string | null; status: string; errorMessage: string | null },
  outcome: string,
  extra?: Record<string, unknown>,
): Promise<Response> {
  const finalizeResult = await finalizePaymentEvent(eventId, fields);
  if (finalizeResult.kind === "error") {
    console.error("[mercado-pago-webhook] Finalização de payment_events falhou — respondendo 500 para permitir reenvio.", {
      category: "respond_after_finalizing_failed",
    });
    return errorResponse(500, "database_error", "Não foi possível processar a notificação agora.");
  }
  return okResponse(outcome, extra);
}

// ═════════════════════════════ Pedido local (orders) ═══════════════════════
interface LocalOrderRow {
  id: string;
  public_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  mercado_pago_environment: MercadoPagoEnvironment;
  mercado_pago_order_id: string | null;
  mercado_pago_payment_id: string | null;
}

function isValidLocalOrderRow(value: unknown): value is LocalOrderRow {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    isUuidString(record.id) &&
    isUuidString(record.public_id) &&
    typeof record.amount_cents === "number" &&
    Number.isSafeInteger(record.amount_cents) &&
    record.amount_cents > 0 &&
    isNonEmptyString(record.currency) &&
    isNonEmptyString(record.status) &&
    (record.mercado_pago_environment === "test" || record.mercado_pago_environment === "production") &&
    (record.mercado_pago_order_id === null || isNonEmptyString(record.mercado_pago_order_id)) &&
    (record.mercado_pago_payment_id === null || isNonEmptyString(record.mercado_pago_payment_id))
  );
}

// ──────────────────────────────── Handler ───────────────────────────────────
Deno.serve(async (req: Request) => {
  // ── Passo 1/2: só POST; valida Content-Length declarado e content-type
  //    ANTES de ler o corpo — uma assinatura inválida nunca chega a fazer o
  //    servidor alocar/ler um corpo grande.
  if (req.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "Método não permitido.", { Allow: "POST" });
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !MERCADO_PAGO_ACCESS_TOKEN ||
    !MERCADO_PAGO_ENVIRONMENT ||
    !MERCADO_PAGO_WEBHOOK_SECRET
  ) {
    return errorResponse(500, "server_misconfigured", "Configuração do servidor incompleta.");
  }
  if (MERCADO_PAGO_ENVIRONMENT !== "test" && MERCADO_PAGO_ENVIRONMENT !== "production") {
    return errorResponse(500, "server_misconfigured", "Configuração do servidor incompleta.");
  }
  const mercadoPagoEnvironment: MercadoPagoEnvironment = MERCADO_PAGO_ENVIRONMENT;

  const contentType = req.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return errorResponse(415, "unsupported_media_type", "Content-Type deve ser application/json.");
  }

  const declaredLength = req.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_BODY_BYTES) {
      return errorResponse(413, "payload_too_large", "Corpo da requisição excede o limite permitido.");
    }
  }

  // ── Passo 3: extrai query (data.id, type) e headers (x-signature,
  //    x-request-id). Nenhum deles é lido do corpo ainda.
  const url = new URL(req.url);
  const queryDataId = url.searchParams.get("data.id");
  const queryType = url.searchParams.get("type");
  const xSignatureHeader = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");

  // ── Passo 4: exige type=order ANTES de qualquer verificação de assinatura
  //    — outro tópico entregue por engano nunca é processado nem custa uma
  //    verificação HMAC; nunca resolve com retry, então 200.
  if (queryType !== "order") {
    console.error("[mercado-pago-webhook] Notificação com type diferente de 'order' recebida.", {
      category: "unexpected_topic",
    });
    return okResponse("ignored_topic");
  }

  // ── Passo 5: valida x-signature. queryDataId, x-request-id e x-signature
  //    são obrigatórios — ausência de qualquer um deles é 401 antes mesmo de
  //    chamar o validador. A partir daqui, a decisão criptográfica em si
  //    (parse do header ts=...,v1=..., cálculo do HMAC, comparação em tempo
  //    constante) é inteiramente do SDK oficial (WebhookSignatureValidator),
  //    não mais de código manual — ver "Validação de x-signature" abaixo.
  if (!isNonEmptyString(queryDataId) || !isNonEmptyString(xRequestId) || !isNonEmptyString(xSignatureHeader)) {
    console.error("[mercado-pago-webhook] Requisição sem data.id/x-request-id/x-signature.", {
      category: "invalid_signature_missing_fields",
    });
    return errorResponse(401, "invalid_signature", "Assinatura ausente ou incompleta.");
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature: xSignatureHeader,
      xRequestId,
      dataId: queryDataId,
      secret: MERCADO_PAGO_WEBHOOK_SECRET,
    });
  } catch (caught) {
    if (caught instanceof InvalidWebhookSignatureError) {
      console.error("[mercado-pago-webhook] Assinatura HMAC não confere (SDK oficial).", {
        category: "invalid_signature_mismatch",
      });
      return errorResponse(401, "invalid_signature", "Assinatura inválida.");
    }

    // Qualquer erro que NÃO seja InvalidWebhookSignatureError nunca é
    // engolido silenciosamente — mas o log fica restrito ao tipo/categoria
    // do erro, nunca ao secret, ao header x-signature, ao corpo ou a
    // qualquer outro dado sensível.
    console.error("[mercado-pago-webhook] Erro inesperado ao validar assinatura via SDK oficial.", {
      category: "signature_validation_unexpected_error",
      error_type: caught instanceof Error ? caught.name : "unknown",
    });
    return errorResponse(500, "signature_validation_error", "Não foi possível validar a notificação agora.");
  }

  // ── Passo 6: só agora lê e faz parse do corpo.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return errorResponse(400, "invalid_body", "Não foi possível ler o corpo da requisição.");
  }
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return errorResponse(413, "payload_too_large", "Corpo da requisição excede o limite permitido.");
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, "invalid_json", "Corpo da requisição não é um JSON válido.");
  }

  // ── Passo 7: exige body.type === "order" e body.data.id não vazio e igual
  //    ao data.id da query. body.id é OPCIONAL (ver bloco abaixo) — quando
  //    ausente, provider_event_id vem de um fallback determinístico.
  //    Assinatura válida (passo 5) já confirma que isto veio do Mercado
  //    Pago — uma divergência aqui é anomalia de formato, não algo que um
  //    reenvio idêntico corrigiria.
  if (parsedBody === null || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    console.error("[mercado-pago-webhook] Corpo da notificação não é um objeto.", { category: "invalid_body_shape" });
    return errorResponse(400, "invalid_request", "Corpo da notificação em formato inesperado.");
  }
  const bodyRecord = parsedBody as Record<string, unknown>;

  if (bodyRecord.type !== "order") {
    console.error("[mercado-pago-webhook] body.type diferente de 'order'.", { category: "invalid_body_type" });
    return errorResponse(400, "invalid_request", "Corpo da notificação em formato inesperado.");
  }

  const bodyData = bodyRecord.data as Record<string, unknown> | undefined;
  const bodyDataId = bodyData?.id;
  if (typeof bodyDataId !== "string" || bodyDataId.length === 0) {
    console.error("[mercado-pago-webhook] body.data.id ausente ou vazio.", { category: "invalid_body_data_id" });
    return errorResponse(400, "invalid_request", "Corpo da notificação em formato inesperado.");
  }
  if (bodyDataId !== queryDataId) {
    console.error("[mercado-pago-webhook] body.data.id diferente do data.id da query.", {
      category: "data_id_mismatch",
    });
    return errorResponse(400, "invalid_request", "Corpo da notificação em formato inesperado.");
  }

  // body.id é OPCIONAL — payloads reais de notificação de Order (vistos no
  // simulador do Mercado Pago) não trazem esse campo de nível superior
  // (só existe dentro de body.data.id, já validado acima). Quando ausente,
  // gera-se uma chave de fallback determinística a partir de campos do
  // corpo JÁ AUTENTICADO pela assinatura (passo 5) — NUNCA de x-request-id,
  // que pode variar entre reenvios do MESMO evento e quebraria a
  // deduplicação em payment_events.
  const bodyActionRaw = bodyRecord.action;
  const bodyDateCreatedRaw = bodyRecord.date_created;
  // Cast explícito (não só a narrowing do type guard) — mesma cautela já
  // usada em create-pix-order para acesso a propriedade dentro de ternário.
  const eventType = isNonEmptyString(bodyActionRaw) ? (bodyActionRaw as string) : "order";

  const rawEventId = bodyRecord.id;
  let providerEventId: string;
  if (
    (typeof rawEventId === "string" || typeof rawEventId === "number") &&
    String(rawEventId).trim().length > 0
  ) {
    providerEventId = String(rawEventId).trim();
  } else {
    if (!isNonEmptyString(bodyActionRaw) || !isNonEmptyString(bodyDateCreatedRaw)) {
      console.error("[mercado-pago-webhook] body.id ausente e action/date_created insuficientes para fallback.", {
        category: "invalid_body_missing_event_id",
      });
      return errorResponse(400, "invalid_request", "Corpo da notificação em formato inesperado.");
    }
    // Casts explícitos (mesma cautela de sempre neste arquivo) — os dois já
    // foram confirmados non-empty string acima.
    const actionForFallback = bodyActionRaw as string;
    const dateCreatedForFallback = bodyDateCreatedRaw as string;
    if (Number.isNaN(Date.parse(dateCreatedForFallback))) {
      console.error("[mercado-pago-webhook] date_created não é uma data válida — fallback recusado.", {
        category: "invalid_body_missing_event_id",
      });
      return errorResponse(400, "invalid_request", "Corpo da notificação em formato inesperado.");
    }
    const fallbackMaterial = `${queryDataId}|${actionForFallback}|${dateCreatedForFallback}`;
    const fallbackHash = await computeSha256Hex(fallbackMaterial);
    providerEventId = `fallback:${fallbackHash}`;
  }

  // ── Passo 8: claim/idempotência em payment_events.
  const claim = await claimPaymentEvent(providerEventId, eventType);
  if (claim.kind === "error") {
    return errorResponse(500, "database_error", "Não foi possível processar a notificação agora.");
  }
  if (claim.kind === "already_processed") {
    return okResponse("already_processed");
  }
  const eventId = claim.eventId;

  // ── Passo 9: GET /v1/orders/{queryDataId} — o mesmo queryDataId usado no
  //    manifesto da assinatura (sem nenhuma transformação de case).
  const getResult = await mpFetchJson(
    `${MERCADO_PAGO_ORDERS_URL}/${encodeURIComponent(queryDataId)}`,
    { method: "GET", headers: mpAuthHeaders() },
  );

  if (getResult.kind === "network_error") {
    console.error("[mercado-pago-webhook] Falha de rede ao consultar a Order no Mercado Pago.", {
      category: "mp_get_network_error",
    });
    return errorResponse(503, "payment_provider_temporarily_unavailable", "Tente novamente em instantes.");
  }
  if (getResult.kind === "http_error") {
    console.error("[mercado-pago-webhook] GET à Order retornou erro HTTP.", {
      category: isTemporaryStatus(getResult.status) ? "mp_get_temporary_error" : "mp_get_definitive_error",
      status: getResult.status,
    });
    // Qualquer erro HTTP no GET (temporário ou 4xx definitivo) é tratado
    // como transitório aqui: um 404/400 logo após recebermos a notificação
    // é mais provável ser propagação/consistência eventual do provedor do
    // que um data.id genuinamente inválido (a assinatura já confirmou que a
    // notificação é legítima) — nunca decidimos "não é nosso" com base
    // apenas nisso. Deixa o Mercado Pago reenviar.
    return errorResponse(503, "payment_provider_temporarily_unavailable", "Tente novamente em instantes.");
  }

  const mpBody = getResult.body;

  // ── Passo 10: extração MÍNIMA e defensiva — id e external_reference.
  //    NÃO autoriza nada por si só; só decide QUAL pedido local carregar.
  if (mpBody === null || typeof mpBody !== "object" || Array.isArray(mpBody)) {
    console.error("[mercado-pago-webhook] Corpo da Order do Mercado Pago não é um objeto.", {
      category: "mp_order_body_malformed",
    });
    return errorResponse(503, "payment_provider_temporarily_unavailable", "Tente novamente em instantes.");
  }
  const mpRecord = mpBody as Record<string, unknown>;

  const mpId = mpRecord.id;
  if ((typeof mpId !== "string" && typeof mpId !== "number") || String(mpId) !== queryDataId) {
    console.error("[mercado-pago-webhook] id da Order devolvida não confere com o data.id solicitado.", {
      category: "mp_order_id_mismatch",
    });
    return errorResponse(503, "payment_provider_temporarily_unavailable", "Tente novamente em instantes.");
  }

  const externalReferenceRaw = mpRecord.external_reference;
  if (typeof externalReferenceRaw !== "string" || !isUuidString(externalReferenceRaw)) {
    // A Order existe e é consistente, mas não tem o formato de
    // external_reference que create-pix-order sempre usa (public_id, um
    // UUID) — não é uma Order criada pelo nosso sistema. Retry nunca muda
    // isso.
    console.error("[mercado-pago-webhook] external_reference não é um UUID — Order não pertence a este sistema.", {
      category: "external_reference_invalid",
    });
    return respondAfterFinalizing(
      eventId,
      {
        orderId: null,
        paymentId: null,
        status: "external_reference_invalid",
        errorMessage: "external_reference não é um UUID válido.",
      },
      "external_reference_invalid",
    );
  }
  const externalReference = externalReferenceRaw;

  // ── Passo 11: localiza o pedido local por public_id = external_reference.
  //    SELECT direto via service_role (SELECT nunca viola a regra "nunca
  //    UPDATE direto em orders" — só leitura; toda escrita continua
  //    exclusivamente via link_mercado_pago_order/mark_order_paid).
  let localOrder: LocalOrderRow | null = null;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: orderRows, error: orderLookupError } = await supabase
      .from("orders")
      .select("id, public_id, amount_cents, currency, status, mercado_pago_environment, mercado_pago_order_id, mercado_pago_payment_id")
      .eq("public_id", externalReference)
      .limit(1);

    if (orderLookupError) {
      console.error("[mercado-pago-webhook] Falha ao consultar orders por public_id.", {
        category: "order_lookup_error",
        postgres_code: orderLookupError.code ?? null,
      });
      return errorResponse(500, "database_error", "Não foi possível processar a notificação agora.");
    }

    if (Array.isArray(orderRows) && orderRows.length === 1) {
      // Linha encontrada mas em formato inesperado (violaria as próprias
      // constraints NOT NULL do schema) é uma anomalia de banco, não um
      // "não encontrado" comum — nunca finaliza payment_events silenciosamente
      // como se fosse esse último caso; deixa o Mercado Pago reenviar.
      if (!isValidLocalOrderRow(orderRows[0])) {
        console.error("[mercado-pago-webhook] Linha de orders encontrada em formato inesperado.", {
          category: "order_row_shape_invalid",
        });
        return errorResponse(500, "database_error", "Não foi possível processar a notificação agora.");
      }
      localOrder = orderRows[0];
    }
  } catch (caught) {
    console.error("[mercado-pago-webhook] Exceção inesperada ao consultar orders por public_id.", {
      category: "order_lookup_thrown_exception",
      error_type: caught instanceof Error ? caught.name : "unknown",
    });
    return errorResponse(500, "database_error", "Não foi possível processar a notificação agora.");
  }

  // ── Passo 12: pedido não encontrado localmente — nunca toca em orders.
  if (localOrder === null) {
    console.error("[mercado-pago-webhook] Nenhum pedido local encontrado para este external_reference.", {
      category: "order_not_found_locally",
    });
    return respondAfterFinalizing(
      eventId,
      { orderId: null, paymentId: null, status: "order_not_found_locally", errorMessage: null },
      "order_not_found_locally",
    );
  }

  // ── Passo 13: confirma ambiente ANTES de qualquer validação de identidade
  //    completa — sem isso, poderíamos comparar contra um amountString
  //    correto mas nunca deveríamos ter chegado a chamar o GET com o token
  //    errado (o GET já usa MERCADO_PAGO_ACCESS_TOKEN atual desde o passo 9,
  //    então essa checagem aqui é sobre CONFIANÇA no resultado, não sobre
  //    refazer a chamada).
  if (localOrder.mercado_pago_environment !== mercadoPagoEnvironment) {
    console.error("[mercado-pago-webhook] mercado_pago_environment do pedido diverge do ambiente atual do deploy.", {
      category: "environment_mismatch",
    });
    return respondAfterFinalizing(
      eventId,
      { orderId: localOrder.id, paymentId: null, status: "environment_mismatch", errorMessage: null },
      "environment_mismatch",
    );
  }

  // ── Passo 14: monta expected para a validação completa.
  const identityExpected: IdentityExpected = {
    externalReference: localOrder.public_id,
    amountString: centsToAmountString(localOrder.amount_cents),
    expectedMercadoPagoOrderId: queryDataId,
    // null e undefined se comportam de forma idêntica em
    // validateMercadoPagoOrderIdentity/evaluateMercadoPagoOrderBody (ambos
    // significam "nenhum valor local ainda conhecido, não exige igualdade")
    // — mesma passagem direta que create-pix-order já faz.
    expectedMercadoPagoPaymentId: localOrder.mercado_pago_payment_id,
  };

  // ── Passo 15: MESMA validação estrita de identidade/estado de
  //    create-pix-order, sobre o corpo COMPLETO já obtido no passo 9 (nenhum
  //    segundo GET).
  const evaluated = evaluateMercadoPagoOrderBody(mpBody, identityExpected);

  // ── Passo 16: identidade não validou — nunca vincula, nunca marca pago.
  if (evaluated.kind === "identity_invalid") {
    console.error("[mercado-pago-webhook] Identidade da Order não validou contra o pedido local encontrado.", {
      category: "identity_invalid",
    });
    return respondAfterFinalizing(
      eventId,
      { orderId: localOrder.id, paymentId: null, status: "identity_invalid", errorMessage: null },
      "identity_invalid",
    );
  }

  // ── Passo 17: vincula (Etapa A/B, idêntico a create-pix-order) para TODO
  //    kind restante — inclusive terminal/state_conflict_with_identity,
  //    para nunca perder o rastro dos IDs mesmo em estados que não avançam o
  //    pedido (mesmo princípio já documentado em create-pix-order).
  const paymentIdToLink = evaluated.kind === "shell" ? null : evaluated.mercadoPagoPaymentId;
  const linkResult = await linkMercadoPagoOrder(localOrder.id, evaluated.mercadoPagoOrderId, paymentIdToLink);

  if (linkResult.kind === "temporary_error") {
    console.error("[mercado-pago-webhook] Falha temporária ao vincular a Order.", {
      category: "link_temporary_error",
    });
    return errorResponse(500, "database_error", "Não foi possível processar a notificação agora.");
  }
  if (linkResult.kind === "conflict") {
    console.error("[mercado-pago-webhook] Conflito de identidade ao vincular a Order.", {
      category: "link_conflict",
    });
    return respondAfterFinalizing(
      eventId,
      { orderId: localOrder.id, paymentId: null, status: "link_conflict", errorMessage: null },
      "link_conflict",
    );
  }

  // linkResult.kind === "linked" a partir daqui.

  if (evaluated.kind === "processed") {
    const markResult = await markOrderPaid(
      localOrder.id,
      evaluated.mercadoPagoOrderId,
      evaluated.mercadoPagoPaymentId,
      localOrder.amount_cents,
    );

    if (markResult.kind === "temporary_error") {
      console.error("[mercado-pago-webhook] Falha temporária ao persistir a confirmação de pagamento.", {
        category: "mark_order_paid_temporary_error",
      });
      return errorResponse(500, "database_error", "Não foi possível processar a notificação agora.");
    }
    if (markResult.kind === "conflict") {
      console.error("[mercado-pago-webhook] Conflito ao persistir a confirmação de pagamento.", {
        category: "mark_order_paid_conflict",
      });
      return respondAfterFinalizing(
        eventId,
        {
          orderId: localOrder.id,
          paymentId: evaluated.mercadoPagoPaymentId,
          status: "mark_order_paid_conflict",
          errorMessage: null,
        },
        "mark_order_paid_conflict",
      );
    }

    // markResult.kind === "paid" — sucesso definitivo.
    return respondAfterFinalizing(
      eventId,
      {
        orderId: localOrder.id,
        paymentId: evaluated.mercadoPagoPaymentId,
        status: markResult.status,
        errorMessage: null,
      },
      "paid",
      { status: markResult.status },
    );
  }

  // ── Demais kinds (shell/pending/processing/incomplete_provider_response/
  //    terminal/state_conflict_with_identity): já vinculados acima, nunca
  //    chama mark_order_paid, só registra.
  const paymentIdForLog = evaluated.kind === "shell" ? null : evaluated.mercadoPagoPaymentId;
  const detailMessage =
    evaluated.kind === "processing" || evaluated.kind === "terminal"
      ? `order=${evaluated.orderStatus}/${evaluated.orderStatusDetail};payment=${evaluated.paymentStatus}/${evaluated.paymentStatusDetail}`
      : evaluated.kind === "shell"
        ? `order=${evaluated.orderStatus}/${evaluated.orderStatusDetail}`
        : null;

  return respondAfterFinalizing(
    eventId,
    { orderId: localOrder.id, paymentId: paymentIdForLog, status: evaluated.kind, errorMessage: detailMessage },
    evaluated.kind,
  );
});
