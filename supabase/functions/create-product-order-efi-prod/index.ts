import { createClient, type PostgrestError } from "npm:@supabase/supabase-js@2.112.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const TURNSTILE_SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY");
const TURNSTILE_EXPECTED_HOSTNAME = Deno.env.get("TURNSTILE_EXPECTED_HOSTNAME");
const TURNSTILE_EXPECTED_ACTION_PRODUCT_ORDER = Deno.env.get("TURNSTILE_EXPECTED_ACTION_PRODUCT_ORDER");
const RATE_LIMIT_HASH_SECRET = Deno.env.get("RATE_LIMIT_HASH_SECRET");
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN");
const EFI_CLIENT_ID = Deno.env.get("EFI_PROD_CLIENT_ID");
const EFI_CLIENT_SECRET = Deno.env.get("EFI_PROD_CLIENT_SECRET");
const EFI_CERT_B64 = Deno.env.get("EFI_PROD_CERT_B64");
const EFI_KEY_B64 = Deno.env.get("EFI_PROD_KEY_B64");
const EFI_PIX_KEY = Deno.env.get("EFI_PROD_PIX_KEY");

const EFI_BASE_URL = "https://pix.api.efipay.com.br";
const EFI_ENVIRONMENT = "production" as const;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TERMS_VERSION = "2026-08-01";
const PRIVACY_VERSION = "2026-08-01";
const MIN_RATE_LIMIT_HASH_SECRET_LENGTH = 32;
// ALTERAÇÃO (etapa 1 do carrinho multiproduto): era 5 ("1 principal + 4
// bumps, no máximo"). Alinhado ao limite real aceito pela RPC
// create_or_get_product_order_with_items_efi (v_slug_count > 16 → erro).
// Nenhuma outra constante/lógica desta função foi alterada.
const MAX_PRODUCT_SLUGS = 16;
const MAX_NAME_LENGTH = 120;
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;
const MAX_BODY_BYTES = 32 * 1024;
const TURNSTILE_TIMEOUT_MS = 5000;
const EFI_TIMEOUT_MS = 8000;
const PRODUCT_SLUG_REGEX = /^[a-z0-9-]{1,80}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECKOUT_ACCESS_TOKEN_REGEX = /^[0-9a-f]{64}$/;
const TXID_REGEX = /^[A-Za-z0-9]{26,35}$/;
const MONEY_RE = /^\d+\.\d{2}$/;

function decodeB64Utf8(value: string): string {
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isAllowedOrigin(origin: string | null): boolean {
  if (origin === null) return true;
  return !!ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN;
}

function buildCorsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  headers.set("Vary", "Origin");
  if (origin && isAllowedOrigin(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function handlePreflight(origin: string | null): Response {
  const headers = buildCorsHeaders(origin);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  return new Response(null, { status: 204, headers });
}

function jsonResponse(status: number, body: unknown, origin: string | null, extra?: Record<string, string>): Response {
  const headers = buildCorsHeaders(origin);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  if (extra) for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(status: number, code: string, message: string, origin: string | null, extra?: Record<string, string>): Response {
  return jsonResponse(status, { ok: false, error: { code, message } }, origin, extra);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(id); }
}

async function efiFetch(httpClient: Deno.HttpClient, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), EFI_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, client: httpClient } as RequestInit & { client: Deno.HttpClient });
  } finally {
    clearTimeout(id);
  }
}

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
function isPlausibleIp(value: string): boolean {
  const m = value.match(IPV4_REGEX);
  if (m) return m.slice(1, 5).every((o) => Number(o) >= 0 && Number(o) <= 255);
  return value.includes(":") && /^[0-9a-fA-F:]+$/.test(value);
}

function extractTrustedClientIp(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf && isPlausibleIp(cf)) return cf;
  const ff = req.headers.get("x-forwarded-for");
  if (ff) {
    const first = ff.split(",")[0].trim();
    if (isPlausibleIp(first)) return first;
  }
  return null;
}

