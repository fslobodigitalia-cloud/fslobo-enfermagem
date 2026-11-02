import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { getAppSupabase } from "./appSupabase";
import { AI_PILOT_EXERCISE, parseAiResult, type AiCategory, type AiClient, type AiFailure, type AiOutcome } from "../data/aiFeedback";

/**
 * Cliente da correção assistida por IA. A chamada ao provedor acontece SÓ no servidor (Edge Function
 * "practice-feedback", com a sessão do aluno). Aqui não existe chave de IA. Em qualquer falha o texto do aluno
 * não é tocado: quem chama só recebe o motivo.
 */
const FN = "practice-feedback";

const MESSAGES: Record<string, string> = {
  unauthorized: "Entre na sua conta de novo para usar a correção. Seu rascunho continua salvo.",
  ai_not_configured: "A correção por IA ainda não está configurada neste ambiente. Seu rascunho continua salvo.",
  rate_limited: "Muitas correções em pouco tempo. Aguarde um pouco e tente de novo.",
  daily_limit: "Limite de correções atingido por agora. Tente mais tarde.",
  global_limit: "Limite de correções atingido por agora. Tente mais tarde.",
  ai_unavailable: "A correção está indisponível agora. Seu rascunho continua salvo; tente de novo em instantes.",
  text_too_short: "Escreva um pouco mais para poder corrigir.",
  text_too_long: "O texto passa do limite da correção.",
};
const KNOWN = Object.keys(MESSAGES) as AiFailure["code"][];

const failure = (code: AiFailure["code"], message?: string, retryAfter?: number): AiFailure => ({
  ok: false, code, message: message ?? MESSAGES[code] ?? "Não foi possível corrigir agora. Seu rascunho continua salvo.", retryAfter,
});

async function readHttpError(e: FunctionsHttpError): Promise<AiFailure> {
  let body: { error?: string; message?: string; retry_after_seconds?: number } = {};
  try {
    body = await (e.context as Response).json();
  } catch {
    /* sem corpo legível */
  }
  const code = (KNOWN.includes(body.error as AiFailure["code"]) ? body.error : (e.context as Response).status === 401 ? "unauthorized" : "other") as AiFailure["code"];
  return failure(code, typeof body.message === "string" && body.message.length < 300 ? body.message : undefined, typeof body.retry_after_seconds === "number" ? body.retry_after_seconds : undefined);
}

export function createAiClient(): AiClient {
  return {
    async evaluate(text: string): Promise<AiOutcome> {
      try {
        const { data, error } = await getAppSupabase().functions.invoke(FN, { body: { op: "evaluate", exercise_id: AI_PILOT_EXERCISE, text } });
        if (error) {
          if (error instanceof FunctionsHttpError) return await readHttpError(error);
          if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) return failure("network", "Sem conexão com o servidor de correção. Seu rascunho continua salvo; tente de novo.");
          return failure("other");
        }
        const result = parseAiResult(data);
        if (!result) return failure("invalid_response", "A resposta da correção veio inesperada e foi descartada. Seu rascunho continua salvo.");
        return { ok: true, result };
      } catch {
        return failure("network", "Sem conexão com o servidor de correção. Seu rascunho continua salvo; tente de novo.");
      }
    },
    async flag(f: { rubric_id: string; category: AiCategory; origin: "ia" | "regra" }) {
      try {
        await getAppSupabase().functions.invoke(FN, { body: { op: "flag", exercise_id: AI_PILOT_EXERCISE, ...f } });
      } catch {
        /* melhor esforço: a marcação local já vale */
      }
    },
  };
}
