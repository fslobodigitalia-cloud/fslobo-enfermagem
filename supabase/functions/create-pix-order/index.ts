// ════════════════════════════════════════════════════════════════════════════
//  ENTRE NÓS TARÔ — FASE 2: EDGE FUNCTION "create-pix-order"
//
//  Endpoint PÚBLICO (chamado pelo navegador do cliente, sem login) que:
//    1. verifica turnstile_token (Cloudflare Turnstile: success, hostname e
//       action exatos) — sem isso, a função está estruturalmente inoperante;
//    2. aplica rate limiting por hash de IP e hash de e-mail (nunca texto
//       puro), IDEMPOTENTE por checkout_request_id + e-mail JUNTOS (retry
//       da mesma compra, pelo mesmo e-mail, nunca infla a contagem; o
//       mesmo checkout_request_id com outro e-mail conta como tentativa
//       distinta), via RPC atômica, antes de tocar em orders/questions;
//    3. valida checkout_request_id, checkout_access_token, nome, e-mail,
//       pacote e perguntas;
//    4. cria (ou, em retry, apenas recupera) o pedido + as perguntas no
//       banco, de forma atômica e IDEMPOTENTE, via
//       public.create_or_get_order_with_questions();
//    5. resolve a Order do Mercado Pago — separando IDENTIDADE (é a mesma
//       Order do nosso pedido?) de ESTADO (ela está pendente, processada ou
//       terminal?). Uma pesquisa que encontra qualquer Order com a mesma
//       external_reference NUNCA vira "não encontrado" — vira sucesso
//       (pendente ou processado), estado terminal, ou conflito que exige
//       reconciliação manual. Só cria uma Order nova (POST) quando a
//       pesquisa (em produção) devolveu, de forma limpa, zero resultados;
//    6. só responde sucesso depois que a vinculação for confirmada via
//       public.link_mercado_pago_order() — validando também que os valores
//       devolvidos batem exatamente com o que foi pedido, não só o formato;
//    7. devolve ao cliente só o necessário.
//
//  ─────────────────────────── Segurança ───────────────────────────────────
//  Turnstile (TURNSTILE_SECRET_KEY/TURNSTILE_EXPECTED_HOSTNAME/
//  TURNSTILE_EXPECTED_ACTION) e rate limiting (RATE_LIMIT_HASH_SECRET, no
//  mínimo 32 caracteres) já estão implementados e OBRIGATÓRIOS — nenhum
//  desses secrets foi inventado ou configurado; sem eles, todo request
//  falha com 500 "server_misconfigured". ALLOWED_ORIGIN (CORS) não é
//  autenticação nem proteção contra automação.
//
//  Cada retry de checkout precisa de um NOVO turnstile_token — tokens do
//  Turnstile são de uso único.
//
//  Diferente de draw-cards: esta função NÃO exige x-internal-secret — é
//  pública por natureza.
//
//  Não implantada em nenhum projeto Supabase por este arquivo — apenas o
//  código local da função, pronto para revisão manual.
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
const TURNSTILE_EXPECTED_ACTION = Deno.env.get("TURNSTILE_EXPECTED_ACTION");
const RATE_LIMIT_HASH_SECRET = Deno.env.get("RATE_LIMIT_HASH_SECRET");
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN");

const MIN_RATE_LIMIT_HASH_SECRET_LENGTH = 32;

const MERCADO_PAGO_ORDERS_URL = "https://api.mercadopago.com/v1/orders";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Dados de pagador de teste documentados pelo Mercado Pago para o ambiente
// de testes (nunca dados reais do cliente nesse modo).
const MERCADO_PAGO_TEST_PAYER_EMAIL = "test_user_br@testuser.com";
const MERCADO_PAGO_TEST_PAYER_FIRST_NAME = "APRO";

// Descrição fixa e curta — nunca construída a partir de package_name.
const MERCADO_PAGO_ORDER_DESCRIPTION = "Leitura de Tarot - Entre Nos";

// Estados terminais documentados — uma Order/pagamento nesses estados nunca
// pode virar uma nova cobrança para o mesmo checkout_request_id.
// charged_back incluído nesta revisão: um pagamento estornado pela
// bandeira/banco também nunca permite nova cobrança automática para o
// mesmo checkout_request_id.
const TERMINAL_STATUS_VALUES = new Set(["canceled", "expired", "failed", "refunded", "charged_back"]);

const MERCADO_PAGO_TIMEOUT_MS = 8_000;
const TURNSTILE_TIMEOUT_MS = 5_000;

const MAX_QUESTIONS_SANITY_CAP = 12;
const MAX_QUESTION_LENGTH = 2000;
const MAX_NAME_LENGTH = 120;
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;
const MAX_BODY_BYTES = 32 * 1024; // 32 KB

const PACKAGE_SLUG_REGEX = /^[a-z0-9-]{1,80}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECKOUT_ACCESS_TOKEN_REGEX = /^[0-9a-f]{64}$/;

const TERMS_VERSION = "2026-08-01";
const PRIVACY_VERSION = "2026-08-01";

// ──────────────────────────────────  CORS  ──────────────────────────────────
// ALLOWED_ORIGIN é OBRIGATÓRIO para esta função (checado no handler, antes
// de qualquer processamento de negócio) — nunca wildcard, sempre a origem
// EXATA configurada. buildCorsHeaders só concede o header quando a origem
// da requisição bate exatamente; se ALLOWED_ORIGIN estiver ausente (antes
// da checagem obrigatória rodar, ex.: durante OPTIONS), nenhuma origem
// jamais bate com undefined, então nenhum header é concedido — seguro por
// padrão.
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
  // (não há login de cliente, não há chamada autenticada via chave anon),
  // mas clientes HTTP baseados no supabase-js podem enviá-los por padrão
  // no preflight; permitir explicitamente evita bloqueio de CORS no
  // navegador sem conceder nenhum privilégio extra no servidor (que
  // ignora esses headers de qualquer forma — a autenticação real desta
  // função continua sendo Turnstile + validação de entrada, nunca CORS).
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
  // IPv6: só dígitos hex e ":" — aceita formas abreviadas (::1 etc.) sem
  // validar posição/quantidade exata de grupos.
  if (value.includes(":") && /^[0-9a-fA-F:]+$/.test(value)) {
    return true;
  }
  return false;
}

