/**
 * Cliente HTTP para a Edge Function create-pix-order — único ponto de
 * integração do frontend com o checkout Pix transparente.
 *
 * O corpo da requisição é montado campo a campo (nunca um spread de objeto
 * arbitrário) para garantir que NENHUM campo além dos sete exigidos pelo
 * contrato da função é enviado. Esta função nunca lança: qualquer falha
 * (rede, JSON inválido, formato de resposta inesperado) vira um
 * PixCheckoutResult do tipo "error", nunca uma exceção não tratada.
 * Nunca loga o corpo da resposta, o checkout_access_token, nem qualquer
 * dado sensível.
 */

export interface CreatePixOrderRequest {
  checkoutRequestId: string;
  checkoutAccessToken: string;
  packageSlug: string;
  customerName: string;
  customerEmail: string;
  questions: string[];
  turnstileToken: string;
}

export interface PixData {
  qrCode: string;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
}

export interface OrderSummary {
  publicId: string;
  amountCents: number;
  currency: string;
  packageName: string;
}

export type PixCheckoutResult =
  | { kind: "pending"; order: OrderSummary; pix: PixData }
  /** Order "shell" do backend: já existe do lado do Mercado Pago, mas
   * ainda sem transação/payment — o Pix em si ainda não está pronto.
   * Nunca confundir com "processing" (ver regra de parse abaixo). */
  | { kind: "preparing"; order: OrderSummary }
  /** Pagamento com identidade e estado reais em confirmação (payment_status
   * presente) — diferente de "preparing", aqui já existe uma tentativa de
   * pagamento sendo avaliada pelo Mercado Pago. */
  | { kind: "processing"; order: OrderSummary }
  | { kind: "processed"; order: OrderSummary }
  | { kind: "error"; code: string; retryAfterSeconds: number | null };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Classificação do que a interface deve fazer com cada código de erro —
 * nunca inventa uma ação; cada código tem um comportamento definido:
 *   - "input": nenhum pedido foi criado no servidor (a RPC rejeitou os
 *     dados antes de qualquer INSERT) — seguro reabrir o formulário para
 *     edição e reenviar com o MESMO checkout_request_id;
 *   - "temporary": falha passageira — retry direto, com os MESMOS dados,
 *     sem reabrir o formulário;
 *   - "contact": exige reconciliação manual OU é um erro de configuração
 *     do servidor/provedor que uma nova tentativa (mesma ou nova) nunca
 *     resolve sozinha — nunca retry automático, nunca resetAttempt, nunca
 *     outro pedido; orienta contato direto;
 *   - "restart": o pedido em si não pode mais avançar (estado terminal ou
 *     reuso de checkout_request_id com dados diferentes) — mas uma compra
 *     NOVA (novo checkout_request_id) tem chance real de funcionar, então
 *     exige explicitamente essa tentativa nova, nunca reaproveita a atual.
 */
export type CheckoutErrorCategory = "input" | "temporary" | "contact" | "restart";

const INPUT_ERROR_CODES = new Set([
  "invalid_request",
  "invalid_question",
  "question_count_mismatch",
  "package_not_found_or_inactive",
]);

// Reconciliação manual E erros de configuração do servidor/provedor —
// nenhuma tentativa nova (com o mesmo ID ou com um ID novo) resolve
// sozinha; só intervenção humana. NUNCA chama resetAttempt, NUNCA cria
// outro pedido.
const CONTACT_ERROR_CODES = new Set([
  "manual_reconciliation_required",
  "idempotency_reconciliation_required",
  "ambiguous_creation_result",
  "provider_state_conflict",
  "payment_creation_failed_order_created",
  "payment_provider_configuration_error",
  "server_misconfigured",
  "origin_not_allowed",
  "payment_request_rejected",
]);

// Só situações em que uma compra REALMENTE NOVA (novo checkout_request_id)
// tem chance de funcionar — nunca erros de configuração, que se repetiriam
// de qualquer forma numa tentativa nova.
const RESTART_ERROR_CODES = new Set(["payment_not_payable", "checkout_conflict"]);

