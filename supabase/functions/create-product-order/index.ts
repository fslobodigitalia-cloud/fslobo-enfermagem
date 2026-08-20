// ════════════════════════════════════════════════════════════════════════════
//  ENTRE NÓS TARÔ — FASE 3A: EDGE FUNCTION "create-product-order"
//
//  Endpoint PÚBLICO (chamado pelo navegador do cliente, sem login) para o
//  novo produto — Guia de Evolução de Enfermagem + order bumps opcionais —
//  irmã de create-pix-order (fluxo de tarô), NÃO um substituto: as duas
//  funções coexistem, cada uma com seu próprio pedido no tempo de vida da
//  Order do Mercado Pago que criam. Esta função copia deliberadamente (não
//  importa/compartilha) toda a integração com Mercado Pago, Turnstile,
//  rate limiting e vinculação já validada em create-pix-order — mesma
//  decisão já registrada para mercado-pago-webhook duplicar em vez de
//  importar: nunca arriscar uma função já em produção por causa de uma
//  nova. create-pix-order NÃO foi alterada por este arquivo.
//
//  Fluxo:
//    1. verifica turnstile_token (Cloudflare Turnstile: success, hostname e
//       action exatos — action aqui é "create_product_order", validada
//       contra o secret TURNSTILE_EXPECTED_ACTION_PRODUCT_ORDER, DISTINTO
//       do TURNSTILE_EXPECTED_ACTION usado por create-pix-order, mesmo que
//       os dois compartilhem o mesmo projeto Supabase e por isso o mesmo
//       espaço de secrets) — sem isso, a função está estruturalmente
//       inoperante;
//    2. aplica rate limiting por hash de IP e hash de e-mail (nunca texto
//       puro), IDEMPOTENTE por checkout_request_id + e-mail JUNTOS, via a
//       MESMA RPC record_checkout_attempt() já usada por create-pix-order —
//       as duas funções compartilham as tabelas de rate limit de propósito:
//       um IP/e-mail abusivo em QUALQUER um dos dois fluxos conta para o
//       mesmo limite combinado;
//    3. valida checkout_request_id, checkout_access_token, nome, e-mail e
//       product_slugs (deve conter exatamente o produto principal
//       guia-evolucao-enfermagem + 0 a 4 bumps distintos — nunca mais que
//       MAX_PRODUCT_SLUGS);
//    4. cria (ou, em retry, apenas recupera) o pedido + os itens comprados
//       no banco, de forma atômica e IDEMPOTENTE, via
//       public.create_or_get_product_order_with_items() — ÚNICA fonte de
//       verdade para validar produtos e calcular amount_cents. Esta função
//       NUNCA recebe nem envia preço algum ao banco — o valor cobrado vem
//       inteiramente de products.price_cents, somado no servidor SQL;
//    5. resolve a Order do Mercado Pago — mesma lógica de identidade e
//       estado já validada em create-pix-order (validateMercadoPagoOrder
//       Identity/Shell/classifyPaymentState/evaluateMercadoPagoOrderBody/
//       resolvePixPayment), copiada aqui sem nenhuma alteração de
//       comportamento;
//    6. só responde sucesso depois que a vinculação for confirmada via
//       public.link_mercado_pago_order() (reaproveitada sem alteração) —
//       validando também que os valores devolvidos batem exatamente com o
//       que foi pedido, não só o formato;
//    7. o valor enviado ao Mercado Pago (total_amount) vem SEMPRE de
//       order.amount_cents devolvido pela RPC — nunca de um campo de preço
//       do corpo da requisição (que não existe neste contrato);
//    8. external_reference continua sendo orders.public_id — IDÊNTICO ao
//       que create-pix-order já usa — para que mercado-pago-webhook (não
//       alterado por esta etapa) reconheça e concilie pedidos deste fluxo
//       sem precisar saber que eles existem;
//    9. devolve ao cliente só o necessário: resumo do pedido (incluindo os
//       itens efetivamente comprados, nome + slug) e o estado do pagamento.
//
//  ─────────────────────────── Segurança ───────────────────────────────────
//  Turnstile (TURNSTILE_SECRET_KEY/TURNSTILE_EXPECTED_HOSTNAME/
//  TURNSTILE_EXPECTED_ACTION_PRODUCT_ORDER) e rate limiting
//  (RATE_LIMIT_HASH_SECRET, no mínimo 32 caracteres) são OBRIGATÓRIOS —
//  sem eles, todo request falha com 500 "server_misconfigured" (falha
//  fechada, idêntico a create-pix-order). ALLOWED_ORIGIN (CORS) não é
//  autenticação nem proteção contra automação.
//
//  Cada retry de checkout precisa de um NOVO turnstile_token — tokens do
//  Turnstile são de uso único.
//
//  Não implantada em nenhum projeto Supabase por este arquivo — apenas o
//  código local da função, pronto para revisão manual até o passo de
//  deploy desta mesma etapa.
// ════════════════════════════════════════════════════════════════════════════

import {
  createClient,
  type PostgrestError,
} from "npm:@supabase/supabase-js@2.112.0";

// ─────────────────────────────── Configuração ───────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MERCADO_PAGO_ACCESS_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
const MERCADO_PAGO_ENVIRONMENT = Deno.env.get("MERCADO_PAGO_ENVIRONMENT");
const TURNSTILE_SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY");
const TURNSTILE_EXPECTED_HOSTNAME = Deno.env.get("TURNSTILE_EXPECTED_HOSTNAME");
// Secret EXCLUSIVO desta função — nunca o mesmo nome usado por
// create-pix-order (TURNSTILE_EXPECTED_ACTION). Os dois secrets convivem no
// mesmo projeto Supabase (o espaço de secrets é por projeto, não por
// função) sob nomes diferentes de propósito, para que cada função valide a
// action exata do próprio widget Turnstile sem colidir com a da outra.
const TURNSTILE_EXPECTED_ACTION_PRODUCT_ORDER = Deno.env.get("TURNSTILE_EXPECTED_ACTION_PRODUCT_ORDER");
const RATE_LIMIT_HASH_SECRET = Deno.env.get("RATE_LIMIT_HASH_SECRET");
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN");

const MIN_RATE_LIMIT_HASH_SECRET_LENGTH = 32;

const MERCADO_PAGO_ORDERS_URL = "https://api.mercadopago.com/v1/orders";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Dados de pagador de teste documentados pelo Mercado Pago para o ambiente
// de testes (nunca dados reais do cliente nesse modo) — idênticos aos já
// usados por create-pix-order.
const MERCADO_PAGO_TEST_PAYER_EMAIL = "test_user_br@testuser.com";
const MERCADO_PAGO_TEST_PAYER_FIRST_NAME = "APRO";

// Descrição fixa e curta (requisito 7) — nunca construída a partir dos
// nomes dos produtos/bumps comprados.
const MERCADO_PAGO_ORDER_DESCRIPTION = "Guia de Evolução de Enfermagem";

// Estados terminais documentados — idêntico a create-pix-order.
const TERMINAL_STATUS_VALUES = new Set(["canceled", "expired", "failed", "refunded", "charged_back"]);

const MERCADO_PAGO_TIMEOUT_MS = 8_000;
const TURNSTILE_TIMEOUT_MS = 5_000;

// 1 produto principal + 4 bumps, no máximo — catálogo do MVP tem
// exatamente 5 produtos (ver migration 20260814_008). Checagem de sanidade
// na borda, ADICIONAL ao limite mais genérico (16) já aplicado dentro da
// RPC — nunca a única barreira, mas rejeita cedo, antes de tocar no banco.
const MAX_PRODUCT_SLUGS = 5;
const MAX_NAME_LENGTH = 120;
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;
const MAX_BODY_BYTES = 32 * 1024; // 32 KB

const PRODUCT_SLUG_REGEX = /^[a-z0-9-]{1,80}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECKOUT_ACCESS_TOKEN_REGEX = /^[0-9a-f]{64}$/;

// Mesmas versões vigentes já usadas por create-pix-order — termos e
// privacidade são do site inteiro, não específicos de um produto.
const TERMS_VERSION = "2026-08-01";
const PRIVACY_VERSION = "2026-08-01";

// ──────────────────────────────────  CORS  ──────────────────────────────────
// Idêntico a create-pix-order: ALLOWED_ORIGIN é OBRIGATÓRIO (checado no
// handler antes de qualquer processamento de negócio) — nunca wildcard,
// sempre a origem EXATA configurada.
function buildCorsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  headers.set("Vary", "Origin");
  if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function handlePreflight(origin: string | null): Response {
  const headers = buildCorsHeaders(origin);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  // authorization/x-client-info/apikey: esta função não usa nenhum deles
  // (não há login de cliente) — mesmo raciocínio de create-pix-order.
  headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  return new Response(null, { status: 204, headers });
}

// ────────────────────────────── Respostas JSON ──────────────────────────────
function jsonResponse(
  status: number,
  body: unknown,
  origin: string | null,
  extraHeaders?: Record<string, string>,
): Response {
  const headers = buildCorsHeaders(origin);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  origin: string | null,
  extraHeaders?: Record<string, string>,
): Response {
  return jsonResponse(status, { ok: false, error: { code, message } }, origin, extraHeaders);
}

// ─────────────────────────── Fetch com timeout ───────────────────────────────
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