/**
 * Extrai o IP do cliente nesta ordem — NUNCA uma string arbitrária
 * enviada pelo próprio cliente:
 *   1. cf-connecting-ip — quando presente, é o sinal mais confiável
 *      disponível para esta função. NÃO HÁ, porém, nenhuma garantia
 *      documentada da Supabase de que todo tráfego chega
 *      necessariamente atrás de uma borda que preenche/normaliza este
 *      header antes de a função rodar — por isso ele é tratado como
 *      SINAL DE DEFESA EM PROFUNDIDADE, não como identidade
 *      autenticada do cliente.
 *   2. x-forwarded-for (primeiro valor) — só como FALLBACK DE
 *      DESENVOLVIMENTO LOCAL, onde cf-connecting-ip normalmente está
 *      ausente. Mais fraco ainda: sem uma borda confiável a normalizar
 *      este header, um proxy intermediário mal configurado (ou, em dev
 *      sem proxy nenhum, o próprio cliente) pode influenciá-lo.
 * Justamente por isso, o IP NUNCA é a única barreira: Turnstile e o
 * limite de rate limiting por e-mail continuam valendo
 * INDEPENDENTEMENTE deste valor (inclusive quando ele é null — ver uso
 * em record_checkout_attempt/p_ip_hash). Nunca loga o IP obtido, seja
 * qual for a fonte.
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
 * logado. O chamador é responsável por aplicar separação de domínio
 * (prefixo "ip:"/"email:"/"request:") antes de chamar esta função.
 * request_hash, especificamente, combina "request:" + checkout_request_id
 * + ":email:" + e-mail normalizado (não só checkout_request_id) — o mesmo
 * checkout_request_id com um e-mail diferente precisa gerar um hash
 * diferente, para não herdar a decisão congelada de outra tentativa.
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

// error-codes documentados pelo Cloudflare, classificados por categoria —
// nunca logados em nenhum caminho (só o "kind" resultante, que é nosso).
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
 * Verifica turnstile_token contra a API do Cloudflare, classificando o
 * resultado (não um booleano simples): rede/timeout/408/429/5xx/401/403 =>
 * temporary/configuration error pela camada HTTP; error-codes do PRÓPRIO
 * corpo da resposta (success=false) são então classificados um a um:
 *   - missing-input-secret/invalid-input-secret/bad-request => nosso
 *     TURNSTILE_SECRET_KEY está errado/ausente => provider_configuration_error;
 *   - internal-error => falha momentânea do Cloudflare => temporary;
 *   - missing-input-response/invalid-input-response/timeout-or-duplicate,
 *     qualquer outro error-code não catalogado, ou hostname/action
 *     incorretos => invalid.
 *
 * idempotency_key é OMITIDO de propósito: como esta função faz apenas UMA
 * chamada ao Siteverify por execução, não há necessidade de idempotência
 * aqui — e reutilizar checkout_request_id como chave arriscaria o
 * Cloudflare tratar um turnstile_token NOVO (num retry) como duplicado do
 * anterior. Se um dia houver retry interno da mesma verificação, gere um
 * crypto.randomUUID() ANTES do loop de retry e reutilize-o só para aquele
 * mesmo turnstile_token — nunca a mesma chave para um token diferente.
 *
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

  if (record.success !== true) return { kind: "invalid" }; // qualquer error-code não catalogado
  if (record.hostname !== TURNSTILE_EXPECTED_HOSTNAME) return { kind: "invalid" };
  if (record.action !== TURNSTILE_EXPECTED_ACTION) return { kind: "invalid" };

  return { kind: "valid" };
}

// ───────────────────────────── Validação do corpo ────────────────────────────
interface OrderRequest {
  checkoutRequestId: string;
  checkoutAccessToken: string;
  packageSlug: string;
  customerName: string;
  customerEmail: string;
  questions: string[];
  turnstileToken: string;
}

function extractOrderRequest(body: unknown): OrderRequest | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  const expectedKeys = [
    "checkout_request_id",
    "checkout_access_token",
    "package_slug",
    "customer_name",
    "customer_email",
    "questions",
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

  const packageSlugRaw = record.package_slug;
  if (typeof packageSlugRaw !== "string" || !PACKAGE_SLUG_REGEX.test(packageSlugRaw)) {
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

  const questionsRaw = record.questions;
  if (!Array.isArray(questionsRaw) || questionsRaw.length === 0 || questionsRaw.length > MAX_QUESTIONS_SANITY_CAP) {
    return null;
  }
  const questions: string[] = [];
  for (const item of questionsRaw) {
    if (typeof item !== "string") return null;
    const trimmed = item.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_QUESTION_LENGTH) return null;
    questions.push(trimmed);
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
    packageSlug: packageSlugRaw,
    customerName,
    customerEmail,
    questions,
    turnstileToken: turnstileTokenRaw,
  };
}

// ─────────────────────── Classificação controlada de erros ──────────────────
type RpcErrorCategory =
  | "package_not_found_or_inactive"
  | "question_count_mismatch"
  | "invalid_question"
  | "checkout_conflict"
  | "unknown_database_error";

interface ClassifiedRpcError {
  category: RpcErrorCategory;
  status: number;
  code: string;
  message: string;
}

function classifyRpcError(error: PostgrestError): ClassifiedRpcError {
  const message = typeof error.message === "string" ? error.message : "";

  if (message.includes("não encontrado ou inativo")) {
    return {
      category: "package_not_found_or_inactive",
      status: 422,
      code: "package_not_found_or_inactive",
      message: "Pacote não encontrado ou indisponível no momento.",
    };
  }
  if (message.includes("exige exatamente")) {
    return {
      category: "question_count_mismatch",
      status: 422,
      code: "question_count_mismatch",
      message: "A quantidade de perguntas não corresponde ao pacote escolhido.",
    };
  }
  if (message.includes("pergunta") && (message.includes("está vazia") || message.includes("excede o tamanho"))) {
    return {
      category: "invalid_question",
      status: 400,
      code: "invalid_question",
      message: "Uma das perguntas enviadas é inválida.",
    };
  }
  if (message.includes("já foi usado com")) {
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
  package_name: string;
  question_count: number;
  customer_email: string;
  order_created_at: string;
  mercado_pago_order_id: string | null;
  mercado_pago_payment_id: string | null;
  // Ambiente PERSISTIDO no momento da criação do pedido — nunca a variável
  // de ambiente atual. resolvePixPayment/buildMercadoPagoRequestBody usam
  // exclusivamente este valor depois que o pedido é recuperado, para que
  // uma troca futura de test<->production nunca reconcilie uma tentativa
  // criada no outro ambiente.
  mercado_pago_environment: MercadoPagoEnvironment;
}

function isUuidString(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
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
  if (!isNonEmptyString(record.package_name)) return false;
  if (
    typeof record.question_count !== "number" ||
    !Number.isInteger(record.question_count) ||
    record.question_count <= 0
  ) {
    return false;
  }
  if (!isNonEmptyString(record.customer_email)) return false;
  if (typeof record.order_created_at !== "string" || Number.isNaN(Date.parse(record.order_created_at))) {
    return false;
  }
  if (record.mercado_pago_order_id !== null && !isNonEmptyString(record.mercado_pago_order_id)) return false;
  if (record.mercado_pago_payment_id !== null && !isNonEmptyString(record.mercado_pago_payment_id)) return false;
  if (record.mercado_pago_environment !== "test" && record.mercado_pago_environment !== "production") return false;

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
  // Nulável: Etapa A da vinculação (Order "shell") grava só o Order ID —
  // o payment ID pode ainda não existir.
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
function centsToAmountString(cents: number): string {
  const abs = Math.abs(Math.trunc(cents));
  const reais = Math.floor(abs / 100);
  const centavos = abs % 100;
  const sign = cents < 0 ? "-" : "";
  return `${sign}${reais}.${String(centavos).padStart(2, "0")}`;
}

type MercadoPagoEnvironment = "test" | "production";

/**
 * Usa EXCLUSIVAMENTE order.mercado_pago_environment (persistido no pedido)
 * — nunca a variável de ambiente atual (MERCADO_PAGO_ENVIRONMENT) passada
 * separadamente. Isso garante que, mesmo que o valor atual da env mude no
 * futuro, um pedido recuperado continua usando o ambiente em que foi
 * CRIADO — nunca envia a Order para o ambiente errado do Mercado Pago.
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
  // Preenchidos só no caminho GET por ID, quando já há vínculo local —
  // exige igualdade exata com o que está persistido.
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
  // Valores EFETIVAMENTE pagos (não o valor esperado/cobrado) — raw, sem
  // formato validado aqui: só são exigidos e comparados no momento de
  // classificar o estado como "processed" (ver classifyPaymentState).
  // Ausentes (undefined) em qualquer estado que não seja pago, o que é
  // esperado e não invalida a identidade.
  totalPaidAmount: unknown;
  paymentPaidAmount: unknown;
}

/**
 * Confirma que um corpo de resposta é, de fato, A NOSSA Order — sem
 * nenhuma opinião sobre em que estado de pagamento ela está. Checa: ID,
 * external_reference, type, processing_mode, total_amount, currency (se
 * presente, exige BRL), exatamente um pagamento, ID, amount e currency (se
 * presente) do pagamento, payment_method pix/bank_transfer, e — quando já
 * persistidos — os IDs locais esperados.
 */
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
  // currency é OPCIONAL na resposta — mas quando presente, tem que ser BRL.
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
  // Mesma regra do nível Order: currency opcional, mas se vier, tem que
  // ser BRL.
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

// ───────────── Order "shell" (assíncrona, ainda sem transação) ──────────────
interface OrderShellIdentity {
  mercadoPagoOrderId: string;
  status: string;
  statusDetail: string;
}

/**
 * O Mercado Pago documenta que um POST (e, por consequência, também um GET
 * subsequente) pode devolver uma Order já criada (com ID válido) mas AINDA
 * sem transactions/payment completos — "shell", nos estados transitórios
 * created/created ou processing/in_process A NÍVEL DE ORDER (o payment
 * ainda nem existe, então não faz sentido validá-lo aqui).
 *
 * Exige: ID; external_reference esperada; type=online;
 * processing_mode=automatic; total_amount esperado; currency (se presente)
 * BRL; status/status_detail nos dois pares transitórios válidos;
 * transactions AUSENTE, null, ou sem nenhum pagamento que pareça completo
 * (id + status + status_detail + amount todos presentes — isso já seria
 * uma Order completa, tratada por validateMercadoPagoOrderIdentity, não um
 * shell). Uma shell válida NUNCA é classificada como provider_error.
 */
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
          // Um pagamento que já parece completo não é mais uma shell —
          // deixa validateMercadoPagoOrderIdentity (mais estrito) decidir.
          if (looksComplete) return null;
        }
      }
    }
  }

  return { mercadoPagoOrderId: String(id), status, statusDetail };
}

// Valor monetário no mesmo formato usado por amountString (reais.centavos,
// sem separador de milhar) — usado para sanidade de payment.paid_amount,
// que NUNCA é exigido igual ao valor bruto esperado (ver ponto C abaixo).
const MONETARY_AMOUNT_REGEX = /^\d+\.\d{2}$/;
function isValidNonNegativeMonetaryString(value: unknown): value is string {
  return typeof value === "string" && MONETARY_AMOUNT_REGEX.test(value) && Number(value) >= 0;
}