async function computeHmacHex(secret: string, value: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type TurnstileResult = { kind: "valid" } | { kind: "invalid" } | { kind: "temporary" } | { kind: "provider_configuration_error" };

async function verifyTurnstileToken(token: string, remoteIp: string | null): Promise<TurnstileResult> {
  const params = new URLSearchParams();
  params.set("secret", TURNSTILE_SECRET_KEY as string);
  params.set("response", token);
  if (remoteIp) params.set("remoteip", remoteIp);

  let response: Response;
  try {
    response = await fetchWithTimeout(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }, TURNSTILE_TIMEOUT_MS);
  } catch {
    return { kind: "temporary" };
  }

  if (response.status === 401 || response.status === 403) return { kind: "provider_configuration_error" };
  if (response.status === 408 || response.status === 423 || response.status === 429 || response.status >= 500) return { kind: "temporary" };
  if (!response.ok) return { kind: "invalid" };

  const body = asRecord(await readJson(response));
  if (!body) return { kind: "invalid" };
  const codes = Array.isArray(body["error-codes"]) ? (body["error-codes"] as unknown[]).filter((x): x is string => typeof x === "string") : [];
  if (codes.some((c) => ["missing-input-secret", "invalid-input-secret", "bad-request"].includes(c))) return { kind: "provider_configuration_error" };
  if (codes.includes("internal-error")) return { kind: "temporary" };

  if (body.success !== true || body.hostname !== TURNSTILE_EXPECTED_HOSTNAME || body.action !== TURNSTILE_EXPECTED_ACTION_PRODUCT_ORDER) {
    return { kind: "invalid" };
  }
  return { kind: "valid" };
}

interface ProductOrderRequest {
  checkoutRequestId: string;
  checkoutAccessToken: string;
  customerName: string;
  customerEmail: string;
  productSlugs: string[];
  turnstileToken: string;
}

function extractProductOrderRequest(body: unknown): ProductOrderRequest | null {
  const r = asRecord(body);
  if (!r) return null;
  const expected = ["checkout_request_id", "checkout_access_token", "customer_name", "customer_email", "product_slugs", "turnstile_token"];
  const keys = Object.keys(r);
  if (keys.length !== expected.length || !expected.every((k) => keys.includes(k))) return null;
  if (typeof r.checkout_request_id !== "string" || !UUID_REGEX.test(r.checkout_request_id)) return null;
  if (typeof r.checkout_access_token !== "string" || !CHECKOUT_ACCESS_TOKEN_REGEX.test(r.checkout_access_token)) return null;
  if (typeof r.customer_name !== "string") return null;
  const name = r.customer_name.trim();
  if (name.length < 2 || name.length > MAX_NAME_LENGTH) return null;
  if (typeof r.customer_email !== "string") return null;
  const email = r.customer_email.trim();
  if (email.length === 0 || email.length > 254 || !EMAIL_REGEX.test(email)) return null;
  if (!Array.isArray(r.product_slugs) || r.product_slugs.length === 0 || r.product_slugs.length > MAX_PRODUCT_SLUGS) return null;
  const slugs: string[] = [];
  for (const x of r.product_slugs) {
    if (typeof x !== "string" || !PRODUCT_SLUG_REGEX.test(x)) return null;
    slugs.push(x);
  }
  if (typeof r.turnstile_token !== "string" || r.turnstile_token.length === 0 || r.turnstile_token.length > MAX_TURNSTILE_TOKEN_LENGTH) return null;
  return { checkoutRequestId: r.checkout_request_id, checkoutAccessToken: r.checkout_access_token, customerName: name, customerEmail: email, productSlugs: slugs, turnstileToken: r.turnstile_token };
}

