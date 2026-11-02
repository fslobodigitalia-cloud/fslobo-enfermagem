// Roda, em sequência, todas as suítes SQL locais em PGlite (banco em memória, sem rede, sem credenciais).
//   npm install   (uma vez, dentro de supabase-app/)   e   npm run test:sql
// Cada suíte recebe um banco novo. Sai com código 1 se qualquer verificação falhar.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (rel) => import(new URL(rel, `file:///${here.replace(/\\/g, "/")}/`).href);

const suites = [
  { name: "run-local (suíte principal, migrations 0001-0009)", mod: "./run-local.mjs", style: "class" },
  { name: "run-0006 (treino completo e escopo da revisão)", mod: "./run-0006.mjs", style: "db" },
  { name: "run-0007 (administração, versionamento, auditoria)", mod: "./run-0007.mjs", style: "db" },
  { name: "run-0009 (persistência da Prática na conta)", mod: "./run-0009.mjs", style: "db" },
  { name: "importador do lote (lote ARTIFICIAL)", mod: "../content-batches/lote-01/test-local.mjs", style: "db" },
];

let totalFailed = 0;
for (const s of suites) {
  console.log(`\n=== ${s.name}`);
  const { run } = await load(s.mod);
  let failed;
  if (s.style === "class") failed = await run(PGlite);
  else {
    const db = new PGlite();
    failed = await run(db, "PGlite");
    await db.close();
  }
  console.log(`=== ${s.name}: ${failed ? failed + " FALHA(S)" : "ok"}`);
  totalFailed += failed;
}
console.log(`\nResumo: ${totalFailed ? totalFailed + " falha(s) no total" : "todas as suítes SQL passaram"}`);
process.exit(totalFailed ? 1 : 0);
