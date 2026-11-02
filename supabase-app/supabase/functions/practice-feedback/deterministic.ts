/**
 * Conferências OBJETIVAS, sem IA: horários e valores que contradizem o caso, e trechos que parecem
 * instruções dirigidas ao sistema. Servem de rede de segurança e de reforço (a IA pode errar; estas regras não
 * dependem dela). Também há "pistas de presença", que só REMOVEM apontamentos de omissão feitos por engano.
 */
import { CASE_TIMES, CASE_VALUES, RUBRIC_BY_ID } from "./rubric.ts";
import { findQuote, norm } from "./text.ts";

export type Category = "ausente" | "contradicao" | "nao_fornecida" | "clareza";
export type Certainty = "alta" | "media" | "baixa";
export type RawFinding = {
  category: Category;
  rubric_id: string;
  quote: string | null;
  explanation: string;
  certainty: Certainty;
  origin: "ia" | "regra";
};

const dec = (s: string) => s.replace(",", ".");

export function timeFindings(text: string): RawFinding[] {
  const out: RawFinding[] = [];
  const re = /(?<![\d:,.])([01]?\d|2[0-3])\s*(?:h|hs|:)\s*([0-5]\d)(?!\d)/gi;
  for (const m of text.matchAll(re)) {
    const hhmm = `${m[1].padStart(2, "0")}:${m[2]}`;
    if (CASE_TIMES.includes(hhmm)) continue;
    out.push({
      category: "nao_fornecida", rubric_id: "X1", quote: m[0], certainty: "alta", origin: "regra",
      explanation: `O horário ${m[0].trim()} não aparece no caso. Os horários do caso são 22h10, 22h15, 22h17, 22h20 e 22h40.`,
    });
  }
  return out;
}

export function valueFindings(text: string): RawFinding[] {
  const out: RawFinding[] = [];
  const push = (quote: string, rubric_id: string, what: string, caseValue: string) =>
    out.push({
      category: "contradicao", rubric_id, quote, certainty: "alta", origin: "regra",
      explanation: `${what} difere do caso: o caso informa ${caseValue}.`,
    });
  for (const m of text.matchAll(/\bPA\b[^0-9\n]{0,8}(\d{2,3})\s*[x\/]\s*(\d{2,3})/gi)) {
    if (Number(m[1]) !== CASE_VALUES.paSys || Number(m[2]) !== CASE_VALUES.paDia) push(m[0], "F4", "A pressão arterial", "PA 128x78 mmHg");
  }
  for (const m of text.matchAll(/\bFC\b[^0-9\n]{0,8}(\d{2,3})/gi)) {
    if (Number(m[1]) !== CASE_VALUES.fc) push(m[0], "F4", "A frequência cardíaca", "FC 88 bpm");
  }
  for (const m of text.matchAll(/\bFR\b[^0-9\n]{0,8}(\d{1,2})(?!\d)/gi)) {
    if (Number(m[1]) !== CASE_VALUES.fr) push(m[0], "F4", "A frequência respiratória", "FR 22 irpm");
  }
  for (const m of text.matchAll(/\b(?:SpO2|SatO2|Sat\.?\s?O2|satura\S{0,5})[^0-9\n]{0,12}(\d{2,3})/gi)) {
    if (Number(m[1]) !== CASE_VALUES.spo2) push(m[0], "F4", "A saturação de oxigênio", "SpO2 94% em ar ambiente");
  }
  for (const m of text.matchAll(/\b(?:Tax|T\.?\s?ax|temp(?:eratura)?(?:\s+axilar)?)\b[^0-9\n]{0,10}(\d{2}[.,]\d)/gi)) {
    if (dec(m[1]) !== dec(CASE_VALUES.tax)) push(m[0], "F4", "A temperatura axilar", "36,8 °C");
  }
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s*\/\s*10(?!\d)/g)) {
    if (Number(m[1]) !== CASE_VALUES.pain) push(m[0], "F3", "A intensidade da dor", "dor 3 na escala de 0 a 10");
  }
  for (const m of text.matchAll(/cabeceira[^.\n]{0,40}?(\d{2})\s*(?:°|º|graus)/gi)) {
    if (Number(m[1]) !== CASE_VALUES.headDegrees) push(m[0], "F5", "A elevação da cabeceira", "cabeceira elevada para 45°");
  }
  return out;
}

const INJECTION: RegExp[] = [
  /ignor(?:e|ar|em|ando)\b.{0,40}\b(?:instruc\w*|regras?|prompt|comandos?|orientac\w*)/,
  /desconsider(?:e|ar|em)\b.{0,40}\b(?:instruc\w*|regras?|prompt|comandos?)/,
  /\b(?:de|dar|atribua|coloque|conceda)\b.{0,20}\bnota\b/,
  /\bnota\s*(?:10|dez|maxima|total)\b/,
  /\baprov(?:e|ar|ado)\b.{0,30}\b(?:registro|texto|aluno|anotacao)\b/,
  /\b(?:system prompt|prompt do sistema|instrucoes? do sistema|developer message)\b/,
  /\bresponda\s+(?:apenas|somente|com)\b/,
  /\b(?:finja|aja como|haja como|act as|ignore (?:all|previous|the above))\b/,
  /\bvoce\s+(?:agora\s+)?(?:e|deve|precisa)\b.{0,30}\b(?:assistente|ia|sistema|avaliador|corretor)\b/,
];

export function injectionFindings(text: string): RawFinding[] {
  const n = norm(text);
  for (const re of INJECTION) {
    const m = n.match(re);
    if (!m) continue;
    const quote = findQuote(text, m[0]);
    return [{
      category: "nao_fornecida", rubric_id: "X1", quote, certainty: "alta", origin: "regra",
      explanation:
        "Este trecho parece uma instrução dirigida ao sistema, e não parte da anotação. Ele não é seguido: só o conteúdo da anotação é analisado, e não há nota nesta atividade.",
    }];
  }
  return [];
}

/**
 * Pistas de PRESENÇA por item. Se o texto do aluno claramente traz o fato, um apontamento de "ausente" para
 * esse item é um engano da IA e é descartado. As pistas só removem apontamentos; nunca criam apontamentos.
 */
const has = (n: string, re: RegExp) => re.test(n);
export const PRESENT: Record<string, (n: string) => boolean> = {
  F1: (n) => has(n, /(desconforto|falta de ar|dispneia|dificuldade (?:para|de|em) respirar|dificuldade respiratoria|respirar)/) &&
    has(n, /(dormir|sono|insonia)/),
  F3: (n) => has(n, /\bdor\b/) && has(n, /(?<!\d)3(?!\d)/) && has(n, /(tos|tossi)/),
  F4: (n) => [/128\s*[x\/]\s*78/, /(?<!\d)88(?!\d)/, /(?<!\d)22\s*irpm|\bfr\b\D{0,6}22/, /(?<!\d)94\s*%?/, /36[.,]8/].filter((r) => r.test(n)).length >= 3,
  F5: (n) => has(n, /(cabeceira|elev)/) && has(n, /(orient|respirar (?:lenta|devagar|calma)|respiracao lenta|respirar pausad)/),
  F6: (n) => has(n, /(enfermeir|\benf\b|enfa\b)/) && has(n, /(comunic|avis|inform|notific|ciente|relat|repass)/),
  F7: (n) => has(n, /(melhora|melhorou|aliv|adorm|dormi|dormindo)/),
};
export const presentIn = (id: string, text: string) => PRESENT[id]?.(norm(text)) ?? false;

export const titleOf = (id: string) => RUBRIC_BY_ID[id]?.title ?? id;
