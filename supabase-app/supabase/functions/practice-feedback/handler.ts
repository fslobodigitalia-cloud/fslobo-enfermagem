/**
 * Manipulador HTTP da correção assistida por IA. Todas as dependências (autenticação, frequência, provedor, log)
 * são injetadas: o mesmo código roda na Edge Function e nos testes com provedor simulado.
 *
 * Garantias: autenticação validada; entrada limitada; frequência controlada ANTES de chamar o provedor; saída
 * validada; nenhum log com texto do aluno; nenhuma persistência da redação.
 */
import { ALL_IDS, EXERCISE_ID } from "./rubric.ts";
import { assemble } from "./validate.ts";
import { ProviderError, type Provider } from "./provider.ts";
import { stripControl } from "./text.ts";

export const MIN_CHARS = 20;
export const MAX_CHARS = 2000;
const MAX_BODY_BYTES = 12_000;

export type Acquire = { allowed: boolean; reason: string; retryAfter: number; eventId?: number };
export type Deps = {
  authenticate(req: Request): Promise<{ userId: string } | null>;
  acquire(userId: string): Promise<Acquire>;
  release(userId: string, eventId: number): Promise<void>;
  provider: Provider | null;
  log(entry: Record<string, unknown>): void;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "600",
};
const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });
const fail = (status: number, error: string, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  json(status, { ok: false, error, message, ...extra }, headers);

const cp = (s: string) => Array.from(s).length;

export function createHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "POST") return fail(405, "method_not_allowed", "Método não permitido.");

    const started = Date.now();
    let raw: string;
    try {
      raw = await req.text();
    } catch {
      return fail(400, "bad_request", "Não foi possível ler o pedido.");
    }
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return fail(413, "too_large", "O pedido é grande demais.");
    let body: Record<string, unknown>;
    try {
      const p = JSON.parse(raw);
      if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error("x");
      body = p as Record<string, unknown>;
    } catch {
      return fail(400, "bad_request", "Pedido inválido.");
    }

    const user = await deps.authenticate(req);
    if (!user) return fail(401, "unauthorized", "Entre na sua conta para usar a correção.");

    // ── sinalizar apontamento incorreto: só metadados (item da rubrica e categoria), nunca texto ──
    if (body.op === "flag") {
      const rubric = typeof body.rubric_id === "string" ? body.rubric_id : "";
      const category = typeof body.category === "string" ? body.category : "";
      if (!ALL_IDS.includes(rubric) || !["ausente", "contradicao", "nao_fornecida", "clareza"].includes(category) || body.exercise_id !== EXERCISE_ID) {
        return fail(400, "bad_request", "Sinalização inválida.");
      }
      deps.log({ event: "flag_incorrect", exercise_id: EXERCISE_ID, rubric_id: rubric, category, origin: body.origin === "regra" ? "regra" : "ia" });
      return json(200, { ok: true });
    }

    if (body.op !== "evaluate") return fail(400, "bad_request", "Operação inválida.");
    if (body.exercise_id !== EXERCISE_ID) return fail(400, "exercise_not_supported", "A correção por IA está disponível só no exercício-piloto.");
    if (typeof body.text !== "string") return fail(400, "bad_request", "Texto ausente.");
    const text = stripControl(body.text).replace(/\r\n/g, "\n").trim();
    const n = cp(text);
    if (n < MIN_CHARS) return fail(400, "text_too_short", `Escreva ao menos ${MIN_CHARS} caracteres para corrigir.`);
    if (n > MAX_CHARS) return fail(400, "text_too_long", `A correção aceita até ${MAX_CHARS} caracteres. Seu texto tem ${n}.`);

    if (!deps.provider) {
      deps.log({ event: "not_configured" });
      return fail(503, "ai_not_configured", "A correção por IA ainda não está configurada neste ambiente. Seu rascunho continua salvo.");
    }

    let slot: Acquire;
    try {
      slot = await deps.acquire(user.userId);
    } catch {
      deps.log({ event: "rate_check_error" });
      return fail(503, "ai_unavailable", "A correção está indisponível agora. Seu rascunho continua salvo.");
    }
    if (!slot.allowed) {
      const retry = Math.max(1, slot.retryAfter || 60);
      const msg = slot.reason === "rate_limited"
        ? "Muitas correções em pouco tempo. Aguarde um pouco e tente de novo."
        : "Limite de correções atingido por agora. Tente mais tarde.";
      deps.log({ event: "limited", reason: slot.reason });
      return fail(429, slot.reason, msg, { retry_after_seconds: retry }, { "Retry-After": String(retry) });
    }

    try {
      const r = await deps.provider(text);
      const result = assemble(text, r.out);
      deps.log({
        event: "evaluated", chars: n, model: r.model, input_tokens: r.inputTokens, output_tokens: r.outputTokens,
        findings: result.findings.length, hits: result.hits.length, discarded: result.discarded, assessable: result.assessable, ms: Date.now() - started,
      });
      return json(200, { ...result, model: r.model });
    } catch (e) {
      if (slot.eventId != null) { try { await deps.release(user.userId, slot.eventId); } catch { /* ignora */ } }
      const code = e instanceof ProviderError ? e.code : "unavailable";
      deps.log({ event: "provider_error", code, ms: Date.now() - started });
      return fail(502, "ai_unavailable", "A correção está indisponível agora. Seu rascunho continua salvo; tente de novo em instantes.");
    }
  };
}
