// ════════════════════════════════════════════════════════════════════════════
//  ENTRE NÓS TARÔ — FASE 3B: EDGE FUNCTION "get-order-downloads"
//
//  Endpoint PÚBLICO (chamado pelo navegador do cliente, sem login) que
//  entrega, de forma privada e temporária, os PDFs de um pedido de produto
//  digital já pago. Não cria nada, não cobra nada, não altera
//  orders.status — é inteiramente de LEITURA (e, quando pago, geração de
//  signed URLs no Storage).
//
//  Fluxo:
//    1. valida o corpo: exatamente { public_id, checkout_access_token };
//    2. autentica o pedido via public.get_order_downloads_info() — MESMO
//       mecanismo de hash (SHA-256 de checkout_access_token) já usado por
//       create_or_get_order_with_questions()/
//       create_or_get_product_order_with_items() para gravar
//       orders.access_token_hash. Nenhum esquema de autenticação novo é
//       inventado aqui; a comparação em si acontece dentro da RPC, em SQL
//       — access_token_hash nunca sai do banco, nunca é devolvido, nunca é
//       logado (nem o token em si, em nenhum caminho);
//    3. se o pedido não está pago (qualquer status diferente de "paid"):
//       devolve { ok: true, status, downloads: [] } — nenhuma URL, nenhuma
//       consulta ao Storage;
//    4. se está pago: gera uma signed URL (válida por 15 minutos) para
//       CADA produto que está em order_items daquele pedido — nunca para
//       todo o catálogo, nunca para um produto que não foi comprado. Se
//       QUALQUER arquivo esperado não existir no Storage, a resposta
//       inteira falha com um erro controlado (nunca uma URL quebrada,
//       nunca detalhe de bucket/caminho no corpo da resposta, nunca altera
//       orders.status);
//    5. cada chamada autenticada gera links NOVOS — nenhuma URL é
//       reaproveitada nem marcada como "já usada"; enquanto o pedido
//       continuar pago, uma nova chamada sempre funciona, mesmo depois que
//       links anteriores expiraram.
//
//  ─────────────────────────── Segurança ───────────────────────────────────
//  service_role só existe dentro desta função (nunca no navegador). Bucket
//  "product-files" é privado, sem nenhuma policy de storage.objects para
//  anon/authenticated (ver migration 20260815_010) — só service_role gera
//  signed URL. Corpo aceito não tem NENHUM campo de preço, product_slugs
//  ou caminho de arquivo — o cliente só prova posse do pedido (public_id +
//  checkout_access_token); quais produtos foram comprados e onde estão no
//  Storage vêm inteiramente do banco.
//
//  Sem Turnstile e sem rate limiting: não fazem parte do escopo desta
//  etapa (não pedidos) — a segurança do endpoint é a posse dos dois
//  valores de alta entropia (public_id de 122 bits + checkout_access_token
//  de 256 bits), já o mecanismo de acesso pensado desde a criação de
//  access_token_hash ("uso futuro: combinado com public_id, autentica a
//  página privada do cliente").
//
//  Implantada no projeto Supabase nesta etapa.
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2.112.0";

// ─────────────────────────────── Configuração ───────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN");
const PREVIEW_ORIGIN = Deno.env.get("EFI_CARD_PREVIEW_ORIGIN");

const MAX_BODY_BYTES = 2 * 1024; // 2 KB — corpo tem só dois campos, pequenos.
// ALTERAÇÃO (etapa 1 do carrinho multiproduto): era 5 ("catálogo do MVP: 1
// produto principal + 4 bumps, no máximo"). Alinhado ao limite real de
// itens por pedido aceito por create_or_get_product_order_with_items_efi
// (v_slug_count > 16 → erro). Nenhuma outra lógica desta função foi
// alterada — autorização, signed URLs e status "paid" permanecem idênticos.
const MAX_ITEMS = 16; // limite de itens (arquivos) por pedido.
const SIGNED_URL_EXPIRES_IN_SECONDS = 900; // 15 minutos (requisito 7).

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECKOUT_ACCESS_TOKEN_REGEX = /^[0-9a-f]{64}$/;

// ──────────────────────────────────  CORS  ──────────────────────────────────
// Mesmo padrão de create-pix-order/create-product-order: ALLOWED_ORIGIN é
// OBRIGATÓRIO, nunca wildcard, sempre a origem EXATA configurada.
function isAllowedOrigin(origin: string | null): origin is string {
  return origin !== null && (origin === ALLOWED_ORIGIN || origin === PREVIEW_ORIGIN);
}

function buildCorsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  headers.set("Vary", "Origin");
  if (isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function handlePreflight(origin: string | null): Response {
  const headers = buildCorsHeaders(origin);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  return new Response(null, { status: 204, headers });
}

// ────────────────────────────── Respostas JSON ──────────────────────────────
function jsonResponse(status: number, body: unknown, origin: string | null): Response {
  const headers = buildCorsHeaders(origin);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(status: number, code: string, message: string, origin: string | null): Response {
  return jsonResponse(status, { ok: false, error: { code, message } }, origin);
}

// ───────────────────────────── Validação do corpo ────────────────────────────
interface DownloadsRequest {
  publicId: string;
  checkoutAccessToken: string;
}

/**
 * Contrato de entrada (requisito 3): exatamente estas duas chaves. Nunca
 * aceita preço, product_slugs ou caminho de arquivo — o cliente só prova
 * posse do pedido; o que foi comprado e onde está no Storage vêm
 * inteiramente do banco, via get_order_downloads_info().
 */
function extractDownloadsRequest(body: unknown): DownloadsRequest | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  const expectedKeys = ["public_id", "checkout_access_token"];
  if (keys.length !== expectedKeys.length || !expectedKeys.every((k) => keys.includes(k))) {
    return null;
  }

  const publicIdRaw = record.public_id;
  if (typeof publicIdRaw !== "string" || !UUID_REGEX.test(publicIdRaw)) {
    return null;
  }

  const checkoutAccessTokenRaw = record.checkout_access_token;
  if (typeof checkoutAccessTokenRaw !== "string" || !CHECKOUT_ACCESS_TOKEN_REGEX.test(checkoutAccessTokenRaw)) {
    return null;
  }

  return { publicId: publicIdRaw, checkoutAccessToken: checkoutAccessTokenRaw };
}

// ────────────────────── Validação do retorno do RPC ─────────────────────────
interface DownloadsInfoRow {
  order_id: string;
  status: string;
  order_kind: string;
  item_slugs: string[];
  item_names: string[];
  item_paths: string[];
  item_buckets: string[];
}

function isUuidString(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Aceita arrays VAZIOS (pedido pending_payment ainda não tem por que
 * expor itens) — diferente de isNonEmptyStringArray usado em
 * create-product-order, onde um pedido sem item nenhum é sempre inválido. */
function isStringArrayWithinLimit(value: unknown, maxLength: number): value is string[] {
  if (!Array.isArray(value) || value.length > maxLength) return false;
  return value.every((item) => isNonEmptyString(item));
}

function isValidDownloadsInfoResult(data: unknown): data is [DownloadsInfoRow] {
  if (!Array.isArray(data) || data.length !== 1) return false;
  const row = data[0];
  if (row === null || typeof row !== "object" || Array.isArray(row)) return false;
  const record = row as Record<string, unknown>;

  if (!isUuidString(record.order_id)) return false;
  if (!isNonEmptyString(record.status)) return false;
  if (record.order_kind !== "digital_product") return false;
  if (!isStringArrayWithinLimit(record.item_slugs, MAX_ITEMS)) return false;
  if (!isStringArrayWithinLimit(record.item_names, MAX_ITEMS)) return false;
  if (!isStringArrayWithinLimit(record.item_paths, MAX_ITEMS)) return false;
  if (!isStringArrayWithinLimit(record.item_buckets, MAX_ITEMS)) return false;

  const length = (record.item_slugs as string[]).length;
  if (
    (record.item_names as string[]).length !== length ||
    (record.item_paths as string[]).length !== length ||
    (record.item_buckets as string[]).length !== length
  ) {
    return false;
  }

  return true;
}

// ──────────────────────────────── Handler ───────────────────────────────────
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return handlePreflight(origin);
  }

  if (req.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "Método não permitido.", origin);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ALLOWED_ORIGIN) {
    return errorResponse(500, "server_misconfigured", "Configuração do servidor incompleta.", origin);
  }

  // Origem diferente da configurada NUNCA processa a chamada normal — CORS
  // é proteção de navegador, não autenticação; requisições sem Origin
  // (server-to-server) são permitidas passar, mesmo raciocínio já usado em
  // create-pix-order/create-product-order.
  if (origin !== null && !isAllowedOrigin(origin)) {
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

  const downloadsRequest = extractDownloadsRequest(parsedBody);
  if (downloadsRequest === null) {
    return errorResponse(
      400,
      "invalid_request",
      'Corpo inválido. Esperado exatamente {"public_id", "checkout_access_token"}.',
      origin,
    );
  }

  // ── Autenticação do pedido: ÚNICA fonte é get_order_downloads_info().
  //    NUNCA loga checkout_access_token (nem em texto puro, nem hash) em
  //    nenhum caminho deste arquivo.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let data: unknown;
  let rpcError: { message?: string; code?: string } | null;
  try {
    const rpcResult = await supabase.rpc("get_order_downloads_info", {
      p_public_id: downloadsRequest.publicId,
      p_checkout_access_token: downloadsRequest.checkoutAccessToken,
    });
    data = rpcResult.data;
    rpcError = rpcResult.error;
  } catch (caught) {
    console.error("[get-order-downloads] Exceção inesperada ao autenticar o pedido.", {
      category: "rpc_thrown_exception",
      error_type: caught instanceof Error ? caught.name : "unknown",
    });
    return errorResponse(500, "database_error", "Não foi possível consultar o pedido agora.", origin);
  }

  if (rpcError) {
    const message = typeof rpcError.message === "string" ? rpcError.message : "";
    // "pedido não encontrado" cobre, de propósito e sem distinção (ver
    // migration 20260815_010/011), três situações: public_id inexistente,
    // checkout_access_token que não confere, e pedido que existe mas não é
    // digital_product (tarô nunca alcançável por esta função).
    if (message.includes("pedido não encontrado")) {
      return errorResponse(404, "order_not_found", "Pedido não encontrado.", origin);
    }
    console.error("[get-order-downloads] RPC de autenticação do pedido falhou.", {
      category: "rpc_error",
      postgres_code: rpcError.code ?? null,
    });
    return errorResponse(500, "database_error", "Não foi possível consultar o pedido agora.", origin);
  }

  if (!isValidDownloadsInfoResult(data)) {
    console.error("[get-order-downloads] Resposta do RPC em formato inesperado.", {
      category: "invalid_rpc_response",
    });
    return errorResponse(500, "database_error", "Não foi possível consultar o pedido agora.", origin);
  }

  const info = data[0];

  // ── Pedido ainda não pago (ou em qualquer estado que não seja "paid" —
  //    inclui pending_payment e, defensivamente, qualquer estado terminal
  //    futuro): nenhuma URL, nenhuma consulta ao Storage. O status
  //    devolvido é sempre o REAL persistido, nunca fabricado.
  if (info.status !== "paid") {
    return jsonResponse(200, { ok: true, status: info.status, downloads: [] }, origin);
  }

  // ── Pedido pago: um pedido digital_product pago sempre tem pelo menos 1
  //    item (garantido por create_or_get_product_order_with_items, que
  //    cria pedido + itens atomicamente) — zero itens aqui é estado
  //    inconsistente, nunca "downloads vazio" silencioso.
  if (info.item_slugs.length === 0) {
    console.error("[get-order-downloads] Pedido pago sem nenhum order_item — estado inconsistente.", {
      category: "paid_order_without_items",
    });
    return errorResponse(500, "invalid_order_state", "Não foi possível preparar os downloads agora.", origin);
  }

  // ── Gera uma signed URL por item comprado — SÓ para esses, nunca para o
  //    catálogo inteiro. Se QUALQUER arquivo esperado não existir no
  //    Storage (ou qualquer outra falha), a resposta INTEIRA falha com um
  //    erro controlado — nunca uma URL quebrada, nunca parcial (requisito
  //    10). Nenhum detalhe de bucket/caminho é exposto na resposta nem
  //    logado.
  const downloads: { slug: string; name: string; url: string; expires_in: number }[] = [];
  for (let index = 0; index < info.item_slugs.length; index++) {
    const bucket = info.item_buckets[index];
    const path = info.item_paths[index];
    // { download: true } (Fase 3B-fix): força o navegador a BAIXAR o PDF em
    // vez de tentar renderizá-lo inline — corrige o caso relatado de
    // clientes recebendo "PDF em branco" ao abrir o link dentro de
    // navegadores internos do Facebook/Instagram (WebView), que tentam
    // exibir o Content-Type application/pdf sem o visualizador nativo do
    // Chrome/Safari. Não altera a expiração (SIGNED_URL_EXPIRES_IN_SECONDS
    // continua 900s/15min, ver constante acima) nem nenhuma outra regra de
    // autorização desta função.
    const { data: signedData, error: signedError } = await supabase
      .storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_URL_EXPIRES_IN_SECONDS, { download: true });

    if (signedError || !signedData?.signedUrl) {
      console.error("[get-order-downloads] Falha ao gerar signed URL para um item do pedido.", {
        category: "signed_url_generation_failed",
      });
      return errorResponse(
        503,
        "download_unavailable",
        "Não foi possível preparar os downloads agora. Tente novamente em instantes ou entre em contato com o suporte.",
        origin,
      );
    }

    downloads.push({
      slug: info.item_slugs[index],
      name: info.item_names[index],
      url: signedData.signedUrl,
      expires_in: SIGNED_URL_EXPIRES_IN_SECONDS,
    });
  }

  return jsonResponse(200, { ok: true, status: "paid", downloads }, origin);
});