// ─────────────────────────── IP confiável do cliente ─────────────────────────
const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Checagem de sanidade, não validação RFC completa — suficiente para
 * rejeitar lixo óbvio antes de usar o valor como chave de rate limiting. */
function isPlausibleIp(value: string): boolean {
  const ipv4Match = value.match(IPV4_REGEX);
  if (ipv4Match) {
    return ipv4Match.slice(1, 5).every((octet) => Number(octet) >= 0 && Number(octet) <= 255);
  }
  if (value.includes(":") && /^[0-9a-fA-F:]+$/.test(value)) {
    return true;
  }
  return false;
}

/**
 * Extrai o IP do cliente — idêntico a create-pix-order: cf-connecting-ip
 * primeiro (sinal mais confiável, sem garantia documentada de estar sempre
 * presente), x-forwarded-for como fallback de desenvolvimento local. Nunca
 * a única barreira: Turnstile e o limite por e-mail continuam valendo
 * independentemente deste valor (inclusive null). Nunca logado.
 */
function extractTrustedClientIp(req: Request): string | null {
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    const trimmed = cfConnectingIp.trim();
    if (isPlausibleIp(trimmed)) return trimmed;
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0].trim();
    if (isPlausibleIp(first)) return first;
  }

  return null;
}

// ────────────────────────────── HMAC (rate limit) ────────────────────────────
/**
 * HMAC-SHA256 em hex, via Web Crypto — nunca hash reversível, nunca
 * logado. Idêntico a create-pix-order, inclusive a separação de domínio
 * ("ip:"/"email:"/"request:") aplicada pelo chamador.
 */
async function computeHmacHex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ────────────────────────────── Turnstile ────────────────────────────────────
type TurnstileResult =
  | { kind: "valid" }
  | { kind: "invalid" }
  | { kind: "temporary" }
  | { kind: "provider_configuration_error" };

const TURNSTILE_CONFIGURATION_ERROR_CODES = new Set([
  "missing-input-secret",
  "invalid-input-secret",
  "bad-request",
]);
const TURNSTILE_TEMPORARY_ERROR_CODES = new Set(["internal-error"]);
const TURNSTILE_INVALID_ERROR_CODES = new Set([
  "missing-input-response",
  "invalid-input-response",
  "timeout-or-duplicate",
]);

/**
 * Verifica turnstile_token contra a API do Cloudflare — mesma
 * classificação de create-pix-order (nunca um booleano simples). A única
 * diferença é a action esperada: TURNSTILE_EXPECTED_ACTION_PRODUCT_ORDER
 * ("create_product_order"), não TURNSTILE_EXPECTED_ACTION ("create_pix_order").
 * Nunca loga o token, os error-codes brutos, o hostname/action recebidos
 * nem o corpo da resposta.
 */
async function verifyTurnstileToken(token: string, remoteIp: string | null): Promise<TurnstileResult> {
  const params = new URLSearchParams();
  params.set("secret", TURNSTILE_SECRET_KEY as string);
  params.set("response", token);
  if (remoteIp) params.set("remoteip", remoteIp);

  let response: Response;
  try {
    response = await fetchWithTimeout(
      TURNSTILE_VERIFY_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
      TURNSTILE_TIMEOUT_MS,
    );
  } catch {
    return { kind: "temporary" };
  }

  if (response.status === 401 || response.status === 403) {
    return { kind: "provider_configuration_error" };
  }
  if (isTemporaryStatus(response.status)) {
    return { kind: "temporary" };
  }
  if (!response.ok) {
    return { kind: "invalid" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "invalid" };
  }

  if (body === null || typeof body !== "object") return { kind: "invalid" };
  const record = body as Record<string, unknown>;

  const errorCodes = Array.isArray(record["error-codes"])
    ? (record["error-codes"] as unknown[]).filter((c): c is string => typeof c === "string")
    : [];

  if (errorCodes.some((c) => TURNSTILE_CONFIGURATION_ERROR_CODES.has(c))) {
    return { kind: "provider_configuration_error" };
  }
  if (errorCodes.some((c) => TURNSTILE_TEMPORARY_ERROR_CODES.has(c))) {
    return { kind: "temporary" };
  }
  if (errorCodes.some((c) => TURNSTILE_INVALID_ERROR_CODES.has(c))) {
    return { kind: "invalid" };
  }

  if (record.success !== true) return { kind: "invalid" };
  if (record.hostname !== TURNSTILE_EXPECTED_HOSTNAME) return { kind: "invalid" };
  if (record.action !== TURNSTILE_EXPECTED_ACTION_PRODUCT_ORDER) return { kind: "invalid" };

  return { kind: "valid" };
}

// ───────────────────────────── Validação do corpo ────────────────────────────
interface ProductOrderRequest {
  checkoutRequestId: string;
  checkoutAccessToken: string;
  customerName: string;
  customerEmail: string;
  productSlugs: string[];
  turnstileToken: string;
}

/**
 * Contrato de entrada (requisito 2): exatamente estas sete chaves — nenhum
 * campo de preço, nunca. product_slugs é só a LISTA de slugs escolhidos
 * (produto principal + bumps opcionais); validação de QUAL é o principal,
 * quais são bumps válidos, e o cálculo do valor cobrado acontecem
 * inteiramente em public.create_or_get_product_order_with_items() — esta
 * função só garante forma/tamanho, nunca decide preço nem quais slugs são
 * legítimos.
 */
function extractProductOrderRequest(body: unknown): ProductOrderRequest | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  const expectedKeys = [
    "checkout_request_id",
    "checkout_access_token",
    "customer_name",
    "customer_email",
    "product_slugs",
    "turnstile_token",
  ];
  if (keys.length !== expectedKeys.length || !expectedKeys.every((k) => keys.includes(k))) {
    return null;
  }

  const checkoutRequestIdRaw = record.checkout_request_id;
  if (typeof checkoutRequestIdRaw !== "string" || !UUID_REGEX.test(checkoutRequestIdRaw)) {
    return null;
  }

  const checkoutAccessTokenRaw = record.checkout_access_token;
  if (typeof checkoutAccessTokenRaw !== "string" || !CHECKOUT_ACCESS_TOKEN_REGEX.test(checkoutAccessTokenRaw)) {
    return null;
  }

  const customerNameRaw = record.customer_name;
  if (typeof customerNameRaw !== "string") return null;
  const customerName = customerNameRaw.trim();
  if (customerName.length < 2 || customerName.length > MAX_NAME_LENGTH) {
    return null;
  }

  const customerEmailRaw = record.customer_email;
  if (typeof customerEmailRaw !== "string") return null;
  const customerEmail = customerEmailRaw.trim();
  if (customerEmail.length === 0 || customerEmail.length > 254 || !EMAIL_REGEX.test(customerEmail)) {
    return null;
  }

  const productSlugsRaw = record.product_slugs;
  if (!Array.isArray(productSlugsRaw) || productSlugsRaw.length === 0 || productSlugsRaw.length > MAX_PRODUCT_SLUGS) {
    return null;
  }
  const productSlugs: string[] = [];
  for (const item of productSlugsRaw) {
    if (typeof item !== "string" || !PRODUCT_SLUG_REGEX.test(item)) return null;
    productSlugs.push(item);
  }

  const turnstileTokenRaw = record.turnstile_token;
  if (
    typeof turnstileTokenRaw !== "string" ||
    turnstileTokenRaw.length === 0 ||
    turnstileTokenRaw.length > MAX_TURNSTILE_TOKEN_LENGTH
  ) {
    return null;
  }

  return {
    checkoutRequestId: checkoutRequestIdRaw,
    checkoutAccessToken: checkoutAccessTokenRaw,
    customerName,
    customerEmail,
    productSlugs,
    turnstileToken: turnstileTokenRaw,
  };
}

// ─────────────────────── Classificação controlada de erros ──────────────────
type RpcErrorCategory =
  | "product_not_found_or_inactive"
  | "primary_product_required"
  | "duplicate_product"
  | "product_currency_mismatch"
  | "checkout_conflict"
  | "unknown_database_error";

interface ClassifiedRpcError {
  category: RpcErrorCategory;
  status: number;
  code: string;
  message: string;
}

/**
 * Mapeia as mensagens controladas lançadas por
 * create_or_get_product_order_with_items() (ver migrations 20260814_008/
 * 009) para códigos estáveis de resposta — nunca repassa a mensagem SQL
 * bruta ao cliente.
 */
function classifyRpcError(error: PostgrestError): ClassifiedRpcError {
  const message = typeof error.message === "string" ? error.message : "";

  if (message.includes("não existem ou estão inativos")) {
    return {
      category: "product_not_found_or_inactive",
      status: 422,
      code: "product_not_found_or_inactive",
      message: "Um ou mais produtos selecionados não estão disponíveis no momento.",
    };
  }
  if (message.includes("produto principal")) {
    // Cobre tanto "é obrigatório nesta compra" quanto "mais de um produto
    // principal informado" — as duas são, do ponto de vista do cliente, a
    // mesma categoria: a seleção de produtos não forma um pedido válido.
    return {
      category: "primary_product_required",
      status: 400,
      code: "primary_product_required",
      message: "O produto principal é obrigatório nesta compra.",
    };
  }
  if (message.includes("produto repetido")) {
    return {
      category: "duplicate_product",
      status: 400,
      code: "duplicate_product",
      message: "Um produto foi selecionado mais de uma vez.",
    };
  }
  if (message.includes("moedas diferentes")) {
    return {
      category: "product_currency_mismatch",
      status: 422,
      code: "product_currency_mismatch",
      message: "Não foi possível calcular o valor desta compra.",
    };
  }
  if (message.includes("já foi usado com") || message.includes("já pertence a um pedido de outro tipo")) {
    return {
      category: "checkout_conflict",
      status: 409,
      code: "checkout_conflict",
      message: "Esta tentativa de compra já foi iniciada com dados diferentes.",
    };
  }

  return {
    category: "unknown_database_error",
    status: 500,
    code: "database_error",
    message: "Não foi possível criar o pedido agora.",
  };
}