// ───────────────────── Estado do pagamento (dado identidade válida) ─────────
type PaymentStateClassification =
  | { kind: "pending_pix"; qrCode: string; qrCodeBase64: string | null; ticketUrl: string | null }
  | { kind: "processing"; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string }
  | { kind: "processed" }
  | { kind: "terminal"; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string }
  | { kind: "unknown_state" };

/**
 * A. pending_pix: order e payment com action_required/waiting_transfer,
 *    qr_code obrigatório, e pelo menos uma forma utilizável entre
 *    ticket_url e qr_code_base64 (que pode vir vazio na Order de teste).
 * B. processing: combinações TRANSITÓRIAS oficiais, não terminais e não
 *    conflituosas — os QUATRO campos exatos, nunca só dois:
 *      - created: order.status=created, order.status_detail=created,
 *        payment.status=created, payment.status_detail=created;
 *      - processing normal: order.status=processing,
 *        order.status_detail=in_process, payment.status=processing,
 *        payment.status_detail=in_process;
 *      - revisão manual: order.status=processing,
 *        order.status_detail=in_process, payment.status=processing,
 *        payment.status_detail=pending_review_manual;
 *      - em revisão (payment): order.status=processing,
 *        order.status_detail=in_process, payment.status=processing,
 *        payment.status_detail=in_review;
 *      - em revisão (ambos): order.status=processing,
 *        order.status_detail=in_process, payment.status=in_review,
 *        payment.status_detail=in_review.
 *    payment.status é SEMPRE "created", "processing" ou "in_review" nestes
 *    cinco casos — NUNCA "in_process"/"pending_review_manual" isolados
 *    (esses são valores de status_detail, não de status; confundir os dois
 *    foi um erro corrigido numa revisão anterior). Nunca permite um novo
 *    POST, mas também nunca é tratado como provider_state_conflict: é um
 *    estado real e esperado, só ainda não resolvido.
 * C. processed: EXATAMENTE order.status="processed" +
 *    order.status_detail="accredited" + payment.status="processed" +
 *    payment.status_detail="accredited" — os quatro campos, não só dois —
 *    E total_paid_amount da Order igual ao valor BRUTO esperado
 *    (amountString; payment.amount já foi validado igual na identidade).
 *    payment.paid_amount NÃO é exigido igual — pode representar o valor
 *    LÍQUIDO (após tarifas do Mercado Pago) e ser legitimamente MENOR que
 *    o valor bruto. Quando presente, só é validado como string monetária
 *    não-negativa (sanidade) — nunca usado sozinho, nem exigido igual,
 *    para autorizar a liberação; se vier num formato inválido, a resposta
 *    inteira é rejeitada (unknown_state) por segurança.
 * D. terminal: order OU payment em canceled/expired/failed/refunded/
 *    charged_back — os QUATRO campos (order e payment, status e
 *    status_detail) são devolvidos separados, nunca só o status da Order:
 *    o estado terminal pode vir só do payment, com a Order ainda não
 *    atualizada.
 * Qualquer outra combinação — incluindo processed/partially_refunded, que
 * NUNCA deve ser tratado como pagamento novo nem como aprovado — cai em
 * unknown_state (tratado como conflito que exige reconciliação manual
 * pelo chamador, nunca como "podemos criar uma Order nova").
 */
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
    // Os quatro campos são devolvidos SEPARADOS — nunca misturados num par
    // "status"/"status_detail" só, já que order e payment podem diferir
    // (created/created tem os dois status=created; os demais têm
    // order.status=processing mas payment.status/status_detail variando).
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
    // payment.paid_amount NUNCA é exigido igual a amountString (pode ser o
    // valor líquido, menor por causa de tarifas) — só validado quando
    // presente, como string monetária não-negativa. Nunca autoriza nada
    // sozinho: a aprovação já depende de identidade completa + os quatro
    // campos de status acima + total_paid_amount bruto, checados antes.
    if (identity.paymentPaidAmount !== undefined && identity.paymentPaidAmount !== null) {
      if (!isValidNonNegativeMonetaryString(identity.paymentPaidAmount)) return { kind: "unknown_state" };
    }
    return { kind: "processed" };
  }

  if (TERMINAL_STATUS_VALUES.has(identity.status) || TERMINAL_STATUS_VALUES.has(identity.paymentStatus)) {
    // Os quatro campos separados — o estado terminal pode vir só do
    // payment (Order ainda não refletindo o mesmo status).
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

// ────────────────────── Identidade + estado combinados ──────────────────────
type EvaluatedOrder =
  | { kind: "pending"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; qrCode: string; qrCodeBase64: string | null; ticketUrl: string | null }
  | { kind: "processing"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string }
  | { kind: "shell"; mercadoPagoOrderId: string; orderStatus: string; orderStatusDetail: string }
  // Corpo do Mercado Pago veio incompleto (sem transactions/payment
  // utilizável), mas JÁ existe um payment ID conhecido localmente para
  // este Order ID — NUNCA tratado como shell "payment ainda desconhecido"
  // (que responderia payment_id=null, apagando uma informação que já
  // temos). mercadoPagoPaymentId aqui é sempre o valor JÁ PERSISTIDO,
  // nunca inventado.
  | { kind: "incomplete_provider_response"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string }
  | { kind: "processed"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string }
  | { kind: "terminal"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string }
  // Identidade COMPLETA confirmada (é seguramente a nossa Order — mesmo
  // ID, external_reference, valores etc.), mas o ESTADO (order.status/
  // payment.status) não é nenhum dos reconhecidos — inclui, por exemplo,
  // processed/partially_refunded. Os IDs são preservados aqui de propósito
  // (nunca descartados só porque o estado é desconhecido): o chamador
  // ainda vincula mercadoPagoOrderId/mercadoPagoPaymentId antes de
  // responder conflito, para nunca perder o rastro desta Order.
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
    // state.kind === "unknown_state": identidade JÁ confirmada completa
    // (identity !== null) — inclui processed/partially_refunded e
    // qualquer outra combinação não reconhecida. Preserva os IDs; NUNCA
    // os descarta só porque o estado é desconhecido.
    return {
      kind: "state_conflict_with_identity",
      mercadoPagoOrderId: identity.mercadoPagoOrderId,
      mercadoPagoPaymentId: identity.mercadoPagoPaymentId,
    };
  }

  // Identidade completa não bateu — tenta como Order "shell" (assíncrona,
  // ainda sem transação). Uma shell válida NUNCA cai em identity_invalid
  // nem é tratada como erro.
  const shell = validateMercadoPagoOrderShell(mpBody, expected);
  if (shell !== null) {
    if (expected.expectedMercadoPagoPaymentId !== undefined && expected.expectedMercadoPagoPaymentId !== null) {
      // Já sabíamos o payment ID (persistido localmente) e a resposta
      // atual veio incompleta — resposta anômala/transitória do provedor,
      // NUNCA prova de que o payment deixou de existir. Nunca afirma
      // payment_id=null quando já sabemos que não é.
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
type MpFetchResult =
  | { kind: "ok"; body: unknown }
  // body preservado mesmo em erro HTTP — a API do Mercado Pago documenta
  // casos (ex.: 402 no POST) em que a Order já foi criada apesar do
  // status de erro; descartar o corpo perderia a única chance de
  // recuperar essa Order sem criar outra.
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

function mpAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Authorization": `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
    ...extra,
  };
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
  // 4xx definitivo na PRÓPRIA chamada de busca (ex.: 400/404/422) — nunca
  // tratado como sinal de "não encontrado", nunca com mensagem de retry.
  | { kind: "provider_request_error" }
  // 200 mas corpo/envelope malformado (JSON inválido, data ausente,
  // paging ausente/inconsistente) — também nunca "não encontrado".
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

/**
 * Envelope oficial da API de Orders para listagem/pesquisa é
 * { "data": [...], "paging": { total, total_pages, offset, limit } } — só
 * isso é aceito. Nenhum suporte a "results"/"elements"/array direto.
 * paging é validado por completo (os quatro campos, convertidos para
 * inteiros seguros não-negativos, MAIS a consistência CRUZADA entre eles —
 * cada campo isoladamente "parecer" um inteiro válido não basta, ver
 * abaixo) — nunca ignorado: é ele, não data.length, que decide se a
 * pesquisa está ambígua (ver tryReconcileViaSearch). Qualquer campo
 * ausente/inválido/inconsistente invalida o envelope inteiro (retorna
 * null), tratado pelo chamador como provider_error — nunca "não
 * encontrado".
 *
 * Consistência cruzada exigida (um envelope malformado/adulterado pode ter
 * cada campo individualmente "parecendo" um inteiro válido e ainda assim
 * ser incoerente entre si — por exemplo total="0" com total_pages="9",
 * offset="999" e limit="0" simultaneamente, onde nenhum campo isolado é
 * "inválido" mas o conjunto é logicamente impossível):
 *   - limit tem que ser >= 1 — 0 é um tamanho de página degenerado, nunca
 *     um valor real (nós mesmos pedimos page_size=20 na URL);
 *   - total===0 exige offset===0 e total_pages<=1 — não há como paginar
 *     além de um resultado vazio, nem existir mais de uma página dele;
 *   - total>0 exige offset<total (nunca aponta além do total declarado) e
 *     total_pages>=1;
 *   - data.length nunca pode exceder total (a própria API nunca deveria
 *     devolver, nesta página, mais itens do que ela mesma declara existir
 *     no total).
 */
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
    // 4xx definitivo (400/404/422/...) — nunca a mesma classificação de
    // erro temporário, nunca orientação de retry automático.
    return { kind: "provider_request_error" };
  }
  const envelope = extractSearchEnvelope(result.body);
  if (envelope === null) {
    // 200 mas envelope inválido (ou JSON não parseável) — nunca tratado
    // como "não encontrado".
    return { kind: "provider_error" };
  }
  return { kind: "ok", envelope };
}

