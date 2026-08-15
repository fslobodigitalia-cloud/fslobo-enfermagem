/**
 * Cliente HTTP para a Edge Function create-product-order — único ponto de
 * integração do frontend com o checkout do Guia de Evolução de Enfermagem
 * (+ order bumps). Espelha src/lib/pixCheckout.ts (fluxo de tarô) — mesma
 * disciplina, contrato diferente.
 *
 * O corpo da requisição é montado campo a campo (nunca um spread de objeto
 * arbitrário), garantindo que NENHUM campo além dos seis exigidos pelo
 * contrato da função é enviado — em especial, nunca um campo de preço:
 * quem calcula amount_cents é sempre o backend (RPC
 * create_or_get_product_order_with_items), nunca este arquivo. Esta
 * função nunca lança: qualquer falha (rede, JSON inválido, formato de
 * resposta inesperado) vira um ProductCheckoutResult do tipo "error",
 * nunca uma exceção não tratada. Nunca loga o corpo da resposta, o
 * checkout_access_token, nem qualquer dado sensível.
 */

export interface CreateProductOrderRequest {
  checkoutRequestId: string;
  checkoutAccessToken: string;
  customerName: string;
  customerEmail: string;
  /** Deve conter o slug do produto principal + 0 a 4 slugs de bump —
   * validação real (qual é o principal, quais bumps são válidos) acontece
   * inteiramente no backend. */
  productSlugs: string[];
  turnstileToken: string;
}

export interface PixData {
  qrCode: string;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
}

export interface OrderItemSummary {
  slug: string;
  name: string;
}

export interface ProductOrderSummary {
  publicId: string;
  amountCents: number;
  currency: string;
  items: OrderItemSummary[];
}

export type ProductCheckoutResult =
  | { kind: "pending"; order: ProductOrderSummary; pix: PixData }
  /** Order "shell" do backend: já existe do lado do Mercado Pago, mas
   * ainda sem transação/payment — o Pix em si ainda não está pronto. */
  | { kind: "preparing"; order: ProductOrderSummary }
  /** Pagamento com identidade e estado reais em confirmação. */
  | { kind: "processing"; order: ProductOrderSummary }
  | { kind: "processed"; order: ProductOrderSummary }
  | { kind: "error"; code: string; retryAfterSeconds: number | null };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Classificação do que a interface deve fazer com cada código de erro —
 * mesma semântica de classifyCheckoutErrorCode em pixCheckout.ts:
 *   - "input": nenhum pedido foi criado no servidor — seguro reabrir o
 *     formulário para edição e reenviar com o MESMO checkout_request_id;
 *   - "temporary": falha passageira — retry direto, com os MESMOS dados;
 *   - "contact": exige reconciliação manual ou é erro de configuração do
 *     servidor/provedor — nunca retry automático, orienta contato direto;
 *   - "restart": exige explicitamente uma compra NOVA (novo
 *     checkout_request_id), nunca reaproveita a atual.
 */
export type CheckoutErrorCategory = "input" | "temporary" | "contact" | "restart";

const INPUT_ERROR_CODES = new Set([
  "invalid_request",
  "product_not_found_or_inactive",
  "primary_product_required",
  "duplicate_product",
  "product_currency_mismatch",
]);

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

const RESTART_ERROR_CODES = new Set(["payment_not_payable", "checkout_conflict"]);

export function classifyCheckoutErrorCode(code: string): CheckoutErrorCategory {
  if (INPUT_ERROR_CODES.has(code)) return "input";
  if (CONTACT_ERROR_CODES.has(code)) return "contact";
  if (RESTART_ERROR_CODES.has(code)) return "restart";
  return "temporary";
}

function buildRequestBody(request: CreateProductOrderRequest): Record<string, unknown> {
  return {
    checkout_request_id: request.checkoutRequestId,
    checkout_access_token: request.checkoutAccessToken,
    customer_name: request.customerName,
    customer_email: request.customerEmail,
    product_slugs: request.productSlugs,
    turnstile_token: request.turnstileToken,
  };
}

function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get("retry-after");
  return header !== null && /^\d+$/.test(header) ? Number(header) : null;
}

function parseItems(raw: unknown): OrderItemSummary[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const items: OrderItemSummary[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    if (!isNonEmptyString(record.slug) || !isNonEmptyString(record.name)) return null;
    items.push({ slug: record.slug, name: record.name });
  }
  return items;
}

export async function createProductOrder(request: CreateProductOrderRequest): Promise<ProductCheckoutResult> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-product-order`;

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
  const items = orderRecord ? parseItems(orderRecord.items) : null;
  if (
    orderRecord === undefined ||
    paymentRecord === undefined ||
    !isNonEmptyString(orderRecord.public_id) ||
    typeof orderRecord.amount_cents !== "number" ||
    !isNonEmptyString(orderRecord.currency) ||
    items === null
  ) {
    return { kind: "error", code: "invalid_response", retryAfterSeconds: parseRetryAfter(response) };
  }

  const order: ProductOrderSummary = {
    publicId: orderRecord.public_id,
    amountCents: orderRecord.amount_cents,
    currency: orderRecord.currency,
    items,
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

  // "shell" (order_status presente, payment_status null) e "processing"
  // (payment_status string) — mesma distinção de pixCheckout.ts.
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