// ────────────────────── Validação do retorno do RPC ─────────────────────────
interface OrderRow {
  order_id: string;
  public_id: string;
  amount_cents: number;
  currency: string;
  customer_email: string;
  order_created_at: string;
  mercado_pago_order_id: string | null;
  mercado_pago_payment_id: string | null;
  // Ambiente PERSISTIDO no momento da criação do pedido — nunca a variável
  // de ambiente atual. resolvePixPayment/buildMercadoPagoRequestBody usam
  // exclusivamente este valor, mesmo raciocínio de create-pix-order.
  mercado_pago_environment: MercadoPagoEnvironment;
  item_slugs: string[];
  item_names: string[];
}

function isUuidString(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonEmptyStringArray(value: unknown, maxLength: number): value is string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxLength) return false;
  return value.every((item) => isNonEmptyString(item));
}

function isValidOrderResult(data: unknown): data is [OrderRow] {
  if (!Array.isArray(data) || data.length !== 1) return false;
  const row = data[0];
  if (row === null || typeof row !== "object" || Array.isArray(row)) return false;
  const record = row as Record<string, unknown>;

  if (!isUuidString(record.order_id)) return false;
  if (!isUuidString(record.public_id)) return false;
  if (
    typeof record.amount_cents !== "number" ||
    !Number.isSafeInteger(record.amount_cents) ||
    record.amount_cents <= 0
  ) {
    return false;
  }
  if (record.currency !== "BRL") return false;
  if (!isNonEmptyString(record.customer_email)) return false;
  if (typeof record.order_created_at !== "string" || Number.isNaN(Date.parse(record.order_created_at))) {
    return false;
  }
  if (record.mercado_pago_order_id !== null && !isNonEmptyString(record.mercado_pago_order_id)) return false;
  if (record.mercado_pago_payment_id !== null && !isNonEmptyString(record.mercado_pago_payment_id)) return false;
  if (record.mercado_pago_environment !== "test" && record.mercado_pago_environment !== "production") return false;
  if (!isNonEmptyStringArray(record.item_slugs, MAX_PRODUCT_SLUGS)) return false;
  if (!isNonEmptyStringArray(record.item_names, MAX_PRODUCT_SLUGS)) return false;
  if ((record.item_slugs as string[]).length !== (record.item_names as string[]).length) return false;

  return true;
}

// ──────────────────────── Validação do retorno de rate limit ─────────────────
interface RateLimitRow {
  allowed: boolean;
  retry_after_seconds: number;
}

function isValidRateLimitResult(data: unknown): data is [RateLimitRow] {
  if (!Array.isArray(data) || data.length !== 1) return false;
  const row = data[0];
  if (row === null || typeof row !== "object") return false;
  const record = row as Record<string, unknown>;
  return (
    typeof record.allowed === "boolean" &&
    typeof record.retry_after_seconds === "number" &&
    Number.isInteger(record.retry_after_seconds) &&
    record.retry_after_seconds >= 0
  );
}

// ────────────────────────── Validação do retorno de link ────────────────────
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

// ───────────────────────── Integração Mercado Pago ───────────────────────────
// A partir daqui até resolvePixPayment/linkMercadoPagoOrder/markOrderPaid:
// lógica de identidade/estado da Order do Mercado Pago copiada
// INTEGRALMENTE de create-pix-order, sem nenhuma alteração de
// comportamento — opera só sobre OrderRow (public_id, customer_email,
// mercado_pago_environment, mercado_pago_order_id, mercado_pago_payment_id,
// order_created_at, amount_cents), nunca sobre package_name/questions, o
// que já a torna 100% reaproveitável aqui.
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

/**
 * Requisito 7 (descrição fixa) + requisito 6 (total_amount vem de
 * order.amount_cents, formatado por centsToAmountString — nunca de um
 * campo de preço do corpo da requisição, que não existe neste contrato).
 * Usa EXCLUSIVAMENTE order.mercado_pago_environment (persistido) — nunca a
 * variável de ambiente atual — mesmo raciocínio de create-pix-order.
 */
function buildMercadoPagoRequestBody(order: OrderRow, amountString: string) {
  const payer =
    order.mercado_pago_environment === "test"
      ? { email: MERCADO_PAGO_TEST_PAYER_EMAIL, first_name: MERCADO_PAGO_TEST_PAYER_FIRST_NAME }
      : { email: order.customer_email };

  return {
    type: "online",
    processing_mode: "automatic",
    total_amount: amountString,
    // Requisito 10: idêntico ao que create-pix-order já usa — permite que
    // mercado-pago-webhook (não alterado) reconcilie pedidos deste fluxo
    // sem nenhuma mudança.
    external_reference: order.public_id,
    description: MERCADO_PAGO_ORDER_DESCRIPTION,
    payer,
    transactions: {
      payments: [
        {
          amount: amountString,
          payment_method: { id: "pix", type: "bank_transfer" },
        },
      ],
    },
  };
}

// ─────────────── Identidade da Order (independente do estado) ───────────────
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
  | { kind: "terminal"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string; mercadoPagoRequestId: string | null }
  | { kind: "state_conflict_with_identity"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string }
  | { kind: "identity_invalid" };

// mercadoPagoRequestId (3º parâmetro, opcional): header x-request-id da
// resposta HTTP que originou mpBody — usado SOMENTE para anexar ao kind
// "terminal" (instrumentação de diagnóstico, ver payment_terminal_state no
// handler). Não é segredo. Não participa de nenhuma validação: toda a
// lógica de identidade/estado abaixo é EXATAMENTE a mesma de antes.
function evaluateMercadoPagoOrderBody(
  mpBody: unknown,
  expected: IdentityExpected,
  mercadoPagoRequestId: string | null = null,
): EvaluatedOrder {
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
        mercadoPagoRequestId,
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

// ────────────────── Chamadas HTTP ao Mercado Pago (com timeout) ─────────────
// mercadoPagoRequestId: header x-request-id devolvido pelo Mercado Pago —
// NÃO é segredo (documentado por eles como identificador de suporte/
// diagnóstico), então é seguro logar. Presente em "ok"/"http_error" (ambos
// têm uma Response real); "network_error" nunca tem, por definição.
type MpFetchResult =
  | { kind: "ok"; body: unknown; mercadoPagoRequestId: string | null }
  | { kind: "http_error"; status: number; retryAfter: string | null; body: unknown; mercadoPagoRequestId: string | null }
  | { kind: "network_error" };

async function mpFetchJson(url: string, init: RequestInit): Promise<MpFetchResult> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, init, MERCADO_PAGO_TIMEOUT_MS);
  } catch {
    return { kind: "network_error" };
  }

  const mercadoPagoRequestId = response.headers.get("x-request-id");

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    return { kind: "http_error", status: response.status, retryAfter: response.headers.get("retry-after"), body, mercadoPagoRequestId };
  }
  return { kind: "ok", body, mercadoPagoRequestId };
}

// ─────────────────────── Busca (reconciliação, só produção) ─────────────────
interface SearchPaging {
  total: number;
  totalPages: number;
  offset: number;
  limit: number;
}

interface SearchEnvelope {
  data: unknown[];
  paging: SearchPaging;
}

type SearchCallResult =
  | { kind: "ok"; envelope: SearchEnvelope }
  | { kind: "temporary"; retryAfter: string | null }
  | { kind: "provider_configuration_error" }
  | { kind: "provider_request_error" }
  | { kind: "provider_error" };

function toSafeNonNegativeInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function extractSearchEnvelope(body: unknown): SearchEnvelope | null {
  if (body === null || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.data)) return null;

  const pagingRaw = record.paging;
  if (pagingRaw === null || typeof pagingRaw !== "object" || Array.isArray(pagingRaw)) return null;
  const pagingRecord = pagingRaw as Record<string, unknown>;

  const total = toSafeNonNegativeInteger(pagingRecord.total);
  const totalPages = toSafeNonNegativeInteger(pagingRecord.total_pages);
  const offset = toSafeNonNegativeInteger(pagingRecord.offset);
  const limit = toSafeNonNegativeInteger(pagingRecord.limit);
  if (total === null || totalPages === null || offset === null || limit === null) return null;

  if (limit === 0) return null;

  if (total === 0) {
    if (offset !== 0 || totalPages > 1) return null;
  } else {
    if (offset >= total) return null;
    if (totalPages < 1) return null;
  }

  if (total < record.data.length) return null;

  return { data: record.data, paging: { total, totalPages, offset, limit } };
}

