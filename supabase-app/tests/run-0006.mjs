// Testes ESPECÍFICOS da migration 0006 (treino completo + escopo da revisão). Não é a suíte inteira:
// aplica 0001..0006 num banco local descartável e exercita só as duas correções.
//
//   PGlite:          npm i -D @electric-sql/pglite   e   node tests/run-0006.mjs
//   PostgreSQL real: via embedded-postgres (ver run-0006-pg.mjs do pacote de testes)
//
// Sem rede, sem credenciais, sem tocar em nenhum projeto Supabase.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const migDir = path.join(root, "supabase", "migrations");
const proposedDir = path.join(root, "supabase-proposed", "migrations");

function migrations() {
  const list = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(".sql")).sort().map((f) => ({ f, dir: d })) : []);
  const applied = list(migDir);
  const names = new Set(applied.map((m) => m.f));
  if (process.env.FSL_WITHOUT_0006 === "1") return applied;   // controle negativo: só o que já está aplicado
  return [...applied, ...list(proposedDir).filter((m) => !names.has(m.f))];
}

/** db = { exec(sql), query(sql, params) -> { rows } } */
export async function run(db, label = "") {
  let pass = 0;
  const failures = [];
  const ok = (c, name) => { if (c) { pass++; if (process.env.VERBOSE) console.log("PASS", name); } else { failures.push(name); console.log("FAIL", name); } };

  await db.exec(fs.readFileSync(path.join(here, "stubs", "supabase_stub.sql"), "utf8"));
  const files = migrations();
  for (const m of files) await db.exec(fs.readFileSync(path.join(m.dir, m.f), "utf8"));
  console.log(`[${label}] migrations aplicadas: ${files.map((m) => m.f.slice(0, 14)).join(", ")}`);
  ok(files.some((m) => /complete_attempts_and_review_scope/.test(m.f)), "a migration 0006 está entre as aplicadas neste teste");

  const ADM = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const U1 = id(1), U2 = id(2), U3 = id(3);

  async function as(role, uid, sql, params) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
    await db.exec(`set role ${role}`);
    try { return await db.query(sql, params); } finally { await db.exec("reset role"); }
  }
  const rpc = async (uid, fn, args = []) => (await as("authenticated", uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args)).rows[0].r;
  const owner = (sql, p) => db.query(sql, p);
  async function fails(p, re, name) {
    try { await p; ok(false, `${name} (deveria falhar)`); } catch (e) { ok(re.test(String(e.message)), `${name} -> ${String(e.message).slice(0, 90)}`); }
  }

  // ── cenário ────────────────────────────────────────────────────────────────
  await owner(`insert into auth.users (id, email) values ('${ADM}','adm@example.test'), ('${U1}','a@example.test'), ('${U2}','b@example.test'), ('${U3}','c@example.test')`);
  const subj = {};
  for (const s of ["s1", "s3", "s4"]) subj[s] = (await owner("insert into public.study_subjects (slug, name) values ($1, $2) returning id", [s, "Assunto " + s])).rows[0].id;
  async function mkQuestion(sl, n) {
    const q = (await owner("insert into public.study_questions (subject_id, stem, created_by) values ($1, $2, $3) returning id", [subj[sl], `Enunciado de teste ${sl}-${n}: escolha a alternativa correta.`, ADM])).rows[0].id;
    let key;
    for (const l of ["A", "B", "C", "D"]) {
      const o = (await owner("insert into public.study_question_options (question_id, label, body) values ($1,$2,$3) returning id", [q, l, `Alternativa ${l} (${sl}-${n})`])).rows[0].id;
      if (l === "A") key = o;
    }
    await owner("insert into public.study_answer_keys values ($1,$2)", [q, key]);
    await owner("insert into public.study_explanations values ($1,$2)", [q, `Explicação de teste ${sl}-${n}.`]);
    await owner("update public.study_questions set status='published', no_real_patient_data_confirmed=true, reviewed_by=$2, reviewed_at=now(), published_at=now() where id=$1", [q, ADM]);
    return { q, stem: `Enunciado de teste ${sl}-${n}: escolha a alternativa correta.` };
  }
  const S1 = [], S3 = [], S4 = [];
  for (let n = 1; n <= 6; n++) S1.push(await mkQuestion("s1", n));
  for (let n = 1; n <= 3; n++) S3.push(await mkQuestion("s3", n));
  for (let n = 1; n <= 2; n++) S4.push(await mkQuestion("s4", n));

  const keyOf = async (itemId) => (await owner("select k.option_id from public.study_attempt_items i join public.study_answer_keys k on k.question_id=i.question_id where i.id=$1", [itemId])).rows[0].option_id;
  const wrongOf = async (it) => { const k = await keyOf(it.item_id); return it.options.find((o) => o.id !== k).id; };
  const answer = async (uid, it, right = true) => rpc(uid, "study_submit_answer", [it.item_id, right ? await keyOf(it.item_id) : await wrongOf(it)]);
  const answerAll = async (uid, a, right = true) => { for (const it of a.items) await answer(uid, it, right); };
  const age = (attemptId, interval) => owner(`update public.study_attempts set last_activity_at = now() - interval '${interval}' where id=$1`, [attemptId]);
  const prog = (uid) => rpc(uid, "study_my_progress");
  const status = async (attemptId) => (await owner("select status from public.study_attempts where id=$1", [attemptId])).rows[0].status;

  // ════════════════ CORREÇÃO 1 — "treino completo" ════════════════════════════
  try {
  await rpc(U1, "study_upsert_my_profile", ["Aluno Um", null, 1]);          // meta semanal = 1 treino
  await rpc(U2, "study_upsert_my_profile", ["Aluno Dois", null, 2]);

  // 1.1 tentativa SEM respostas
  let a = await rpc(U1, "study_start_attempt", ["s1", "practice", 5]);
  await fails(rpc(U1, "study_complete_attempt", [a.attempt.id]), /attempt_incomplete/, "1.1 sem nenhuma resposta: concluir é recusado (attempt_incomplete)");
  ok((await status(a.attempt.id)) === "in_progress", "1.1 a tentativa continua em andamento (não virou completed)");
  let p = await prog(U1);
  ok(p.attempts_completed === 0 && p.week_completed === 0 && p.weekly_goal === 1, "1.1 não conta como treino e não preenche a meta semanal (0 de 1)");

  // 1.2 PARCIALMENTE respondida
  await answer(U1, a.items[0]); await answer(U1, a.items[1]);
  await fails(rpc(U1, "study_complete_attempt", [a.attempt.id]), /attempt_incomplete/, "1.2 2 de 5 respondidas: concluir é recusado");
  p = await prog(U1);
  ok(p.attempts_completed === 0 && p.week_completed === 0, "1.2 parcial também não conta como treino nem na meta");
  ok((await owner("select count(*)::int c from public.study_points_ledger where user_id=$1", [U1])).rows[0].c === 0, "1.2 e não pontua (pontos só entram ao concluir)");

  // 1.3 completa
  for (const it of a.items.slice(2)) await answer(U1, it);
  const done = await rpc(U1, "study_complete_attempt", [a.attempt.id]);
  ok(done.attempt.status === "completed" && done.attempt.points_awarded === 70, "1.3 todas respondidas: conclui e a pontuação segue a regra de sempre (5 x 10 + bônus 20 = 70)");
  p = await prog(U1);
  ok(p.attempts_completed === 1 && p.week_completed === 1 && p.week_completed >= p.weekly_goal, "1.3 agora conta: 1 treino e meta semanal atingida (1 de 1)");

  // 1.4 linha ANTIGA com conclusão parcial (legado): deixa de contar, sem ser apagada
  const legacy = await rpc(U1, "study_start_attempt", ["s1", "practice", 5]);
  await answer(U1, legacy.items[0]); await answer(U1, legacy.items[1]);
  await owner("update public.study_attempts set status='completed', completed_at=now(), correct_count=2, points_awarded=0 where id=$1", [legacy.attempt.id]);
  p = await prog(U1);
  ok(p.attempts_completed === 1 && p.week_completed === 1, "1.4 conclusão parcial já gravada (legado) NÃO entra nas métricas");
  ok((await owner("select count(*)::int c from public.study_attempts where id=$1", [legacy.attempt.id])).rows[0].c === 1, "1.4 ...mas a linha é preservada (histórico intacto)");

  // 1.5 abandonada parcial
  const ab = await rpc(U1, "study_start_attempt", ["s1", "free", 3]);
  await answer(U1, ab.items[0]);
  await rpc(U1, "study_abandon_attempt", [ab.attempt.id]);
  p = await prog(U1);
  ok(p.attempts_completed === 1 && p.week_completed === 1, "1.5 abandonada com respostas parciais não conta");

  // 1.6 expirada parcial
  const ex = await rpc(U1, "study_start_attempt", ["s1", "free", 3]);
  await answer(U1, ex.items[0]);
  await age(ex.attempt.id, "8 days");
  const ex2 = await rpc(U1, "study_start_attempt", ["s1", "free", 2]);
  ok((await status(ex.attempt.id)) === "expired", "1.6 a vencida e parcial virou expired");
  p = await prog(U1);
  ok(p.attempts_completed === 1 && p.week_completed === 1, "1.6 expirada parcial não conta");

  // 1.7 vencida mas TODA respondida: concluída pelo servidor e CONTA
  await answerAll(U1, ex2);
  await age(ex2.attempt.id, "9 days");
  const ex3 = await rpc(U1, "study_start_attempt", ["s1", "free", 2]);
  ok((await status(ex2.attempt.id)) === "completed", "1.7 vencida e toda respondida é concluída automaticamente");
  p = await prog(U1);
  ok(p.attempts_completed === 2 && p.week_completed === 2, "1.7 e essa conta (2 treinos, 2 na semana)");
  await rpc(U1, "study_abandon_attempt", [ex3.attempt.id]);

  // 1.8 outra conta, meta 2: parciais não preenchem a meta
  const b = await rpc(U2, "study_start_attempt", ["s1", "practice", 5]);
  await answer(U2, b.items[0]);
  await fails(rpc(U2, "study_complete_attempt", [b.attempt.id]), /attempt_incomplete/, "1.8 outra conta: parcial também é recusada");
  await rpc(U2, "study_abandon_attempt", [b.attempt.id]);
  p = await prog(U2);
  ok(p.week_completed === 0 && p.weekly_goal === 2, "1.8 meta semanal da outra conta segue 0 de 2");
  // idempotência: concluir de novo uma já concluída continua ok
  const again = await rpc(U1, "study_complete_attempt", [a.attempt.id]);
  ok(again.attempt.status === "completed" && again.attempt.points_awarded === 70, "1.9 concluir de novo uma tentativa já concluída segue idempotente");

  } catch (e) { ok(false, "seção 1 (treino completo) interrompida: " + String(e.message).slice(0, 80)); }

  // ════════════════ CORREÇÃO 2 — revisão: só questão publicada em assunto ativo ═
  try {
  const slugs = (arr) => new Set(arr.map((x) => x.stem));
  const wrongAttempt = async (uid, slug, n) => { const t = await rpc(uid, "study_start_attempt", [slug, "practice", n]); await answerAll(uid, t, false); await rpc(uid, "study_complete_attempt", [t.attempt.id]); return t; };
  await rpc(U3, "study_upsert_my_profile", ["Aluno Três", null, 5]);
  const h3 = await wrongAttempt(U3, "s3", 3);
  const h4 = await wrongAttempt(U3, "s4", 2);
  const reviewRows = async () => (await owner("select count(*)::int c from public.study_review_items where user_id=$1", [U3])).rows[0].c;
  const listStems = async () => (await rpc(U3, "study_list_my_review_items", [50])).map((x) => x.stem);
  const consistent = async (label) => { const pr = (await prog(U3)).pending_review; const l = (await listStems()).length; ok(pr === l, `${label}: pending_review (${pr}) == itens listados (${l})`); return pr; };

  ok((await prog(U3)).pending_review === 5 && (await reviewRows()) === 5, "2.0 começa com 5 erros pendentes");
  await consistent("2.0");

  await owner("update public.study_questions set status='archived' where id=$1", [S3[0].q]);
  ok((await prog(U3)).pending_review === 4, "2.1 arquivar uma questão: pendências caem para 4");
  ok(!(await listStems()).includes(S3[0].stem), "2.1 a questão arquivada sai da lista de revisão");
  await consistent("2.1");

  await owner("update public.study_subjects set active=false where id=$1", [subj.s4]);
  ok((await prog(U3)).pending_review === 2, "2.2 desativar um assunto: pendências caem para 2 (só s3: duas questões)");
  const l2 = await listStems();
  ok(l2.length === 2 && l2.includes(S3[1].stem) && l2.includes(S3[2].stem), "2.2 a lista traz só as 2 questões publicadas do assunto ativo");
  await consistent("2.2");

  const rv = await rpc(U3, "study_start_attempt", [null, "review", 5]);
  const rvStems = rv.items.map((i) => i.stem);
  ok(rv.items.length === 2 && rvStems.includes(S3[1].stem) && rvStems.includes(S3[2].stem), "2.3 nova revisão traz exatamente as 2 elegíveis");
  ok(![S3[0], ...S4].some((x) => rvStems.includes(x.stem)), "2.3 e nenhuma arquivada nem de assunto inativo");

  // tentativa de revisão JÁ ABERTA continua mesmo se uma questão for arquivada depois
  await owner("update public.study_questions set status='archived' where id=$1", [S3[1].q]);
  const reopened = await rpc(U3, "study_get_attempt", [rv.attempt.id]);
  ok(reopened.items.length === 2 && reopened.attempt.resumable === true, "2.4 revisão já aberta continua com as 2 questões (retomável) mesmo após arquivar uma");
  ok((await prog(U3)).pending_review === 1, "2.4 ...enquanto a contagem de novas pendências cai para 1");
  await answerAll(U3, reopened, true);
  const rvDone = await rpc(U3, "study_complete_attempt", [rv.attempt.id]);
  ok(rvDone.attempt.status === "completed", "2.4 a revisão aberta pode ser respondida e concluída");
  ok((await prog(U3)).pending_review === 0, "2.4 depois de resolvidas, 0 pendências elegíveis");
  await consistent("2.4");

  // histórico preservado
  ok((await reviewRows()) === 5, "2.5 HISTÓRICO: as 5 linhas de erro continuam na tabela (nada foi apagado)");
  const st = (await owner("select status, count(*)::int c from public.study_review_items where user_id=$1 group by 1 order by 1", [U3])).rows;
  ok(JSON.stringify(st) === JSON.stringify([{ status: "pending", c: 3 }, { status: "resolved", c: 2 }]), "2.5 as não elegíveis seguem 'pending' no histórico (3) e as resolvidas 'resolved' (2)");
  const oldAtt = await rpc(U3, "study_get_attempt", [h3.attempt.id]);
  ok(oldAtt.items.length === 3 && oldAtt.items.every((i) => i.answer && i.answer.explanation), "2.5 a tentativa antiga com questão arquivada continua legível, com respostas e explicações");
  const oldAtt4 = await rpc(U3, "study_get_attempt", [h4.attempt.id]);
  ok(oldAtt4.items.length === 2 && oldAtt4.items.every((i) => i.answer && i.answer.explanation), "2.5 idem para a tentativa de um assunto hoje inativo");
  const hist = (await as("authenticated", U3, "select count(*)::int c from public.study_attempts")).rows[0].c;
  ok(hist === 3, "2.5 e o aluno ainda enxerga as 3 tentativas no próprio histórico");

  // reativação: o critério é dinâmico
  await owner("update public.study_subjects set active=true where id=$1", [subj.s4]);
  ok((await prog(U3)).pending_review === 2, "2.6 reativar o assunto: as 2 pendências voltam a ser elegíveis (histórico preservado)");
  await consistent("2.6");

  // nada elegível
  await owner("update public.study_questions set status='archived' where id = any($1)", [S4.map((x) => x.q)]);
  ok((await prog(U3)).pending_review === 0, "2.7 arquivando as últimas: 0 pendências");
  await fails(rpc(U3, "study_start_attempt", [null, "review", 5]), /no_questions_available/, "2.7 revisão sem elegíveis: no_questions_available");
  ok((await reviewRows()) === 5, "2.7 e ainda assim as 5 linhas do histórico existem");

  // prática e treino livre não mudaram
  const pr = await rpc(U3, "study_start_attempt", ["s3", "practice", 5]);
  ok(pr.items.length === 1, "2.8 prática segue só com questões publicadas de assunto ativo (s3 tem 1 publicada)");
  await rpc(U3, "study_abandon_attempt", [pr.attempt.id]);

  } catch (e) { ok(false, "seção 2 (revisão) interrompida: " + String(e.message).slice(0, 80)); }

  // ════════════════ permissões e funções ══════════════════════════════════════
  const fns = (await owner(`select p.proname, p.prosecdef, p.proconfig::text cfg,
      has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u,
      has_function_privilege('service_role', p.oid, 'execute') s
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'study%' or p.proname='is_study_admin')`)).rows;
  // Lista EXATA (allow-list) do que o navegador logado pode executar, com todas as migrations atuais (0001-0008):
  //  - 9 RPCs do aluno + is_study_admin (já existiam na 0006);
  //  - 13 RPCs de administração (contrato em supabase-proposed/docs/0007-admin-contract.md), cada uma SECURITY DEFINER com search_path
  //    fixo e protegida por study__admin_guard (confere admin ativo e MFA aal2; verificado em run-0007.mjs);
  //  - NENHUMA função da 0008 (study_ai_acquire / study_ai_release): essas só o service_role executa.
  // Qualquer função nova executável pelo navegador, ou uma prevista que sumiu, reprova este teste.
  const studentRpcs = ["study_upsert_my_profile", "study_list_subjects", "study_start_attempt", "study_get_attempt", "study_submit_answer", "study_complete_attempt", "study_abandon_attempt", "study_my_progress", "study_list_my_attempts", "study_list_my_review_items", "is_study_admin"];
  const adminRpcs = ["study_admin_archive_question", "study_admin_create_new_version", "study_admin_delete_draft", "study_admin_get_question", "study_admin_import_questions", "study_admin_list_audit", "study_admin_list_questions", "study_admin_list_subjects", "study_admin_publish_question", "study_admin_publish_questions", "study_admin_save_draft_question", "study_admin_save_question_meta", "study_admin_save_subject"];
  const rpcs = [...studentRpcs, ...adminRpcs].sort();
  const actual = fns.filter((f) => f.u).map((f) => f.proname).sort();
  ok(actual.join() === rpcs.join(), `3.1 authenticated executa exatamente as ${rpcs.length} RPCs previstas (11 do aluno/is_study_admin + 13 de administração)`);
  if (actual.join() !== rpcs.join()) console.log("   a mais:", actual.filter((x) => !rpcs.includes(x)).join(",") || "-", "| a menos:", rpcs.filter((x) => !actual.includes(x)).join(",") || "-");
  const ai = fns.filter((f) => /^study_ai_/.test(f.proname));
  ok(ai.length === 2 && ai.every((f) => !f.a && !f.u && f.s && f.prosecdef && /search_path/.test(f.cfg || "")), "3.1b as funções da 0008 (study_ai_*) só o service_role executa (nem anon nem authenticated), SECURITY DEFINER com search_path fixo");
  ok(fns.every((f) => !f.a), "3.2 anon continua sem EXECUTE em qualquer função study_*");
  ok(fns.find((f) => f.proname === "study__answered_count") && !fns.find((f) => f.proname === "study__answered_count").u, "3.3 a função interna nova não é executável pelo navegador");
  ok(fns.filter((f) => f.prosecdef).every((f) => /search_path/.test(f.cfg || "")), "3.4 toda SECURITY DEFINER segue com search_path fixo");
  await fails(as("authenticated", U1, "select public.study__answered_count(gen_random_uuid())"), /permission denied/, "3.5 aluno não chama a função interna");
  ok((await owner("select relrowsecurity r from pg_class where relname='study_review_items'")).rows[0].r === true, "3.6 RLS segue ligado nas tabelas (não houve mudança de tabela)");

  console.log(`[${label}] ${pass} verificações passaram, ${failures.length} falharam`);
  return failures.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  process.exitCode = (await run(db, "PGlite")) ? 1 : 0;
  await db.close();
}
