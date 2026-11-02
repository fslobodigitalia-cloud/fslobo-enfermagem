// Lote ARTIFICIAL para os testes. Não contém nenhuma questão real, nem dado pessoal: enunciados, alternativas e
// explicações são frases genéricas geradas aqui ("Questão artificial NN ..."). Ele só precisa respeitar o CONTRATO do
// importador: 25 questões numeradas, 5 alternativas distintas (A–E), gabarito, explicação, lista final de gabaritos e
// mapeamento nos 11 assuntos de content-batches/lote-01/build.mjs.
//
// O Markdown e as saídas (manifest, import.sql, validate.sql) são gerados em uma pasta temporária, com o MESMO build.mjs
// usado no lote real. Nada é gravado no repositório. O lote real (editorial) nunca é lido pelos testes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const buildScript = path.resolve(here, "..", "..", "content-batches", "lote-01", "build.mjs");

/** Gabarito artificial (varia entre A e E para exercitar o contrato). */
export const artificialCorrect = (n) => "ABCDE"[(n * 3 + 1) % 5];

export function artificialMarkdown() {
  const lines = ["# Lote artificial de teste (não é conteúdo editorial)", "", "Versão editorial proposta: 0.0", ""];
  const key = [];
  for (let n = 1; n <= 25; n++) {
    const nn = String(n).padStart(2, "0");
    const c = artificialCorrect(n);
    key.push(`${nn}-${c}`);
    lines.push(`### Questão ${nn}`, "");
    lines.push(`Questão artificial ${nn} do conjunto de teste. Escolha a alternativa indicada como correta no gabarito deste conjunto.`, "");
    for (const l of "ABCDE") lines.push(`${l}) Alternativa ${l} da questão artificial ${nn}`);
    lines.push("", `**Gabarito:** ${c}`, `**Explicação:** Explicação artificial ${nn}: neste conjunto de teste a alternativa ${c} é a indicada como correta.`, "", "---", "");
  }
  lines.push("## Gabarito final", "", key.join(", ") + ".", "");
  return lines.join("\n");
}

let cached;
/** Gera (uma vez por processo) o lote artificial e devolve os caminhos. */
export function artificialBatch() {
  if (cached) return cached;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsl-lote-artificial-"));
  const md = path.join(dir, "lote-artificial.md");
  fs.writeFileSync(md, artificialMarkdown());
  execFileSync(process.execPath, [buildScript, md, "--out", dir], { stdio: ["ignore", "pipe", "inherit"] });
  cached = {
    dir,
    importSql: path.join(dir, "lote-01.import.sql"),
    validateSql: path.join(dir, "lote-01.validate.sql"),
    manifest: path.join(dir, "lote-01.manifest.json"),
  };
  process.on("exit", () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temporário */ } });
  return cached;
}