function classifySearchResult(result: MpFetchResult): SearchCallResult {
  if (result.kind === "network_error") {
    return { kind: "temporary", retryAfter: null };
  }
  if (result.kind === "http_error") {
    if (result.status === 401 || result.status === 403) {
      return { kind: "provider_configuration_error" };
    }
    if (isTemporaryStatus(result.status)) {
      return { kind: "temporary", retryAfter: result.retryAfter };
    }
    return { kind: "provider_request_error" };
  }
  const envelope = extractSearchEnvelope(result.body);
  if (envelope === null) {
    return { kind: "provider_error" };
  }
  return { kind: "ok", envelope };
}

// ── Instrumentação TEMPORÁRIA (diagnóstico do incidente provider_state_conflict
//    em produção, 2026-08-15 ~22:03 UTC) ──────────────────────────────────────
//    Objetivo único: descobrir qual das 6 checagens que produzem
//    "provider_state_conflict" realmente disparou, sem afrouxar nenhuma
//    validação de identidade e sem confiar em nada do corpo do webhook (esta
//    instrumentação não toca no webhook). Só números/booleanos/enums curtos
//    já considerados seguros no restante deste arquivo (status/status_detail
//    já aparecem em outros logs de sucesso) — NUNCA token, e-mail, qr_code,
//    Pix copia-e-cola ou corpo completo. Remover depois que a causa exata for
//    confirmada em um novo incidente real (não overte aqui — nenhuma compra
//    nova foi feita para gerar esse próximo dado).
interface ConflictDiagnostics {
  reason:
    | "paging_total_lt_data_length"
    | "paging_total_zero_with_data"
    | "paging_total_one_data_mismatch"
    | "search_summary_invalid"
    | "detail_get_failed"
    | "detail_identity_invalid"
    | "unmapped_evaluated_kind"
    | "create_409_unrecognized_error_code";
  pagingTotal?: number;
  pagingTotalPages?: number;
  pagingOffset?: number;
  pagingLimit?: number;
  dataLength?: number;
  orderStatus?: string;
  orderStatusDetail?: string;
  paymentStatus?: string;
  paymentStatusDetail?: string;
  hasTransactions?: boolean;
  hasPayments?: boolean;
  paymentsLength?: number;
  hasPaymentMethod?: boolean;
  hasQrCode?: boolean;
  hasQrCodeBase64?: boolean;
  hasTicketUrl?: boolean;
  mercadoPagoErrorCode?: string | null;
}

/** Inspeciona defensivamente um item bruto de Order (sem nunca lançar) e
 * devolve só presença/tipo/enums curtos — nunca os valores de qr_code,
 * ticket_url ou qualquer dado do pagador. */
function snapshotOrderShape(item: unknown): Partial<ConflictDiagnostics> {
  if (item === null || typeof item !== "object") return {};
  const record = item as Record<string, unknown>;
  const snapshot: Partial<ConflictDiagnostics> = {};

  if (typeof record.status === "string") snapshot.orderStatus = record.status;
  if (typeof record.status_detail === "string") snapshot.orderStatusDetail = record.status_detail;

  const transactions = record.transactions;
  snapshot.hasTransactions = transactions !== undefined && transactions !== null;
  if (snapshot.hasTransactions && typeof transactions === "object" && !Array.isArray(transactions)) {
    const payments = (transactions as Record<string, unknown>).payments;
    snapshot.hasPayments = Array.isArray(payments);
    if (Array.isArray(payments)) {
      snapshot.paymentsLength = payments.length;
      const firstPayment = payments[0];
      if (firstPayment !== null && typeof firstPayment === "object") {
        const paymentRecord = firstPayment as Record<string, unknown>;
        if (typeof paymentRecord.status === "string") snapshot.paymentStatus = paymentRecord.status;
        if (typeof paymentRecord.status_detail === "string") snapshot.paymentStatusDetail = paymentRecord.status_detail;
        const paymentMethod = paymentRecord.payment_method;
        snapshot.hasPaymentMethod = paymentMethod !== undefined && paymentMethod !== null;
        if (snapshot.hasPaymentMethod && typeof paymentMethod === "object") {
          const pm = paymentMethod as Record<string, unknown>;
          snapshot.hasQrCode = typeof pm.qr_code === "string" && pm.qr_code.length > 0;
          snapshot.hasQrCodeBase64 = typeof pm.qr_code_base64 === "string" && pm.qr_code_base64.length > 0;
          snapshot.hasTicketUrl = typeof pm.ticket_url === "string" && pm.ticket_url.length > 0;
        }
      }
    }
  }

  return snapshot;
}

/**
 * Extrai SOMENTE o id de um item de /v1/orders/search — nunca usa o resto
 * do item para decidir identidade/estado (essa busca devolve uma
 * representação resumida; ver PATCH 2026-08-15: status_detail/payment.status
 * ausentes no resumo, confirmado via instrumentação em incidente real).
 * Validação defensiva idêntica à já usada em validateMercadoPagoOrderIdentity/
 * Shell para o campo id: existe, é string ou number, não é vazio.
 */
