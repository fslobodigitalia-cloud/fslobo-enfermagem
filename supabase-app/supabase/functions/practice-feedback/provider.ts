/**
 * Chamada ao provedor de IA (Anthropic), SOMENTE no servidor. A chave vem do segredo ANTHROPIC_API_KEY da Edge
 * Function (nunca do navegador, do código ou de logs). Saída estruturada validada por esquema; limite de saída fixo.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { ALL_IDS, HIT_IDS } from "./rubric.ts";
import { buildSystemPrompt, buildUserMessage } from "./prompt.ts";
import type { ModelOut } from "./validate.ts";

const ids = ALL_IDS as [string, ...string[]];
const hitIds = HIT_IDS as [string, ...string[]];

export const ModelSchema = z.object({
  assessable: z.boolean(),
  limitation: z.string(),
  hits: z.array(z.object({ rubric_id: z.enum(hitIds), quote: z.string() })),
  findings: z.array(z.object({
    category: z.enum(["ausente", "contradicao", "nao_fornecida", "clareza"]),
    rubric_id: z.enum(ids),
    quote: z.string().nullable(),
    explanation: z.string(),
    certainty: z.enum(["alta", "media", "baixa"]),
  })),
});

export type ProviderCode = "unavailable" | "refused" | "invalid_output" | "timeout";
export class ProviderError extends Error {
  constructor(public code: ProviderCode, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export type ProviderResult = { out: ModelOut; inputTokens: number; outputTokens: number; model: string };
export type Provider = (text: string) => Promise<ProviderResult>;

export const MAX_OUTPUT_TOKENS = 6000;
// Sonnet 5.5 ($2/$10 por milhão de tokens). Opus só se o dono trocar o segredo AI_MODEL de propósito; NÃO há fallback automático
// para outro modelo: se este falhar, o aluno vê "indisponível" e o rascunho fica salvo.
export const DEFAULT_MODEL = "claude-sonnet-5-5";
export type Effort = "low" | "medium" | "high";

export function makeAnthropicProvider(cfg: { apiKey: string; model?: string; effort?: Effort; timeoutMs?: number }): Provider {
  const model = cfg.model || DEFAULT_MODEL;
  const effort: Effort = cfg.effort ?? "medium";
  // maxRetries 1: o SDK repete só falha de rede/5xx/429 uma vez. Sem retentativa por conta própria (custo).
  const client = new Anthropic({ apiKey: cfg.apiKey, timeout: cfg.timeoutMs ?? 45_000, maxRetries: 1 });
  return async (text: string) => {
    try {
      const res = await client.messages.parse({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: buildSystemPrompt(),
        messages: [{ role: "user", content: buildUserMessage(text) }],
        output_config: { effort, format: zodOutputFormat(ModelSchema) },
      });
      if (res.stop_reason === "refusal") throw new ProviderError("refused");
      if (res.stop_reason === "max_tokens") throw new ProviderError("invalid_output", "max_tokens");
      if (!res.parsed_output) throw new ProviderError("invalid_output", "sem saída estruturada");
      return { out: res.parsed_output as ModelOut, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, model };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ProviderError("timeout");
      if (e instanceof Anthropic.APIError) throw new ProviderError("unavailable", `http ${e.status ?? "?"}`);
      throw new ProviderError("unavailable", e instanceof Error ? e.name : "erro");
    }
  };
}
