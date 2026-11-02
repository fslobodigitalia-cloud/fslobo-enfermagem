// Trava de segurança: confirma que a Supabase CLI desta pasta está vinculada
// EXATAMENTE ao projeto de homologação esperado, antes de qualquer `db push`.
//
//   node scripts/check-target.mjs <ref-esperado-do-projeto-de-homologacao> [qtde-de-migrations=5]
//
// Sai com código 1 (e não deve ser seguido de nenhum push) se:
//   - não houver vínculo (supabase/.temp/project-ref ausente);
//   - o vínculo for diferente do ref esperado;
//   - o ref esperado não for passado, ou parecer inválido.
// Não lê nem imprime tokens ou senhas.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expected = (process.argv[2] || "").trim();
const expectedCount = Number(process.argv[3] || 5);   // 4 antes da 0005; 5 depois
const fail = (m) => { console.error("BLOQUEADO:", m); process.exit(1); };

if (!/^[a-z]{20}$/.test(expected)) fail("informe o ref esperado (20 letras minúsculas) como argumento.");
const refFile = path.join(root, "supabase", ".temp", "project-ref");
if (!fs.existsSync(refFile)) fail("CLI sem vínculo nesta pasta (rode `supabase link --project-ref <ref>` com o ref de homologação).");
const linked = fs.readFileSync(refFile, "utf8").trim();
if (linked !== expected) fail(`a CLI está vinculada a OUTRO projeto (${linked}) e não ao esperado (${expected}).`);
if (!fs.existsSync(path.join(root, "supabase", "migrations"))) fail("pasta supabase/migrations ausente.");
const migs = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((f) => f.endsWith(".sql"));
if (migs.length !== expectedCount) fail(`esperadas ${expectedCount} migrations, encontradas ${migs.length}.`);
console.log(`OK: CLI vinculada a ${linked} (o esperado) e ${migs.length} migrations presentes.`);