function extractOrderIdFromSearchItem(item: unknown): string | null {
  if (item === null || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const id = record.id;
  if ((typeof id !== "string" && typeof id !== "number") || String(id).length === 0) return null;
  return String(id);
}

type ReconcileResult =
  | { kind: "success_pending"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; qrCode: string; qrCodeBase64: string | null; ticketUrl: string | null }
  | { kind: "success_processing"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string }
  | { kind: "success_shell"; mercadoPagoOrderId: string; orderStatus: string; orderStatusDetail: string }
  | { kind: "success_processed"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string }
  | { kind: "terminal"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string; mercadoPagoRequestId: string | null }
  | { kind: "state_conflict_with_identity"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string }
  | { kind: "manual_reconciliation_required" }
  | { kind: "provider_state_conflict"; diagnostics: ConflictDiagnostics }
  | { kind: "not_found" }
  | { kind: "temporary"; retryAfter: string | null }
  | { kind: "provider_configuration_error" }
  | { kind: "provider_request_error" }
  | { kind: "provider_error" };

async function tryReconcileViaSearch(
  externalReference: string,
  orderCreatedAtIso: string,
  identityExpected: IdentityExpected,
): Promise<ReconcileResult> {
  const createdAtMs = Date.parse(orderCreatedAtIso);
  if (Number.isNaN(createdAtMs)) {
    return { kind: "provider_error" };
  }
  const beginDate = new Date(createdAtMs - 60 * 60 * 1000).toISOString();
  const endDate = new Date().toISOString();

  const url = new URL(MERCADO_PAGO_ORDERS_URL);
  url.searchParams.set("begin_date", beginDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set("external_reference", externalReference);
  url.searchParams.set("type", "online");
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "20");
  url.searchParams.set("sort_by", "created_date");
  url.searchParams.set("sort_order", "desc");

  const rawResult = await mpFetchJson(url.toString(), { method: "GET", headers: mpAuthHeaders() });
  const searchResult = classifySearchResult(rawResult);

  if (searchResult.kind === "temporary") return { kind: "temporary", retryAfter: searchResult.retryAfter };
  if (searchResult.kind === "provider_configuration_error") return { kind: "provider_configuration_error" };
  if (searchResult.kind === "provider_request_error") return { kind: "provider_request_error" };
  if (searchResult.kind === "provider_error") return { kind: "provider_error" };

  const { data, paging } = searchResult.envelope;
  const pagingDiagnostics = {
    pagingTotal: paging.total,
    pagingTotalPages: paging.totalPages,
    pagingOffset: paging.offset,
    pagingLimit: paging.limit,
    dataLength: data.length,
  };

  if (paging.total < data.length) {
    return { kind: "provider_state_conflict", diagnostics: { reason: "paging_total_lt_data_length", ...pagingDiagnostics } };
  }

  if (paging.total === 0) {
    return data.length === 0
      ? { kind: "not_found" }
      : { kind: "provider_state_conflict", diagnostics: { reason: "paging_total_zero_with_data", ...pagingDiagnostics } };
  }

  if (paging.total === 1) {
    if (data.length !== 1) {
      return { kind: "provider_state_conflict", diagnostics: { reason: "paging_total_one_data_mismatch", ...pagingDiagnostics } };
    }
  } else {
    return { kind: "manual_reconciliation_required" };
  }

  // ── PATCH 2026-08-15 (provider_state_conflict): o item de /v1/orders/search
  //    é uma representação RESUMIDA (paginada) — NUNCA a mesma forma do
  //    detalhe completo de GET /v1/orders/{id}. Confirmado via instrumentação
  //    em incidente real: status_detail (nível Order) e status/status_detail
  //    (nível payment) chegaram ausentes no resumo, o que reprovava
  //    corretamente validateMercadoPagoOrderIdentity/Shell (as duas exigem
  //    esses campos como string) mesmo quando a Order era genuína. A partir
  //    daqui usamos o item de busca SOMENTE para obter o id, e validamos
  //    identidade/estado (external_reference, total_amount, type,
  //    processing_mode, payment_method, status/status_detail, valor, QR
  //    Code) exclusivamente sobre o corpo COMPLETO de GET /v1/orders/{id} —
  //    mesma validação estrita de sempre, nenhuma checagem removida ou
  //    afrouxada, só a FONTE dos dados validados muda.
  const searchItemId = extractOrderIdFromSearchItem(data[0]);
  if (searchItemId === null) {
    return {
      kind: "provider_state_conflict",
      diagnostics: { reason: "search_summary_invalid", ...pagingDiagnostics },
    };
  }

  const detailResult = await mpFetchJson(
    `${MERCADO_PAGO_ORDERS_URL}/${encodeURIComponent(searchItemId)}`,
    { method: "GET", headers: mpAuthHeaders() },
  );

  if (detailResult.kind === "network_error") {
    return { kind: "temporary", retryAfter: null };
  }
  if (detailResult.kind === "http_error") {
    if (detailResult.status === 401 || detailResult.status === 403) return { kind: "provider_configuration_error" };
    if (isTemporaryStatus(detailResult.status)) return { kind: "temporary", retryAfter: detailResult.retryAfter };
    return {
      kind: "provider_state_conflict",
      diagnostics: { reason: "detail_get_failed", ...pagingDiagnostics },
    };
  }

  const only = evaluateMercadoPagoOrderBody(detailResult.body, identityExpected, detailResult.mercadoPagoRequestId);

  if (only.kind === "identity_invalid") {
    return {
      kind: "provider_state_conflict",
      diagnostics: { reason: "detail_identity_invalid", ...pagingDiagnostics, ...snapshotOrderShape(detailResult.body) },
    };
  }
  if (only.kind === "pending") {
    return {
      kind: "success_pending",
      mercadoPagoOrderId: only.mercadoPagoOrderId,
      mercadoPagoPaymentId: only.mercadoPagoPaymentId,
      qrCode: only.qrCode,
      qrCodeBase64: only.qrCodeBase64,
      ticketUrl: only.ticketUrl,
    };
  }
  if (only.kind === "processing") {
    return {
      kind: "success_processing",
      mercadoPagoOrderId: only.mercadoPagoOrderId,
      mercadoPagoPaymentId: only.mercadoPagoPaymentId,
      orderStatus: only.orderStatus,
      orderStatusDetail: only.orderStatusDetail,
      paymentStatus: only.paymentStatus,
      paymentStatusDetail: only.paymentStatusDetail,
    };
  }
  if (only.kind === "shell") {
    return { kind: "success_shell", mercadoPagoOrderId: only.mercadoPagoOrderId, orderStatus: only.orderStatus, orderStatusDetail: only.orderStatusDetail };
  }
  if (only.kind === "processed") {
    return { kind: "success_processed", mercadoPagoOrderId: only.mercadoPagoOrderId, mercadoPagoPaymentId: only.mercadoPagoPaymentId };
  }
  if (only.kind === "terminal") {
    return {
      kind: "terminal",
      mercadoPagoOrderId: only.mercadoPagoOrderId,
      mercadoPagoPaymentId: only.mercadoPagoPaymentId,
      orderStatus: only.orderStatus,
      orderStatusDetail: only.orderStatusDetail,
      paymentStatus: only.paymentStatus,
      paymentStatusDetail: only.paymentStatusDetail,
      mercadoPagoRequestId: only.mercadoPagoRequestId,
    };
  }
  if (only.kind === "state_conflict_with_identity") {
    return {
      kind: "state_conflict_with_identity",
      mercadoPagoOrderId: only.mercadoPagoOrderId,
      mercadoPagoPaymentId: only.mercadoPagoPaymentId,
    };
  }
  return {
    kind: "provider_state_conflict",
    diagnostics: { reason: "unmapped_evaluated_kind", ...pagingDiagnostics, ...snapshotOrderShape(detailResult.body) },
  };
}

// ─────────────────────────── Resolução final do Pix ──────────────────────────
type PixResolution =
  | { kind: "pending"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; qrCode: string; qrCodeBase64: string | null; ticketUrl: string | null }
  | { kind: "processing"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string }
  | { kind: "shell"; mercadoPagoOrderId: string; orderStatus: string; orderStatusDetail: string }
  | { kind: "incomplete_provider_response"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string }
  | { kind: "processed"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string }
  | { kind: "terminal"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string; mercadoPagoRequestId: string | null }
  | { kind: "state_conflict_with_identity"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string }
  | { kind: "temporary"; retryAfter: string | null }
  | { kind: "manual_reconciliation_required" }
  | { kind: "provider_state_conflict"; diagnostics: ConflictDiagnostics }
  | { kind: "provider_configuration_error" }
  | { kind: "payment_creation_failed_order_created" }
  | { kind: "idempotency_reconciliation_required" }
  | { kind: "provider_request_error" }
  | { kind: "linked_order_lookup_conflict" }
  | { kind: "ambiguous_creation_result" }
  | { kind: "provider_error" };

function resolutionFromEvaluation(evaluated: EvaluatedOrder): PixResolution {
  if (evaluated.kind === "pending") {
    return {
      kind: "pending",
      mercadoPagoOrderId: evaluated.mercadoPagoOrderId,
      mercadoPagoPaymentId: evaluated.mercadoPagoPaymentId,
      qrCode: evaluated.qrCode,
      qrCodeBase64: evaluated.qrCodeBase64,
      ticketUrl: evaluated.ticketUrl,
    };
  }
  if (evaluated.kind === "processing") {
    return {
      kind: "processing",
      mercadoPagoOrderId: evaluated.mercadoPagoOrderId,
      mercadoPagoPaymentId: evaluated.mercadoPagoPaymentId,
      orderStatus: evaluated.orderStatus,
      orderStatusDetail: evaluated.orderStatusDetail,
      paymentStatus: evaluated.paymentStatus,
      paymentStatusDetail: evaluated.paymentStatusDetail,
    };
  }
  if (evaluated.kind === "shell") {
    return { kind: "shell", mercadoPagoOrderId: evaluated.mercadoPagoOrderId, orderStatus: evaluated.orderStatus, orderStatusDetail: evaluated.orderStatusDetail };
  }
  if (evaluated.kind === "incomplete_provider_response") {
    return { kind: "incomplete_provider_response", mercadoPagoOrderId: evaluated.mercadoPagoOrderId, mercadoPagoPaymentId: evaluated.mercadoPagoPaymentId };
  }
  if (evaluated.kind === "processed") {
    return { kind: "processed", mercadoPagoOrderId: evaluated.mercadoPagoOrderId, mercadoPagoPaymentId: evaluated.mercadoPagoPaymentId };
  }
  if (evaluated.kind === "terminal") {
    return {
      kind: "terminal",
      mercadoPagoOrderId: evaluated.mercadoPagoOrderId,
      mercadoPagoPaymentId: evaluated.mercadoPagoPaymentId,
      orderStatus: evaluated.orderStatus,
      orderStatusDetail: evaluated.orderStatusDetail,
      paymentStatus: evaluated.paymentStatus,
      paymentStatusDetail: evaluated.paymentStatusDetail,
      mercadoPagoRequestId: evaluated.mercadoPagoRequestId,
    };
  }
  if (evaluated.kind === "state_conflict_with_identity") {
    return { kind: "state_conflict_with_identity", mercadoPagoOrderId: evaluated.mercadoPagoOrderId, mercadoPagoPaymentId: evaluated.mercadoPagoPaymentId };
  }
  return { kind: "provider_error" }; // identity_invalid
}

function resolutionFromReconcile(r: ReconcileResult): PixResolution | { kind: "not_found" } {
  switch (r.kind) {
    case "success_pending":
      return { kind: "pending", mercadoPagoOrderId: r.mercadoPagoOrderId, mercadoPagoPaymentId: r.mercadoPagoPaymentId, qrCode: r.qrCode, qrCodeBase64: r.qrCodeBase64, ticketUrl: r.ticketUrl };
    case "success_processing":
      return { kind: "processing", mercadoPagoOrderId: r.mercadoPagoOrderId, mercadoPagoPaymentId: r.mercadoPagoPaymentId, orderStatus: r.orderStatus, orderStatusDetail: r.orderStatusDetail, paymentStatus: r.paymentStatus, paymentStatusDetail: r.paymentStatusDetail };
    case "success_shell":
      return { kind: "shell", mercadoPagoOrderId: r.mercadoPagoOrderId, orderStatus: r.orderStatus, orderStatusDetail: r.orderStatusDetail };
    case "success_processed":
      return { kind: "processed", mercadoPagoOrderId: r.mercadoPagoOrderId, mercadoPagoPaymentId: r.mercadoPagoPaymentId };
    case "terminal":
      return { kind: "terminal", mercadoPagoOrderId: r.mercadoPagoOrderId, mercadoPagoPaymentId: r.mercadoPagoPaymentId, orderStatus: r.orderStatus, orderStatusDetail: r.orderStatusDetail, paymentStatus: r.paymentStatus, paymentStatusDetail: r.paymentStatusDetail, mercadoPagoRequestId: r.mercadoPagoRequestId };
    case "state_conflict_with_identity":
      return { kind: "state_conflict_with_identity", mercadoPagoOrderId: r.mercadoPagoOrderId, mercadoPagoPaymentId: r.mercadoPagoPaymentId };
    case "manual_reconciliation_required":
      return { kind: "manual_reconciliation_required" };
    case "provider_state_conflict":
      return { kind: "provider_state_conflict", diagnostics: r.diagnostics };
    case "temporary":
      return { kind: "temporary", retryAfter: r.retryAfter };
    case "provider_configuration_error":
      return { kind: "provider_configuration_error" };
    case "provider_request_error":
      return { kind: "provider_request_error" };
    case "provider_error":
      return { kind: "provider_error" };
    case "not_found":
      return { kind: "not_found" };
  }
}

function extractMercadoPagoErrorCode(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.code === "string") return record.code;

  const cause = record.cause;
  if (Array.isArray(cause)) {
    for (const item of cause) {
      if (item !== null && typeof item === "object") {
        const itemRecord = item as Record<string, unknown>;
        if (typeof itemRecord.code === "string") return itemRecord.code;
      }
    }
  }
  return null;
}

