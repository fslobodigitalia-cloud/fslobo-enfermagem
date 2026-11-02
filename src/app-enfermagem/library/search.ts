import type { Category, Library, RecordKind, RecordModel, SynonymGroup } from "./types";

/**
 * Busca da biblioteca. Funções puras (sem React), testáveis fora do navegador.
 *  - ignora maiúsculas, acentos e pontuação ("Pós-operatório" = "pos operatorio");
 *  - todas as palavras da busca precisam aparecer (cada uma em título, palavras-chave, resumo, categoria ou corpo);
 *  - sinônimos cadastrados: se a busca contém um termo de um grupo (inclusive frases, como "falta de ar"), qualquer termo do grupo vale.
 */
export const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const STOP = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "na", "no", "nas", "nos", "para", "por", "com", "um", "uma"]);

export type Query = { q: string; kind: RecordKind | "todos"; category: string | "todas" };

export type Expanded = {
  /** Cada item é um termo da busca: basta UMA das alternativas aparecer. */
  terms: string[][];
  /** Sinônimos usados além do que a pessoa digitou (para mostrar na tela). */
  alsoSearched: string[];
};

export function expandQuery(q: string, groups: SynonymGroup[]): Expanded {
  const fq = fold(q);
  if (!fq) return { terms: [], alsoSearched: [] };
  const folded = groups.map((g) => g.map(fold).filter(Boolean));
  const pairs: { gi: number; term: string }[] = [];
  folded.forEach((g, gi) => g.forEach((term) => pairs.push({ gi, term })));
  pairs.sort((a, b) => b.term.length - a.term.length); // frases mais longas primeiro
  let rest = ` ${fq} `;
  const used = new Set<number>();
  const terms: string[][] = [];
  const alsoSearched: string[] = [];
  for (const { gi, term } of pairs) {
    if (used.has(gi) || !rest.includes(` ${term} `)) continue;
    used.add(gi);
    rest = rest.replace(` ${term} `, " ");
    terms.push(folded[gi]);
    for (const alt of groups[gi]) if (fold(alt) !== term) alsoSearched.push(alt);
  }
  for (const tok of rest.split(" ")) if (tok.length >= 2 && !STOP.has(tok)) terms.push([tok]);
  return { terms, alsoSearched };
}

/** Início de palavra: "resp" acha "respiratório", mas "ar" não acha "cabeceira". */
const has = (text: string, term: string) => ` ${text}`.includes(` ${term}`);

type Indexed = { model: RecordModel; title: string; keywords: string; category: string; summary: string; body: string };

function index(models: RecordModel[], categories: Category[]): Indexed[] {
  const catLabel = new Map(categories.map((c) => [c.id, c.label]));
  return models.map((m) => ({
    model: m,
    title: fold(m.title),
    keywords: fold(m.keywords.join(" ")),
    category: fold(`${catLabel.get(m.category) ?? ""} ${m.kind === "anotacao" ? "anotacao" : "evolucao"}`),
    summary: fold(m.summary),
    body: fold([...m.context, ...m.example, ...m.adapt, ...m.guidance].join(" ")),
  }));
}

export type Hit = { model: RecordModel; score: number };
export type SearchResult = { hits: Hit[]; alsoSearched: string[]; hasQuery: boolean };

export function searchModels(lib: Library, query: Query): SearchResult {
  const ex = expandQuery(query.q, lib.synonyms);
  const hasQuery = ex.terms.length > 0;
  const hits: Hit[] = [];
  for (const row of index(lib.models, lib.categories)) {
    const m = row.model;
    if (query.kind !== "todos" && m.kind !== query.kind) continue;
    if (query.category !== "todas" && m.category !== query.category) continue;
    let score = 0;
    let all = true;
    for (const alts of ex.terms) {
      let best = 0;
      for (const a of alts) {
        if (has(row.title, a)) best = Math.max(best, 5);
        else if (has(row.keywords, a)) best = Math.max(best, 4);
        else if (has(row.category, a)) best = Math.max(best, 3);
        else if (has(row.summary, a)) best = Math.max(best, 2);
        else if (has(row.body, a)) best = Math.max(best, 1);
      }
      if (best === 0) {
        all = false;
        break;
      }
      score += best;
    }
    if (all) hits.push({ model: m, score });
  }
  if (hasQuery) hits.sort((a, b) => b.score - a.score || a.model.title.localeCompare(b.model.title, "pt-BR"));
  return { hits, alsoSearched: [...new Set(ex.alsoSearched)], hasQuery };
}