type ReconcileResult =
  | { kind: "success_pending"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; qrCode: string; qrCodeBase64: string | null; ticketUrl: string | null }
  | { kind: "success_processing"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string }
  | { kind: "success_shell"; mercadoPagoOrderId: string; orderStatus: string; orderStatusDetail: string }
  | { kind: "success_processed"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string }
  | { kind: "terminal"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string }
  // Identidade confirmada pela pesquisa, mas estado não reconhecido —
  // preserva os IDs para vinculação antes de reportar conflito (mesmo
  // raciocínio de EvaluatedOrder.state_conflict_with_identity).
  | { kind: "state_conflict_with_identity"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string }
  | { kind: "manual_reconciliation_required" }
  | { kind: "provider_state_conflict" }
  | { kind: "not_found" }
  | { kind: "temporary"; retryAfter: string | null }
  | { kind: "provider_configuration_error" }
  | { kind: "provider_request_error" }
  | { kind: "provider_error" };

/**
 * Pesquisa /v1/orders (mesmo endpoint de listagem, com filtros) por
 * external_reference numa janela de datas RFC3339 em torno de
 * order_created_at.
 *
 * "not_found" SÓ se aplica quando: HTTP 200, envelope válido, e
 * paging.total === 0 (com data.length === 0). Qualquer chamada
 * malsucedida (rede, timeout, 401/403, 408/423/429/5xx, JSON/envelope
 * inválido) NUNCA vira not_found.
 *
 * Ambiguidade tratada pelo PAGING oficial (paging.total), não por
 * data.length nem por quantos itens passam na validação de identidade —
 * nunca aceita "um válido entre vários" como se fosse inequívoco:
 *   - paging.total === 0 e data.length === 0 => not_found;
 *   - paging.total === 1 e data.length === 1 => avalia a única Order
 *     (pending/processing/shell/processed/terminal/
 *     state_conflict_with_identity/identity_invalid — identity_invalid
 *     vira provider_state_conflict; state_conflict_with_identity preserva
 *     os IDs para vinculação; nunca "podemos criar uma Order nova");
 *   - paging.total > 1 => manual_reconciliation_required SEMPRE,
 *     independentemente de data.length;
 *   - qualquer OUTRA combinação (total=1 com data=[]; total=0 com data não
 *     vazia; total menor que data.length) é uma inconsistência interna do
 *     próprio envelope — provider_state_conflict, nunca not_found e nunca
 *     "podemos criar uma Order nova". Isso nunca permite um POST quando o
 *     paging já informa que existe alguma Order.
 */
async function tryReconcileViaSearch(
  externalReference: string,
  orderCreatedAtIso: string,
  identityExpected: IdentityExpected,
): Promise<ReconcileResult> {
  const createdAtMs = Date.parse(orderCreatedAtIso);
  if (Number.isNaN(createdAtMs)) {
    return { kind: "provider_error" };
  }
  const beginDate = new Date(createdAtMs - 60 * 60 * 1000).toISOString(); // 1h de folga antes
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

  // searchResult.kind === "ok" — extractSearchEnvelope() já garantiu a
  // consistência cruzada completa do paging (total>=data.length, limit>=1,
  // offset/total_pages coerentes com total) antes de chegar aqui; este
  // gate é redundância defensiva barata, não a única linha de defesa.
  const { data, paging } = searchResult.envelope;

  if (paging.total < data.length) {
    return { kind: "provider_state_conflict" };
  }

  if (paging.total === 0) {
    // Aqui data.length já está garantido <= 0 pelo gate acima, isto é,
    // sempre 0 — mas a checagem explícita documenta a regra e cobre
    // qualquer futuro relaxamento do gate.
    return data.length === 0 ? { kind: "not_found" } : { kind: "provider_state_conflict" };
  }

  if (paging.total === 1) {
    if (data.length !== 1) {
      // total=1 com data=[] (0 itens nesta página) — inconsistência.
      return { kind: "provider_state_conflict" };
    }
    // segue para avaliar a única Order abaixo.
  } else {
    // paging.total > 1: SEMPRE exige reconciliação manual, mesmo que só
    // um item (ou nenhum) passe na validação de identidade, e
    // independentemente de data.length. Nunca escolhe automaticamente "o
    // único válido entre vários".
    return { kind: "manual_reconciliation_required" };
  }

  // paging.total === 1 e data.length === 1: nunca mais pode virar
  // not_found nem manual_reconciliation_required por ambiguidade de
  // contagem.
  const only = evaluateMercadoPagoOrderBody(data[0], identityExpected);

  if (only.kind === "identity_invalid") {
    // Existe uma Order com o mesmo external_reference, mas não bate com a
    // identidade esperada (nem como Order completa, nem como shell) —
    // inconsistência que exige investigação, nunca tratada como "podemos
    // criar uma Order nova".
    return { kind: "provider_state_conflict" };
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
    };
  }
  if (only.kind === "state_conflict_with_identity") {
    // Identidade confirmada pela pesquisa, mas estado não reconhecido
    // (inclui processed/partially_refunded) — preserva os IDs para
    // vinculação antes de reportar conflito, nunca os descarta.
    return {
      kind: "state_conflict_with_identity",
      mercadoPagoOrderId: only.mercadoPagoOrderId,
      mercadoPagoPaymentId: only.mercadoPagoPaymentId,
    };
  }
  // only.kind === "incomplete_provider_response": a busca nunca informa
  // expectedMercadoPagoPaymentId (só o caminho GET por ID, quando já há
  // vínculo local, faz isso), então isto não deveria ocorrer aqui na
  // prática — mas se ocorrer, tratamento conservador: bloqueia POST,
  // exige investigação (sem os IDs, já que não são garantidos aqui).
  return { kind: "provider_state_conflict" };
}