/**
 * Resolve o pagamento Pix da Order do Mercado Pago para este pedido —
 * cópia INTEGRAL da mesma função em create-pix-order (mesmo comportamento,
 * mesmos ramos, mesma documentação de cada decisão), reaproveitável sem
 * nenhuma mudança porque opera só sobre OrderRow (campos genéricos de
 * pedido/pagamento), nunca sobre package_name/questions.
 */
async function resolvePixPayment(
  order: OrderRow,
  checkoutRequestId: string,
  amountString: string,
): Promise<PixResolution> {
  const environment = order.mercado_pago_environment;
  const baseIdentityExpected: IdentityExpected = { externalReference: order.public_id, amountString };

  if (order.mercado_pago_order_id) {
    const identityExpected: IdentityExpected = {
      ...baseIdentityExpected,
      expectedMercadoPagoOrderId: order.mercado_pago_order_id,
      expectedMercadoPagoPaymentId: order.mercado_pago_payment_id,
    };
    const result = await mpFetchJson(
      `${MERCADO_PAGO_ORDERS_URL}/${encodeURIComponent(order.mercado_pago_order_id)}`,
      { method: "GET", headers: mpAuthHeaders() },
    );
    if (result.kind === "network_error") return { kind: "temporary", retryAfter: null };
    if (result.kind === "http_error") {
      if (result.status === 401 || result.status === 403) return { kind: "provider_configuration_error" };
      if (isTemporaryStatus(result.status)) return { kind: "temporary", retryAfter: result.retryAfter };
      return { kind: "linked_order_lookup_conflict" };
    }
    return resolutionFromEvaluation(evaluateMercadoPagoOrderBody(result.body, identityExpected, result.mercadoPagoRequestId));
  }

  if (environment === "production") {
    const reconciled = await tryReconcileViaSearch(order.public_id, order.order_created_at, baseIdentityExpected);
    const mapped = resolutionFromReconcile(reconciled);
    if (mapped.kind !== "not_found") return mapped;
  }

  const createResult = await mpFetchJson(MERCADO_PAGO_ORDERS_URL, {
    method: "POST",
    headers: mpAuthHeaders({
      "Content-Type": "application/json",
      "X-Idempotency-Key": checkoutRequestId,
    }),
    body: JSON.stringify(buildMercadoPagoRequestBody(order, amountString)),
  });

  if (createResult.kind === "network_error") {
    if (environment === "production") {
      const afterNetworkError = await tryReconcileViaSearch(order.public_id, order.order_created_at, baseIdentityExpected);
      const mapped = resolutionFromReconcile(afterNetworkError);
      if (mapped.kind !== "not_found") return mapped;
    }
    return { kind: "temporary", retryAfter: null };
  }

  if (createResult.kind === "http_error") {
    if (createResult.status === 401 || createResult.status === 403) return { kind: "provider_configuration_error" };
    if (isTemporaryStatus(createResult.status)) {
      return { kind: "temporary", retryAfter: createResult.retryAfter };
    }
    if (createResult.status === 402) {
      const evaluated402 = evaluateMercadoPagoOrderBody(createResult.body, baseIdentityExpected, createResult.mercadoPagoRequestId);
      if (evaluated402.kind !== "identity_invalid") {
        return resolutionFromEvaluation(evaluated402);
      }

      if (environment === "production") {
        const after402 = await tryReconcileViaSearch(order.public_id, order.order_created_at, baseIdentityExpected);
        const mapped = resolutionFromReconcile(after402);
        if (mapped.kind !== "not_found") return mapped;
        return { kind: "manual_reconciliation_required" };
      }

      return { kind: "payment_creation_failed_order_created" };
    }
    if (createResult.status === 409) {
      const errorCode = extractMercadoPagoErrorCode(createResult.body);

      if (errorCode === "idempotency_key_already_used") {
        if (environment === "production") {
          const after409 = await tryReconcileViaSearch(order.public_id, order.order_created_at, baseIdentityExpected);
          const mapped = resolutionFromReconcile(after409);
          if (mapped.kind !== "not_found") return mapped;
          return { kind: "manual_reconciliation_required" };
        }
        return { kind: "idempotency_reconciliation_required" };
      }

      return {
        kind: "provider_state_conflict",
        diagnostics: { reason: "create_409_unrecognized_error_code", mercadoPagoErrorCode: errorCode },
      };
    }
    return { kind: "provider_request_error" };
  }

  const evaluatedCreate = evaluateMercadoPagoOrderBody(createResult.body, baseIdentityExpected, createResult.mercadoPagoRequestId);
  if (evaluatedCreate.kind !== "identity_invalid") {
    return resolutionFromEvaluation(evaluatedCreate);
  }

  if (environment === "production") {
    const afterAmbiguousCreate = await tryReconcileViaSearch(order.public_id, order.order_created_at, baseIdentityExpected);
    const mapped = resolutionFromReconcile(afterAmbiguousCreate);
    if (mapped.kind !== "not_found") return mapped;
    return { kind: "manual_reconciliation_required" };
  }

  return { kind: "ambiguous_creation_result" };
}

// ────────────────────── Vinculação (via RPC, nunca UPDATE direto) ───────────
type LinkResult =
  | { kind: "linked" }
  | { kind: "conflict" }
  | { kind: "temporary_error" };

/**
 * Chama public.link_mercado_pago_order() — a MESMA RPC já usada por
 * create-pix-order, reaproveitada sem alteração (ela não sabe nem precisa
 * saber qual Edge Function a chamou).
 */
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
      console.error("[create-product-order] Falha ao vincular o ID da Order do Mercado Pago ao pedido.", {
        category: isConflict ? "order_link_conflict" : "order_link_rpc_error",
        postgres_code: linkError.code ?? null,
      });
      return { kind: isConflict ? "conflict" : "temporary_error" };
    }

    if (!isValidLinkResultShape(linkData)) {
      console.error("[create-product-order] Resposta da RPC de vinculação em formato inesperado.", {
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
      console.error("[create-product-order] Resposta da RPC de vinculação não confere com os IDs solicitados.", {
        category: "link_rpc_value_mismatch",
      });
      return { kind: "conflict" };
    }

    return { kind: "linked" };
  } catch (caught) {
    console.error("[create-product-order] Exceção inesperada ao vincular o ID da Order ao pedido.", {
      category: "order_link_thrown_exception",
      error_type: caught instanceof Error ? caught.name : "unknown",
    });
    return { kind: "temporary_error" };
  }
}

// ─────── Persistência do pagamento confirmado (via RPC, nunca UPDATE direto) ──
type MarkOrderPaidResult =
  | { kind: "paid" }
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

/**
 * Chama public.mark_order_paid() — a MESMA RPC já usada por
 * create-pix-order (genérica: não referencia package_id, questions nem
 * nada de tarô), reaproveitada sem alteração.
 */
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
      console.error("[create-product-order] Falha ao persistir a confirmação de pagamento.", {
        category: isConflictMessage ? "mark_order_paid_conflict" : "mark_order_paid_rpc_error",
        postgres_code: markError.code ?? null,
      });
      return { kind: isConflictMessage ? "conflict" : "temporary_error" };
    }

    if (!isValidMarkOrderPaidResultShape(markData)) {
      console.error("[create-product-order] Resposta da RPC de confirmação de pagamento em formato inesperado.", {
        category: "invalid_mark_order_paid_response",
      });
      return { kind: "temporary_error" };
    }

    const mark = markData[0];
    if (mark.order_id !== orderId) {
      console.error("[create-product-order] Resposta da RPC de confirmação de pagamento não confere com o pedido solicitado.", {
        category: "mark_order_paid_value_mismatch",
      });
      return { kind: "conflict" };
    }

    return { kind: "paid" };
  } catch (caught) {
    console.error("[create-product-order] Exceção inesperada ao persistir a confirmação de pagamento.", {
      category: "mark_order_paid_thrown_exception",
      error_type: caught instanceof Error ? caught.name : "unknown",
    });
    return { kind: "temporary_error" };
  }
}

