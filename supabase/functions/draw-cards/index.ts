// ════════════════════════════════════════════════════════════════════════════
//  ENTRE NÓS TARÔ — FASE 1: EDGE FUNCTION "draw-cards"
//
//  Única responsabilidade: validar a chamada (segredo interno + corpo) e
//  acionar public.draw_cards_for_question(p_question_id uuid) via RPC.
//  Toda a decisão de QUAIS cartas, em QUAL ordem e com QUAL orientação vem
//  inteiramente do PostgreSQL (ver supabase/migrations/20260805_004_...).
//  Esta função nunca escolhe carta, posição ou orientação, nunca faz INSERT
//  direto em drawn_cards, nunca usa Math.random() e nunca chama IA.
//
//  Protegida por um segredo interno (header x-internal-secret) — não por
//  JWT do Supabase Auth. Por isso verify_jwt está desligado só para esta
//  função em supabase/config.toml (ver comentário lá).
//
//  Não implantada em nenhum projeto Supabase por este arquivo — apenas o
//  código local da função, pronto para revisão manual.
// ════════════════════════════════════════════════════════════════════════════

import {
  createClient,
  type PostgrestError,
} from "npm:@supabase/supabase-js@2.112.0";

// ─────────────────────────────── Configuração ───────────────────────────────
// Lidas uma única vez, no carregamento do módulo. Nunca hardcoded, nunca
// impressas, nunca devolvidas na resposta.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");
// Opcional: se ausente, a resposta simplesmente não inclui
// Access-Control-Allow-Origin (nenhum navegador de origem cruzada consegue
// ler a resposta — aceitável nesta etapa, já que só infraestrutura interna
// chama esta função).
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN");

const MAX_BODY_BYTES = 4 * 1024; // 4 KB
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ──────────────────────────────────  CORS  ──────────────────────────────────
/**
 * Vary: Origin é enviado sempre que ALLOWED_ORIGIN está configurado —
 * mesmo quando a origem recebida NÃO bate — porque a resposta (com ou sem
 * Access-Control-Allow-Origin) já depende do valor de Origin; caches
 * intermediários precisam saber disso independentemente do resultado.
 * Access-Control-Allow-Origin em si só é enviado no match exato. Nunca "*".
 * Nunca Access-Control-Allow-Credentials (credenciais não são permitidas
 * nesta etapa).
 */
function buildCorsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  if (ALLOWED_ORIGIN) {
    headers.set("Vary", "Origin");
    if (origin === ALLOWED_ORIGIN) {
      headers.set("Access-Control-Allow-Origin", origin);
    }
  }
  return headers;
}

function handlePreflight(origin: string | null): Response {
  const headers = buildCorsHeaders(origin);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "content-type, x-internal-secret");
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
  // Resposta nunca deve ser cacheada — nem pelo cliente, nem por proxies
  // intermediários — já que carrega o resultado (ou erro) de uma operação
  // pontual sobre dados sensíveis do pedido.
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

function successResponse(questionId: string, cards: unknown[], origin: string | null): Response {
  return jsonResponse(200, { ok: true, question_id: questionId, cards }, origin);
}

// ───────────────────────── Comparação em tempo constante ────────────────────
/**
 * Evita que a diferença de tempo de resposta vaze informação sobre o quanto
 * do segredo recebido coincide com o valor configurado. Percorre sempre o
 * mesmo número de posições (o maior dos dois comprimentos).
 */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  const length = Math.max(bytesA.length, bytesB.length);
  let mismatch = bytesA.length === bytesB.length ? 0 : 1;
  for (let i = 0; i < length; i++) {
    const byteA = i < bytesA.length ? bytesA[i] : 0;
    const byteB = i < bytesB.length ? bytesB[i] : 0;
    mismatch |= byteA ^ byteB;
  }
  return mismatch === 0;
}

// ───────────────────────────── Validação do corpo ────────────────────────────
/**
 * Aceita exclusivamente { "question_id": "<uuid>" } — objeto simples, uma
 * única propriedade, valor em formato UUID. Qualquer outra coisa (array,
 * null, propriedades extras, tipos errados) é rejeitada. Isso também é o
 * que impede card_id/orientação/posição/order_id/status/dados do cliente
 * de entrarem por aqui: a função nunca aceitaria essas chaves.
 */
