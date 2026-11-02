/** Utilidades de texto: normalização e localização de trechos citados no texto do aluno. */

export function stripControl(s: string): string {
  // Remove caracteres de controle (exceto \n e \t) e de direção invisíveis que poderiam esconder instruções.
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g, "");
}

/** Minúsculas, sem acentos, espaços colapsados. */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Procura `quote` em `text` ignorando maiúsculas, acentos e diferenças de espaço, e devolve o trecho EXATO
 * do texto original (ou null se não existir). É assim que se garante que o trecho citado é do aluno.
 */
export function findQuote(text: string, quote: string): string | null {
  const q = quote.trim();
  if (q.length < 2) return null;
  if (text.includes(q)) return q;
  const map: number[] = [];
  let normText = "";
  let lastSpace = false;
  for (let i = 0; i < text.length; i++) {
    const piece = text[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    for (const ch of piece) {
      if (/\s/.test(ch)) {
        if (lastSpace || normText.length === 0) continue;
        normText += " ";
        map.push(i);
        lastSpace = true;
      } else {
        normText += ch;
        map.push(i);
        lastSpace = false;
      }
    }
  }
  const nq = norm(q);
  if (nq.length < 2) return null;
  const at = normText.indexOf(nq);
  if (at < 0) return null;
  const start = map[at];
  const end = map[at + nq.length - 1];
  return text.slice(start, end + 1);
}

export function cleanExplanation(s: unknown, max = 300): string {
  if (typeof s !== "string") return "";
  const t = stripControl(s).replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}
