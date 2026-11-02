/**
 * Validação e montagem do resultado. A saída da IA é tratada como NÃO CONFIÁVEL: cada trecho citado é conferido
 * no texto do aluno, cada item da rubrica é conferido, e a "evidência" mostrada ao aluno vem da RUBRICA (não da IA).
 * Apontamentos inconsistentes são descartados (e só contados, sem registrar texto).
 */
import { ACCEPTED_ABBREVIATIONS, ALL_IDS, FACT_IDS, HIT_IDS, RUBRIC_BY_ID, RUBRIC_VERSION, EXERCISE_ID } from "./rubric.ts";
import { injectionFindings, presentIn, timeFindings, valueFindings, type Category, type Certainty, type RawFinding } from "./deterministic.ts";
import { cleanExplanation, findQuote, norm } from "./text.ts";

export type ModelOut = {
  assessable: boolean;
  limitation: string;
  hits: { rubric_id: string; quote: string }[];
  findings: { category: string; rubric_id: string; quote: string | null; explanation: string; certainty: string }[];
};

export type Finding = {
  id: string;
  category: Category;
  severity: "factual" | "opcional";
  rubric_id: string;
  title: string;
  /** Trecho exato do texto do aluno; null nas omissões (não se inventa citação). */
  quote: string | null;
  evidence: string;
  source: string;
  explanation: string;
  certainty: Certainty;
  origin: "ia" | "regra";
};
export type Hit = { rubric_id: string; title: string; quote: string; note: string };
export type FeedbackResult = {
  ok: true;
  exercise_id: string;
  rubric_version: string;
  assessable: boolean;
  limitation: string;
  hits: Hit[];
  findings: Finding[];
  discarded: number;
  notice: string;
};

export const NOTICE =
  "Feedback educativo assistido por IA. Pode conter erros e não é avaliação clínica, nota ou aprovação. Use como apoio e confira com o caso.";

const CATS: Category[] = ["ausente", "contradicao", "nao_fornecida", "clareza"];
const CERTS: Certainty[] = ["alta", "media", "baixa"];
const MAX_FINDINGS = 10;
const MAX_HITS = 9;

function onlyAcceptedAbbreviations(quote: string): boolean {
  const tokens = norm(quote).split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((t) => /^\d+(?:x\d+)*$/.test(t) || ACCEPTED_ABBREVIATIONS.includes(t));
}

export function assemble(text: string, out: ModelOut | null): FeedbackResult {
  let discarded = 0;
  const det: RawFinding[] = [...injectionFindings(text), ...timeFindings(text), ...valueFindings(text)];

  // ── acertos ──
  const hits: Hit[] = [];
  const hitIds = new Set<string>();
  if (out?.assessable) {
    for (const h of out.hits ?? []) {
      if (hits.length >= MAX_HITS) break;
      if (!HIT_IDS.includes(h.rubric_id) || hitIds.has(h.rubric_id)) { discarded++; continue; }
      const q = typeof h.quote === "string" ? findQuote(text, h.quote) : null;
      if (!q) { discarded++; continue; }
      const r = RUBRIC_BY_ID[h.rubric_id];
      hitIds.add(h.rubric_id);
      hits.push({ rubric_id: r.id, title: r.title, quote: q, note: r.hitNote });
    }
  }

  // ── apontamentos da IA ──
  const kept: RawFinding[] = [];
  if (out?.assessable) {
    for (const f of out.findings ?? []) {
      if (!CATS.includes(f.category as Category) || !ALL_IDS.includes(f.rubric_id)) { discarded++; continue; }
      let category = f.category as Category;
      const r = RUBRIC_BY_ID[f.rubric_id];
      const certainty: Certainty = CERTS.includes(f.certainty as Certainty) ? (f.certainty as Certainty) : "media";
      let quote: string | null = null;
      if (typeof f.quote === "string" && f.quote.trim()) {
        quote = findQuote(text, f.quote);
        if (!quote) { discarded++; continue; } // trecho que não existe no texto do aluno: descarta
      }
      if (quote && quote.length > Math.max(200, text.length * 0.9)) { discarded++; continue; }

      if (category === "ausente") {
        if (r.kind !== "fato") { discarded++; continue; }
        if (!r.essential) category = "clareza"; // omissão de item não essencial é só sugestão opcional
        else if (presentIn(r.id, text) || hitIds.has(r.id)) { discarded++; continue; } // o texto traz o fato
        quote = null; // omissão: nunca se inventa citação do aluno
      } else if (category === "contradicao") {
        if (r.kind !== "fato" || !quote) { discarded++; continue; }
      } else if (category === "nao_fornecida") {
        if (!(r.id === "X1" || r.id === "N8") || !quote) { discarded++; continue; }
      } else if (category === "clareza") {
        if (r.id === "X1") { discarded++; continue; }
        if (r.id === "N6" && !quote) { discarded++; continue; }
        if (r.id === "N7") {
          if (!quote || onlyAcceptedAbbreviations(quote)) { discarded++; continue; } // abreviatura aceita não é apontada
        }
      }
      kept.push({
        category, rubric_id: r.id, quote,
        explanation: cleanExplanation(f.explanation) || r.defaultExplanation,
        certainty, origin: "ia",
      });
    }
  }

  // ── regras objetivas: entram se a IA não cobriu o mesmo trecho ──
  const covers = (a: string, b: string) => { const x = norm(a), y = norm(b); return x.includes(y) || y.includes(x); };
  for (const d of det) {
    if (d.quote && kept.some((k) => k.quote && (k.category === "contradicao" || k.category === "nao_fornecida") && covers(k.quote, d.quote!))) continue;
    kept.push(d);
  }

  // ── sem duplicatas, factuais primeiro, limite ──
  const seen = new Set<string>();
  const uniq = kept.filter((k) => {
    const key = `${k.category}|${k.rubric_id}|${k.quote ? norm(k.quote) : "-"}`;
    if (seen.has(key)) { discarded++; return false; }
    seen.add(key);
    return true;
  });
  const rank: Record<Category, number> = { contradicao: 0, ausente: 1, nao_fornecida: 2, clareza: 3 };
  uniq.sort((a, b) => rank[a.category] - rank[b.category]);
  if (uniq.length > MAX_FINDINGS) discarded += uniq.length - MAX_FINDINGS;

  const findings: Finding[] = uniq.slice(0, MAX_FINDINGS).map((k, i) => {
    const r = RUBRIC_BY_ID[k.rubric_id];
    return {
      id: `f${i + 1}`, category: k.category,
      severity: k.category === "clareza" ? "opcional" : "factual",
      rubric_id: r.id, title: r.title, quote: k.quote,
      evidence: r.criterion, source: r.source,
      explanation: k.explanation, certainty: k.certainty, origin: k.origin,
    };
  });

  const assessable = out ? !!out.assessable : true;
  return {
    ok: true, exercise_id: EXERCISE_ID, rubric_version: RUBRIC_VERSION,
    assessable,
    limitation: assessable ? cleanExplanation(out?.limitation ?? "", 240) : cleanExplanation(out?.limitation ?? "", 240) || "Não foi possível avaliar este texto.",
    hits, findings, discarded, notice: NOTICE,
  };
}

export { FACT_IDS };
