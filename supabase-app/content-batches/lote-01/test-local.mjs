// Teste LOCAL (banco descartável, sem rede, sem credenciais) do importador do lote 01.
//   run(db, label) com db = { exec(sql), query(sql, params) -> { rows } }  (PGlite ou PostgreSQL local)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXPECTED, parsePooler, tlsOptions, checkLinkedRef } from "./guards.mjs";
import { artificialBatch } from "../../tests/fixtures/artificial-batch.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

export async function run(db, label = "") {
  let pass = 0; const failures = [];
  const ok = (c, name, extra) => { if (c) pass++; else { failures.push(name); console.log("FAIL", name, extra ?? ""); } };
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  // lote ARTIFICIAL gerado em pasta temporária pelo mesmo build.mjs: o lote editorial real nunca é lido pelos testes
  const batch = artificialBatch();
  const importSql = fs.readFileSync(batch.importSql, "utf8");
  const validateSql = fs.readFileSync(batch.validateSql, "utf8");
  const manifest = JSON.parse(fs.readFileSync(batch.manifest, "utf8"));

  // ── 0) travas de conexão (puras, sem rede) ──────────────────────────────────────────────────────
  const goodUrl = `postgresql://${EXPECTED.user}@${EXPECTED.host}:5432/postgres`;
  ok(parsePooler(goodUrl).host === EXPECTED.host, "trava: URL da homologação é aceita");
  const bad = (fn, re, name) => { try { fn(); ok(false, name + " (deveria bloquear)"); } catch (e) { ok(re.test(e.message), name + " -> " + e.message.slice(0, 60)); } };
  bad(() => parsePooler(`postgresql://${EXPECTED.user}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`), /host do banco/, "trava: host de outra região");
  bad(() => parsePooler(`postgresql://postgres.bwntzilgzwryouvjtibf@${EXPECTED.host}:5432/postgres`), /usuário do banco/, "trava: usuário de outro projeto (loja)");
  bad(() => parsePooler(`postgresql://${EXPECTED.user}@db.${EXPECTED.ref}.supabase.co:5432/postgres`), /host do banco/, "trava: host direto diferente do esperado");
  bad(() => parsePooler(`postgresql://${EXPECTED.user}@${EXPECTED.host}:5432/outrodb`), /banco inesperado/, "trava: nome de banco diferente");
  bad(() => parsePooler("lixo"), /ilegível/, "trava: URL inválida");
  bad(() => checkLinkedRef("zwulewxnvvowkytnfiuv"), /não está vinculada/, "trava: CLI vinculada a outro projeto");
  bad(() => tlsOptions(undefined), /obrigatória/, "TLS: sem CA o executor recusa");
  bad(() => tlsOptions(path.join(os.tmpdir(), "nao-existe.crt")), /não encontrado/, "TLS: CA inexistente");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fsl-ca-"));
  fs.writeFileSync(path.join(tmp, "chave.pem"), "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n");
  bad(() => tlsOptions(path.join(tmp, "chave.pem")), /não é um certificado/, "TLS: arquivo que não é certificado público é recusado");
  fs.writeFileSync(path.join(tmp, "ca.crt"), "-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n");
  const t = tlsOptions(path.join(tmp, "ca.crt"));
  ok(t.rejectUnauthorized === true && /BEGIN CERTIFICATE/.test(t.ca), "TLS: com CA válida, rejectUnauthorized = true");
  fs.rmSync(tmp, { recursive: true, force: true });
  const applySrc = fs.readFileSync(path.join(here, "apply.mjs"), "utf8");
  ok(!/rejectUnauthorized\s*:\s*false/.test(applySrc) && !/NODE_TLS_REJECT_UNAUTHORIZED/.test(applySrc), "apply.mjs não desliga a verificação do certificado");

  // ── banco local ───────────────────────────────────────────────────────────────────────────────
  await db.exec(fs.readFileSync(path.join(root, "tests", "stubs", "supabase_stub.sql"), "utf8"));
  const migDir = path.join(root, "supabase", "migrations");
  const files = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) await db.exec(fs.readFileSync(path.join(migDir, f), "utf8"));
  // conjunto EXATO de migrations versionadas (aplicadas na homologação): se alguém acrescentar ou remover uma, este teste avisa
  const EXPECTED_MIGRATIONS = [
    "20261031120001_study_foundation.sql", "20261031120002_study_content.sql", "20261031120003_study_attempts.sql", "20261031120004_study_rpcs.sql",
    "20261031130001_fix_admin_deletion_and_indexes.sql", "20261031140001_complete_attempts_and_review_scope.sql",
    "20261101120001_admin_rpcs_and_versioning.sql", "20261102120001_practice_ai_feedback_usage.sql",
    "20261103120001_practice_progress.sql",
  ];
  ok(JSON.stringify(files) === JSON.stringify(EXPECTED_MIGRATIONS), "as 9 migrations versionadas aplicadas no banco local (" + files.length + ")");

  // fotografia completa do conteúdo (para provar "sem gravações parciais")
  const snap = async () => (await q(`select md5(coalesce(string_agg(x, '|' order by x), '')) h, count(*)::int n from (
      select 'q:' || id || ':' || stem || ':' || coalesce(source_note,'') || ':' || status || ':' || difficulty || ':' || subject_id as x from public.study_questions
      union all select 'o:' || id || ':' || question_id || ':' || label || ':' || body from public.study_question_options
      union all select 'k:' || question_id || ':' || option_id from public.study_answer_keys
      union all select 'e:' || question_id || ':' || body from public.study_explanations
      union all select 's:' || id || ':' || slug || ':' || name || ':' || active from public.study_subjects) t`))[0];
  const tryImport = async () => { try { await db.exec(importSql); return null; } catch (e) { const m = String(e.message); try { await db.exec("rollback"); } catch { /* sem transação aberta */ } return m; } };
  const validate = async () => q(validateSql);
  const lote = "source_note like 'FSLOBO-L01-%'";
  const counts = async () => (await q(`select
    (select count(*)::int from public.study_questions where ${lote}) q,
    (select count(*)::int from public.study_question_options o join public.study_questions x on x.id=o.question_id where x.${lote}) o,
    (select count(*)::int from public.study_answer_keys k join public.study_questions x on x.id=k.question_id where x.${lote}) k,
    (select count(*)::int from public.study_explanations e join public.study_questions x on x.id=e.question_id where x.${lote}) e,
    (select count(*)::int from public.study_subjects) s`))[0];
  /** exige aborto com mensagem clara, banco inalterado e validação reprovando o mesmo estado */
  async function expectAbort(name, re) {
    const before = await snap();
    const err = await tryImport();
    const after = await snap();
    ok(err && /ABORTADO antes do COMMIT/.test(err) && re.test(err), `${name}: importação aborta com mensagem clara -> ${String(err).replace(/\s+/g, " ").slice(-120)}`);
    ok(before.h === after.h && before.n === after.n, `${name}: nenhuma gravação parcial (banco idêntico antes e depois)`);
    const v = await validate();
    ok(v.some((r) => r.ok !== true), `${name}: a validação somente leitura também reprova esse estado`);
    return err;
  }
  const idOf = (n) => `(select id from public.study_questions where source_note like 'FSLOBO-L01-Q${n} |%')`;

  // A) importação limpa
  ok((await tryImport()) === null, "A) importação limpa conclui (COMMIT)");
  const c1 = await counts();
  ok(c1.q === 25 && c1.o === 125 && c1.k === 25 && c1.e === 25 && c1.s === 11, "A) 25 questões, 125 alternativas, 25 gabaritos, 25 explicações, 11 assuntos", JSON.stringify(c1));
  const v1 = await validate();
  ok(v1.length === 8 && v1.every((r) => r.ok === true), "A) validação integral: todas as " + v1.length + " verificações ok", JSON.stringify(v1.filter((r) => r.ok !== true)));
  const s1 = await snap();

  // B) repetição idempotente (3 vezes)
  ok((await tryImport()) === null && (await tryImport()) === null && (await tryImport()) === null, "B) repetir 3 vezes conclui sem erro");
  const s2 = await snap();
  ok(s1.h === s2.h && s1.n === s2.n && JSON.stringify(await counts()) === JSON.stringify(c1), "B) idempotente: nenhuma linha nova nem alterada (mesmos IDs e conteúdo)");

  // C) conteúdo gravado == manifesto
  const rows = await q(`select q.source_note, s.slug, q.difficulty, q.status,
      (select o.label from public.study_answer_keys k join public.study_question_options o on o.id=k.option_id where k.question_id=q.id) correta,
      (select count(*)::int from public.study_question_options o where o.question_id=q.id) nopt
    from public.study_questions q join public.study_subjects s on s.id=q.subject_id where q.${lote} order by q.source_note`);
  let diff = 0;
  rows.forEach((r, i) => { const m = manifest.questions[i]; if (r.source_note !== m.source_note || r.slug !== m.subject_slug || r.correta !== m.correct || r.nopt !== 5 || r.status !== "draft" || r.difficulty !== 2) diff++; });
  ok(rows.length === 25 && diff === 0, "C) gravado confere com o manifesto", "divergências: " + diff);

  // D) explicação alterada (rascunho é editável, então o desvio é possível e tem de ser pego)
  const exp7 = (await q(`select body from public.study_explanations where question_id = ${idOf("07")}`))[0].body;
  await db.exec(`update public.study_explanations set body = body || ' (alterada fora do lote)' where question_id = ${idOf("07")}`);
  await expectAbort("D) explicação alterada", /FSLOBO-L01-Q07 \[explicação\]/);
  ok((await q(`select body from public.study_explanations where question_id = ${idOf("07")}`))[0].body.endsWith("(alterada fora do lote)"), "D) o conteúdo divergente existente NÃO foi sobrescrito");
  await db.query(`update public.study_explanations set body = $1 where question_id = ${idOf("07")}`, [exp7]);
  ok((await snap()).h === s1.h, "D) restaurado o estado original");

  // E) gabarito errado
  const setKey = (n, l) => db.exec(`delete from public.study_answer_keys where question_id = ${idOf(n)};
    insert into public.study_answer_keys (question_id, option_id) select o.question_id, o.id from public.study_question_options o where o.question_id = ${idOf(n)} and o.label = '${l}'`);
  // letras derivadas do próprio manifesto (o teste não pressupõe o gabarito de nenhum lote): "errada" = qualquer letra diferente da correta
  const q10 = manifest.questions.find((x) => x.key === "FSLOBO-L01-Q10").correct;
  const wrong10 = q10 === "B" ? "C" : "B";
  await setKey("10", wrong10);
  await expectAbort("E) gabarito errado", /FSLOBO-L01-Q10 \[gabarito\]/);
  await setKey("10", q10);
  ok((await snap()).h === s1.h && (await validate()).every((r) => r.ok === true), "E) restaurado: banco idêntico e validação toda ok");

  // F) Q25 substituída por Q99 (falta Q25, sobra Q99)
  await db.exec(`update public.study_questions set source_note = replace(source_note, 'FSLOBO-L01-Q25 |', 'FSLOBO-L01-Q99 |') where source_note like 'FSLOBO-L01-Q25 |%'`);
  const errF = await expectAbort("F) Q25 substituída por Q99", /FSLOBO-L01-Q99 \[extra[^\]]*\]/);
  ok(/FSLOBO-L01-Q25 \[ausente\]/.test(errF || "") || (await q("select count(*)::int c from public.study_questions where source_note like 'FSLOBO-L01-Q25 |%'"))[0].c === 0, "F) Q25 não foi criada pela tentativa abortada (transação desfeita por inteiro)");
  await db.exec(`update public.study_questions set source_note = replace(source_note, 'FSLOBO-L01-Q99 |', 'FSLOBO-L01-Q25 |') where source_note like 'FSLOBO-L01-Q99 |%'`);
  ok((await snap()).h === s1.h, "F) restaurado o estado original");

  // G) outros desvios, um a um
  await db.exec(`insert into public.study_questions (subject_id, stem, source_note) select subject_id, 'Cópia duplicada da questão 05 para teste.', source_note from public.study_questions where source_note like 'FSLOBO-L01-Q05 |%'`);
  await expectAbort("G1) chave duplicada", /FSLOBO-L01-Q05 \[duplicada\]/);
  await db.exec("delete from public.study_questions where stem = 'Cópia duplicada da questão 05 para teste.'");
  await db.exec(`update public.study_questions set stem = stem || ' ' where source_note like 'FSLOBO-L01-Q03 |%'`);
  await expectAbort("G2) enunciado divergente (1 espaço a mais)", /FSLOBO-L01-Q03 \[enunciado\]/);
  await db.exec(`update public.study_questions set stem = btrim(stem) where source_note like 'FSLOBO-L01-Q03 |%'`);
  await db.exec(`update public.study_question_options set body = body || '.' where label = 'D' and question_id = ${idOf("12")}`);
  await expectAbort("G3) alternativa divergente", /FSLOBO-L01-Q12 \[alternativa D\]/);
  await db.exec(`update public.study_question_options set body = left(body, length(body) - 1) where label = 'D' and question_id = ${idOf("12")}`);
  await db.exec(`update public.study_questions set subject_id = (select id from public.study_subjects where slug = 'calculo-medicacao') where source_note like 'FSLOBO-L01-Q01 |%'`);
  await expectAbort("G4) assunto divergente", /FSLOBO-L01-Q01 \[assunto\]/);
  await db.exec(`update public.study_questions set subject_id = (select id from public.study_subjects where slug = 'politicas-saude-sus') where source_note like 'FSLOBO-L01-Q01 |%'`);
  await db.exec(`update public.study_questions set difficulty = 3 where source_note like 'FSLOBO-L01-Q02 |%'`);
  await expectAbort("G5) dificuldade divergente", /FSLOBO-L01-Q02 \[dificuldade\]/);
  await db.exec(`update public.study_questions set difficulty = 2 where source_note like 'FSLOBO-L01-Q02 |%'`);
  await db.exec(`update public.study_questions set source_note = source_note || ' (editado)' where source_note like 'FSLOBO-L01-Q04 |%'`);
  await expectAbort("G6) metadados (source_note) divergentes", /FSLOBO-L01-Q04 \[metadados/);
  await db.exec(`update public.study_questions set source_note = replace(source_note, ' (editado)', '') where source_note like 'FSLOBO-L01-Q04 |%'`);
  await db.exec(`update public.study_subjects set name = name || ' (renomeado)' where slug = 'urgencia-emergencia'`);
  await expectAbort("G7) nome de assunto divergente", /assunto:urgencia-emergencia \[nome ou descrição divergente\]/);
  await db.exec(`update public.study_subjects set name = replace(name, ' (renomeado)', '') where slug = 'urgencia-emergencia'`);
  ok((await snap()).h === s1.h && (await validate()).every((r) => r.ok === true), "G) tudo restaurado: banco idêntico ao original e validação ok");

  // G8) rascunho não é publicável por engano e nada aparece para o aluno
  let pubErr = "";
  try { await db.exec("update public.study_questions set status='published' where source_note like 'FSLOBO-L01-Q01 |%'"); } catch (e) { pubErr = String(e.message); }
  ok(/publicar exige|publish_requirements|check|violat/i.test(pubErr), "G8) publicar sem revisão/atestado é barrado pelo banco: " + pubErr.slice(0, 60));
  const U = "00000000-0000-0000-0000-0000000000a1";
  await db.exec(`insert into auth.users (id, email) values ('${U}','aluno@example.test')`);
  const asStudent = async (sql) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [U]); await db.exec("set role authenticated"); try { return await db.query(sql); } finally { await db.exec("reset role"); } };
  await asStudent("select public.study_upsert_my_profile('Aluno Teste', null, 5)");
  const subRows = (await asStudent("select public.study_list_subjects() as r")).rows;
  const subs = subRows.length === 1 && Array.isArray(subRows[0].r) ? subRows[0].r : subRows;
  ok(subs.length === 0, "G8) aluno: study_list_subjects não lista assunto nenhum (inativos, nada publicado)");
  let startErr = "";
  try { await asStudent("select public.study_start_attempt('politicas-saude-sus','practice',5)"); } catch (e) { startErr = String(e.message); }
  ok(/no_questions_available|subject_not_found|not_found/.test(startErr), "G8) aluno: não inicia treino com o rascunho: " + startErr.slice(0, 50));
  for (const tb of ["study_questions", "study_question_options", "study_answer_keys", "study_explanations"]) {
    let e = ""; let n = null;
    try { n = (await asStudent(`select count(*)::int c from public.${tb}`)).rows[0].c; } catch (x) { e = String(x.message); }
    ok(/permission denied/.test(e) || n === 0, `G8) aluno não lê ${tb} direto`);
  }

  // H) chave existente divergente + chaves faltantes: nada do lote novo pode entrar
  await db.exec("delete from public.study_questions where source_note like 'FSLOBO-L01-Q2_ |%' or source_note like 'FSLOBO-L01-Q1_ |%'");
  ok((await counts()).q === 9, "H) preparação: 16 questões removidas (Q10–Q25), restam 9");
  await db.exec(`update public.study_questions set stem = 'Enunciado antigo diferente do esperado para teste.' where source_note like 'FSLOBO-L01-Q01 |%'`);
  await expectAbort("H) chave existente divergente com outras ausentes", /FSLOBO-L01-Q01 \[enunciado\]/);
  ok((await counts()).q === 9, "H) as 16 ausentes NÃO foram criadas porque a divergência abortou tudo");

  console.log(`[${label}] ${pass} verificações passaram, ${failures.length} falharam`);
  return failures.length;
}