// ──────────────────────────────── Handler ───────────────────────────────────
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return handlePreflight(origin);
  }

  if (req.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "Método não permitido.", origin, {
      Allow: "POST, OPTIONS",
    });
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !MERCADO_PAGO_ACCESS_TOKEN ||
    !MERCADO_PAGO_ENVIRONMENT ||
    !TURNSTILE_SECRET_KEY ||
    !TURNSTILE_EXPECTED_HOSTNAME ||
    !TURNSTILE_EXPECTED_ACTION_PRODUCT_ORDER ||
    !RATE_LIMIT_HASH_SECRET ||
    !ALLOWED_ORIGIN
  ) {
    return errorResponse(500, "server_misconfigured", "Configuração do servidor incompleta.", origin);
  }

  if (MERCADO_PAGO_ENVIRONMENT !== "test" && MERCADO_PAGO_ENVIRONMENT !== "production") {
    return errorResponse(500, "server_misconfigured", "Configuração do servidor incompleta.", origin);
  }
  const mercadoPagoEnvironment: MercadoPagoEnvironment = MERCADO_PAGO_ENVIRONMENT;

  if (RATE_LIMIT_HASH_SECRET.length < MIN_RATE_LIMIT_HASH_SECRET_LENGTH) {
    return errorResponse(500, "server_misconfigured", "Configuração do servidor incompleta.", origin);
  }

  // Origem diferente da configurada NUNCA processa a chamada normal —
  // mesmo raciocínio de create-pix-order (CORS é proteção de navegador,
  // não autenticação; requisições sem Origin — server-to-server — passam).
  if (origin !== null && origin !== ALLOWED_ORIGIN) {
    return errorResponse(403, "origin_not_allowed", "Origem não permitida.", origin);
  }

  const contentType = req.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return errorResponse(415, "unsupported_media_type", "Content-Type deve ser application/json.", origin);
  }

  const declaredLength = req.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_BODY_BYTES) {
      return errorResponse(413, "payload_too_large", "Corpo da requisição excede o limite permitido.", origin);
    }
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return errorResponse(400, "invalid_body", "Não foi possível ler o corpo da requisição.", origin);
  }

  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return errorResponse(413, "payload_too_large", "Corpo da requisição excede o limite permitido.", origin);
  }

  if (rawBody.trim().length === 0) {
    return errorResponse(400, "invalid_body", "Corpo da requisição vazio.", origin);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, "invalid_json", "Corpo da requisição não é um JSON válido.", origin);
  }

  const orderRequest = extractProductOrderRequest(parsedBody);
  if (orderRequest === null) {
    return errorResponse(
      400,
      "invalid_request",
      'Corpo inválido. Esperado exatamente {"checkout_request_id", "checkout_access_token", "customer_name", "customer_email", "product_slugs", "turnstile_token"}.',
      origin,
    );
  }

  const remoteIp = extractTrustedClientIp(req);

  // ── Turnstile: verifica ANTES de tocar no banco. Nunca loga o token, o
  //    hostname/action recebidos nem o corpo da resposta.
  const turnstileResult = await verifyTurnstileToken(orderRequest.turnstileToken, remoteIp);
  if (turnstileResult.kind === "temporary") {
    console.error("[create-product-order] Verificação Turnstile temporariamente indisponível.", {
      category: "turnstile_temporarily_unavailable",
    });
    return errorResponse(
      503,
      "human_verification_temporarily_unavailable",
      "Não foi possível confirmar a verificação de segurança agora. Tente novamente em instantes.",
      origin,
    );
  }
  if (turnstileResult.kind === "provider_configuration_error") {
    console.error("[create-product-order] Configuração do Turnstile rejeitada pelo Cloudflare.", {
      category: "turnstile_provider_configuration_error",
    });
    return errorResponse(500, "server_misconfigured", "Configuração do servidor incompleta.", origin);
  }
  if (turnstileResult.kind === "invalid") {
    console.error("[create-product-order] Verificação Turnstile falhou.", { category: "turnstile_verification_failed" });
    return errorResponse(403, "human_verification_failed", "Não foi possível confirmar a verificação de segurança.", origin);
  }

  // ── Rate limiting: MESMA RPC/tabelas de create-pix-order (ver cabeçalho
  //    do arquivo) — hashes com separação de domínio, nunca logados.
  const normalizedEmailForRateLimit = orderRequest.customerEmail.trim().toLowerCase();
  const ipHash = remoteIp !== null ? await computeHmacHex(RATE_LIMIT_HASH_SECRET, `ip:${remoteIp}`) : null;
  const emailHash = await computeHmacHex(RATE_LIMIT_HASH_SECRET, `email:${normalizedEmailForRateLimit}`);
  const requestHash = await computeHmacHex(
    RATE_LIMIT_HASH_SECRET,
    `request:${orderRequest.checkoutRequestId}:email:${normalizedEmailForRateLimit}:environment:${mercadoPagoEnvironment}`,
  );

  let rateLimitData: unknown;
  let rateLimitError: PostgrestError | null;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const result = await supabase.rpc("record_checkout_attempt", {
      p_ip_hash: ipHash,
      p_email_hash: emailHash,
      p_request_hash: requestHash,
    });
    rateLimitData = result.data;
    rateLimitError = result.error;
  } catch (caught) {
    console.error("[create-product-order] Exceção inesperada ao verificar limite de tentativas.", {
      category: "rate_limit_thrown_exception",
      error_type: caught instanceof Error ? caught.name : "unknown",
    });
    return errorResponse(500, "database_error", "Não foi possível processar o pedido agora.", origin);
  }

  if (rateLimitError) {
    console.error("[create-product-order] RPC de limite de tentativas falhou.", {
      category: "rate_limit_rpc_error",
      postgres_code: rateLimitError.code ?? null,
    });
    return errorResponse(500, "database_error", "Não foi possível processar o pedido agora.", origin);
  }

  if (!isValidRateLimitResult(rateLimitData)) {
    console.error("[create-product-order] Resposta da RPC de limite de tentativas em formato inesperado.", {
      category: "invalid_rate_limit_response",
    });
    return errorResponse(500, "database_error", "Não foi possível processar o pedido agora.", origin);
  }

  const rateLimit = rateLimitData[0];
  if (!rateLimit.allowed) {
    console.error("[create-product-order] Limite de tentativas excedido.", { category: "rate_limit_exceeded" });
    const extraHeaders: Record<string, string> = {};
    if (rateLimit.retry_after_seconds > 0) extraHeaders["Retry-After"] = String(rateLimit.retry_after_seconds);
    return errorResponse(
      429,
      "rate_limit_exceeded",
      "Muitas tentativas em pouco tempo. Tente novamente em instantes.",
      origin,
      extraHeaders,
    );
  }

  // ── Criação/recuperação idempotente do pedido (requisitos 4/5/8): ÚNICA
  //    fonte de verdade para validar produtos e calcular amount_cents é a
  //    RPC — nenhum preço é lido do corpo da requisição em nenhum ponto
  //    deste arquivo.
  let data: unknown;
  let error: PostgrestError | null;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const rpcResult = await supabase.rpc("create_or_get_product_order_with_items", {
      p_checkout_request_id: orderRequest.checkoutRequestId,
      p_checkout_access_token: orderRequest.checkoutAccessToken,
      p_product_slugs: orderRequest.productSlugs,
      p_customer_name: orderRequest.customerName,
      p_customer_email: orderRequest.customerEmail,
      p_terms_version: TERMS_VERSION,
      p_privacy_version: PRIVACY_VERSION,
      p_mercado_pago_environment: mercadoPagoEnvironment,
    });
    data = rpcResult.data;
    error = rpcResult.error;
  } catch (caught) {
    console.error("[create-product-order] Exceção inesperada ao criar/recuperar o pedido.", {
      category: "rpc_thrown_exception",
      error_type: caught instanceof Error ? caught.name : "unknown",
    });
    return errorResponse(500, "database_error", "Não foi possível criar o pedido agora.", origin);
  }

  if (error) {
    const classified = classifyRpcError(error);
    console.error("[create-product-order] RPC de criação/recuperação de pedido falhou.", {
      category: classified.category,
      postgres_code: error.code ?? null,
    });
    return errorResponse(classified.status, classified.code, classified.message, origin);
  }

  if (!isValidOrderResult(data)) {
    console.error("[create-product-order] Resposta do RPC em formato inesperado.", {
      category: "invalid_rpc_response",
    });
    return errorResponse(500, "database_error", "Não foi possível criar o pedido agora.", origin);
  }

  const order = data[0];
  // Requisito 6: total_amount enviado ao Mercado Pago vem SEMPRE daqui —
  // order.amount_cents, devolvido pela RPC, nunca de um campo do corpo da
  // requisição (que não existe neste contrato).
  const amountString = centsToAmountString(order.amount_cents);

  const resolution = await resolvePixPayment(order, orderRequest.checkoutRequestId, amountString);

  if (resolution.kind === "temporary") {
    console.error("[create-product-order] Mercado Pago temporariamente indisponível.", {
      category: "mp_temporarily_unavailable",
    });
    const extraHeaders: Record<string, string> = {};
    if (resolution.retryAfter) extraHeaders["Retry-After"] = resolution.retryAfter;
    return errorResponse(
      503,
      "payment_provider_temporarily_unavailable",
      "O provedor de pagamento está temporariamente indisponível. Tente novamente em instantes.",
      origin,
      extraHeaders,
    );
  }

  if (resolution.kind === "manual_reconciliation_required") {
    console.error("[create-product-order] Reconciliação automática não encontrou uma correspondência única.", {
      category: "manual_reconciliation_required",
    });
    return errorResponse(
      409,
      "manual_reconciliation_required",
      "Não foi possível confirmar automaticamente este pagamento. Tente novamente mais tarde ou entre em contato.",
      origin,
    );
  }

  if (resolution.kind === "provider_state_conflict") {
    // Instrumentação temporária de diagnóstico (ver ConflictDiagnostics) —
    // só números/enums curtos/booleanos, nunca token/e-mail/qr_code/corpo.
    console.error("[create-product-order] Order encontrada com identidade/estado inconsistente.", {
      category: "provider_state_conflict",
      ...resolution.diagnostics,
    });
    return errorResponse(
      409,
      "provider_state_conflict",
      "Encontramos uma inconsistência ao confirmar este pagamento. Nossa equipe foi notificada.",
      origin,
    );
  }

  if (resolution.kind === "provider_configuration_error") {
    console.error("[create-product-order] Credenciais do Mercado Pago rejeitadas (401/403).", {
      category: "mp_provider_configuration_error",
    });
    return errorResponse(500, "payment_provider_configuration_error", "Não foi possível processar o pagamento agora.", origin);
  }

  if (resolution.kind === "provider_error") {
    console.error("[create-product-order] Não foi possível confirmar a Order no Mercado Pago.", {
      category: "mp_provider_error",
    });
    return errorResponse(
      502,
      "payment_provider_error",
      "Não foi possível iniciar o pagamento agora. Tente novamente em instantes, com os mesmos dados.",
      origin,
    );
  }

  if (resolution.kind === "provider_request_error") {
    console.error("[create-product-order] O Mercado Pago recusou definitivamente a requisição.", {
      category: "mp_provider_request_error",
    });
    return errorResponse(
      422,
      "payment_request_rejected",
      "Não foi possível processar esta solicitação de pagamento. Inicie uma nova tentativa de compra.",
      origin,
    );
  }

  if (resolution.kind === "idempotency_reconciliation_required") {
    console.error("[create-product-order] Chave de idempotência já utilizada, sem pesquisa confiável disponível (ambiente de teste).", {
      category: "mp_idempotency_reconciliation_required",
    });
    return errorResponse(
      409,
      "idempotency_reconciliation_required",
      "Não foi possível confirmar automaticamente este pagamento. Não tente novamente automaticamente — entre em contato com o suporte.",
      origin,
    );
  }

  if (resolution.kind === "payment_creation_failed_order_created") {
    console.error("[create-product-order] POST recusado (402) sem identidade confirmável no corpo.", {
      category: "mp_payment_creation_failed_order_created",
    });
    return errorResponse(
      409,
      "payment_creation_failed_order_created",
      "Não foi possível confirmar se o pagamento foi criado. Não tente novamente automaticamente — entre em contato com o suporte.",
      origin,
    );
  }

  if (resolution.kind === "ambiguous_creation_result") {
    console.error("[create-product-order] POST devolveu 2xx com corpo ambíguo, sem identidade confirmável.", {
      category: "mp_ambiguous_creation_result",
    });
    return errorResponse(
      409,
      "ambiguous_creation_result",
      "Não foi possível confirmar se o pagamento foi criado. Não tente novamente automaticamente — entre em contato com o suporte.",
      origin,
    );
  }

  if (resolution.kind === "linked_order_lookup_conflict") {
    console.error("[create-product-order] Falha ao consultar uma Order já vinculada localmente.", {
      category: "mp_linked_order_lookup_conflict",
    });
    return errorResponse(
      409,
      "manual_reconciliation_required",
      "Não foi possível confirmar automaticamente este pagamento. Tente novamente mais tarde ou entre em contato.",
      origin,
    );
  }

  const paymentIdToLink = resolution.kind === "shell" ? null : resolution.mercadoPagoPaymentId;
  const linkResult = await linkMercadoPagoOrder(order.order_id, resolution.mercadoPagoOrderId, paymentIdToLink);

  if (linkResult.kind === "conflict") {
    return errorResponse(
      409,
      "manual_reconciliation_required",
      "Não foi possível confirmar automaticamente este pagamento. Tente novamente mais tarde ou entre em contato.",
      origin,
    );
  }

  if (linkResult.kind === "temporary_error") {
    return errorResponse(
      500,
      "order_link_persistence_failed",
      "O pagamento foi iniciado, mas não foi possível confirmar o registro agora. Tente novamente com os mesmos dados.",
      origin,
    );
  }

  if (resolution.kind === "terminal") {
    // Instrumentação temporária: só os 4 campos de status já presentes em
    // resolution.terminal (enums curtos do Mercado Pago) + mercadoPagoRequestId
    // (header x-request-id — NÃO é segredo, é o identificador que a própria
    // documentação do Mercado Pago recomenda usar em contato com o suporte
    // deles para casos como processing_error) — nunca e-mail, QR Code, Pix,
    // token, payer, Access Token ou corpo completo.
    console.error("[create-product-order] Pagamento em estado terminal — não pagável.", {
      category: "payment_terminal_state",
      orderStatus: resolution.orderStatus,
      orderStatusDetail: resolution.orderStatusDetail,
      paymentStatus: resolution.paymentStatus,
      paymentStatusDetail: resolution.paymentStatusDetail,
      mercadoPagoRequestId: resolution.mercadoPagoRequestId,
    });
    return errorResponse(
      409,
      "payment_not_payable",
      "Este pagamento não pode mais ser concluído. Inicie uma nova compra com um novo checkout_request_id.",
      origin,
    );
  }

  if (resolution.kind === "state_conflict_with_identity") {
    console.error("[create-product-order] Identidade confirmada, mas estado da Order/payment não reconhecido.", {
      category: "mp_state_conflict_with_identity",
    });
    return errorResponse(
      409,
      "manual_reconciliation_required",
      "Não foi possível confirmar automaticamente este pagamento. Tente novamente mais tarde ou entre em contato.",
      origin,
    );
  }

  // Resumo do pedido devolvido ao cliente — "items" no lugar de
  // package_name/question_count (que não existem neste fluxo): um par
  // slug/name por produto efetivamente comprado (principal + bumps),
  // exatamente na mesma ordem devolvida pela RPC.
  const orderSummary = {
    public_id: order.public_id,
    amount_cents: order.amount_cents,
    currency: order.currency,
    items: order.item_slugs.map((slug, index) => ({ slug, name: order.item_names[index] })),
  };

  if (resolution.kind === "incomplete_provider_response") {
    console.error("[create-product-order] Resposta do Mercado Pago incompleta para uma Order com pagamento já conhecido localmente.", {
      category: "mp_incomplete_provider_response",
    });
    return errorResponse(
      503,
      "incomplete_provider_response",
      "Não foi possível confirmar o estado do pagamento agora. Tente novamente em instantes.",
      origin,
    );
  }

  if (resolution.kind === "shell") {
    return jsonResponse(
      202,
      {
        ok: true,
        order: orderSummary,
        payment: {
          mercado_pago_order_id: resolution.mercadoPagoOrderId,
          mercado_pago_payment_id: null,
          order_status: resolution.orderStatus,
          order_status_detail: resolution.orderStatusDetail,
          payment_status: null,
          payment_status_detail: null,
          pix: null,
        },
      },
      origin,
    );
  }

  if (resolution.kind === "processing") {
    return jsonResponse(
      202,
      {
        ok: true,
        order: orderSummary,
        payment: {
          mercado_pago_order_id: resolution.mercadoPagoOrderId,
          mercado_pago_payment_id: resolution.mercadoPagoPaymentId,
          order_status: resolution.orderStatus,
          order_status_detail: resolution.orderStatusDetail,
          payment_status: resolution.paymentStatus,
          payment_status_detail: resolution.paymentStatusDetail,
          pix: null,
        },
      },
      origin,
    );
  }

  if (resolution.kind === "processed") {
    const markResult = await markOrderPaid(
      order.order_id,
      resolution.mercadoPagoOrderId,
      resolution.mercadoPagoPaymentId,
      order.amount_cents,
    );

    if (markResult.kind === "temporary_error") {
      console.error("[create-product-order] Não foi possível persistir a confirmação de pagamento agora.", {
        category: "mark_order_paid_temporary_error",
      });
      return errorResponse(
        503,
        "payment_confirmation_persistence_failed",
        "O pagamento foi identificado, mas não foi possível confirmar o registro agora. Tente novamente em instantes.",
        origin,
      );
    }

    if (markResult.kind === "conflict") {
      console.error("[create-product-order] Divergência ao persistir a confirmação de pagamento.", {
        category: "mark_order_paid_conflict",
      });
      return errorResponse(
        409,
        "manual_reconciliation_required",
        "Não foi possível confirmar automaticamente este pagamento. Tente novamente mais tarde ou entre em contato.",
        origin,
      );
    }

    return jsonResponse(
      200,
      {
        ok: true,
        order: orderSummary,
        payment: {
          mercado_pago_order_id: resolution.mercadoPagoOrderId,
          mercado_pago_payment_id: resolution.mercadoPagoPaymentId,
          status: "processed",
          status_detail: "accredited",
          pix: null,
        },
      },
      origin,
    );
  }

  // resolution.kind === "pending"
  return jsonResponse(
    200,
    {
      ok: true,
      order: orderSummary,
      payment: {
        mercado_pago_order_id: resolution.mercadoPagoOrderId,
        mercado_pago_payment_id: resolution.mercadoPagoPaymentId,
        status: "action_required",
        status_detail: "waiting_transfer",
        pix: {
          qr_code: resolution.qrCode,
          qr_code_base64: resolution.qrCodeBase64,
          ticket_url: resolution.ticketUrl,
        },
      },
    },
    origin,
  );
});
