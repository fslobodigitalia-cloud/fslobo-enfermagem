// Testes LOCAIS da migration 0007 (administração do conteúdo, versionamento, metadados, auditoria).
// Banco descartável (PGlite ou PostgreSQL local). Sem rede, sem credenciais, sem tocar em nenhum projeto Supabase.
//   run(db, label) com db = { exec(sql), query(sql, params) -> { rows } }
//
// Fase 1 reproduz o estado da homologação ANTES da 0007 (6 migrations, lote 01 importado, 24 publicadas, Q24 em rascunho,
//        questão antiga arquivada, aluno com histórico), tira uma fotografia, aplica a 0007 e compara.
// Fase 2 exercita as RPCs sobre esse mesmo estado realista.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const migDir = path.join(root, "supabase", "migrations");
const propDir = path.join(root, "supabase-proposed", "migrations");
const lote01 = path.join(root, "content-batches", "lote-01", "lote-01.import.sql");

export async function run(db, label = "") {
  let pass = 0; const failures = [];
  const ok = (c, name, extra) => { if (c) pass++; else { failures.push(name); console.log("FAIL", name, extra ?? ""); } };
  const owner = (sql, p) => db.query(sql, p);
  const one = async (sql, p) => (await db.query(sql, p)).rows[0];
  const j = (o) => JSON.stringify(o);
  const arr = (a) => "{" + a.join(",") + "}";

  async function as(role, uid, aal, sql, params) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
    await db.query("select set_config('request.jwt.claims', $1, false)", [uid ? j({ sub: uid, aal: aal ?? "aal1", role }) : ""]);
    await db.exec(`set role ${role}`);
    try { return await db.query(sql, params); } finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claims', '', false)"); }
  }
  const call = async (who, fn, args = [], cast = []) => {
    const sql = `select public.${fn}(${args.map((_, i) => `$${i + 1}${cast[i] ? "::" + cast[i] : ""}`).join(", ")}) as r`;
    return (await as(who.role || "authenticated", who.uid, who.aal, sql, args)).rows[0].r;
  };
  async function fails(p, re, name, detailRe) {
    try { await p; ok(false, `${name} (deveria falhar)`); }
    catch (e) { const m = String(e.message); const d = String(e.detail ?? ""); ok(re.test(m) && (!detailRe || detailRe.test(d)), `${name} -> ${m.slice(0, 70)}${detailRe ? " | " + d.slice(0, 90) : ""}`); }
  }

  const ADM = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", STU = "00000000-0000-0000-0000-0000000000a1", INA = "00000000-0000-0000-0000-0000000000a2", OTH = "00000000-0000-0000-0000-0000000000a3";
  const A2 = { uid: ADM, aal: "aal2" }, A1 = { uid: ADM, aal: "aal1" }, S = { uid: STU, aal: "aal2" }, I2 = { uid: INA, aal: "aal2" }, NOUID = { uid: null };
  const keyOf = async (itemId) => (await one("select k.option_id from public.study_attempt_items i join public.study_answer_keys k on k.question_id=i.question_id where i.id=$1", [itemId])).option_id;

  // ════════════ FASE 1 — estado anterior à 0007 + preservação ════════════
  await db.exec(fs.readFileSync(path.join(here, "stubs", "supabase_stub.sql"), "utf8"));
  const is0007 = (f) => /admin_rpcs_and_versioning/.test(f);
  const applied = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql") && !is0007(f)).sort();   // as 6 anteriores (a 0007, se já promovida, é aplicada à parte)
  for (const f of applied) await db.exec(fs.readFileSync(path.join(migDir, f), "utf8"));
  const dir0007 = fs.readdirSync(migDir).some(is0007) ? migDir : propDir;      // depois de promovida, a 0007 fica em supabase/migrations
  const propFile = fs.readdirSync(dir0007).find(is0007);
  ok(applied.length === 6 && !!propFile, `fase 1: 6 migrations aplicadas e a 0007 é a proposta (${applied.length}, ${propFile ? "0007 achada" : "sem 0007"})`);

  await owner(`insert into auth.users (id, email) values ('${ADM}','admin-teste@example.test'),('${STU}','aluno@example.test'),('${INA}','inativo@example.test'),('${OTH}','outro@example.test')`);
  await owner(`insert into public.study_admins (user_id, active) values ('${ADM}', true), ('${INA}', false)`);
  await db.exec(fs.readFileSync(lote01, "utf8"));                       // as 25 questões do lote 01 como rascunho
  const q24id = (await one("select id from public.study_questions where source_note like 'FSLOBO-L01-Q24 |%'")).id;
  const ids24 = (await owner("select id from public.study_questions where source_note like 'FSLOBO-L01-Q__ |%' and id <> $1 order by source_note", [q24id])).rows.map((r) => r.id);
  for (const id of ids24) await call({ uid: ADM }, "study_admin_publish_question", [id, true]);   // 0007 ainda não existe: sem MFA
  await owner("update public.study_subjects set active = true where slug <> 'administracao-enfermagem'");
  // questão antiga (sem chave) publicada e depois arquivada, como as de teste que existem na homologação
  const subj0 = (await one("select id from public.study_subjects where slug = 'politicas-saude-sus'")).id;
  const legacy = (await one("insert into public.study_questions (subject_id, stem, created_by) values ($1, 'Questão antiga de teste sem chave externa.', $2) returning id", [subj0, ADM])).id;
  let legacyKey;
  for (const l of ["A", "B", "C", "D"]) { const o = (await one("insert into public.study_question_options (question_id, label, body) values ($1,$2,$3) returning id", [legacy, l, "Alt " + l])).id; if (l === "A") legacyKey = o; }
  await owner("insert into public.study_answer_keys values ($1,$2)", [legacy, legacyKey]);
  await owner("insert into public.study_explanations values ($1,'Explicação da questão antiga de teste.')", [legacy]);
  await owner("update public.study_questions set status='published', no_real_patient_data_confirmed=true, reviewed_by=$2, reviewed_at=now(), published_at=now() where id=$1", [legacy, ADM]);
  await owner("update public.study_questions set status='archived' where id=$1", [legacy]);
  // aluno com histórico
  await call(S, "study_upsert_my_profile", ["Aluno", null, 5], ["text", "text", "integer"]);
  const att = await call(S, "study_start_attempt", ["urgencia-emergencia", "practice", 4], ["text", "public.study_attempt_mode", "integer"]);
  await call(S, "study_submit_answer", [att.items[0].item_id, await keyOf(att.items[0].item_id)], ["uuid", "uuid"]);
  const wrongOpt = (await one("select o.id from public.study_attempt_items i join public.study_question_options o on o.question_id=i.question_id where i.id=$1 and o.id <> (select option_id from public.study_answer_keys where question_id=i.question_id) limit 1", [att.items[1].item_id])).id;
  await call(S, "study_submit_answer", [att.items[1].item_id, wrongOpt], ["uuid", "uuid"]);

  const OLD_COLS = "id, subject_id, stem, difficulty, status, supersedes_id, source_note, no_real_patient_data_confirmed, created_by, reviewed_by, reviewed_at, published_at, created_at, updated_at, created_by_ref, reviewed_by_ref";
  const snapshot = async () => (await one(`select md5(string_agg(x, '|' order by x)) h, count(*)::int n from (
      select 'q:' || (select string_agg(coalesce(v::text,'~'), ',') from jsonb_each_text(to_jsonb(q) - 'external_key' - 'version') e(k, v)) as x from public.study_questions q
      union all select 'o:' || o::text from public.study_question_options o
      union all select 'k:' || k::text from public.study_answer_keys k
      union all select 'e:' || e::text from public.study_explanations e
      union all select 's:' || s::text from public.study_subjects s
      union all select 'a:' || a::text from public.study_attempts a
      union all select 'i:' || i::text from public.study_attempt_items i
      union all select 'r:' || r::text from public.study_attempt_answers r
      union all select 'l:' || l::text from public.study_points_ledger l
      union all select 'v:' || v::text from public.study_review_items v
      union all select 'p:' || p::text from public.study_profiles p
      union all select 'm:' || m::text from public.study_admins m) t`));
  const oldFns = (await owner("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like any (array['study%','is_study%']) order by 1")).rows.map((r) => r.proname);
  const aclSnap = async () => (await one(`select md5(coalesce(string_agg(x, '|' order by x), '')) h from (
      select 't:' || c.relname || ':' || coalesce(c.relacl::text, '') || ':' || c.relrowsecurity::text as x from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind='r' and c.relname = any (array['study_settings','study_admins','study_profiles','study_subjects','study_questions','study_question_options','study_answer_keys','study_explanations','study_attempts','study_attempt_items','study_attempt_answers','study_points_ledger','study_review_items'])
      union all select 'f:' || p.proname || ':' || coalesce(p.proacl::text, '') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname = any ($1)
      union all select 'p:' || polrelid::regclass::text || ':' || polname from pg_policy) t`, [oldFns]));
  const policiesBefore = (await one("select count(*)::int n from pg_policy")).n;
  const viewBefore = (await as("authenticated", STU, "aal1", "select (select jsonb_agg(to_jsonb(s) order by slug) from public.study_list_subjects() s)::text as v")).rows[0].v;
  const progBefore = j(await call(S, "study_my_progress"));
  const snap0 = await snapshot(); const acl0 = await aclSnap();
  const legacyBefore = await one("select updated_at::text u from public.study_questions where id=$1", [legacy]);
  const q01Before = await one("select updated_at::text u from public.study_questions where source_note like 'FSLOBO-L01-Q01 |%'");

  await db.exec(fs.readFileSync(path.join(dir0007, propFile), "utf8"));      // ← a 0007

  const snap1 = await snapshot(); const acl1 = await aclSnap();
  ok(snap0.h === snap1.h && snap0.n === snap1.n, "preservação: todas as linhas de questões (exceto as 2 colunas novas), alternativas, gabaritos, explicações, assuntos, tentativas, respostas, pontos, revisão, perfis e admins ficaram idênticas", `${snap0.n} vs ${snap1.n}`);
  ok(acl0.h === acl1.h, "preservação: GRANTs, RLS, políticas e permissões de execução de tudo que já existia ficaram idênticos");
  ok((await one("select count(*)::int n from pg_policy")).n === policiesBefore, "preservação: nenhuma política nova ou removida");
  ok((await one("select updated_at::text u from public.study_questions where id=$1", [legacy])).u === legacyBefore.u && (await one("select updated_at::text u from public.study_questions where source_note like 'FSLOBO-L01-Q01 |%'")).u === q01Before.u, "preservação: updated_at das questões não mudou com o preenchimento das chaves");
  const bk = await one(`select count(*) filter (where external_key ~ '^FSLOBO-L01-Q[0-9]{2}$' and version = 1)::int lote,
      count(*) filter (where external_key is null)::int sem_chave, count(*) filter (where status='published')::int pub,
      count(*) filter (where status='draft')::int draft, count(*) filter (where status='archived')::int arq from public.study_questions`);
  ok(bk.lote === 25 && bk.sem_chave === 1 && bk.pub === 24 && bk.draft === 1 && bk.arq === 1, "preenchimento: 25 chaves do lote (versão 1), questão antiga sem chave, 24 publicadas, Q24 em rascunho, 1 arquivada", j(bk));
  ok((await one("select external_key k from public.study_questions where id=$1", [q24id])).k === "FSLOBO-L01-Q24", "Q24 continua rascunho e ganhou a chave FSLOBO-L01-Q24");
  const viewAfter = (await as("authenticated", STU, "aal1", "select (select jsonb_agg(to_jsonb(s) order by slug) from public.study_list_subjects() s)::text as v")).rows[0].v;
  ok(viewBefore === viewAfter && progBefore === j(await call(S, "study_my_progress")), "preservação: a visão do aluno (assuntos, contagens, progresso) é idêntica");
  const attAfter = await call(S, "study_get_attempt", [att.attempt.id], ["uuid"]);
  ok(attAfter.items.filter((i) => i.answer).length === 2, "preservação: o histórico do aluno (2 respostas) continua legível");
  await call(S, "study_abandon_attempt", [att.attempt.id], ["uuid"]);   // libera o "treino aberto" para os testes seguintes (as respostas ficam)

  // ════════════ FASE 2 — permissões ════════════
  const NEWT = ["study_question_meta", "study_admin_audit"];
  for (const t of NEWT) {
    let bad = [];
    for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      const r = await one("select has_table_privilege('anon', $1, $2) a, has_table_privilege('authenticated', $1, $2) u, has_table_privilege('service_role', $1, $2) s", ["public." + t, p]);
      if (r.a || r.u) bad.push(p + " anon/authenticated");
      if (r.s !== ["SELECT", "INSERT", "UPDATE", "DELETE"].includes(p)) bad.push(p + " service_role");
    }
    ok(bad.length === 0, `${t}: anon/authenticated sem nenhum privilégio; service_role só SELECT/INSERT/UPDATE/DELETE`, bad.join(","));
    ok((await one("select relrowsecurity r from pg_class where oid = $1::regclass", ["public." + t])).r === true, `${t}: RLS ligada`);
  }
  const PUB = ["study_admin_list_subjects", "study_admin_save_subject", "study_admin_list_questions", "study_admin_get_question", "study_admin_save_draft_question", "study_admin_save_question_meta", "study_admin_delete_draft", "study_admin_import_questions", "study_admin_publish_questions", "study_admin_publish_question", "study_admin_archive_question", "study_admin_create_new_version", "study_admin_list_audit"];
  const INT = ["study__admin_guard", "study__admin_audit", "study__admin_validate_content", "study__admin_create_question", "study__admin_diff_question", "study__admin_question_json"];
  const priv = await owner(`select p.proname, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u, has_function_privilege('service_role', p.oid, 'execute') s, p.prosecdef sd, p.proconfig::text cfg
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'study\\_admin\\_%' or p.proname like 'study\\_\\_admin\\_%'`);
  const byName = Object.fromEntries(priv.rows.map((r) => [r.proname, r]));
  ok(PUB.every((n) => byName[n] && !byName[n].a && byName[n].u && byName[n].s), "as 13 RPCs administrativas: anon NÃO executa; authenticated e service_role executam");
  ok(INT.every((n) => byName[n] && !byName[n].a && !byName[n].u), "as 6 funções internas: nem anon nem authenticated executam");
  ok([...PUB, ...INT].every((n) => byName[n].sd && /search_path=pg_catalog/.test(byName[n].cfg || "") || ["study__admin_validate_content"].includes(n)), "todas as RPCs e auxiliares com SECURITY DEFINER e search_path fixo (a validação pura só tem search_path)");
  const allAdminFns = (await owner("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'study\\_admin\\_%' order by 1")).rows.map((r) => r.proname);
  ok(JSON.stringify(allAdminFns) === JSON.stringify([...PUB].sort()), "o conjunto de RPCs study_admin_* é exatamente o esperado (nenhuma de promover/conceder administrador)", allAdminFns.join(","));
  await fails(as("authenticated", STU, "aal2", "insert into public.study_admins (user_id, active) values ($1, true)", [STU]), /permission denied/, "aluno não se promove inserindo em study_admins");
  await fails(as("authenticated", ADM, "aal2", "update public.study_admins set active = true where user_id = $1", [INA]), /permission denied/, "nem o administrador altera study_admins pelo banco");
  await fails(as("authenticated", ADM, "aal2", "select * from public.study_question_meta"), /permission denied/, "authenticated não lê study_question_meta direto");
  await fails(as("authenticated", ADM, "aal2", "select * from public.study_admin_audit"), /permission denied/, "authenticated não lê study_admin_audit direto");
  await fails(as("anon", null, null, "select public.study_admin_list_subjects()"), /permission denied/, "anon não executa study_admin_list_subjects");
  await fails(as("authenticated", ADM, "aal2", "select public.study__admin_guard(false)"), /permission denied/, "authenticated não executa a função interna study__admin_guard");

  // ════════════ autorização (servidor) ════════════
  const probe = { study_admin_list_subjects: [], study_admin_list_questions: [], study_admin_get_question: [q24id], study_admin_list_audit: [] };
  for (const [fn, a] of Object.entries(probe)) {
    await fails(call(S, fn, a, a.length ? ["uuid"] : []), /forbidden/, `aluno: ${fn} -> forbidden`);
    await fails(call(I2, fn, a, a.length ? ["uuid"] : []), /forbidden/, `administrador INATIVO: ${fn} -> forbidden`);
    await fails(call(NOUID, fn, a, a.length ? ["uuid"] : []), /forbidden/, `sem sessão (sem uid): ${fn} -> forbidden`);
  }
  const writes = [
    ["study_admin_save_subject", [null, "x-x", "Assunto X", null, 0, false], ["uuid", "text", "text", "text", "integer", "boolean"]],
    ["study_admin_save_draft_question", [j({})], ["jsonb"]],
    ["study_admin_save_question_meta", [q24id, j({})], ["uuid", "jsonb"]],
    ["study_admin_delete_draft", [q24id], ["uuid"]],
    ["study_admin_import_questions", [j({ format: "fslobo.study-import/1", batch_id: "x1", questions: [] }), false], ["jsonb", "boolean"]],
    ["study_admin_publish_questions", [arr([q24id]), true], ["uuid[]", "boolean"]],
    ["study_admin_publish_question", [q24id, true], ["uuid", "boolean"]],
    ["study_admin_archive_question", [ids24[0], "motivo de teste"], ["uuid", "text"]],
    ["study_admin_create_new_version", [ids24[0]], ["uuid"]],
  ];
  for (const [fn, a, c] of writes) {
    await fails(call(S, fn, a, c), /forbidden/, `aluno: ${fn} -> forbidden`);
    await fails(call(A1, fn, a, c), /mfa_required/, `administrador SEM MFA (aal1): ${fn} -> mfa_required`);
  }
  const before0 = await one("select count(*)::int n from public.study_questions where status='published'");
  ok(before0.n === 24, "nenhuma tentativa não autorizada publicou ou alterou algo (24 publicadas)");
  ok((await call(A1, "study_admin_list_subjects")).length >= 11 && (await call(A1, "study_admin_list_questions")).total === 26, "administrador aal1 consegue LER (assuntos e 26 questões), só não escreve");
  const dry1 = await call(A1, "study_admin_import_questions", [j({ format: "fslobo.study-import/1", batch_id: "dry-aal1", questions: [] }).replace('"questions":[]', '"questions":[{"external_key":"ZZ-DRY-1","subject_slug":"politicas-saude-sus","stem":"Enunciado de simulação sem MFA?","options":{"A":"a1","B":"b1","C":"c1","D":"d1","E":"e1"},"correct":"A","explanation":"Explicação da simulação sem MFA."}]'), true], ["jsonb", "boolean"]);
  ok(dry1.dry_run === true && dry1.counts.new === 1 && dry1.applied === false, "simulação de importação funciona sem MFA e não grava nada");

  // ════════════ assuntos ════════════
  const sl = await call(A1, "study_admin_list_subjects");
  const sus = sl.find((s) => s.slug === "urgencia-emergencia");
  ok(sl.length === 11 && sus.counts.published === 4 && sus.active === true && sl.find((s) => s.slug === "administracao-enfermagem").counts.draft === 1 && sl.find((s) => s.slug === "administracao-enfermagem").active === false, "lista de assuntos: 11 (inclui o inativo), contagens por status corretas");
  const sub = await call(A2, "study_admin_save_subject", [null, "teste-adm", "Assunto de teste", "Descrição", 5, null], ["uuid", "text", "text", "text", "integer", "boolean"]);
  ok(sub.slug === "teste-adm" && sub.active === false && sub.position === 5 && sub.counts.draft === 0, "criar assunto: nasce INATIVO por padrão");
  await fails(call(A2, "study_admin_save_subject", [null, "teste-adm", "Outro nome", null, 0, null], ["uuid", "text", "text", "text", "integer", "boolean"]), /slug_taken/, "slug repetido -> slug_taken");
  await fails(call(A2, "study_admin_save_subject", [null, "Slug Inválido", "Nome ok", null, 0, null], ["uuid", "text", "text", "text", "integer", "boolean"]), /invalid_payload/, "slug inválido -> invalid_payload", /slug/);
  await fails(call(A2, "study_admin_save_subject", [null, "nome-curto", "x", null, 0, null], ["uuid", "text", "text", "text", "integer", "boolean"]), /invalid_payload/, "nome curto -> invalid_payload", /name/);
  await fails(call(A2, "study_admin_save_subject", [null, "pos-ruim", "Nome ok", null, 99999, null], ["uuid", "text", "text", "text", "integer", "boolean"]), /invalid_payload/, "posição fora da faixa -> invalid_payload", /position/);
  const sub2 = await call(A2, "study_admin_save_subject", [sub.id, null, "Assunto renomeado", null, 7, true], ["uuid", "text", "text", "text", "integer", "boolean"]);
  ok(sub2.name === "Assunto renomeado" && sub2.position === 7 && sub2.active === true && sub2.description === "Descrição" && sub2.slug === "teste-adm", "editar assunto: nome, posição e ativação mudam; descrição e slug preservados");
  await fails(call(A2, "study_admin_save_subject", [sub.id, "outro-slug", "Assunto renomeado", null, null, null], ["uuid", "text", "text", "text", "integer", "boolean"]), /slug_immutable/, "mudar o slug -> slug_immutable");
  await fails(call(A2, "study_admin_save_subject", ["99999999-9999-9999-9999-999999999999", null, "Nome ok", null, null, null], ["uuid", "text", "text", "text", "integer", "boolean"]), /not_found/, "assunto inexistente -> not_found");
  const sub3 = await call(A2, "study_admin_save_subject", [sub.id, null, "Assunto renomeado", null, null, false], ["uuid", "text", "text", "text", "integer", "boolean"]);
  ok(sub3.active === false, "desativar assunto");
  await call(A2, "study_admin_save_subject", [sub.id, null, "Assunto renomeado", null, null, true], ["uuid", "text", "text", "text", "integer", "boolean"]);

  // ════════════ rascunhos ════════════
  const mk = (n, over = {}) => ({ subject_slug: "teste-adm", stem: `Enunciado de teste ${n}: qual alternativa está correta?`, difficulty: 2, options: { A: `Alt A ${n}`, B: `Alt B ${n}`, C: `Alt C ${n}`, D: `Alt D ${n}`, E: `Alt E ${n}` }, correct: "C", explanation: `Explicação de teste ${n} com texto suficiente.`, ...over });
  const d1 = await call(A2, "study_admin_save_draft_question", [j(mk(1, { meta: { technical_references: [{ title: "Fonte técnica", url: "https://exemplo.test/ref", note: "n", verified: false }], origin_status: "not_proven", editorial_note: "nota" } }))], ["jsonb"]);
  ok(d1.status === "draft" && d1.version === 1 && /^APP-\d{8}-[0-9a-f]{6}$/.test(d1.external_key) && d1.correct_label === "C" && d1.options.length === 5 && d1.audit.created_by_ref === ADM && d1.audit.reviewed_by_ref === null && d1.audit.no_real_patient_data_confirmed === false && d1.student_visible === false, "criar rascunho: versão 1, chave gerada, 5 alternativas, gabarito C, autoria = administrador, sem revisão");
  ok(d1.meta.technical_references.length === 1 && d1.meta.origin_status === "not_proven" && d1.meta.editorial_note === "nota", "metadados gravados (referência técnica, origem, nota)");
  const row1 = await one("select created_by, reviewed_by, status, published_at from public.study_questions where id=$1", [d1.id]);
  ok(row1.created_by === ADM && row1.reviewed_by === null && row1.status === "draft" && row1.published_at === null, "banco: created_by = conta do administrador; reviewed_by/published_at nulos");
  const d2 = await call(A2, "study_admin_save_draft_question", [j(mk(2, { external_key: "TESTE-CHAVE-2" }))], ["jsonb"]);
  ok(d2.external_key === "TESTE-CHAVE-2", "criar rascunho com chave externa informada");
  await fails(call(A2, "study_admin_save_draft_question", [j(mk(2, { external_key: "TESTE-CHAVE-2" }))], ["jsonb"]), /key_taken/, "chave repetida -> key_taken");
  const bad = mk(3, { options: { A: "a", B: "b", C: "c", D: "d" }, correct: "Z", stem: "curto", difficulty: 9, explanation: "x", extra: 1 });
  await fails(call(A2, "study_admin_save_draft_question", [j(bad)], ["jsonb"]), /invalid_payload/, "campo desconhecido -> invalid_payload", /extra/);
  delete bad.extra;
  await fails(call(A2, "study_admin_save_draft_question", [j(bad)], ["jsonb"]), /invalid_payload/, "conteúdo inválido -> lista todos os problemas", /stem[\s\S]*difficulty[\s\S]*options[\s\S]*correct[\s\S]*explanation|options[\s\S]*stem/);
  await fails(call(A2, "study_admin_save_draft_question", [j(mk(3, { options: { A: "igual", B: "igual", C: "c", D: "d", E: "e" } }))], ["jsonb"]), /invalid_payload/, "alternativas repetidas -> invalid_payload", /repetida/);
  await fails(call(A2, "study_admin_save_draft_question", [j(mk(3, { subject_slug: "nao-existe" }))], ["jsonb"]), /invalid_payload/, "assunto inexistente -> invalid_payload", /subject_slug/);
  await fails(call(A2, "study_admin_save_draft_question", [j(mk(3, { subject_slug: undefined }))], ["jsonb"]), /invalid_payload/, "sem assunto -> invalid_payload", /subject/);
  await fails(call(A2, "study_admin_save_draft_question", [j(mk(3, { meta: { origin_status: "banca_fgv" } }))], ["jsonb"]), /invalid_payload/, "origem fora da lista (não se atribui a banca) -> invalid_payload", /origin_status/);
  await fails(call(A2, "study_admin_save_draft_question", [j(mk(3, { meta: { technical_references: [{ title: "x", url: "javascript:alert(1)" }] } }))], ["jsonb"]), /invalid_payload/, "URL que não é http(s) -> invalid_payload", /url/);
  await fails(call(A2, "study_admin_save_draft_question", [j(mk(3, { external_key: "a b" }))], ["jsonb"]), /invalid_payload/, "chave com caracteres inválidos -> invalid_payload", /external_key/);
  ok((await one("select count(*)::int n from public.study_questions where stem like 'Enunciado de teste 3:%'")).n === 0, "payloads inválidos não gravaram nada");
  // edição
  const e1 = await call(A2, "study_admin_save_draft_question", [j(mk(1, { id: d1.id, stem: "Enunciado de teste 1 EDITADO: qual alternativa está correta?", correct: "B", options: { A: "Novo A", B: "Novo B", C: "Novo C", D: "Novo D", E: "Novo E" }, expected_updated_at: d1.audit.updated_at }))], ["jsonb"]);
  ok(e1.id === d1.id && /EDITADO/.test(e1.stem) && e1.correct_label === "B" && e1.options.find((o) => o.label === "A").body === "Novo A" && e1.external_key === d1.external_key && e1.audit.created_by_ref === ADM, "editar rascunho: conteúdo, alternativas e gabarito trocados; id, chave e autoria preservados");
  ok((await one("select count(*)::int n from public.study_question_options where question_id=$1", [d1.id])).n === 5 && (await one("select count(*)::int n from public.study_answer_keys where question_id=$1", [d1.id])).n === 1, "edição atômica: continuam 5 alternativas e 1 gabarito");
  await fails(call(A2, "study_admin_save_draft_question", [j(mk(1, { id: d1.id, expected_updated_at: d1.audit.updated_at }))], ["jsonb"]), /stale_write/, "edição com data desatualizada -> stale_write");
  await fails(call(A2, "study_admin_save_draft_question", [j(mk(1, { id: d1.id, external_key: "OUTRA-CHAVE" }))], ["jsonb"]), /invalid_payload/, "mudar a chave na edição -> recusado", /imutável/);
  await fails(call(A2, "study_admin_save_draft_question", [j(mk(1, { id: d1.id, stem: "x" }))], ["jsonb"]), /invalid_payload/, "edição inválida -> recusada");
  ok((await call(A2, "study_admin_get_question", [d1.id], ["uuid"])).stem === e1.stem, "edição recusada não alterou o rascunho");
  await fails(call(A2, "study_admin_save_draft_question", [j(mk(1, { id: ids24[0] }))], ["jsonb"]), /not_editable/, "editar questão PUBLICADA -> not_editable");
  await fails(call(A2, "study_admin_save_draft_question", [j(mk(1, { id: legacy }))], ["jsonb"]), /not_editable/, "editar questão ARQUIVADA -> not_editable");
  await fails(call(A2, "study_admin_save_draft_question", [j(mk(1, { id: "99999999-9999-9999-9999-999999999999" }))], ["jsonb"]), /not_found/, "editar questão inexistente -> not_found");
  const g = await call(A1, "study_admin_get_question", [ids24[0]], ["uuid"]);
  ok(g.status === "published" && g.correct_label && g.explanation && g.external_key === "FSLOBO-L01-Q01" && g.version === 1 && g.is_latest === true && g.student_visible === true && g.versions.length === 1, "consultar questão publicada: gabarito e explicação só para o administrador, chave, versão e visibilidade");

  // ════════════ listagem ════════════
  const l1 = await call(A1, "study_admin_list_questions", [arr(["published"]), null, null, 10, 0, false], ["text[]", "uuid", "text", "integer", "integer", "boolean"]);
  ok(l1.total === 24 && l1.items.length === 10 && l1.limit === 10 && l1.items.every((i) => i.status === "published" && i.stem_preview.length <= 160), "listar publicadas: total 24, página de 10, prévia até 160 caracteres");
  const l2 = await call(A1, "study_admin_list_questions", [arr(["published"]), null, null, 10, 20, false], ["text[]", "uuid", "text", "integer", "integer", "boolean"]);
  ok(l2.items.length === 4, "paginação: offset 20 devolve as 4 restantes");
  ok((await call(A1, "study_admin_list_questions", [null, null, null, 9999, 0, false], ["text[]", "uuid", "text", "integer", "integer", "boolean"])).limit === 200, "limite máximo de 200 por página");
  ok((await call(A1, "study_admin_list_questions", [null, null, "fslobo-l01-q07"], ["text[]", "uuid", "text"])).total === 1, "busca por chave externa (sem diferenciar maiúsculas)");
  ok((await call(A1, "study_admin_list_questions", [null, null, "notificação"], ["text[]", "uuid", "text"])).total >= 1, "busca no enunciado");
  ok((await call(A1, "study_admin_list_questions", [null, null, "%%"], ["text[]", "uuid", "text"])).total === 0, "busca por '%%' é literal (não vira curinga que casaria tudo)");
  ok((await call(A1, "study_admin_list_questions", [null, sus.id], ["text[]", "uuid"])).total === 4, "filtro por assunto");
  await fails(call(A1, "study_admin_list_questions", [arr(["publicada"])], ["text[]"]), /invalid_filter/, "status inválido -> invalid_filter");
  await fails(call(A1, "study_admin_list_questions", [null, null, "x".repeat(101)], ["text[]", "uuid", "text"]), /invalid_filter/, "busca com mais de 100 caracteres -> invalid_filter");

  // ════════════ importação ════════════
  const asItem = (g0) => ({ external_key: g0.external_key, version: g0.version, subject_slug: g0.subject.slug, stem: g0.stem, difficulty: g0.difficulty,
    options: Object.fromEntries(g0.options.map((o) => [o.label, o.body])), correct: g0.correct_label, explanation: g0.explanation });
  const B = (id, qs) => j({ format: "fslobo.study-import/1", batch_id: id, questions: qs });
  const imp = (who, batch, dry) => call(who, "study_admin_import_questions", [batch, dry], ["jsonb", "boolean"]);
  const count = async () => (await one("select count(*)::int n from public.study_questions")).n;
  // 7.1 NÃO reimportar o lote 01: os 25 do banco chegam como "equal" (dry-run)
  const all25 = [];
  for (const id of [...ids24, q24id]) all25.push(asItem(await call(A1, "study_admin_get_question", [id], ["uuid"])));
  const rAll = await imp(A1, B("reimport-lote01", all25), true);
  ok(rAll.counts.equal === 25 && rAll.counts.new === 0 && rAll.counts.divergent === 0 && rAll.counts.invalid === 0 && rAll.can_apply === true, "simulação com o conteúdo do lote 01: 25 iguais, nenhuma nova/divergente/inválida");
  const c0 = await count();
  const rAllApply = await imp(A2, B("reimport-lote01", all25), false);
  ok(rAllApply.applied === true && rAllApply.counts.equal === 25 && (await count()) === c0, "reaplicar o lote 01 não cria nada (idempotente) e preserva as 25 questões");
  // 7.2 lote misto
  const novo = mk("imp-novo", { external_key: "IMP-NOVO-1" });
  const igual = asItem(await call(A1, "study_admin_get_question", [ids24[2]], ["uuid"]));
  const diverg = { ...asItem(await call(A1, "study_admin_get_question", [ids24[3]], ["uuid"])) }; diverg.explanation = diverg.explanation + " (alterada)";
  const invalido = { external_key: "IMP-INV-1", subject_slug: "teste-adm", stem: "Enunciado sem alternativas para teste?", correct: "A", explanation: "Explicação suficiente para o teste." };
  const mixed = B("lote-misto", [novo, igual, diverg, invalido]);
  const rm = await imp(A1, mixed, true);
  const out = Object.fromEntries(rm.items.map((i) => [i.external_key, i]));
  ok(rm.counts.new === 1 && rm.counts.equal === 1 && rm.counts.divergent === 1 && rm.counts.invalid === 1 && rm.can_apply === false && rm.applied === false, "simulação mista: 1 nova, 1 igual, 1 divergente, 1 inválida; não pode aplicar", j(rm.counts));
  ok(out["IMP-NOVO-1"].outcome === "new" && out[igual.external_key].outcome === "equal" && out[diverg.external_key].outcome === "divergent" && out["IMP-INV-1"].outcome === "invalid", "resultado por item correto");
  ok(out[diverg.external_key].diffs.length === 1 && out[diverg.external_key].diffs[0] === "explanation" && out[diverg.external_key].status === "published", "divergente: aponta o campo (explanation) e o status da questão existente");
  ok(out["IMP-INV-1"].problems.some((p) => p.field === "options"), "inválida: aponta o campo com problema (options)");
  const c1 = await count();
  const ra = await imp(A2, mixed, false);
  ok(ra.applied === false && ra.can_apply === false && (await count()) === c1 && (await one("select count(*)::int n from public.study_questions where external_key='IMP-NOVO-1'")).n === 0, "aplicar lote com divergente/inválida NÃO grava nada (nem a questão nova)");
  ok((await call(A1, "study_admin_get_question", [ids24[3]], ["uuid"])).explanation === (await call(A1, "study_admin_get_question", [ids24[3]], ["uuid"])).explanation && !/alterada/.test((await call(A1, "study_admin_get_question", [ids24[3]], ["uuid"])).explanation), "a questão publicada divergente não foi sobrescrita");
  // 7.3 lote bom
  const bom = B("lote-bom", [mk("b1", { external_key: "IMP-B1", meta: { technical_references: [{ title: "Ref técnica" }], editorial_note: "nota de lote" } }), mk("b2", { external_key: "IMP-B2" }), { ...asItem(await call(A1, "study_admin_get_question", [ids24[4]], ["uuid"])) }]);
  const importsBefore = (await one("select count(*)::int n from public.study_admin_audit where action='import'")).n;
  const rb = await imp(A1, bom, true);
  ok(rb.counts.new === 2 && rb.counts.equal === 1 && rb.can_apply === true && rb.applied === false && (await count()) === c1, "simulação do lote bom: 2 novas e 1 igual; não gravou nada");
  ok((await one("select count(*)::int n from public.study_admin_audit where action='import'")).n === importsBefore, "simulação (dry-run) não gera linha de auditoria");
  const rba = await imp(A2, bom, false);
  ok(rba.applied === true && rba.counts.new === 2 && (await count()) === c1 + 2 && rba.items.filter((i) => i.outcome === "new").every((i) => i.id), "aplicação atômica: 2 rascunhos criados e ids devolvidos");
  const imported = await one("select q.status::text st, q.created_by, q.reviewed_by, q.published_at, q.no_real_patient_data_confirmed att, q.version, m.import_batch, m.technical_references->0->>'title' ref from public.study_questions q join public.study_question_meta m on m.question_id=q.id where q.external_key='IMP-B1'");
  ok(imported.st === "draft" && imported.created_by === ADM && imported.reviewed_by === null && imported.published_at === null && imported.att === false && imported.version === 1 && imported.import_batch === "lote-bom" && imported.ref === "Ref técnica", "importadas entram como RASCUNHO, autoria = administrador, sem revisão, com lote e metadados");
  const c2 = await count();
  const rb2 = await imp(A2, bom, false);
  ok(rb2.applied === true && rb2.counts.equal === 3 && rb2.counts.new === 0 && (await count()) === c2, "repetir a importação: 3 iguais, nenhuma duplicata");
  await call(A2, "study_admin_save_draft_question", [j(mk("b1", { id: (await one("select id from public.study_questions where external_key='IMP-B1'")).id, stem: "Enunciado de teste b1 MUDOU: qual alternativa está correta?", meta: { technical_references: [{ title: "Ref técnica" }], editorial_note: "nota de lote" } }))], ["jsonb"]);
  const rb3 = await imp(A1, bom, true);
  ok(rb3.counts.divergent === 1 && rb3.items.find((i) => i.external_key === "IMP-B1").diffs.includes("stem"), "rascunho editado depois da importação vira 'divergente' (não é sobrescrito)");
  // 7.4 versões e regras do lote
  const v1id = ids24[5];
  const v1 = await call(A1, "study_admin_get_question", [v1id], ["uuid"]);
  const v2item = { ...asItem(v1), version: 2, explanation: v1.explanation + " Versão corrigida." };
  const rv2 = await imp(A2, B("corr-v2", [v2item]), false);
  const v2row = await one("select q.id, q.supersedes_id, q.version, q.status::text st from public.study_questions q where q.external_key=$1 and q.version=2", [v1.external_key]);
  ok(rv2.applied === true && v2row.supersedes_id === v1id && v2row.st === "draft", "importar versão 2: entra como rascunho apontando para a versão 1 (que continua publicada e intacta)");
  ok((await one("select status::text s from public.study_questions where id=$1", [v1id])).s === "published", "a versão 1 continua publicada");
  const rv2b = await imp(A1, B("corr-v2b", [{ ...v2item, version: 3 }]), true);
  ok(rv2b.items[0].outcome === "invalid" && rv2b.items[0].problems.some((p) => /anterior/.test(p.message) || /rascunho aberto/.test(p.message)), "versão 3 sem versão 2 publicada/existente ou com rascunho aberto -> inválida");
  const rv9 = await imp(A1, B("sem-ant", [{ ...asItem(await call(A1, "study_admin_get_question", [ids24[6]], ["uuid"])), version: 5 }]), true);
  ok(rv9.items[0].outcome === "invalid" && /anterior/.test(JSON.stringify(rv9.items[0].problems)), "versão sem a anterior no banco -> inválida (missing previous)");
  await call(A2, "study_admin_delete_draft", [v2row.id], ["uuid"]);
  const dup = await imp(A1, B("dups", [mk("d", { external_key: "IMP-D1" }), mk("d", { external_key: "IMP-D1" })]), true);
  ok(dup.counts.invalid === 1 && dup.counts.new === 1, "chave e versão repetidas no lote: a repetição é inválida");
  const unk = await imp(A1, B("unk", [{ ...mk("u", { external_key: "IMP-U1" }), extra: 1 }]), true);
  ok(unk.items[0].outcome === "invalid" && unk.items[0].problems.some((p) => p.field === "extra"), "campo desconhecido no item -> inválido");
  const nosub = await imp(A1, B("nosub", [mk("s", { external_key: "IMP-S1", subject_slug: "nao-existe" })]), true);
  ok(nosub.items[0].outcome === "invalid" && nosub.items[0].problems.some((p) => p.field === "subject_slug"), "assunto inexistente -> inválido (importar não cria assuntos)");
  const dupStem = await imp(A1, B("dst", [mk("x", { external_key: "IMP-DS1", stem: (await call(A1, "study_admin_get_question", [ids24[7]], ["uuid"])).stem })]), true);
  ok(dupStem.items[0].outcome === "new" && dupStem.items[0].warnings.some((w) => w.code === "duplicate_stem"), "mesmo enunciado com outra chave: nova, mas com aviso duplicate_stem");
  for (const [bad, re, nm] of [
    [j({ format: "outro", batch_id: "x1", questions: [mk(1, { external_key: "ZZ-1" })] }), /invalid_batch/, "formato errado"],
    [j({ format: "fslobo.study-import/1", batch_id: "x1", questions: [] }), /empty_batch/, "lote vazio"],
    [j({ format: "fslobo.study-import/1", batch_id: "x", questions: [mk(1)] }), /invalid_batch/, "batch_id inválido"],
    [j({ format: "fslobo.study-import/1", batch_id: "x1", questions: [mk(1)], extra: 1 }), /invalid_batch/, "campo desconhecido no lote"],
    [j([1]), /invalid_batch/, "lote que não é objeto"],
    [j({ format: "fslobo.study-import/1", batch_id: "x1", questions: Array.from({ length: 201 }, (_, i) => mk(i, { external_key: "BIG-" + i })) }), /batch_too_large/, "mais de 200 questões"],
    [j({ format: "fslobo.study-import/1", batch_id: "x1", questions: [mk(1, { external_key: "HUGE-1", stem: "x".repeat(2100000) })] }), /payload_too_large/, "mais de 2 MB"],
  ]) await fails(imp(A1, bad, true), re, `lote inválido (${nm}) é rejeitado`);
  // 7.5 atomicidade real: uma falha no meio da gravação desfaz tudo
  await db.exec(`create function public.zz_test_fail() returns trigger language plpgsql as $$ begin if new.body like '%FORCEFAIL%' then raise exception 'falha_injetada'; end if; return new; end $$;
    create trigger zz_test_fail before insert on public.study_explanations for each row execute function public.zz_test_fail()`);
  const cA = await count();
  await fails(imp(A2, B("atomico", [mk("at1", { external_key: "AT-1" }), mk("at2", { external_key: "AT-2", explanation: "Explicação com FORCEFAIL para falhar." }), mk("at3", { external_key: "AT-3" })]), false), /falha_injetada/, "falha no meio da gravação aborta a chamada");
  ok((await count()) === cA && (await one("select count(*)::int n from public.study_questions where external_key like 'AT-%'")).n === 0, "importação atômica: nenhuma das 3 questões ficou gravada");
  await db.exec("drop trigger zz_test_fail on public.study_explanations; drop function public.zz_test_fail()");

  // ════════════ publicar ════════════
  const p1 = await call(A2, "study_admin_save_draft_question", [j(mk("p1", { external_key: "PUB-1", meta: { technical_references: [{ title: "Ref", url: "https://exemplo.test/x" }] } }))], ["jsonb"]);
  const p2 = await call(A2, "study_admin_save_draft_question", [j(mk("p2", { external_key: "PUB-2" }))], ["jsonb"]);
  const p3 = await call(A2, "study_admin_save_draft_question", [j(mk("p3", { external_key: "PUB-3", subject_slug: "administracao-enfermagem" }))], ["jsonb"]);
  await fails(call(A2, "study_admin_publish_questions", [arr([p1.id, p2.id]), false], ["uuid[]", "boolean"]), /patient_data_confirmation_required/, "publicar sem o atestado -> patient_data_confirmation_required");
  await fails(call(A2, "study_admin_publish_questions", [arr([p1.id, "99999999-9999-9999-9999-999999999999"]), true], ["uuid[]", "boolean"]), /not_found/, "lote com id inexistente -> not_found");
  await fails(call(A2, "study_admin_publish_questions", [arr([p1.id, ids24[0]]), true], ["uuid[]", "boolean"]), /invalid_status/, "lote com questão já publicada -> invalid_status");
  await fails(call(A2, "study_admin_publish_questions", [arr([]), true], ["uuid[]", "boolean"]), /invalid_payload/, "lista vazia -> invalid_payload");
  ok((await one("select count(*)::int n from public.study_questions where external_key in ('PUB-1','PUB-2') and status='draft'")).n === 2, "tudo ou nada: as recusas acima não publicaram nenhuma");
  const pr = await call(A2, "study_admin_publish_questions", [arr([p1.id, p2.id, p3.id]), true], ["uuid[]", "boolean"]);
  ok(pr.published.length === 3 && pr.archived_previous.length === 0, "publicar 3 em lote");
  ok(pr.warnings.length === 1 && pr.warnings[0].id === p3.id && pr.warnings[0].code === "subject_inactive", "aviso subject_inactive para a questão do assunto inativo");
  const pub1 = await one("select status::text s, created_by, reviewed_by, reviewed_at is not null ra, published_at is not null pa, no_real_patient_data_confirmed att, created_by_ref, reviewed_by_ref from public.study_questions where id=$1", [p1.id]);
  ok(pub1.s === "published" && pub1.created_by === ADM && pub1.reviewed_by === ADM && pub1.ra && pub1.pa && pub1.att && pub1.created_by_ref === ADM && pub1.reviewed_by_ref === ADM, "publicada: criador, revisor (= quem chamou), datas e atestado registrados");
  await fails(call(A2, "study_admin_publish_questions", [arr([p1.id]), true], ["uuid[]", "boolean"]), /invalid_status/, "publicar de novo -> invalid_status");
  const vis = (await as("authenticated", STU, "aal1", "select (select jsonb_agg(to_jsonb(s) order by slug) from public.study_list_subjects() s)::text as v")).rows[0].v;
  ok(/teste-adm/.test(vis) && !/administracao-enfermagem/.test(vis), "o aluno passa a ver o assunto ativo com questão publicada e não vê o assunto inativo");
  await fails(owner("update public.study_questions set stem = 'service_role tentando editar o enunciado publicado' where id=$1", [p1.id]), /imut/, "enunciado publicado é imutável (mesmo para o dono do banco)");
  await fails(owner("update public.study_questions set external_key = 'OUTRA-CHAVE' where id=$1", [p1.id]), /imut/, "external_key de questão publicada é imutável");
  await fails(owner("update public.study_questions set version = 9 where id=$1", [p1.id]), /imut/, "version de questão publicada é imutável");
  const p4 = await call(A2, "study_admin_save_draft_question", [j(mk("p4", { external_key: "PUB-4" }))], ["jsonb"]);
  await call(A2, "study_admin_publish_question", [p4.id, true], ["uuid", "boolean"]);
  ok((await one("select reviewed_by r from public.study_questions where id=$1", [p4.id])).r === ADM, "a RPC antiga study_admin_publish_question continua funcionando (agora com MFA)");
  await fails(call(A2, "study_admin_publish_question", [p4.id, true], ["uuid", "boolean"]), /invalid_status/, "RPC antiga: republicar -> invalid_status");
  await fails(call(S, "study_admin_publish_question", [p2.id, true], ["uuid", "boolean"]), /forbidden/, "RPC antiga: aluno -> forbidden");
  const draftNoKey = await one("select id from public.study_questions where external_key = 'IMP-B2'");
  await owner("delete from public.study_answer_keys where question_id=$1", [draftNoKey.id]);
  await fails(call(A2, "study_admin_publish_questions", [arr([draftNoKey.id]), true], ["uuid[]", "boolean"]), /answer_key_missing/, "rascunho sem gabarito -> answer_key_missing (rede de segurança do servidor)");
  await owner("insert into public.study_answer_keys select $1, id from public.study_question_options where question_id=$1 and label='C'", [draftNoKey.id]);

  // ════════════ arquivar ════════════
  const att2 = await call(S, "study_start_attempt", ["teste-adm", "practice", 5], ["text", "public.study_attempt_mode", "integer"]);
  const itemPub1 = att2.items.find((i) => i.stem === p1.stem) || att2.items[0];
  await call(S, "study_submit_answer", [itemPub1.item_id, await keyOf(itemPub1.item_id)], ["uuid", "uuid"]);
  const qOfItem = (await one("select question_id q from public.study_attempt_items where id=$1", [itemPub1.item_id])).q;
  await fails(call(A2, "study_admin_archive_question", [qOfItem, "x"], ["uuid", "text"]), /invalid_payload/, "arquivar exige motivo de 3 a 300 caracteres", /reason/);
  await fails(call(A2, "study_admin_archive_question", [d1.id, "rascunho não arquiva"], ["uuid", "text"]), /invalid_status/, "arquivar rascunho -> invalid_status");
  const ansBefore = (await one("select count(*)::int n from public.study_attempt_answers")).n;
  const arq = await call(A2, "study_admin_archive_question", [qOfItem, "conteúdo desatualizado"], ["uuid", "text"]);
  ok(arq.status === "archived" && arq.student_visible === false, "arquivar questão publicada");
  ok((await one("select count(*)::int n from public.study_attempt_answers")).n === ansBefore && (await call(S, "study_get_attempt", [att2.attempt.id], ["uuid"])).items.some((i) => i.answer), "histórico preservado: a resposta do aluno à questão arquivada continua lá");
  await call(S, "study_abandon_attempt", [att2.attempt.id], ["uuid"]);
  const att3 = await call(S, "study_start_attempt", ["teste-adm", "practice", 5], ["text", "public.study_attempt_mode", "integer"]);
  ok(!att3.items.some((i) => (i.item_id === itemPub1.item_id)) && !(await owner("select 1 from public.study_attempt_items where attempt_id=$1 and question_id=$2", [att3.attempt.id, qOfItem])).rows.length, "novas tentativas não incluem a questão arquivada");
  await call(S, "study_abandon_attempt", [att3.attempt.id], ["uuid"]);
  await fails(call(A2, "study_admin_archive_question", [qOfItem, "arquivar de novo"], ["uuid", "text"]), /invalid_status/, "arquivar de novo -> invalid_status");
  await fails(owner("update public.study_questions set status = 'published' where id=$1", [qOfItem]), /transição|imut/i, "arquivada não volta a publicada");

  // ════════════ nova versão ════════════
  const orig = await call(A1, "study_admin_get_question", [p2.id], ["uuid"]);
  const origHash = async () => (await one(`select md5(concat_ws('|', (select to_jsonb(q) - 'updated_at' from public.study_questions q where q.id=$1)::text,
      (select string_agg(o::text, ',' order by o.label) from public.study_question_options o where o.question_id=$1),
      (select k::text from public.study_answer_keys k where k.question_id=$1), (select e::text from public.study_explanations e where e.question_id=$1))) h`, [p2.id])).h;
  const h0 = await origHash();
  const nv = await call(A2, "study_admin_create_new_version", [p2.id], ["uuid"]);
  ok(nv.status === "draft" && nv.version === 2 && nv.external_key === orig.external_key && nv.supersedes_id === p2.id && nv.stem === orig.stem && nv.correct_label === orig.correct_label && nv.audit.created_by_ref === ADM, "nova versão: rascunho v2 com o mesmo conteúdo, chave igual e supersedes_id da v1");
  ok(nv.versions.length === 2 && nv.versions[0].version === 1 && nv.versions[0].status === "published", "nova versão lista as versões da chave");
  ok((await call(A1, "study_admin_get_question", [p2.id], ["uuid"])).is_latest === false, "a v1 deixa de ser a mais recente");
  await fails(call(A2, "study_admin_create_new_version", [p2.id], ["uuid"]), /not_latest_version/, "nova versão a partir da v1 (não é a última) -> not_latest_version");
  await fails(call(A2, "study_admin_create_new_version", [nv.id], ["uuid"]), /invalid_status/, "nova versão a partir de rascunho -> invalid_status");
  await fails(call(A2, "study_admin_create_new_version", [legacy], ["uuid"]), /no_external_key/, "questão antiga sem chave -> no_external_key");
  await fails(call(A2, "study_admin_create_new_version", [d1.id], ["uuid"]), /invalid_status/, "nova versão de rascunho comum -> invalid_status");
  const nvEdit = await call(A2, "study_admin_save_draft_question", [j(mk("p2", { id: nv.id, external_key: orig.external_key, stem: "Enunciado de teste p2 CORRIGIDO: qual alternativa está correta?" }))], ["jsonb"]);
  ok(/CORRIGIDO/.test(nvEdit.stem) && (await origHash()) === h0, "editar a v2 não altera nenhuma linha da v1 (conteúdo, alternativas, gabarito e explicação idênticos)");
  const att4 = await call(S, "study_start_attempt", ["teste-adm", "practice", 5], ["text", "public.study_attempt_mode", "integer"]);
  const itV1 = att4.items.find((i) => i.stem === orig.stem);
  if (itV1) await call(S, "study_submit_answer", [itV1.item_id, await keyOf(itV1.item_id)], ["uuid", "uuid"]);
  const pv = await call(A2, "study_admin_publish_questions", [arr([nv.id]), true], ["uuid[]", "boolean"]);
  ok(pv.published.length === 1 && pv.archived_previous.length === 1 && pv.archived_previous[0] === p2.id, "publicar a v2 arquiva a v1 automaticamente, na mesma transação");
  const vs = await one("select (select status::text from public.study_questions where id=$1) s1, (select status::text from public.study_questions where id=$2) s2", [p2.id, nv.id]);
  ok(vs.s1 === "archived" && vs.s2 === "published", "v1 arquivada e v2 publicada");
  ok(!itV1 || (await call(S, "study_get_attempt", [att4.attempt.id], ["uuid"])).items.find((i) => i.item_id === itV1.item_id).answer, "tentativa aberta com a v1: a resposta dada à v1 continua legível");
  await call(S, "study_abandon_attempt", [att4.attempt.id], ["uuid"]);
  const att5 = await call(S, "study_start_attempt", ["teste-adm", "practice", 5], ["text", "public.study_attempt_mode", "integer"]);
  ok(att5.items.some((i) => /CORRIGIDO/.test(i.stem)) && !att5.items.some((i) => i.stem === orig.stem), "o aluno passa a receber a v2 e não recebe mais a v1");
  ok(!/correct_option_id|explanation|is_correct|technical_references|origin_status|editorial_note|external_key/.test(j(att5)), "payload do aluno não tem gabarito, explicação, referências, origem nem chave");
  await call(S, "study_abandon_attempt", [att5.attempt.id], ["uuid"]);
  const nv3 = await call(A2, "study_admin_create_new_version", [nv.id], ["uuid"]);
  ok(nv3.version === 3 && nv3.supersedes_id === nv.id, "a partir da v2 (última) cria v3");
  await call(A2, "study_admin_delete_draft", [nv3.id], ["uuid"]);

  // ════════════ metadados, exclusão de rascunho ════════════
  const mm = await call(A2, "study_admin_save_question_meta", [ids24[0], j({ technical_references: [{ title: "Ministério da Saúde — SUS", url: "https://www.gov.br/saude/pt-br/sus", verified: true }], origin_status: "not_proven", origin_note: "origem a confirmar", editorial_note: "revisão editorial pendente" })], ["uuid", "jsonb"]);
  ok(mm.meta.technical_references[0].verified === true && mm.meta.origin_note === "origem a confirmar" && mm.status === "published", "metadados podem ser corrigidos em questão publicada (não são conteúdo do aluno)");
  await fails(call(A2, "study_admin_save_question_meta", [ids24[0], j({ origin_status: "FGV" })], ["uuid", "jsonb"]), /invalid_payload/, "origem 'FGV' é recusada (não se atribui a banca)", /origin_status/);
  await fails(call(A2, "study_admin_save_question_meta", [ids24[0], j([])], ["uuid", "jsonb"]), /invalid_payload/, "meta que não é objeto -> invalid_payload");
  await fails(call(A2, "study_admin_save_question_meta", ["99999999-9999-9999-9999-999999999999", j({})], ["uuid", "jsonb"]), /not_found/, "meta de questão inexistente -> not_found");
  const dd = await call(A2, "study_admin_save_draft_question", [j(mk("del", { external_key: "DEL-1" }))], ["jsonb"]);
  await call(A2, "study_admin_delete_draft", [dd.id], ["uuid"]);
  const left = await one("select (select count(*)::int from public.study_questions where id=$1) q, (select count(*)::int from public.study_question_options where question_id=$1) o, (select count(*)::int from public.study_answer_keys where question_id=$1) k, (select count(*)::int from public.study_explanations where question_id=$1) e, (select count(*)::int from public.study_question_meta where question_id=$1) m", [dd.id]);
  ok(Object.values(left).every((v) => v === 0), "excluir rascunho remove questão, alternativas, gabarito, explicação e metadados");
  await fails(call(A2, "study_admin_delete_draft", [ids24[0]], ["uuid"]), /invalid_status/, "excluir questão publicada -> invalid_status");
  await fails(call(A2, "study_admin_delete_draft", [dd.id], ["uuid"]), /not_found/, "excluir de novo -> not_found");

  // ════════════ chaves e versões no banco ════════════
  await fails(owner("insert into public.study_questions (subject_id, stem, external_key, version) select subject_id, 'Duplicata de chave e versão para teste.', external_key, version from public.study_questions where external_key='FSLOBO-L01-Q01'"), /study_questions_key_version_uq|duplicate key/, "banco: (external_key, version) é único");
  await fails(owner("insert into public.study_questions (subject_id, stem, external_key, version) select subject_id, 'Segundo rascunho aberto para a mesma chave.', external_key, 5 from public.study_questions where external_key='FSLOBO-L01-Q24'"), /study_questions_one_open_draft_uq|duplicate key/, "banco: só um rascunho aberto por chave");
  await fails(owner("update public.study_questions set external_key = 'a b' where id=$1", [q24id]), /study_questions_external_key_format|check/, "banco: formato da chave externa");
  await fails(owner("update public.study_questions set version = 0 where id=$1", [q24id]), /study_questions_version_positive|check/, "banco: versão maior ou igual a 1");

  // ════════════ limite de 12.000 bytes das referências técnicas (mesma conta da constraint) ════════════
  const sizeOf = async (refs) => (await one("select octet_length($1::jsonb::text) n", [j(refs)])).n;
  const refsOfSize = async (target) => {            // 20 referências individualmente válidas; jsonb::text com EXATAMENTE `target` bytes
    const refs = Array.from({ length: 20 }, () => ({ title: "T".repeat(200), note: "a".repeat(300) }));
    let rem = target - (await sizeOf(refs));
    for (let i = 0; i < 20 && rem > 0; i++) { const add = Math.min(rem, 200); refs[i].note += "a".repeat(add); rem -= add; }
    return refs;
  };
  const okRefs = await refsOfSize(12000), overRefs = await refsOfSize(12001);
  const multiRefs = Array.from({ length: 20 }, () => ({ title: "T".repeat(200), note: "ã".repeat(200) }));
  ok((await sizeOf(okRefs)) === 12000 && (await sizeOf(overRefs)) === 12001, "calibração: referências de exatamente 12000 e 12001 bytes");
  ok(okRefs.every((r) => r.title.length <= 200 && r.note.length <= 500) && overRefs.every((r) => r.title.length <= 200 && r.note.length <= 500), "ambas têm campos individualmente válidos (título até 200 e nota até 500 caracteres)");
  ok((await sizeOf(multiRefs)) > 12000 && multiRefs.every((r) => r.note.length <= 500), "referências com acento: poucos caracteres, mas passam de 12000 BYTES");
  const refProblems = async (refs) => (await one("select public.study__admin_validate_content($1::jsonb) r", [j({ ...mk("lim"), meta: { technical_references: refs } })])).r;
  ok((await refProblems(okRefs)).length === 0, "validação: 12000 bytes -> nenhum problema");
  const pOver = await refProblems(overRefs);
  ok(pOver.length === 1 && pOver[0].field === "meta.technical_references" && /12000/.test(pOver[0].message) && /12001/.test(pOver[0].message), "validação: 12001 bytes -> 1 problema no campo meta.technical_references, com o tamanho", j(pOver));
  ok((await refProblems(multiRefs)).some((p) => p.field === "meta.technical_references" && /bytes/.test(p.message)), "validação: conta BYTES (acentos), não caracteres");
  await fails(owner("insert into public.study_question_meta (question_id, technical_references) values ($1, $2::jsonb)", [q24id, j(overRefs)]), /study_question_meta_technical_references_check|check/, "constraint da tabela continua recusando 12001 bytes (a validação agora a antecipa)");
  const nQ = await count();
  // salvar rascunho
  await fails(call(A2, "study_admin_save_draft_question", [j(mk("lim1", { external_key: "LIM-OVER", meta: { technical_references: overRefs } }))], ["jsonb"]), /invalid_payload/, "rascunho com 12001 bytes -> invalid_payload (antes de gravar)", /meta\.technical_references/);
  await fails(call(A2, "study_admin_save_draft_question", [j(mk("lim1", { external_key: "LIM-MULTI", meta: { technical_references: multiRefs } }))], ["jsonb"]), /invalid_payload/, "rascunho com referências acima do limite em bytes (acentos) -> invalid_payload", /meta\.technical_references/);
  ok((await count()) === nQ && (await one("select count(*)::int n from public.study_questions where external_key like 'LIM-%'")).n === 0, "recusas por tamanho não gravaram nada (nem questão, nem metadados)");
  const limOk = await call(A2, "study_admin_save_draft_question", [j(mk("lim2", { external_key: "LIM-OK", meta: { technical_references: okRefs } }))], ["jsonb"]);
  ok(limOk.meta.technical_references.length === 20 && (await one("select octet_length(technical_references::text) n from public.study_question_meta where question_id=$1", [limOk.id])).n === 12000, "rascunho com exatamente 12000 bytes e 20 referências é gravado");
  // editar / salvar metadados
  await fails(call(A2, "study_admin_save_draft_question", [j(mk("lim2", { id: limOk.id, external_key: "LIM-OK", meta: { technical_references: overRefs } }))], ["jsonb"]), /invalid_payload/, "editar rascunho com 12001 bytes -> invalid_payload", /meta\.technical_references/);
  await fails(call(A2, "study_admin_save_question_meta", [limOk.id, j({ technical_references: overRefs })], ["uuid", "jsonb"]), /invalid_payload/, "salvar metadados com 12001 bytes -> invalid_payload", /meta\.technical_references/);
  ok((await one("select octet_length(technical_references::text) n from public.study_question_meta where question_id=$1", [limOk.id])).n === 12000, "as recusas deixaram os metadados anteriores intactos (12000 bytes)");
  const mm2 = await call(A2, "study_admin_save_question_meta", [limOk.id, j({ technical_references: [{ title: "Só uma" }] })], ["uuid", "jsonb"]);
  ok(mm2.meta.technical_references.length === 1, "metadados dentro do limite continuam sendo salvos");
  // importação: simulação e gravação
  const itemWith = (key, refs) => mk("lim-" + key, { external_key: key, meta: { technical_references: refs } });
  const rOver = await imp(A1, B("lim-dry", [itemWith("LIM-I1", overRefs)]), true);
  ok(rOver.items[0].outcome === "invalid" && rOver.counts.invalid === 1 && rOver.can_apply === false && rOver.items[0].problems.some((p) => p.field === "meta.technical_references" && /12000/.test(p.message)), "simulação: item com 12001 bytes sai 'invalid', com o problema no campo", j(rOver.items[0].problems));
  const rOk = await imp(A1, B("lim-dry2", [itemWith("LIM-I2", okRefs)]), true);
  ok(rOk.items[0].outcome === "new" && rOk.counts.invalid === 0 && rOk.can_apply === true, "simulação: item com exatamente 12000 bytes sai 'new'");
  const rMulti = await imp(A1, B("lim-dry3", [itemWith("LIM-I3", multiRefs)]), true);
  ok(rMulti.items[0].outcome === "invalid", "simulação: item acima do limite em bytes (acentos) sai 'invalid'");
  // lote misto: nada é gravado enquanto houver item inválido por tamanho
  const mixedLim = B("lim-misto", [itemWith("LIM-M1", okRefs), itemWith("LIM-M2", overRefs), itemWith("LIM-M3", [{ title: "Curta" }])]);
  const dm = await imp(A1, mixedLim, true);
  ok(dm.counts.new === 2 && dm.counts.invalid === 1 && dm.can_apply === false && dm.items[1].outcome === "invalid", "lote misto (simulação): 2 novas e 1 inválida por tamanho", j(dm.counts));
  const nBefore = await count();
  const am = await imp(A2, mixedLim, false);
  ok(am.applied === false && am.counts.invalid === 1 && (await count()) === nBefore && (await one("select count(*)::int n from public.study_questions where external_key like 'LIM-M%'")).n === 0, "lote misto (aplicação): applied=false e NENHUMA das 3 questões gravada");
  const fixedBatch = B("lim-misto", [itemWith("LIM-M1", okRefs), itemWith("LIM-M2", okRefs), itemWith("LIM-M3", [{ title: "Curta" }])]);
  const af = await imp(A2, fixedBatch, false);
  ok(af.applied === true && af.counts.new === 3 && (await one("select count(*)::int n from public.study_questions where external_key like 'LIM-M%' and status='draft'")).n === 3, "corrigido o item, a aplicação grava as 3 como rascunho (a gravação não falha na constraint)");
  ok((await one("select count(*)::int n from public.study_question_meta m join public.study_questions q on q.id=m.question_id where q.external_key in ('LIM-M1','LIM-M2') and octet_length(m.technical_references::text) = 12000")).n === 2, "os 2 itens de 12000 bytes foram gravados inteiros");
  const af2 = await imp(A2, fixedBatch, false);
  ok(af2.applied === true && af2.counts.equal === 3 && (await one("select count(*)::int n from public.study_questions where external_key like 'LIM-M%'")).n === 3, "repetir o lote corrigido: 3 iguais, sem duplicata");

  // ════════════ auditoria ════════════
  const aud = await call(A1, "study_admin_list_audit", [null, 200], ["uuid", "integer"]);
  const acts = new Set(aud.map((a) => a.action));
  ok(["create_subject", "update_subject", "create_draft", "update_draft", "delete_draft", "import", "publish", "archive", "new_version", "save_meta"].every((a) => acts.has(a)), "auditoria registra todas as ações (" + [...acts].sort().join(",") + ")");
  ok(aud.every((a) => a.actor_ref === ADM), "toda ação auditada tem actor_ref = conta que agiu");
  const audQ = await call(A1, "study_admin_list_audit", [p2.id, 50], ["uuid", "integer"]);
  ok(audQ.map((a) => a.action).includes("create_draft") && audQ.map((a) => a.action).includes("publish") && audQ.map((a) => a.action).includes("archive"), "auditoria por questão: criação, publicação e arquivamento (por substituição) da v1");
  ok((await call(A1, "study_admin_list_audit", [null, 9999], ["uuid", "integer"])).length <= 200 && (await call(A1, "study_admin_list_audit", [null, 2], ["uuid", "integer"])).length === 2, "limite da auditoria (máx. 200)");
  await fails(owner("update public.study_admin_audit set action = 'publish' where id = (select min(id) from public.study_admin_audit)"), /append-only/, "auditoria: UPDATE bloqueado (mesmo para o dono)");
  await fails(owner("delete from public.study_admin_audit where id = (select min(id) from public.study_admin_audit)"), /append-only/, "auditoria: DELETE bloqueado (mesmo para o dono)");
  await fails(owner("truncate public.study_admin_audit"), /TRUNCATE não é permitido/, "auditoria: TRUNCATE bloqueado");
  await fails(owner("truncate public.study_question_meta"), /TRUNCATE não é permitido/, "metadados: TRUNCATE bloqueado");
  const pubAud = aud.find((a) => a.action === "publish");
  ok(pubAud.external_key && pubAud.version >= 1 && pubAud.question_id, "linha de auditoria traz questão, chave e versão");

  // ════════════ o aluno segue funcionando ════════════
  const att6 = await call(S, "study_start_attempt", ["seguranca-paciente-infeccao", "practice", 4], ["text", "public.study_attempt_mode", "integer"]);
  for (const it of att6.items) await call(S, "study_submit_answer", [it.item_id, await keyOf(it.item_id)], ["uuid", "uuid"]);
  const done = await call(S, "study_complete_attempt", [att6.attempt.id], ["uuid"]);
  ok(att6.items.length === 4 && done.attempt.status === "completed" && done.attempt.points_awarded === 60, "regressão: aluno faz e conclui um treino de 4 questões do lote (4 x 10 + bônus 20 = 60)");

  console.log(`[${label}] ${pass} verificações passaram, ${failures.length} falharam`);
  return failures.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log("rode via run-0007-pglite.mjs / run-0007-pg17.mjs (precisam de um motor de banco)");
}