function classifyRpcError(error: PostgrestError) {
  const m = error.message ?? "";
  if (m.includes("não existem ou estão inativos")) return { status: 422, code: "product_not_found_or_inactive", message: "Um ou mais produtos selecionados não estão disponíveis no momento." };
  if (m.includes("produto principal")) return { status: 400, code: "primary_product_required", message: "O produto principal é obrigatório nesta compra." };
  if (m.includes("produto repetido")) return { status: 400, code: "duplicate_product", message: "Um produto foi selecionado mais de uma vez." };
  if (m.includes("moedas diferentes")) return { status: 422, code: "product_currency_mismatch", message: "Não foi possível calcular o valor desta compra." };
  if (m.includes("já foi usado com") || m.includes("outro fluxo/provedor")) return { status: 409, code: "checkout_conflict", message: "Esta tentativa de compra já foi iniciada com dados diferentes." };
  return { status: 500, code: "database_error", message: "Não foi possível criar o pedido agora." };
}

interface OrderRow {
  order_id: string;
  public_id: string;
  amount_cents: number;
  currency: string;
  customer_email: string;
  order_created_at: string;
  efi_txid: string | null;
  efi_location_id: number | null;
  efi_environment: string;
  item_slugs: string[];
  item_names: string[];
}

function validStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.length <= MAX_PRODUCT_SLUGS && v.every((x) => typeof x === "string" && x.length > 0);
}

function isValidOrderResult(data: unknown): data is [OrderRow] {
  if (!Array.isArray(data) || data.length !== 1) return false;
  const r = asRecord(data[0]);
  if (!r) return false;
  return typeof r.order_id === "string" && UUID_REGEX.test(r.order_id)
    && typeof r.public_id === "string" && UUID_REGEX.test(r.public_id)
    && typeof r.amount_cents === "number" && Number.isSafeInteger(r.amount_cents) && r.amount_cents > 0
    && r.currency === "BRL"
    && typeof r.customer_email === "string"
    && typeof r.order_created_at === "string"
    && r.efi_environment === EFI_ENVIRONMENT
    && (r.efi_txid === null || (typeof r.efi_txid === "string" && TXID_REGEX.test(r.efi_txid)))
    && (r.efi_location_id === null || (typeof r.efi_location_id === "number" && Number.isSafeInteger(r.efi_location_id) && r.efi_location_id > 0))
    && validStringArray(r.item_slugs)
    && validStringArray(r.item_names)
    && (r.item_slugs as string[]).length === (r.item_names as string[]).length;
}

interface RateLimitRow { allowed: boolean; retry_after_seconds: number; }
function isValidRateLimitResult(data: unknown): data is [RateLimitRow] {
  const r = Array.isArray(data) && data.length === 1 ? asRecord(data[0]) : null;
  return !!r && typeof r.allowed === "boolean" && typeof r.retry_after_seconds === "number" && Number.isInteger(r.retry_after_seconds) && r.retry_after_seconds >= 0;
}