// ─────────────────────────── Resolução final do Pix ──────────────────────────
type PixResolution =
  | { kind: "pending"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; qrCode: string; qrCodeBase64: string | null; ticketUrl: string | null }
  | { kind: "processing"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string }
  | { kind: "shell"; mercadoPagoOrderId: string; orderStatus: string; orderStatusDetail: string }
  | { kind: "incomplete_provider_response"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string }
  | { kind: "processed"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string }
  | { kind: "terminal"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string; orderStatus: string; orderStatusDetail: string; paymentStatus: string; paymentStatusDetail: string }
  // Identidade confirmada, estado não reconhecido — os IDs já foram
  // vinculados (Etapa A/B) antes desta resolução ser produzida no
  // handler; nunca liberado como sucesso, nunca outro POST.
  | { kind: "state_conflict_with_identity"; mercadoPagoOrderId: string; mercadoPagoPaymentId: string }
  | { kind: "temporary"; retryAfter: string | null }
  | { kind: "manual_reconciliation_required" }
  | { kind: "provider_state_conflict" }
  | { kind: "provider_configuration_error" }
  // POST recusado (402) sem nenhuma identidade/estado reconhecível no
  // corpo, em ambiente de TESTE (sem busca disponível para reconciliar) —
  // a Order PODE ter sido criada mesmo assim; nunca orienta o cliente a
  // repetir o POST cegamente com a mesma chave.
  | { kind: "payment_creation_failed_order_created" }
  // 409 idempotency_key_already_used em ambiente de TESTE — não há
  // pesquisa confiável com a credencial de teste para reconciliar; nunca
  // outro POST para o mesmo checkout_request_id a partir daqui.
  | { kind: "idempotency_reconciliation_required" }
  // 4xx definitivo do Mercado Pago (400/404/422/... ou 409 não relacionado
  // a idempotency_key_already_used) — nunca a mesma mensagem/orientação de
  // retry automático dos erros temporários.
  | { kind: "provider_request_error" }
  // GET numa Order JÁ vinculada localmente devolveu um 4xx definitivo
  // (400/404/...) — inconsistência que exige investigação; mantém o
  // vínculo local intocado, nunca POST, nunca orienta nova compra.
  | { kind: "linked_order_lookup_conflict" }
  // POST devolveu 2xx, mas o corpo não valida nem como Order completa nem
  // como shell — AMBÍGUO (a Order PODE ter sido criada mesmo assim, já
  // que 2xx normalmente significa sucesso). Só ocorre em TESTE, sem busca
  // confiável para reconciliar; nunca mensagem de retry automático, nunca
  // outro POST para este checkout_request_id.
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
      return { kind: "terminal", mercadoPagoOrderId: r.mercadoPagoOrderId, mercadoPagoPaymentId: r.mercadoPagoPaymentId, orderStatus: r.orderStatus, orderStatusDetail: r.orderStatusDetail, paymentStatus: r.paymentStatus, paymentStatusDetail: r.paymentStatusDetail };
    case "state_conflict_with_identity":
      return { kind: "state_conflict_with_identity", mercadoPagoOrderId: r.mercadoPagoOrderId, mercadoPagoPaymentId: r.mercadoPagoPaymentId };
    case "manual_reconciliation_required":
      return { kind: "manual_reconciliation_required" };
    case "provider_state_conflict":
      return { kind: "provider_state_conflict" };
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

/**
 * Extrai um código de erro controlado do corpo de uma resposta de erro do
 * Mercado Pago — checa record.code (nível superior) e, se ausente,
 * record.cause[].code (formato mais comum de erro da API). NUNCA loga o
 * corpo em si — só o código já classificado (uma string curta, nossa) é
 * usado em category de log.
 */
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
 * Resolve o pagamento Pix da Order do Mercado Pago para este pedido. Usa
 * EXCLUSIVAMENTE order.mercado_pago_environment (persistido) — nunca uma
 * env atual passada separadamente — para decidir se há busca disponível
 * (só produção) e para montar o corpo do POST.
 *   - já tem mercado_pago_order_id local => GET direto por ID, validando
 *     que o ID (e o payment ID, se já persistido) batem EXATAMENTE com o
 *     que está gravado. Nesse GET, qualquer 4xx definitivo (incluindo 400
 *     e 404) => linked_order_lookup_conflict (mantém o vínculo local
 *     intocado, nunca POST, nunca orienta nova compra) — nunca o mesmo
 *     provider_request_error genérico usado em outros lugares, já que
 *     aqui já sabemos que a Order deveria existir;
 *   - identidade completa confirmada mas ESTADO não reconhecido (inclui
 *     processed/partially_refunded) => state_conflict_with_identity,
 *     preservando os IDs para vinculação antes de responder conflito —
 *     nunca perde o rastro da Order só porque o estado é desconhecido.
 *     Vale para GET, POST 2xx, POST 402 e busca igualmente, via
 *     evaluateMercadoPagoOrderBody/resolutionFromEvaluation compartilhados;
 *   - senão, em PRODUÇÃO => tenta reconciliar por busca ANTES de criar.
 *     Qualquer resultado da busca que não seja "not_found" limpo é
 *     devolvido diretamente — NUNCA cai para POST;
 *   - senão, em TESTE => pula a busca por completo e vai direto para POST,
 *     com X-Idempotency-Key = checkout_request_id;
 *   - falha ambígua de rede no POST (produção) => tenta reconciliar por
 *     busca antes de desistir;
 *   - 402 no POST => a API do Mercado Pago documenta que a Order pode já
 *     ter sido criada mesmo com essa recusa; tenta validar o CORPO do 402
 *     (Order completa, shell, ou terminal) antes de qualquer outra coisa —
 *     nunca provider_error genérico direto. Só cai para reconciliação por
 *     busca (produção) ou payment_creation_failed_order_created (teste) se
 *     o corpo não permitir validar identidade nenhuma. NUNCA repete o POST
 *     automaticamente para o mesmo checkout_request_id a partir daqui;
 *   - 409 no POST => interpreta o campo code do corpo (nunca logado):
 *       - idempotency_key_already_used em produção => busca por
 *         external_reference; sem correspondência segura =>
 *         manual_reconciliation_required (NUNCA provider_error com
 *         orientação de retry automático);
 *       - idempotency_key_already_used em teste => não há busca confiável
 *         com a credencial de teste => idempotency_reconciliation_required,
 *         HTTP 409, NUNCA outro POST para o mesmo checkout_request_id;
 *       - qualquer outro 409 => provider_state_conflict, sem orientação de
 *         retry automático;
 *   - qualquer outro 4xx definitivo (400/404/422/...) =>
 *     provider_request_error, NUNCA a mesma mensagem dos erros temporários;
 *   - POST devolveu 2xx mas o corpo não valida nem como Order completa nem
 *     como shell => AMBÍGUO. Em produção, tenta busca por
 *     external_reference (sem correspondência segura =>
 *     manual_reconciliation_required); em teste, sem busca confiável =>
 *     ambiguous_creation_result. Nunca mensagem de retry automático, nunca
 *     outro POST para este checkout_request_id, nunca loga o corpo/IDs;
 *   - 408/423/429/5xx => "temporary"; 401/403 => "provider_configuration_error".
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
      // Qualquer outro 4xx (incluindo 400 e 404) numa Order JÁ vinculada
      // localmente — inconsistência entre o que temos persistido e o que
      // o Mercado Pago responde agora para o MESMO Order ID. Nunca
      // provider_request_error genérico aqui: o vínculo local se mantém
      // intocado, nunca um POST, nunca orienta nova compra.
      return { kind: "linked_order_lookup_conflict" };
    }
    return resolutionFromEvaluation(evaluateMercadoPagoOrderBody(result.body, identityExpected));
  }

  if (environment === "production") {
    const reconciled = await tryReconcileViaSearch(order.public_id, order.order_created_at, baseIdentityExpected);
    const mapped = resolutionFromReconcile(reconciled);
    if (mapped.kind !== "not_found") return mapped;
    // mapped.kind === "not_found": segue para criar via POST.
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
      // not_found aqui é ambíguo (rede falhou, busca não achou nada) —
      // mais seguro devolver "temporary" que declarar erro definitivo.
    }
    return { kind: "temporary", retryAfter: null };
  }

  if (createResult.kind === "http_error") {
    if (createResult.status === 401 || createResult.status === 403) return { kind: "provider_configuration_error" };
    if (isTemporaryStatus(createResult.status)) {
      return { kind: "temporary", retryAfter: createResult.retryAfter };
    }
    if (createResult.status === 402) {
      // A Order PODE já ter sido criada mesmo com 402 — nunca descarta o
      // corpo sem tentar validar identidade primeiro.
      const evaluated402 = evaluateMercadoPagoOrderBody(createResult.body, baseIdentityExpected);
      if (evaluated402.kind !== "identity_invalid") {
        // Identidade reconhecida com segurança (completa, shell, ou
        // terminal) — vincula o que houver disponível e devolve o estado
        // real. resolutionFromEvaluation já trata identidade-com-estado-
        // desconhecido como state_conflict_with_identity (preserva os IDs
        // para vinculação), nunca como "podemos criar outra Order".
        return resolutionFromEvaluation(evaluated402);
      }

      // Corpo do 402 não permite validar identidade nenhuma.
      if (environment === "production") {
        const after402 = await tryReconcileViaSearch(order.public_id, order.order_created_at, baseIdentityExpected);
        const mapped = resolutionFromReconcile(after402);
        if (mapped.kind !== "not_found") return mapped;
        // not_found aqui é ambíguo (402 pode ter sido recusa genuína ANTES
        // de qualquer Order existir, ou a busca simplesmente ainda não
        // indexou a Order recém-criada) — nunca orienta o cliente a
        // repetir cegamente o POST com a mesma chave.
        return { kind: "manual_reconciliation_required" };
      }

      // Em teste não há busca para reconciliar — devolve um código
      // específico que deixa claro que a Order PODE ter sido criada, sem
      // orientar retry automático com a mesma chave.
      return { kind: "payment_creation_failed_order_created" };
    }
    if (createResult.status === 409) {
      // Interpreta o campo code do corpo de forma controlada — nunca loga
      // o corpo em si.
      const errorCode = extractMercadoPagoErrorCode(createResult.body);

      if (errorCode === "idempotency_key_already_used") {
        if (environment === "production") {
          const after409 = await tryReconcileViaSearch(order.public_id, order.order_created_at, baseIdentityExpected);
          const mapped = resolutionFromReconcile(after409);
          if (mapped.kind !== "not_found") return mapped;
          // MP diz que a chave já foi usada, mas a busca não encontrou uma
          // correspondência segura — nunca provider_error com orientação
          // de retry automático (o retry repetiria a mesma colisão).
          return { kind: "manual_reconciliation_required" };
        }
        // TESTE: não há pesquisa confiável com a credencial de teste.
        // NUNCA outro POST para este checkout_request_id a partir daqui.
        return { kind: "idempotency_reconciliation_required" };
      }

      // Outro 409, não relacionado a idempotency_key_already_used.
      return { kind: "provider_state_conflict" };
    }
    // Qualquer outro 4xx definitivo (400/404/422/...) — nunca a mesma
    // mensagem/orientação de erro temporário.
    return { kind: "provider_request_error" };
  }

  // createResult.kind === "ok" (POST devolveu 2xx).
  const evaluatedCreate = evaluateMercadoPagoOrderBody(createResult.body, baseIdentityExpected);
  if (evaluatedCreate.kind !== "identity_invalid") {
    return resolutionFromEvaluation(evaluatedCreate);
  }

  // Corpo do POST 2xx não valida nem como Order completa nem como shell —
  // AMBÍGUO: 2xx normalmente significa que a Order FOI criada, mas não
  // conseguimos confirmar identidade nenhuma no corpo devolvido. Nunca
  // mensagem de retry automático, nunca outro POST para este
  // checkout_request_id a partir daqui. Mesmo que o corpo contenha alguns
  // campos reconhecíveis (id, external_reference, type, processing_mode,
  // total_amount corretos) mas esteja incompleto demais para identidade
  // OU shell válidas, NUNCA vincula parcialmente — só os requisitos
  // mínimos já definidos em validateMercadoPagoOrderIdentity/
  // validateMercadoPagoOrderShell autorizam vinculação. O corpo e os IDs
  // NUNCA são logados — nem aqui, nem em nenhum ramo abaixo.
  if (environment === "production") {
    const afterAmbiguousCreate = await tryReconcileViaSearch(order.public_id, order.order_created_at, baseIdentityExpected);
    const mapped = resolutionFromReconcile(afterAmbiguousCreate);
    if (mapped.kind !== "not_found") return mapped;
    // Sem correspondência segura na busca.
    return { kind: "manual_reconciliation_required" };
  }

  // Em teste não há busca confiável para reconciliar.
  return { kind: "ambiguous_creation_result" };
}