function extractQuestionId(body: unknown): string | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const entries = Object.keys(body as Record<string, unknown>);
  if (entries.length !== 1 || entries[0] !== "question_id") {
    return null;
  }
  const value = (body as Record<string, unknown>).question_id;
  if (typeof value !== "string" || !UUID_REGEX.test(value)) {
    return null;
  }
  return value;
}

// ─────────────────────── Classificação controlada de erros ──────────────────
/**
 * Categorias fechadas de erro conhecidas do RPC. Qualquer coisa fora dessas
 * cinco cai em "unknown_database_error" — nunca inventamos uma categoria
 * nova a partir de texto livre do Postgres.
 */
type RpcErrorCategory =
  | "question_not_found"
  | "partial_draw_state"
  | "order_status_blocks_draw"
  | "insufficient_card_catalog"
  | "invalid_request"
  | "unknown_database_error";

interface ClassifiedRpcError {
  category: RpcErrorCategory;
  status: number;
  code: string;
  message: string;
}

/**
 * public.draw_cards_for_question() sinaliza cada caso conhecido com uma
 * mensagem de erro própria (ver migration 004) — não usa SQLSTATEs
 * dedicados, então a classificação aqui é por trecho de mensagem.
 *
 * IMPORTANTE: error.message só é lido AQUI, em memória, para decidir a
 * categoria — o texto em si nunca é impresso em log nem devolvido ao
 * cliente. A estrutura resultante (category/status/code/message) é a
 * ÚNICA fonte usada tanto para montar a resposta HTTP quanto para o log —
 * evita classificar o mesmo erro duas vezes, com o risco de divergirem.
 */
function classifyRpcError(error: PostgrestError): ClassifiedRpcError {
  const message = typeof error.message === "string" ? error.message : "";

  if (message.includes("não encontrada")) {
    return {
      category: "question_not_found",
      status: 422,
      code: "question_not_found",
      message: "Pergunta não encontrada.",
    };
  }
  if (message.includes("estado parcial")) {
    return {
      category: "partial_draw_state",
      status: 409,
      code: "partial_draw_state",
      message: "O sorteio desta pergunta está em estado parcial e requer correção administrativa.",
    };
  }
  if (message.includes("bloqueia qualquer sorteio") || message.includes("fora dos status permitidos")) {
    return {
      category: "order_status_blocks_draw",
      status: 409,
      code: "order_status_blocks_draw",
      message: "O status atual do pedido não permite sorteio no momento.",
    };
  }
  if (message.includes("catálogo insuficiente")) {
    return {
      category: "insufficient_card_catalog",
      status: 422,
      code: "insufficient_card_catalog",
      message: "Catálogo de cartas insuficiente para realizar o sorteio.",
    };
  }
  if (message.includes("não pode ser nulo")) {
    return {
      category: "invalid_request",
      status: 400,
      code: "invalid_request",
      message: "question_id inválido.",
    };
  }

  return {
    category: "unknown_database_error",
    status: 500,
    code: "database_error",
    message: "Não foi possível processar o sorteio agora.",
  };
}

// ────────────────────── Validação do retorno bem-sucedido ───────────────────
/**
 * Confirma, antes de responder 200, que o RPC realmente devolveu as 3
 * cartas no formato esperado: array de exatamente 3 objetos não nulos, com
 * draw_order 1, 2 e 3 NESSA ORDEM (sem reordenar nada aqui) e question_id
 * de cada linha batendo com o question_id pedido. Qualquer desvio é tratado
 * como erro de banco — nunca respondemos 200 com menos de 3 cartas.
 */