export function classifyCheckoutErrorCode(code: string): CheckoutErrorCategory {
  if (INPUT_ERROR_CODES.has(code)) return "input";
  if (CONTACT_ERROR_CODES.has(code)) return "contact";
  if (RESTART_ERROR_CODES.has(code)) return "restart";
  return "temporary";
}

function buildRequestBody(request: CreatePixOrderRequest): Record<string, unknown> {
  return {
    checkout_request_id: request.checkoutRequestId,
    checkout_access_token: request.checkoutAccessToken,
    package_slug: request.packageSlug,
    customer_name: request.customerName,
    customer_email: request.customerEmail,
    questions: request.questions,
    turnstile_token: request.turnstileToken,
  };
}

function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get("retry-after");
  return header !== null && /^\d+$/.test(header) ? Number(header) : null;
}

export async function createPixOrder(request: CreatePixOrderRequest): Promise<PixCheckoutResult> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-pix-order`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRequestBody(request)),
    });
  } catch {
    return { kind: "error", code: "network_error", retryAfterSeconds: null };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "error", code: "invalid_response", retryAfterSeconds: parseRetryAfter(response) };
  }

  if (body === null || typeof body !== "object") {
    return { kind: "error", code: "invalid_response", retryAfterSeconds: parseRetryAfter(response) };
  }
  const record = body as Record<string, unknown>;

  if (record.ok !== true) {
    const errorRecord = record.error as Record<string, unknown> | undefined;
    const code = isNonEmptyString(errorRecord?.code) ? (errorRecord!.code as string) : "unknown_error";
    return { kind: "error", code, retryAfterSeconds: parseRetryAfter(response) };
  }

  const orderRecord = record.order as Record<string, unknown> | undefined;
  const paymentRecord = record.payment as Record<string, unknown> | undefined;
  if (
    orderRecord === undefined ||
    paymentRecord === undefined ||
    !isNonEmptyString(orderRecord.public_id) ||
    typeof orderRecord.amount_cents !== "number" ||
    !isNonEmptyString(orderRecord.currency) ||
    !isNonEmptyString(orderRecord.package_name)
  ) {
    return { kind: "error", code: "invalid_response", retryAfterSeconds: parseRetryAfter(response) };
  }

  const order: OrderSummary = {
    publicId: orderRecord.public_id,
    amountCents: orderRecord.amount_cents,
    currency: orderRecord.currency,
    packageName: orderRecord.package_name,
  };

  if (paymentRecord.status === "processed") {
    return { kind: "processed", order };
  }

  if (paymentRecord.status === "action_required") {
    const pixRecord = paymentRecord.pix as Record<string, unknown> | null | undefined;
    if (pixRecord && isNonEmptyString(pixRecord.qr_code)) {
      return {
        kind: "pending",
        order,
        pix: {
          qrCode: pixRecord.qr_code,
          qrCodeBase64: isNonEmptyString(pixRecord.qr_code_base64) ? (pixRecord.qr_code_base64 as string) : null,
          ticketUrl: isNonEmptyString(pixRecord.ticket_url) ? (pixRecord.ticket_url as string) : null,
        },
      };
    }
  }

  // "shell" e "processing" ambos carregam order_status (nunca presente em
  // pending/processed) — mas payment_status é quem diferencia os dois:
  //   - payment_status === null  => shell: a Order existe, mas o Pix
  //     ainda está sendo preparado (nenhuma transação ainda);
  //   - payment_status string    => processing: já existe uma tentativa
  //     de pagamento real sendo confirmada pelo Mercado Pago.
  // Nunca tratados como a mesma coisa — misturar os dois faria a
  // interface parecer que um pagamento está em confirmação quando, na
  // verdade, o Pix nem foi gerado ainda.
  if (typeof paymentRecord.order_status === "string") {
    if (paymentRecord.payment_status === null) {
      return { kind: "preparing", order };
    }
    if (typeof paymentRecord.payment_status === "string") {
      return { kind: "processing", order };
    }
  }

  return { kind: "error", code: "invalid_response", retryAfterSeconds: parseRetryAfter(response) };
}
