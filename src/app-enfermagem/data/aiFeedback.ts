/**
 * Tipos e validação do feedback assistido por IA (piloto). A resposta do servidor é validada de novo aqui, e o
 * mesmo validador protege o que foi guardado no navegador. Nada é nota: não há pontos, conquistas nem classificação.
 */
export const AI_PILOT_EXERCISE = "anotacao-dispneia-noite";
export const AI_MIN_CHARS = 20;
export const AI_MAX_CHARS = 2000;
export const AI_MAX_ROUNDS = 5;

export type AiCategory = "ausente" | "contradicao" | "nao_fornecida" | "clareza";
export type AiCertainty = "alta" | "media" | "baixa";

export type AiHit = { rubric_id: string; title: string; quote: string; note: string };
export type AiFinding = {
  id: string;
  category: AiCategory;
  severity: "factual" | "opcional";
  rubric_id: string;
  title: string;
  /** Trecho exato do aluno; null nas omissões. */
  quote: string | null;
  evidence: string;
  source: string;
  explanation: string;
  certainty: AiCertainty;
  origin: "ia" | "regra";
};
export type AiResult = {
  assessable: boolean;
  limitation: string;
  hits: AiHit[];
  findings: AiFinding[];
  discarded: number;
  notice: string;
  model: string;
  rubric_version: string;
};
export type AiRound = { n: number; at: number; text: string; result: AiResult; flagged: string[] };

export type AiFailure = {
  ok: false;
  code: "unauthorized" | "ai_not_configured" | "rate_limited" | "daily_limit" | "global_limit" | "ai_unavailable" | "text_too_short" | "text_too_long" | "network" | "invalid_response" | "other";
  message: string;
  retryAfter?: number;
};
export type AiOutcome = { ok: true; result: AiResult } | AiFailure;

/** Cliente injetado só na conta real (a demonstração pública nunca recebe um). */
export type AiClient = {
  evaluate(text: string): Promise<AiOutcome>;
  /** Melhor esforço: envia só o tipo do apontamento (item da rubrica e categoria), nunca o texto. */
  flag(f: { rubric_id: string; category: AiCategory; origin: "ia" | "regra" }): Promise<void>;
};

export const CATEGORY_LABEL: Record<AiCategory, string> = {
  ausente: "Informação ausente",
  contradicao: "Contradição com o caso",
  nao_fornecida: "Informação não fornecida",
  clareza: "Sugestão de clareza",
};

const CATS: AiCategory[] = ["ausente", "contradicao", "nao_fornecida", "clareza"];
const CERTS: AiCertainty[] = ["alta", "media", "baixa"];
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.length <= max ? v : null);

export function parseAiResult(raw: unknown): AiResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.assessable !== "boolean" || !Array.isArray(r.hits) || !Array.isArray(r.findings)) return null;
  if (r.hits.length > 12 || r.findings.length > 12) return null;
  const hits: AiHit[] = [];
  for (const h of r.hits) {
    const o = (h ?? {}) as Record<string, unknown>;
    const rubric_id = str(o.rubric_id, 8), title = str(o.title, 200), quote = str(o.quote, 400), note = str(o.note, 300);
    if (!rubric_id || !title || !quote || note === null) return null;
    hits.push({ rubric_id, title, quote, note });
  }
  const findings: AiFinding[] = [];
  for (const f of r.findings) {
    const o = (f ?? {}) as Record<string, unknown>;
    const id = str(o.id, 12), rubric_id = str(o.rubric_id, 8), title = str(o.title, 200), evidence = str(o.evidence, 700);
    const source = str(o.source, 400), explanation = str(o.explanation, 500);
    const quote = o.quote === null ? null : str(o.quote, 400);
    if (!id || !rubric_id || !title || !evidence || source === null || !explanation) return null;
    if (o.quote !== null && quote === null) return null;
    if (!CATS.includes(o.category as AiCategory) || !CERTS.includes(o.certainty as AiCertainty)) return null;
    if (o.severity !== "factual" && o.severity !== "opcional") return null;
    findings.push({
      id, category: o.category as AiCategory, severity: o.severity, rubric_id, title, quote, evidence, source, explanation,
      certainty: o.certainty as AiCertainty, origin: o.origin === "regra" ? "regra" : "ia",
    });
  }
  return {
    assessable: r.assessable, limitation: str(r.limitation, 300) ?? "", hits, findings,
    discarded: typeof r.discarded === "number" && r.discarded >= 0 && r.discarded < 1000 ? r.discarded : 0,
    notice: str(r.notice, 400) ?? "Feedback educativo assistido por IA. Pode conter erros.",
    model: str(r.model, 60) ?? "", rubric_version: str(r.rubric_version, 30) ?? "",
  };
}

export function parseAiRounds(raw: unknown): AiRound[] {
  if (!Array.isArray(raw)) return [];
  const out: AiRound[] = [];
  for (const x of raw.slice(0, AI_MAX_ROUNDS + 1)) {
    const o = (x ?? {}) as Record<string, unknown>;
    const result = parseAiResult(o.result);
    if (!result || typeof o.text !== "string" || o.text.length > 3000 || typeof o.n !== "number" || typeof o.at !== "number") continue;
    const flagged = Array.isArray(o.flagged) ? o.flagged.filter((v): v is string => typeof v === "string" && v.length <= 12).slice(0, 12) : [];
    out.push({ n: o.n, at: o.at, text: o.text, result, flagged });
  }
  return out;
}