function isValidDrawResult(data: unknown, questionId: string): data is Record<string, unknown>[] {
  if (!Array.isArray(data) || data.length !== 3) {
    return false;
  }
  for (let i = 0; i < 3; i++) {
    const row = data[i];
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      return false;
    }
    const record = row as Record<string, unknown>;
    if (record.draw_order !== i + 1) {
      return false;
    }
    if (record.question_id !== questionId) {
      return false;
    }
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
    return errorResponse(405, "method_not_allowed", "Método não permitido.", origin, {
      Allow: "POST, OPTIONS",
    });
  }

  // Configuração ausente é um erro de servidor, nunca do cliente — e sem
  // ela não dá pra fazer nem a checagem do segredo com segurança (duas
  // ausências não podem "combinar" e liberar o acesso).
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !INTERNAL_FUNCTION_SECRET) {
    return errorResponse(500, "server_misconfigured", "Configuração do servidor incompleta.", origin);
  }

  // Proteção interna: exige x-internal-secret correto. Em caso de falha,
  // não diferencia "ausente" de "incorreto", não loga o valor recebido e
  // não chega a tocar no banco.
  const providedSecret = req.headers.get("x-internal-secret");
  if (!providedSecret || !timingSafeEqual(providedSecret, INTERNAL_FUNCTION_SECRET)) {
    return errorResponse(401, "unauthorized", "Não autorizado.", origin);
  }

  // Content-Type estrito: extrai só o media type (antes do ";") e exige
  // igualdade exata com "application/json" — "application/json;
  // charset=utf-8" continua válido, mas "application/jsonp",
  // "text/application/json" e "application/json-extra" são rejeitados.
  const contentType = req.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return errorResponse(415, "unsupported_media_type", "Content-Type deve ser application/json.", origin);
  }

  // Verificação barata pelo header, antes de ler qualquer byte do corpo.
  const declaredLength = req.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_BODY_BYTES) {
      return errorResponse(413, "payload_too_large", "Corpo da requisição excede o limite permitido.", origin);
    }
  }

  // Lê como texto (não request.json() direto) para poder validar o
  // tamanho real mesmo quando Content-Length está ausente ou incorreto.
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

  const questionId = extractQuestionId(parsedBody);
  if (questionId === null) {
    return errorResponse(
      400,
      "invalid_request",
      'Corpo inválido. Esperado exatamente {"question_id": "<uuid>"}.',
      origin,
    );
  }

  // ── Acesso ao banco: criação do cliente + RPC + leitura inicial do
  //    resultado, tudo dentro do try/catch. Uma exceção lançada aqui (rede,
  //    client mal configurado etc.) nunca vaza stack nem mensagem — vira um
  //    500 genérico, com log mínimo e controlado.
  let data: unknown;
  let error: PostgrestError | null;
  try {
    // Cliente com a service_role key — nunca a chave publishable — e sem
    // qualquer persistência de sessão (esta função não representa um
    // usuário logado).
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    // Única operação de banco desta função: o RPC do sorteio. Nenhum
    // SELECT, nenhum INSERT direto, nenhuma seleção de carta em TypeScript.
    const rpcResult = await supabase.rpc("draw_cards_for_question", {
      p_question_id: questionId,
    });
    data = rpcResult.data;
    error = rpcResult.error;
  } catch (caught) {
    console.error("[draw-cards] Exceção inesperada ao acessar o banco.", {
      category: "rpc_thrown_exception",
      error_type: caught instanceof Error ? caught.name : "unknown",
    });
    return errorResponse(500, "database_error", "Não foi possível processar o sorteio agora.", origin);
  }

  if (error) {
    // Uma única classificação, usada tanto para o log quanto para a
    // resposta — nunca duas decisões separadas que poderiam divergir.
    // error.message só é lido dentro de classifyRpcError; nunca chega ao
    // console nem à resposta.
    const classified = classifyRpcError(error);
    console.error("[draw-cards] RPC falhou.", {
      category: classified.category,
      postgres_code: error.code ?? null,
    });
    return errorResponse(classified.status, classified.code, classified.message, origin);
  }

  if (!isValidDrawResult(data, questionId)) {
    console.error("[draw-cards] Resposta do RPC em formato inesperado.", {
      category: "invalid_rpc_response",
      received_count: Array.isArray(data) ? data.length : null,
    });
    return errorResponse(500, "database_error", "Não foi possível processar o sorteio agora.", origin);
  }

  return successResponse(questionId, data, origin);
});
