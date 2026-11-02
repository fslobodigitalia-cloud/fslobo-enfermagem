// Executor do lote 01 na HOMOLOGAÇÃO. NÃO foi executado: aguarda aprovação.
//   node apply.mjs --validate-only --ca <ca.crt>     só lê e imprime a validação (transação somente leitura)
//   node apply.mjs --confirm       --ca <ca.crt>     importa os 25 rascunhos (1 transação) e valida
// A CA é o certificado PÚBLICO do banco (Supabase: Database > Settings > SSL Configuration > Download certificate).
// Também aceita a variável FSL_DB_CA. Sem CA o script recusa rodar: o certificado TLS é sempre verificado.
// Precisa do módulo "pg" resolvível e de ~/.fslobo-homolog/db-password. Nunca imprime credenciais.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { EXPECTED, parsePooler, tlsOptions, checkLinkedRef } from "./guards.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const args = process.argv.slice(2);
const validateOnly = args.includes("--validate-only");
if (!validateOnly && !args.includes("--confirm")) throw new Error("use --validate-only ou --confirm");
const caArg = args.includes("--ca") ? args[args.indexOf("--ca") + 1] : process.env.FSL_DB_CA;

checkLinkedRef(fs.readFileSync(path.join(root, "supabase", ".temp", "project-ref"), "utf8"));
const migCount = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).length;
if (migCount !== 6) throw new Error("BLOQUEADO: esperadas 6 migrations locais, há " + migCount);
const target = parsePooler(fs.readFileSync(path.join(root, "supabase", ".temp", "pooler-url"), "utf8"));
const ssl = tlsOptions(caArg);                       // rejectUnauthorized: true, sempre

const dbpw = fs.readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, ".fslobo-homolog", "db-password"), "utf8").trim();
const c = new pg.Client({ host: target.host, port: target.port, user: target.user, password: dbpw, database: target.database, ssl });
await c.connect();
try {
  const migs = (await c.query("select count(*)::int n from supabase_migrations.schema_migrations")).rows[0].n;
  if (migs !== 6) throw new Error("BLOQUEADO: o remoto tem " + migs + " migrations (esperado 6)");
  if (!validateOnly) {
    try {
      await c.query(fs.readFileSync(path.join(here, "lote-01.import.sql"), "utf8"));
      console.log("importação confirmada (COMMIT)");
    } catch (e) {
      try { await c.query("rollback"); } catch { /* sem transação aberta */ }
      console.error("IMPORTAÇÃO ABORTADA (ROLLBACK feito, nada foi gravado): " + String(e.message));
      process.exitCode = 2;
    }
  }
  if (process.exitCode !== 2) {
    await c.query("begin read only");
    const v = (await c.query(fs.readFileSync(path.join(here, "lote-01.validate.sql"), "utf8"))).rows;
    await c.query("rollback");
    console.table(v.map((r) => ({ verificação: r.check, ok: r.ok, valor: r.valor })));
    process.exitCode = v.every((r) => r.ok === true) ? 0 : 1;
  }
} finally { await c.end(); }
console.log("destino conferido:", EXPECTED.host, "como", EXPECTED.user, "(TLS verificado)");