function centsToAmountString(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function moneyToCents(value: unknown): number | null {
  if (typeof value !== "string" || !MONEY_RE.test(value)) return null;
  const [whole, fraction] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

function checkoutIdToTxid(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

async function oauth(httpClient: Deno.HttpClient): Promise<string | null> {
  const basic = btoa(`${EFI_CLIENT_ID}:${EFI_CLIENT_SECRET}`);
  let response: Response;
  try {
    response = await efiFetch(httpClient, `${EFI_BASE_URL}/oauth/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json", Accept: "application/json", "Accept-Encoding": "identity" },
      body: JSON.stringify({ grant_type: "client_credentials" }),
    });
  } catch {
    return null;
  }
  const body = asRecord(await readJson(response));
  if (!response.ok || typeof body?.access_token !== "string" || body.access_token.length === 0) return null;
  return body.access_token;
}

interface ChargeInfo {
  txid: string;
  status: string;
  locationId: number;
  pixCopyPaste: string;
  qrBase64: string | null;
  receivedCents: number;
  endToEndId: string | null;
}

type ChargeResult = { kind: "ok"; charge: ChargeInfo } | { kind: "not_found" } | { kind: "temporary" } | { kind: "rejected" };

async function loadQr(httpClient: Deno.HttpClient, accessToken: string, locationId: number, pixCopy: string): Promise<{ kind: "ok"; base64: string | null } | { kind: "temporary" } | { kind: "rejected" }> {
  let response: Response;
  try {
    response = await efiFetch(httpClient, `${EFI_BASE_URL}/v2/loc/${locationId}/qrcode`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Accept-Encoding": "identity" },
    });
  } catch {
    return { kind: "temporary" };
  }
  if (response.status === 408 || response.status === 423 || response.status === 429 || response.status >= 500) return { kind: "temporary" };
  const b = asRecord(await readJson(response));
  if (!response.ok || !b || typeof b.qrcode !== "string" || b.qrcode !== pixCopy) return { kind: "rejected" };
  let base64: string | null = null;
  if (typeof b.imagemQrcode === "string" && b.imagemQrcode.length > 0) {
    const marker = "base64,";
    const i = b.imagemQrcode.indexOf(marker);
    base64 = i >= 0 ? b.imagemQrcode.slice(i + marker.length) : b.imagemQrcode;
  }
  return { kind: "ok", base64 };
}

function parseProviderPix(body: Record<string, unknown>, txid: string): { receivedCents: number; endToEndId: string | null } {
  let receivedCents = 0;
  let endToEndId: string | null = null;
  if (Array.isArray(body.pix)) {
    for (const p0 of body.pix) {
      const p = asRecord(p0);
      if (!p || p.txid !== txid) continue;
      const cents = moneyToCents(p.valor);
      if (cents !== null) receivedCents += cents;
      if (!endToEndId && typeof p.endToEndId === "string" && p.endToEndId.length > 0) endToEndId = p.endToEndId;
    }
  }
  return { receivedCents, endToEndId };
}

async function loadCharge(httpClient: Deno.HttpClient, accessToken: string, order: OrderRow, txid: string): Promise<ChargeResult> {
  let response: Response;
  try {
    response = await efiFetch(httpClient, `${EFI_BASE_URL}/v2/cob/${encodeURIComponent(txid)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Accept-Encoding": "identity" },
    });
  } catch {
    return { kind: "temporary" };
  }

  const body = asRecord(await readJson(response));
  const providerName = typeof body?.nome === "string" ? body.nome : null;
  if (response.status === 404 || (response.status === 400 && providerName === "cobranca_nao_encontrada")) return { kind: "not_found" };
  if (response.status === 408 || response.status === 423 || response.status === 429 || response.status >= 500) return { kind: "temporary" };
  if (!response.ok || !body) return { kind: "rejected" };

  const loc = asRecord(body.loc);
  const locationId = Number(loc?.id);
  const originalCents = moneyToCents(asRecord(body.valor)?.original);
  if (body.txid !== txid || body.chave !== EFI_PIX_KEY || originalCents !== order.amount_cents || typeof body.status !== "string" || !Number.isSafeInteger(locationId) || locationId <= 0 || typeof body.pixCopiaECola !== "string" || body.pixCopiaECola.length === 0) {
    return { kind: "rejected" };
  }

  const qr = await loadQr(httpClient, accessToken, locationId, body.pixCopiaECola);
  if (qr.kind !== "ok") return qr.kind === "temporary" ? { kind: "temporary" } : { kind: "rejected" };
  const pix = parseProviderPix(body, txid);
  return { kind: "ok", charge: { txid, status: body.status, locationId, pixCopyPaste: body.pixCopiaECola, qrBase64: qr.base64, receivedCents: pix.receivedCents, endToEndId: pix.endToEndId } };
}

async function createCharge(httpClient: Deno.HttpClient, accessToken: string, order: OrderRow, txid: string): Promise<ChargeResult> {
  let response: Response;
  try {
    response = await efiFetch(httpClient, `${EFI_BASE_URL}/v2/cob/${encodeURIComponent(txid)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json", "Accept-Encoding": "identity" },
      body: JSON.stringify({
        calendario: { expiracao: 3600 },
        valor: { original: centsToAmountString(order.amount_cents) },
        chave: EFI_PIX_KEY,
        solicitacaoPagador: "Pagamento do Guia de Evolução de Enfermagem",
      }),
    });
  } catch {
    return { kind: "temporary" };
  }

  const body = asRecord(await readJson(response));
  const providerName = typeof body?.nome === "string" ? body.nome : null;
  if (response.status === 408 || response.status === 423 || response.status === 429 || response.status >= 500) return { kind: "temporary" };
  if (response.status === 409 && providerName === "txid_duplicado") return await loadCharge(httpClient, accessToken, order, txid);
  if (!response.ok || !body) return { kind: "rejected" };

  const loc = asRecord(body.loc);
  const locationId = Number(loc?.id);
  const originalCents = moneyToCents(asRecord(body.valor)?.original);
  if (body.txid !== txid || originalCents !== order.amount_cents || typeof body.status !== "string" || !Number.isSafeInteger(locationId) || locationId <= 0 || typeof body.pixCopiaECola !== "string" || body.pixCopiaECola.length === 0) return { kind: "rejected" };

  const qr = await loadQr(httpClient, accessToken, locationId, body.pixCopiaECola);
  if (qr.kind !== "ok") return qr.kind === "temporary" ? { kind: "temporary" } : { kind: "rejected" };
  return { kind: "ok", charge: { txid, status: body.status, locationId, pixCopyPaste: body.pixCopiaECola, qrBase64: qr.base64, receivedCents: 0, endToEndId: null } };
}

async function linkCharge(orderId: string, txid: string, locationId: number): Promise<boolean> {
  const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await supabase.rpc("link_efi_charge", { p_order_id: orderId, p_efi_txid: txid, p_efi_location_id: locationId });
  if (error || !Array.isArray(data) || data.length !== 1) return false;
  const r = asRecord(data[0]);
  return !!r && r.order_id === orderId && r.efi_txid === txid && Number(r.efi_location_id) === locationId;
}

async function markPaidIfVerified(order: OrderRow, charge: ChargeInfo): Promise<boolean> {
  if (charge.status !== "CONCLUIDA" || charge.receivedCents < order.amount_cents || !charge.endToEndId) return false;
  const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await supabase.rpc("mark_order_paid_efi", {
    p_order_id: order.order_id,
    p_efi_txid: charge.txid,
    p_paid_amount_cents: order.amount_cents,
    p_efi_end_to_end_id: charge.endToEndId,
  });
  return !error && Array.isArray(data) && data.length === 1;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return handlePreflight(origin);
  if (req.method !== "POST") return errorResponse(405, "method_not_allowed", "Método não permitido.", origin, { Allow: "POST, OPTIONS" });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TURNSTILE_SECRET_KEY || !TURNSTILE_EXPECTED_HOSTNAME || !TURNSTILE_EXPECTED_ACTION_PRODUCT_ORDER || !RATE_LIMIT_HASH_SECRET || !ALLOWED_ORIGIN || !EFI_CLIENT_ID || !EFI_CLIENT_SECRET || !EFI_CERT_B64 || !EFI_KEY_B64 || !EFI_PIX_KEY || RATE_LIMIT_HASH_SECRET.length < MIN_RATE_LIMIT_HASH_SECRET_LENGTH) {
    return errorResponse(500, "server_misconfigured", "Configuração do servidor incompleta.", origin);
  }
  if (!isAllowedOrigin(origin)) return errorResponse(403, "origin_not_allowed", "Origem não permitida.", origin);

  let cert: string;
  let key: string;
  try {
    cert = decodeB64Utf8(EFI_CERT_B64);
    key = decodeB64Utf8(EFI_KEY_B64);
  } catch {
    return errorResponse(500, "server_misconfigured", "Configuração do servidor incompleta.", origin);
  }
  if (!cert.includes("-----BEGIN CERTIFICATE-----") || !key.includes("-----BEGIN PRIVATE KEY-----")) return errorResponse(500, "server_misconfigured", "Configuração do servidor incompleta.", origin);

  const media = (req.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (media !== "application/json") return errorResponse(415, "unsupported_media_type", "Content-Type deve ser application/json.", origin);

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return errorResponse(413, "payload_too_large", "Corpo da requisição excede o limite permitido.", origin);

  let raw = "";
  try { raw = await req.text(); } catch { return errorResponse(400, "invalid_body", "Não foi possível ler o corpo da requisição.", origin); }
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return errorResponse(413, "payload_too_large", "Corpo da requisição excede o limite permitido.", origin);

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return errorResponse(400, "invalid_json", "Corpo da requisição não é um JSON válido.", origin); }
  const input = extractProductOrderRequest(parsed);
  if (!input) return errorResponse(400, "invalid_request", "Corpo inválido para criar o pedido.", origin);

  const remoteIp = extractTrustedClientIp(req);
  const turn = await verifyTurnstileToken(input.turnstileToken, remoteIp);
  if (turn.kind === "temporary") return errorResponse(503, "human_verification_temporarily_unavailable", "Não foi possível confirmar a verificação de segurança agora. Tente novamente em instantes.", origin);
  if (turn.kind === "provider_configuration_error") return errorResponse(500, "server_misconfigured", "Configuração do servidor incompleta.", origin);
  if (turn.kind === "invalid") return errorResponse(403, "human_verification_failed", "Não foi possível confirmar a verificação de segurança.", origin);

  const email = input.customerEmail.toLowerCase();
  const ipHash = remoteIp ? await computeHmacHex(RATE_LIMIT_HASH_SECRET, `ip:${remoteIp}`) : null;
  const emailHash = await computeHmacHex(RATE_LIMIT_HASH_SECRET, `email:${email}`);
  const requestHash = await computeHmacHex(RATE_LIMIT_HASH_SECRET, `request:${input.checkoutRequestId}:email:${email}:environment:efi:${EFI_ENVIRONMENT}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const rl = await supabase.rpc("record_checkout_attempt", { p_ip_hash: ipHash, p_email_hash: emailHash, p_request_hash: requestHash });
  if (rl.error || !isValidRateLimitResult(rl.data)) return errorResponse(500, "database_error", "Não foi possível processar o pedido agora.", origin);
  if (!rl.data[0].allowed) {
    const h: Record<string, string> = {};
    if (rl.data[0].retry_after_seconds > 0) h["Retry-After"] = String(rl.data[0].retry_after_seconds);
    return errorResponse(429, "rate_limit_exceeded", "Muitas tentativas em pouco tempo. Tente novamente em instantes.", origin, h);
  }

  const rpc = await supabase.rpc("create_or_get_product_order_with_items_efi", {
    p_checkout_request_id: input.checkoutRequestId,
    p_checkout_access_token: input.checkoutAccessToken,
    p_product_slugs: input.productSlugs,
    p_customer_name: input.customerName,
    p_customer_email: input.customerEmail,
    p_terms_version: TERMS_VERSION,
    p_privacy_version: PRIVACY_VERSION,
    p_efi_environment: EFI_ENVIRONMENT,
  });

  if (rpc.error) {
    const c = classifyRpcError(rpc.error);
    return errorResponse(c.status, c.code, c.message, origin);
  }
  if (!isValidOrderResult(rpc.data)) return errorResponse(500, "database_error", "Não foi possível criar o pedido agora.", origin);

  const order = rpc.data[0];
  // Trava a escolha do Pix antes da chamada externa; a seleção de cartão
  // usa o mesmo bloqueio de linha na RPC, impedindo as duas cobranças.
  const { data: claimedPix, error: claimError } = await supabase.rpc("claim_efi_pix_checkout", { p_order_id: order.order_id });
  if (claimError) return errorResponse(500, "database_error", "Não foi possível processar o pedido agora.", origin);
  if (claimedPix !== true)
    return errorResponse(409, "checkout_conflict", "Esta tentativa de compra já foi iniciada com cartão.", origin);

  let httpClient: Deno.HttpClient | null = null;
  try {
    httpClient = Deno.createHttpClient({ cert, key });
    const token = await oauth(httpClient);
    if (!token) return errorResponse(503, "payment_provider_temporarily_unavailable", "O provedor de pagamento está temporariamente indisponível. Tente novamente em instantes.", origin);

    const desiredTxid = checkoutIdToTxid(input.checkoutRequestId);
    let result: ChargeResult;
    if (order.efi_txid) {
      result = await loadCharge(httpClient, token, order, order.efi_txid);
      if (result.kind === "not_found") return errorResponse(409, "manual_reconciliation_required", "Não foi possível localizar a cobrança vinculada. Entre em contato com o suporte.", origin);
    } else {
      const existing = await loadCharge(httpClient, token, order, desiredTxid);
      result = existing.kind === "not_found" ? await createCharge(httpClient, token, order, desiredTxid) : existing;
    }

    if (result.kind === "temporary") return errorResponse(503, "payment_provider_temporarily_unavailable", "O provedor de pagamento está temporariamente indisponível. Tente novamente em instantes.", origin);
    if (result.kind !== "ok") return errorResponse(502, "payment_provider_error", "Não foi possível iniciar o pagamento agora. Tente novamente em instantes.", origin);

    const charge = result.charge;
    if (!order.efi_txid || order.efi_location_id !== charge.locationId) {
      const linked = await linkCharge(order.order_id, charge.txid, charge.locationId);
      if (!linked) return errorResponse(500, "order_link_persistence_failed", "O pagamento foi iniciado, mas não foi possível confirmar o registro agora. Tente novamente com os mesmos dados.", origin);
    }

    let paid = false;
    if (charge.status === "CONCLUIDA") paid = await markPaidIfVerified(order, charge);

    const summary = {
      public_id: order.public_id,
      amount_cents: order.amount_cents,
      currency: order.currency,
      items: order.item_slugs.map((slug, i) => ({ slug, name: order.item_names[i] })),
    };

    if (charge.status === "CONCLUIDA") {
      return jsonResponse(200, {
        ok: true,
        order: summary,
        payment: { provider: "efi", efi_txid: charge.txid, status: paid ? "processed" : "processing", status_detail: paid ? "accredited" : "confirmation_pending", pix: null },
      }, origin);
    }

    if (charge.status !== "ATIVA") {
      return jsonResponse(202, {
        ok: true,
        order: summary,
        payment: { provider: "efi", efi_txid: charge.txid, status: "processing", status_detail: charge.status, pix: null },
      }, origin);
    }

    return jsonResponse(200, {
      ok: true,
      order: summary,
      payment: {
        provider: "efi",
        efi_txid: charge.txid,
        status: "action_required",
        status_detail: "waiting_transfer",
        pix: { qr_code: charge.pixCopyPaste, qr_code_base64: charge.qrBase64, ticket_url: null },
      },
    }, origin);
  } catch (e) {
    console.error("[create-product-order-efi-prod] Falha inesperada.", { error_type: e instanceof Error ? e.name : "unknown" });
    return errorResponse(503, "payment_provider_temporarily_unavailable", "O provedor de pagamento está temporariamente indisponível. Tente novamente em instantes.", origin);
  } finally {
    try { httpClient?.close(); } catch { /* no-op */ }
  }
});