// ────────────────────── Vinculação (via RPC, nunca UPDATE direto) ───────────
type LinkResult =
  | { kind: "linked" }
  | { kind: "conflict" }
  | { kind: "temporary_error" };

/**
 * Chama public.link_mercado_pago_order() e confirma não só o FORMATO da
 * resposta, mas que os VALORES devolvidos batem exatamente com o que foi
 * pedido — nunca considera vinculado só porque a resposta "parece válida".
 *
 * mercadoPagoPaymentId é OPCIONAL (null): Etapa A da vinculação em duas
 * etapas, quando o Mercado Pago devolveu uma Order "shell" (só o Order ID
 * é conhecido ainda). Null NUNCA é comparado contra o retorno da RPC — só
 * verifica igualdade quando um valor específico foi pedido.
 *
 * Devolve uma classificação, não um booleano: "conflict" (a mensagem
 * controlada de vínculo diferente, OU um unique_violation/23505 durante a
 * gravação do ID) exige reconciliação manual — nunca deve ser sugerido
 * como "tente de novo com os mesmos dados", já que retentar não resolve
 * um conflito de identidade. "temporary_error" (qualquer outra falha —
 * RPC, formato de resposta, exceção) é o único caso em que retry com os
 * mesmos dados faz sentido.
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
      // 23505 = unique_violation (SQLSTATE) — pode ocorrer se, por
      // exemplo, mercado_pago_order_id (UNIQUE em orders) já pertencer a
      // OUTRO pedido: também um conflito de identidade, nunca uma falha
      // temporária.
      const isUniqueViolation = linkError.code === "23505";
      const isConflict = isConflictMessage || isUniqueViolation;
      console.error("[create-pix-order] Falha ao vincular o ID da Order do Mercado Pago ao pedido.", {
        category: isConflict ? "order_link_conflict" : "order_link_rpc_error",
        postgres_code: linkError.code ?? null,
      });
      return { kind: isConflict ? "conflict" : "temporary_error" };
    }

    if (!isValidLinkResultShape(linkData)) {
      console.error("[create-pix-order] Resposta da RPC de vinculação em formato inesperado.", {
        category: "invalid_link_rpc_response",
      });
      return { kind: "temporary_error" };
    }

    const link = linkData[0];
    if (
      link.order_id !== orderId ||
      link.mercado_pago_order_id !== mercadoPagoOrderId ||
      // payment_id só é comparado quando um valor específico foi pedido —
      // null significa "não informado nesta chamada", nunca "deveria ter
      // sido limpo/vazio".
      (mercadoPagoPaymentId !== null && link.mercado_pago_payment_id !== mercadoPagoPaymentId)
    ) {
      // A RPC não retornou erro, mas os valores não batem com o pedido —
      // mais próximo de um conflito de identidade não sinalizado
      // corretamente do que de uma falha passageira. Trata como conflito:
      // bloqueia retry automático, exige investigação.
      console.error("[create-pix-order] Resposta da RPC de vinculação não confere com os IDs solicitados.", {
        category: "link_rpc_value_mismatch",
      });
      return { kind: "conflict" };
    }

    return { kind: "linked" };
  } catch (caught) {
    console.error("[create-pix-order] Exceção inesperada ao vincular o ID da Order ao pedido.", {
      category: "order_link_thrown_exception",
      error_type: caught instanceof Error ? caught.name : "unknown",
    });
    return { kind: "temporary_error" };
  }
}

// ─────────── Persistência do pagamento confirmado (via RPC, nunca UPDATE direto) ──
type MarkOrderPaidResult =
  | { kind: "paid" }
  | { kind: "conflict" }
  | { kind: "temporary_error" };

interface MarkOrderPaidRow {
  order_id: string;
  status: string;
  was_already_paid: boolean;
}

// Únicos valores de status aceitos como resposta de SUCESSO de
// mark_order_paid(): 'paid' (transição acabou de acontecer) ou qualquer
// estágio POSTERIOR do pipeline (a RPC também devolve esses como sucesso
// idempotente, quando o pedido já avançou além de 'paid'). Nunca aceita
// 'pending_payment' (a RPC não deveria devolver isso como sucesso — se
// devolver, é formato inesperado, não confirmação) nem nenhum dos estados
// terminais (failed/cancelled/refunded/expired), nem nenhuma string
// desconhecida — qualquer um desses caindo aqui é tratado como resposta em
// formato inválido (temporary_error), nunca como pagamento confirmado.
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
 * Chama public.mark_order_paid() — única forma legítima de persistir
 * orders.status = 'paid'/paid_at/order_events a partir de uma confirmação
 * processed/accredited do Mercado Pago. Confirma não só o FORMATO da
 * resposta, mas que o order_id devolvido bate com o pedido pedido — nunca
 * considera pago só porque a resposta "parece válida".
 *
 * Devolve uma classificação, não um booleano:
 *   - "paid": gravado agora OU já estava pago/além (idempotente, RPC trata
 *     retry) — seguro liberar "processed" ao cliente;
 *   - "conflict": a própria RPC recusou (identidade/valor divergente do já
 *     persistido, ou pedido em estado terminal) — NUNCA deve ser liberado
 *     como sucesso; exige reconciliação manual, nunca retry automático;
 *   - "temporary_error": falha de RPC/rede/formato de resposta — nunca
 *     afirma que o pagamento foi confirmado; retry com os mesmos dados faz
 *     sentido (a RPC é idempotente).
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
      // Mensagens controladas lançadas pela própria RPC para divergência de
      // identidade/valor ou estado terminal (ver mark_order_paid na
      // migration) — nunca tratadas como falha temporária.
      const isConflictMessage =
        typeof markError.message === "string" &&
        (markError.message.includes("não confere") ||
          markError.message.includes("estado terminal") ||
          markError.message.includes("não reconhecido") ||
          markError.message.includes("não encontrado"));
      console.error("[create-pix-order] Falha ao persistir a confirmação de pagamento.", {
        category: isConflictMessage ? "mark_order_paid_conflict" : "mark_order_paid_rpc_error",
        postgres_code: markError.code ?? null,
      });
      return { kind: isConflictMessage ? "conflict" : "temporary_error" };
    }

    if (!isValidMarkOrderPaidResultShape(markData)) {
      console.error("[create-pix-order] Resposta da RPC de confirmação de pagamento em formato inesperado.", {
        category: "invalid_mark_order_paid_response",
      });
      return { kind: "temporary_error" };
    }

    const mark = markData[0];
    if (mark.order_id !== orderId) {
      // A RPC não retornou erro, mas o order_id devolvido não bate com o
      // pedido solicitado — mais próximo de um conflito não sinalizado
      // corretamente do que de uma falha passageira.
      console.error("[create-pix-order] Resposta da RPC de confirmação de pagamento não confere com o pedido solicitado.", {
        category: "mark_order_paid_value_mismatch",
      });
      return { kind: "conflict" };
    }

    return { kind: "paid" };
  } catch (caught) {
    console.error("[create-pix-order] Exceção inesperada ao persistir a confirmação de pagamento.", {
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
    !TURNSTILE_EXPECTED_ACTION ||
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
  // responde 403 sem tocar em Turnstile/rate limit/banco. Requisições SEM
  // header Origin (server-to-server: curl, testes automatizados,
  // integrações backend) são permitidas passar — CORS é uma proteção de
  // NAVEGADOR (impede que JavaScript de outra origem LEIA a resposta), não
  // autenticação; um cliente server-to-server nunca envia Origin e não é
  // afetado por CORS de qualquer forma. Isto é intencional para permitir
  // testes/integrações backend-to-backend; a segurança real do endpoint
  // continua vindo de Turnstile, validação de entrada e rate limiting,
  // aplicados independentemente de haver ou não um Origin.
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

  const orderRequest = extractOrderRequest(parsedBody);
  if (orderRequest === null) {
    return errorResponse(
      400,
      "invalid_request",
      'Corpo inválido. Esperado exatamente {"checkout_request_id", "checkout_access_token", "package_slug", "customer_name", "customer_email", "questions", "turnstile_token"}.',
      origin,
    );
  }

  const remoteIp = extractTrustedClientIp(req);

  // ── Turnstile: verifica ANTES de tocar no banco. Nunca loga o token, o
  //    hostname/action recebidos nem o corpo da resposta.
  const turnstileResult = await verifyTurnstileToken(orderRequest.turnstileToken, remoteIp);
  if (turnstileResult.kind === "temporary") {
    console.error("[create-pix-order] Verificação Turnstile temporariamente indisponível.", {
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
    console.error("[create-pix-order] Configuração do Turnstile rejeitada pelo Cloudflare.", {
      category: "turnstile_provider_configuration_error",
    });
    return errorResponse(500, "server_misconfigured", "Configuração do servidor incompleta.", origin);
  }
  if (turnstileResult.kind === "invalid") {
    console.error("[create-pix-order] Verificação Turnstile falhou.", { category: "turnstile_verification_failed" });
    return errorResponse(403, "human_verification_failed", "Não foi possível confirmar a verificação de segurança.", origin);
  }

  // ── Rate limiting: hashes com separação de domínio, calculados aqui,
  //    nunca logados (nem o e-mail em texto puro, nem os hashes). request_hash
  //    combina checkout_request_id E o e-mail normalizado — não só o
  //    primeiro: o MESMO checkout_request_id com o MESMO e-mail continua
  //    sendo um retry idempotente (não incrementa nada); o MESMO
  //    checkout_request_id com um e-mail DIFERENTE agora conta como uma
  //    tentativa DISTINTA, contabilizada normalmente. Sem isso, a decisão
  //    congelada de uma tentativa ficaria presa só ao checkout_request_id,
  //    ignorando de quem (por e-mail) ela realmente partiu.
  //    ipHash é OPCIONAL (null) quando não há IP confiável — NUNCA usamos
  //    um bucket "unknown" compartilhado por toda requisição sem IP
  //    confiável, o que juntaria clientes não relacionados sob o mesmo
  //    limite e criaria uma forma de negar serviço a todos eles. Nesse
  //    caso, a decisão passa a depender só do limite por e-mail — ver
  //    record_checkout_attempt() na migration, que trata p_ip_hash null
  //    como "ignorar limite de IP".
  //    request_hash também inclui o AMBIENTE atual do Mercado Pago
  //    (test/production) — uma troca futura de ambiente nunca reutiliza a
  //    decisão congelada de uma tentativa feita no outro ambiente.
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
    console.error("[create-pix-order] Exceção inesperada ao verificar limite de tentativas.", {
      category: "rate_limit_thrown_exception",
      error_type: caught instanceof Error ? caught.name : "unknown",
    });
    return errorResponse(500, "database_error", "Não foi possível processar o pedido agora.", origin);
  }

  if (rateLimitError) {
    console.error("[create-pix-order] RPC de limite de tentativas falhou.", {
      category: "rate_limit_rpc_error",
      postgres_code: rateLimitError.code ?? null,
    });
    return errorResponse(500, "database_error", "Não foi possível processar o pedido agora.", origin);
  }

  if (!isValidRateLimitResult(rateLimitData)) {
    console.error("[create-pix-order] Resposta da RPC de limite de tentativas em formato inesperado.", {
      category: "invalid_rate_limit_response",
    });
    return errorResponse(500, "database_error", "Não foi possível processar o pedido agora.", origin);
  }

  const rateLimit = rateLimitData[0];
  if (!rateLimit.allowed) {
    console.error("[create-pix-order] Limite de tentativas excedido.", { category: "rate_limit_exceeded" });
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

  // ── Criação/recuperação idempotente do pedido.
  let data: unknown;
  let error: PostgrestError | null;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const rpcResult = await supabase.rpc("create_or_get_order_with_questions", {
      p_checkout_request_id: orderRequest.checkoutRequestId,
      p_checkout_access_token: orderRequest.checkoutAccessToken,
      p_package_slug: orderRequest.packageSlug,
      p_customer_name: orderRequest.customerName,
      p_customer_email: orderRequest.customerEmail,
      p_questions: orderRequest.questions,
      p_terms_version: TERMS_VERSION,
      p_privacy_version: PRIVACY_VERSION,
      p_mercado_pago_environment: mercadoPagoEnvironment,
    });
    data = rpcResult.data;
    error = rpcResult.error;
  } catch (caught) {
    console.error("[create-pix-order] Exceção inesperada ao criar/recuperar o pedido.", {
      category: "rpc_thrown_exception",
      error_type: caught instanceof Error ? caught.name : "unknown",
    });
    return errorResponse(500, "database_error", "Não foi possível criar o pedido agora.", origin);
  }

  if (error) {
    const classified = classifyRpcError(error);
    console.error("[create-pix-order] RPC de criação/recuperação de pedido falhou.", {
      category: classified.category,
      postgres_code: error.code ?? null,
    });
    return errorResponse(classified.status, classified.code, classified.message, origin);
  }

  if (!isValidOrderResult(data)) {
    console.error("[create-pix-order] Resposta do RPC em formato inesperado.", {
      category: "invalid_rpc_response",
    });
    return errorResponse(500, "database_error", "Não foi possível criar o pedido agora.", origin);
  }

  const order = data[0];
  const amountString = centsToAmountString(order.amount_cents);

  // resolvePixPayment usa order.mercado_pago_environment (persistido),
  // nunca mercadoPagoEnvironment (a env atual) diretamente.
  const resolution = await resolvePixPayment(order, orderRequest.checkoutRequestId, amountString);

  if (resolution.kind === "temporary") {
    console.error("[create-pix-order] Mercado Pago temporariamente indisponível.", {
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
    console.error("[create-pix-order] Reconciliação automática não encontrou uma correspondência única.", {
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
    console.error("[create-pix-order] Order encontrada com identidade/estado inconsistente.", {
      category: "provider_state_conflict",
    });
    return errorResponse(
      409,
      "provider_state_conflict",
      "Encontramos uma inconsistência ao confirmar este pagamento. Nossa equipe foi notificada.",
      origin,
    );
  }

  if (resolution.kind === "provider_configuration_error") {
    console.error("[create-pix-order] Credenciais do Mercado Pago rejeitadas (401/403).", {
      category: "mp_provider_configuration_error",
    });
    return errorResponse(500, "payment_provider_configuration_error", "Não foi possível processar o pagamento agora.", origin);
  }

  if (resolution.kind === "provider_error") {
    console.error("[create-pix-order] Não foi possível confirmar a Order no Mercado Pago.", {
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
    // 4xx DEFINITIVO do Mercado Pago (400/404/422/409 não relacionado a
    // idempotency_key_already_used/...) — nunca a mesma mensagem de
    // "tente novamente com os mesmos dados" dos erros temporários, já que
    // retentar com os MESMOS dados repetiria a mesma rejeição.
    console.error("[create-pix-order] O Mercado Pago recusou definitivamente a requisição.", {
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
    // 409 idempotency_key_already_used em ambiente de TESTE — sem busca
    // confiável disponível para reconciliar com a credencial de teste.
    // NUNCA outro POST para este checkout_request_id a partir daqui.
    console.error("[create-pix-order] Chave de idempotência já utilizada, sem pesquisa confiável disponível (ambiente de teste).", {
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
    // POST recusado com 402 sem nenhuma identidade reconhecível no corpo
    // (ambiente de teste, sem busca disponível para reconciliar) — a
    // Order PODE ter sido criada mesmo assim. Não há nenhum ID para
    // vincular aqui; NUNCA orienta o cliente a repetir o POST com a mesma
    // chave (poderia colidir com uma Order que realmente existe).
    console.error("[create-pix-order] POST recusado (402) sem identidade confirmável no corpo.", {
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
    // POST devolveu 2xx, mas o corpo não validou nem como Order completa
    // nem como shell (ambiente de teste, sem busca disponível para
    // reconciliar) — a Order PODE ter sido criada (2xx normalmente
    // significa sucesso). Não há nenhum ID confiável para vincular aqui;
    // NUNCA orienta o cliente a repetir o POST com a mesma chave.
    console.error("[create-pix-order] POST devolveu 2xx com corpo ambíguo, sem identidade confirmável.", {
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
    // GET numa Order JÁ vinculada localmente devolveu um 4xx definitivo —
    // o vínculo local se mantém EXATAMENTE como estava (nenhuma escrita
    // acontece aqui); nunca um POST, nunca orienta nova compra.
    console.error("[create-pix-order] Falha ao consultar uma Order já vinculada localmente.", {
      category: "mp_linked_order_lookup_conflict",
    });
    return errorResponse(
      409,
      "manual_reconciliation_required",
      "Não foi possível confirmar automaticamente este pagamento. Tente novamente mais tarde ou entre em contato.",
      origin,
    );
  }

  // resolution.kind é agora "pending" | "processing" | "shell" |
  // "incomplete_provider_response" | "processed" | "terminal" |
  // "state_conflict_with_identity" — todos com pelo menos o Order ID do
  // Mercado Pago disponível para vincular. "shell" ainda não tem payment
  // ID (Order assíncrona, ainda sem transação) — vincula só o Order ID
  // (Etapa A); o payment ID é preenchido numa chamada futura (Etapa B),
  // quando o cliente retentar e a Order já tiver avançado de estado.
  // "incomplete_provider_response"/"state_conflict_with_identity" SEMPRE
  // carregam um payment ID — nunca null.
  const paymentIdToLink = resolution.kind === "shell" ? null : resolution.mercadoPagoPaymentId;
  const linkResult = await linkMercadoPagoOrder(order.order_id, resolution.mercadoPagoOrderId, paymentIdToLink);

  if (linkResult.kind === "conflict") {
    // Conflito de identidade (vínculo diferente já existente, ou
    // unique_violation na gravação) — NUNCA sugere retentar com os mesmos
    // dados, já que retentar não resolve um conflito.
    return errorResponse(
      409,
      "manual_reconciliation_required",
      "Não foi possível confirmar automaticamente este pagamento. Tente novamente mais tarde ou entre em contato.",
      origin,
    );
  }

  if (linkResult.kind === "temporary_error") {
    // O Mercado Pago JÁ tem a Order neste ponto — não perdida, só ainda não
    // vinculada localmente. Erro recuperável: o cliente deve tentar de novo
    // com o MESMO checkout_request_id e checkout_access_token (e um NOVO
    // turnstile_token) — a próxima tentativa recupera esta mesma Order,
    // nunca cria uma cobrança nova.
    return errorResponse(
      500,
      "order_link_persistence_failed",
      "O pagamento foi iniciado, mas não foi possível confirmar o registro agora. Tente novamente com os mesmos dados.",
      origin,
    );
  }

  if (resolution.kind === "terminal") {
    // Nunca interpola order_status/payment_status (valores não controlados
    // diretamente — vêm do Mercado Pago) na mensagem PÚBLICA ao cliente;
    // eles continuam disponíveis de forma estruturada (nunca em prosa
    // livre) só internamente, no log.
    console.error("[create-pix-order] Pagamento em estado terminal — não pagável.", {
      category: "payment_terminal_state",
    });
    return errorResponse(
      409,
      "payment_not_payable",
      "Este pagamento não pode mais ser concluído. Inicie uma nova compra com um novo checkout_request_id.",
      origin,
    );
  }

  if (resolution.kind === "state_conflict_with_identity") {
    // Identidade CONFIRMADA (é seguramente a nossa Order), mas o estado
    // (order.status/payment.status) não é nenhum dos reconhecidos —
    // inclui processed/partially_refunded. Os IDs já foram vinculados
    // acima (linkResult), nunca perdidos. Nunca libera como sucesso, nunca
    // inclui os estados brutos na mensagem pública, nunca outro POST para
    // este checkout_request_id.
    console.error("[create-pix-order] Identidade confirmada, mas estado da Order/payment não reconhecido.", {
      category: "mp_state_conflict_with_identity",
    });
    return errorResponse(
      409,
      "manual_reconciliation_required",
      "Não foi possível confirmar automaticamente este pagamento. Tente novamente mais tarde ou entre em contato.",
      origin,
    );
  }

  const orderSummary = {
    public_id: order.public_id,
    amount_cents: order.amount_cents,
    currency: order.currency,
    package_name: order.package_name,
  };

  if (resolution.kind === "incomplete_provider_response") {
    // O Order ID e o payment ID JÁ ESTÃO vinculados (linkResult acima
    // confirmou, de forma idempotente, o que já estava persistido) — só a
    // resposta ATUAL do Mercado Pago veio incompleta. Nunca afirma
    // payment_id=null aqui; responde um estado temporário, orientando um
    // novo GET (que a próxima chamada já faz naturalmente, via
    // resolvePixPayment, usando o Order ID persistido).
    console.error("[create-pix-order] Resposta do Mercado Pago incompleta para uma Order com pagamento já conhecido localmente.", {
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
    // Order "shell": o Mercado Pago já criou a Order (ID confirmado e
    // vinculado — Etapa A), mas ainda não devolveu transactions/payment.
    // Nunca um novo POST a partir daqui — o próximo retry do cliente (com
    // o mesmo checkout_request_id) já vai encontrar mercado_pago_order_id
    // persistido e usar GET /v1/orders/{order_id} diretamente
    // (resolvePixPayment), até o payment aparecer e a Etapa B preencher
    // mercado_pago_payment_id pela mesma RPC.
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
    // Estado transitório oficial (created/created, processing/in_process
    // ou processing/pending_review_manual): já vinculado localmente, nunca
    // um novo POST a partir daqui, e nunca tratado como conflito — é um
    // estado real e esperado, só ainda não resolvido. Os quatro campos vêm
    // SEPARADOS (nunca um único status/status_detail misturando os dois
    // níveis, que podem diferir entre si). 202 (não 200): sinaliza que a
    // requisição foi aceita, mas o processamento não terminou.
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
    // mercado_pago_order_id/mercado_pago_payment_id já estão vinculados
    // neste ponto (linkResult acima). Antes de responder ao cliente que o
    // pagamento está confirmado, persiste isso em public.orders — nunca
    // responde "processed" sem que a gravação (idempotente) tenha
    // sucedido.
    const markResult = await markOrderPaid(
      order.order_id,
      resolution.mercadoPagoOrderId,
      resolution.mercadoPagoPaymentId,
      order.amount_cents,
    );

    if (markResult.kind === "temporary_error") {
      // Nunca afirma que o pagamento está confirmado sem a gravação ter
      // sucedido — o cliente deve tentar de novo com o MESMO
      // checkout_request_id/checkout_access_token (e um NOVO
      // turnstile_token); mark_order_paid é idempotente, então o retry é
      // seguro e nunca duplica o evento de pagamento.
      console.error("[create-pix-order] Não foi possível persistir a confirmação de pagamento agora.", {
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
      // Divergência de identidade/valor com o que já está persistido, ou
      // pedido em estado terminal — nunca liberado como sucesso, nunca
      // retry automático sugerido.
      console.error("[create-pix-order] Divergência ao persistir a confirmação de pagamento.", {
        category: "mark_order_paid_conflict",
      });
      return errorResponse(
        409,
        "manual_reconciliation_required",
        "Não foi possível confirmar automaticamente este pagamento. Tente novamente mais tarde ou entre em contato.",
        origin,
      );
    }

    // markResult.kind === "paid" — gravado agora ou já estava pago/além
    // (idempotente); seguro responder como confirmado.
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
