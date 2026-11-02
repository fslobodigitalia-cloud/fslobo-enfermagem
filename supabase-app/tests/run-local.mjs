// Testes de segurança e de regra das migrations, num Postgres LOCAL descartável
// (PGlite = Postgres em WebAssembly, em memória). Não toca em nenhum projeto
// Supabase, não usa rede e não lê credenciais.
//
//   npm i -D @electric-sql/pglite      (só quando for rodar; não é dependência do site)
//   node supabase-app/tests/run-local.mjs
//
// Sai com código 1 se qualquer verificação falhar.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
// layout do repositório: <raiz>/migrations; layout da CLI: <raiz>/supabase/migrations
const migDir = [path.join(root, "supabase", "migrations"), path.join(root, "migrations")].find((d) => fs.existsSync(d));

export async function run(PGlite) {
  const db = new PGlite();
  let pass = 0;
  const failures = [];
  const ok = (cond, name) => { if (cond) pass++; else { failures.push(name); console.log("FAIL", name); } };

  // ── carga: stub do Supabase + migrations na ordem ───────────────────────────
  await db.exec(fs.readFileSync(path.join(here, "stubs", "supabase_stub.sql"), "utf8"));
  const migs = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of migs) await db.exec(fs.readFileSync(path.join(migDir, f), "utf8"));
  console.log("migrations aplicadas (somente no banco local em memória):", migs.join(", "));

  // ── helpers ─────────────────────────────────────────────────────────────────
  const U1 = "11111111-1111-1111-1111-111111111111";
  const U2 = "22222222-2222-2222-2222-222222222222";
  const ADM = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  async function as(role, uid, sql, params) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
    await db.exec(`set role ${role}`);
    try { return await db.query(sql, params); } finally { await db.exec("reset role"); }
  }
  const user = (uid, sql, p) => as("authenticated", uid, sql, p);
  const anon = (sql, p) => as("anon", null, sql, p);
  const svc = (sql, p) => as("service_role", null, sql, p);
  async function fails(promise, re, name) {
    try { await promise; ok(false, `${name} (deveria falhar)`); }
    catch (e) { ok(re.test(String(e.message)), `${name} -> erro esperado ${re} / recebido: ${e.message}`); }
  }
  async function failsDetail(promise, re, detail, name) {
    try { await promise; ok(false, name + " (deveria falhar)"); }
    catch (e) { ok(re.test(String(e.message)) && e.detail === detail, name + " -> " + e.message + " / detail=" + e.detail); }
  }
  const rpc = async (uid, fn, args = []) => {
    const ph = args.map((_, i) => `$${i + 1}`).join(", ");
    const r = await user(uid, `select public.${fn}(${ph}) as r`, args);
    return r.rows[0].r;
  };

  // ── dados de teste (como dono do banco, equivalente a SQL direto/service_role) ─
  await db.exec(`
    insert into auth.users (id, email) values
      ('${U1}', 'aluno1@example.test'), ('${U2}', 'aluno2@example.test'), ('${ADM}', 'admin@example.test');
    insert into public.study_admins (user_id) values ('${ADM}');
    insert into public.study_subjects (slug, name, position) values ('clinica-medica', 'Clínica Médica', 1);
  `);
  const subj = (await db.query("select id from public.study_subjects")).rows[0].id;

  async function makeQuestion(n, { withKey = true, withExplanation = true } = {}) {
    const q = (await db.query(
      "insert into public.study_questions (subject_id, stem, created_by) values ($1, $2, $3) returning id",
      [subj, `Enunciado fictício número ${n} para teste automatizado.`, ADM])).rows[0].id;
    const opts = [];
    for (const l of ["A", "B", "C", "D"]) {
      opts.push((await db.query("insert into public.study_question_options (question_id, label, body) values ($1,$2,$3) returning id",
        [q, l, `Alternativa ${l} da questão ${n}`])).rows[0].id);
    }
    if (withKey) await db.query("insert into public.study_answer_keys (question_id, option_id) values ($1,$2)", [q, opts[0]]); // A é a correta
    if (withExplanation) await db.query("insert into public.study_explanations (question_id, body) values ($1,$2)", [q, `Explicação fictícia da questão ${n}.`]);
    return { q, opts };
  }

  const published = [];
  for (let n = 1; n <= 6; n++) published.push(await makeQuestion(n));
  const qNoKey = await makeQuestion(90, { withKey: false });
  const qDraft = await makeQuestion(91);                       // inédita, nunca publicada
  const qReview = await makeQuestion(92);
  await db.query("update public.study_questions set status='in_review' where id=$1", [qReview.q]);

  // ── 1. Publicação (administração) ───────────────────────────────────────────
  await fails(rpc(U1, "study_admin_publish_question", [published[0].q, true]), /forbidden/, "não-admin não publica");
  await fails(rpc(ADM, "study_admin_publish_question", [published[0].q, false]), /patient_data_confirmation_required/, "publicar exige confirmar ausência de paciente real");
  await fails(rpc(ADM, "study_admin_publish_question", [qNoKey.q, true]), /answer_key_missing/, "publicar exige gabarito");
  for (const p of published) await rpc(ADM, "study_admin_publish_question", [p.q, true]);
  ok((await db.query("select count(*)::int c from public.study_questions where status='published'")).rows[0].c === 6, "6 questões publicadas");

  await fails(db.query("update public.study_questions set stem='alterado depois de publicado' where id=$1", [published[0].q]), /imut/, "enunciado publicado é imutável");
  await fails(db.query("delete from public.study_questions where id=$1", [published[0].q]), /não pode ser apagada/, "questão publicada não é apagada");
  await fails(db.query("update public.study_question_options set body='x' where id=$1", [published[0].opts[1]]), /imut/, "alternativa publicada é imutável");
  await fails(db.query("update public.study_answer_keys set option_id=$2 where question_id=$1", [published[0].q, published[0].opts[1]]), /imut/, "gabarito publicado é imutável");
  await fails(db.query("update public.study_explanations set body='texto novo bem longo' where question_id=$1", [published[0].q]), /imut/, "explicação publicada é imutável");
  await db.query("update public.study_questions set status='archived' where id=$1", [published[5].q]);
  ok(true, "questão publicada pode ser arquivada");
  await db.query("update public.study_questions set status='published' where id=$1", [published[5].q]).then(
    () => ok(false, "arquivada não volta a publicada"), () => ok(true, "arquivada não volta a publicada"));

  // ── 2. Permissões de tabela: anon e authenticated ───────────────────────────
  const tables = ["study_settings", "study_admins", "study_profiles", "study_subjects", "study_questions", "study_question_options",
    "study_answer_keys", "study_explanations", "study_attempts", "study_attempt_items", "study_attempt_answers",
    "study_points_ledger", "study_review_items"];
  for (const t of tables) {
    await fails(anon(`select * from public.${t}`), /permission denied/, `anon não lê ${t}`);
    await fails(anon(`delete from public.${t}`), /permission denied/, `anon não apaga ${t}`);
  }
  for (const t of ["study_settings", "study_admins", "study_subjects", "study_questions", "study_question_options", "study_answer_keys", "study_explanations"]) {
    await fails(user(U1, `select * from public.${t}`), /permission denied/, `aluno não lê ${t} diretamente`);
  }
  for (const t of tables) {
    await fails(user(U1, `insert into public.${t} select * from public.${t} where false`), /permission denied/, `aluno não insere em ${t}`);
    await fails(user(U1, `delete from public.${t}`), /permission denied/, `aluno não apaga de ${t}`);
  }
  await fails(user(U1, "update public.study_profiles set display_name = 'x'"), /permission denied/, "aluno não edita perfil direto");
  await fails(user(U1, "insert into public.study_admins (user_id) values ($1)", [U1]), /permission denied/, "aluno não se torna admin");
  await fails(user(U1, "update public.study_attempts set points_awarded = 9999"), /permission denied/, "aluno não altera pontos da tentativa");
  await fails(user(U1, "insert into public.study_points_ledger (user_id, attempt_id, reason, points) values ($1, gen_random_uuid(), 'attempt_correct', 9999)", [U1]), /permission denied/, "aluno não escreve no livro-razão");
  ok((await svc("select count(*)::int c from public.study_questions")).rows[0].c === 9, "service_role lê o banco de questões");

  // ── 3. Funções: anon sem acesso; internas sem acesso; hardening ─────────────
  for (const fn of ["study_my_progress()", "study_list_subjects()", "study_start_attempt()", "study_list_my_review_items()"]) {
    await fails(anon(`select public.${fn}`), /permission denied/, `anon não executa ${fn}`);
  }
  await fails(user(U1, "select public.study__attempt_payload(gen_random_uuid())"), /permission denied/, "aluno não executa função interna de payload");
  const hard = (await db.query(`
    select p.proname, p.prosecdef, p.proconfig::text cfg,
           has_function_privilege('anon', p.oid, 'execute') anon_x,
           has_function_privilege('public', p.oid, 'execute') public_x
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and (p.proname like 'study\\_%' or p.proname = 'is_study_admin')`)).rows;
  ok(hard.length >= 14, `funções do app encontradas (${hard.length})`);
  for (const f of hard) {
    ok(!f.anon_x && !f.public_x, `${f.proname}: sem EXECUTE para anon/public`);
    ok(!f.prosecdef || /search_path/.test(f.cfg || ""), `${f.proname}: SECURITY DEFINER com search_path fixo`);
  }
  const rls = (await db.query(`select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
                                where n.nspname='public' and c.relkind='r' and relname like 'study\\_%'`)).rows;
  ok(rls.length === tables.length && rls.every((r) => r.relrowsecurity), "RLS ligado em todas as tabelas study_*");

  // ── 4. Perfil e início de tentativa ─────────────────────────────────────────
  await fails(rpc(U1, "study_start_attempt", [null, "practice", 5]), /profile_required/, "tentativa exige perfil");
  await fails(rpc(null, "study_my_progress"), /not_authenticated/, "sem identidade não há progresso");
  await rpc(U1, "study_upsert_my_profile", ["  Aluna Um ", "Concurso X", 5]);
  await rpc(U2, "study_upsert_my_profile", ["Aluno Dois", null, 5]);
  await fails(rpc(U1, "study_upsert_my_profile", ["", null, 5]), /check|violat/i, "nome vazio é recusado");
  await fails(rpc(U1, "study_upsert_my_profile", ["Ok", null, 99]), /check|violat/i, "meta semanal fora do limite é recusada");
  ok((await user(U1, "select display_name from public.study_profiles")).rows.map((r) => r.display_name).join() === "Aluna Um", "aluno vê só o próprio perfil e o nome é aparado");
  await fails(rpc(U1, "study_start_attempt", [null, "practice", 0]), /invalid_question_count/, "quantidade inválida");
  await fails(rpc(U1, "study_start_attempt", ["nao-existe", "practice", 5]), /subject_not_found/, "assunto inexistente");

  const subjects = await user(U1, "select * from public.study_list_subjects()");
  ok(subjects.rows.length === 1 && subjects.rows[0].question_count === 5, "lista de assuntos só conta questões publicadas (a arquivada fica fora)");

  const a1 = await rpc(U1, "study_start_attempt", ["clinica-medica", "practice", 5]);
  const raw = JSON.stringify(a1);
  ok(a1.items.length === 5, "tentativa com 5 itens");
  ok(!/correct_option_id|explanation|is_correct|Explicação fictícia/.test(raw), "payload inicial NÃO contém gabarito nem explicação");
  ok(a1.items.every((i) => i.answer === null && i.options.length === 4), "itens iniciais sem resposta, com 4 alternativas");
  ok(!/Enunciado fictício número (90|91|92)/.test(raw), "questões não publicadas não entram");
  const again = await rpc(U1, "study_start_attempt", ["clinica-medica", "practice", 5]);
  ok(again.attempt.id === a1.attempt.id, "start repetido retoma a mesma tentativa (uma aberta por modo)");
  // as questões inéditas nunca aparecem, mesmo em muitas tentativas de outro usuário
  const seenStems = new Set();
  for (let i = 0; i < 6; i++) {
    const t = await rpc(U2, "study_start_attempt", ["clinica-medica", "practice", 6]);
    t.items.forEach((x) => seenStems.add(x.stem));
    await rpc(U2, "study_abandon_attempt", [t.attempt.id]);
  }
  ok([...seenStems].every((s) => !/número (90|91|92)\b/.test(s)) && seenStems.size === 5, "tentativas de outro usuário só enxergam as 5 questões publicadas e vigentes");

  // ── 5. Respostas ────────────────────────────────────────────────────────────
  const items = a1.items;
  const label = (item, l) => item.options.find((o) => o.label === l).id;
  await fails(rpc(U2, "study_submit_answer", [items[0].item_id, label(items[0], "A")]), /not_found/, "outro aluno não responde item alheio");
  await fails(rpc(U2, "study_get_attempt", [a1.attempt.id]), /not_found/, "outro aluno não lê tentativa alheia");
  await fails(rpc(U1, "study_submit_answer", [items[0].item_id, items[1].options[0].id]), /invalid_option/, "alternativa de outra questão é recusada");

  // descobre qual alternativa é a correta SEM ter acesso ao gabarito: via service_role (teste), nunca via aluno
  const keyOf = async (itemId) => (await svc(`select k.option_id from public.study_attempt_items i join public.study_answer_keys k on k.question_id=i.question_id where i.id=$1`, [itemId])).rows[0].option_id;
  const wrongOf = async (item) => { const k = await keyOf(item.item_id); return item.options.find((o) => o.id !== k).id; };

  const r0 = await rpc(U1, "study_submit_answer", [items[0].item_id, await keyOf(items[0].item_id)]);
  ok(r0.is_correct === true && r0.correct_option_id && /Explicação/.test(r0.explanation), "resposta correta revela gabarito e explicação só depois de responder");
  await fails(rpc(U1, "study_submit_answer", [items[0].item_id, await keyOf(items[0].item_id)]), /already_answered/, "item não pode ser respondido duas vezes");
  const ledgerBefore = (await svc("select count(*)::int c from public.study_points_ledger where user_id=$1", [U1])).rows[0].c;
  await fails(rpc(U1, "study_submit_answer", [items[0].item_id, await keyOf(items[0].item_id)]), /already_answered/, "repetir a mesma resposta correta é recusado");
  ok((await svc("select count(*)::int c from public.study_points_ledger where user_id=$1", [U1])).rows[0].c === ledgerBefore && (await svc("select count(*)::int c from public.study_attempt_answers where item_id=$1", [items[0].item_id])).rows[0].c === 1, "resposta repetida não grava nada nem gera pontos");
  const r1 = await rpc(U1, "study_submit_answer", [items[1].item_id, await wrongOf(items[1])]);
  ok(r1.is_correct === false, "resposta errada é marcada errada pelo servidor");
  const mid = await rpc(U1, "study_get_attempt", [a1.attempt.id]);
  ok(mid.items[0].answer?.is_correct === true && mid.items[1].answer?.is_correct === false && mid.items.slice(2).every((i) => i.answer === null), "gabarito só aparece nos itens já respondidos");
  ok(!JSON.stringify(mid.items.slice(2)).match(/correct_option_id|explanation/), "itens ainda não respondidos continuam sem gabarito");

  // conclui com 2 de 5 respondidas: sem bônus
  const done = await rpc(U1, "study_complete_attempt", [a1.attempt.id]);
  ok(done.attempt.status === "completed" && done.attempt.correct_count === 1 && done.attempt.points_awarded === 10, "pontos = 10 por acerto, sem bônus se faltou responder");
  const done2 = await rpc(U1, "study_complete_attempt", [a1.attempt.id]);
  ok(done2.attempt.points_awarded === 10, "concluir de novo é idempotente");
  ok((await svc("select count(*)::int c from public.study_points_ledger where user_id=$1", [U1])).rows[0].c === 1, "livro-razão sem duplicidade");
  await fails(rpc(U1, "study_submit_answer", [items[2].item_id, label(items[2], "A")]), /attempt_not_open/, "tentativa concluída não aceita resposta");

  // tentativa completa: 20 de bônus
  const a2 = await rpc(U1, "study_start_attempt", ["clinica-medica", "practice", 3]);
  for (const it of a2.items) await rpc(U1, "study_submit_answer", [it.item_id, await keyOf(it.item_id)]);
  const d2 = await rpc(U1, "study_complete_attempt", [a2.attempt.id]);
  ok(d2.attempt.points_awarded === 50 && d2.attempt.correct_count === 3, "3 acertos + bônus de conclusão = 50");
  const prog = await rpc(U1, "study_my_progress");
  ok(prog.points === 60 && prog.attempts_completed === 2 && prog.answered === 5 && prog.correct === 4, "progresso calculado no servidor");
  ok(prog.pending_review === 1 && prog.weekly_goal === 5 && prog.study_days >= 1, "revisão pendente e metas no progresso");

  // ── 6. Revisão de erros ─────────────────────────────────────────────────────
  const rev = await rpc(U1, "study_list_my_review_items", [20]);
  ok(rev.length === 1 && rev[0].options.some((o) => o.is_correct) && /Explicação/.test(rev[0].explanation), "revisão lista o erro com gabarito (já revelado ao aluno)");
  ok((await rpc(U2, "study_list_my_review_items", [20])).length === 0, "revisão é por usuário");
  const rt = await rpc(U1, "study_start_attempt", [null, "review", 5]);
  ok(rt.items.length === 1 && rt.attempt.mode === "review", "modo revisão traz só as questões erradas");
  await rpc(U1, "study_submit_answer", [rt.items[0].item_id, await keyOf(rt.items[0].item_id)]);
  await rpc(U1, "study_complete_attempt", [rt.attempt.id]);
  ok((await rpc(U1, "study_my_progress")).pending_review === 0, "acertar na revisão resolve o erro");
  await fails(rpc(U1, "study_start_attempt", [null, "review", 5]), /no_questions_available/, "sem erros pendentes não há revisão");
  {
    const p = await rpc(U1, "study_my_progress");
    ok(p.points === 70 && p.scored_questions === 5, "acertar na revisão pontua uma única vez (a questão ainda não tinha sido acertada): 70 pontos, 5 questões pontuadas");
  }

  // ── 6b. Anti-acúmulo: repetir as mesmas questões NÃO pontua ─────────────────
  for (let round = 1; round <= 2; round++) {
    const farm = await rpc(U1, "study_start_attempt", ["clinica-medica", "practice", 5]);
    ok(farm.items.length === 5, "repetição " + round + ": 5 itens (todas já acertadas)");
    for (const it of farm.items) await rpc(U1, "study_submit_answer", [it.item_id, await keyOf(it.item_id)]);
    const fd = await rpc(U1, "study_complete_attempt", [farm.attempt.id]);
    ok(fd.attempt.correct_count === 5 && fd.attempt.points_awarded === 0 && fd.attempt.scored_questions === 0, "repetição " + round + ": 5 acertos, 0 pontos, sem bônus");
  }
  {
    const p = await rpc(U1, "study_my_progress");
    ok(p.points === 70 && p.scored_questions === 5, "pontos totais não mudam ao repetir questões (teto finito)");
    ok((await svc("select count(*)::int c from public.study_points_ledger where user_id=$1", [U1])).rows[0].c === 6, "livro-razão: 5 questões + 1 bônus, nada a mais");
  }

  // ── 7. Isolamento entre usuários (RLS) ──────────────────────────────────────
  for (const t of ["study_attempts", "study_attempt_items", "study_attempt_answers", "study_points_ledger", "study_review_items"]) {
    const own = (await user(U2, `select count(*)::int c from public.${t}`)).rows[0].c;
    const mine1 = (await svc(`select count(*)::int c from public.${t}`)).rows[0].c;
    ok(mine1 > own, `${t}: aluno 2 não vê as linhas do aluno 1 (vê ${own} de ${mine1})`);
  }
  ok((await user(U2, "select count(*)::int c from public.study_attempt_answers where user_id=$1", [U1])).rows[0].c === 0, "aluno 2 não lê respostas do aluno 1");
  ok((await rpc(U2, "study_my_progress")).points === 0, "pontos do aluno 2 independem do aluno 1");

  // ── 7b. Acesso a tentativa de outro usuário (todas as portas) ───────────────
  {
    const mine = await rpc(U1, "study_start_attempt", [null, "free", 2]);
    await fails(rpc(U2, "study_complete_attempt", [mine.attempt.id]), /not_found/, "outro aluno não conclui tentativa alheia");
    await fails(rpc(U2, "study_abandon_attempt", [mine.attempt.id]), /not_found/, "outro aluno não abandona tentativa alheia");
    await fails(rpc(U2, "study_get_attempt", [mine.attempt.id]), /not_found/, "outro aluno não lê tentativa alheia (de novo, modo livre)");
    await fails(rpc(U2, "study_submit_answer", [mine.items[0].item_id, mine.items[0].options[0].id]), /not_found/, "outro aluno não responde item alheio (modo livre)");
    ok((await svc("select status from public.study_attempts where id=$1", [mine.attempt.id])).rows[0].status === "in_progress", "tentativa alheia continua intacta");
    await rpc(U1, "study_abandon_attempt", [mine.attempt.id]);
  }

  // ── 7c. Treino livre não pontua; treino pontuado pontua uma vez ─────────────
  {
    const fr = await rpc(U2, "study_start_attempt", [null, "free", 3]);
    const pr = await rpc(U2, "study_start_attempt", [null, "practice", 5]);
    ok(fr.attempt.id !== pr.attempt.id && fr.attempt.awards_points === false && pr.attempt.awards_points === true, "treino livre e pontuado coexistem e são rotulados (awards_points)");
    for (const it of fr.items) await rpc(U2, "study_submit_answer", [it.item_id, await keyOf(it.item_id)]);
    const fd = await rpc(U2, "study_complete_attempt", [fr.attempt.id]);
    ok(fd.attempt.correct_count === 3 && fd.attempt.points_awarded === 0 && fd.attempt.scored_questions === 0, "treino livre: 3 acertos, 0 pontos, sem bônus");
    ok((await rpc(U2, "study_my_progress")).points === 0, "treino livre deixa os pontos em 0 (mesmo com questões inéditas)");
    for (const it of pr.items) await rpc(U2, "study_submit_answer", [it.item_id, await keyOf(it.item_id)]);
    const pd = await rpc(U2, "study_complete_attempt", [pr.attempt.id]);
    ok(pd.attempt.points_awarded === 70 && pd.attempt.scored_questions === 5, "treino pontuado depois do livre: 5 questões x10 + bônus 20 (o livre não 'queimou' as questões)");
  }

  // ── 7d. Auditoria de permissões, políticas e funções ────────────────────────
  {
    const privs = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
    const own = ["study_profiles", "study_attempts", "study_attempt_items", "study_attempt_answers", "study_points_ledger", "study_review_items"];
    let bad = [];
    for (const t of tables) {
      for (const p of privs) {
        const r = (await db.query("select has_table_privilege('anon', 'public." + t + "', $1) a, has_table_privilege('authenticated', 'public." + t + "', $1) u, has_table_privilege('service_role', 'public." + t + "', $1) s", [p])).rows[0];
        if (r.a) bad.push("anon " + p + " " + t);
        if (r.u !== (p === "SELECT" && own.includes(t))) bad.push("authenticated " + p + " " + t);
        if (r.s !== ["SELECT", "INSERT", "UPDATE", "DELETE"].includes(p)) bad.push("service_role " + p + " " + t);
      }
    }
    ok(bad.length === 0, "grants exatos: anon nada; authenticated só SELECT nas 6 tabelas do próprio histórico; service_role sem TRUNCATE/TRIGGER/REFERENCES" + (bad.length ? " -> " + bad.slice(0, 5).join("; ") : ""));
    const pol = (await db.query("select tablename, cmd, roles::text r, qual from pg_policies where schemaname='public' and tablename like 'study\\_%'")).rows;
    ok(pol.length === 6 && pol.every((p) => p.cmd === "SELECT" && p.r === "{authenticated}" && /auth\.uid\(\)/.test(p.qual)), "6 políticas, todas SELECT para authenticated e amarradas a auth.uid() (" + pol.length + ")");
    const defs = (await db.query("select p.proname, p.proconfig::text cfg, has_function_privilege('authenticated', p.oid, 'execute') auth_x, has_function_privilege('service_role', p.oid, 'execute') svc_x from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'study%' or p.proname = 'is_study_admin')")).rows;
    const internal = ["study__attempt_payload", "study__complete_attempt_row", "study__expire_attempt_row", "study__setting", "study_touch_updated_at",
      "study_guard_published_question", "study_guard_published_children", "study_block_truncate", "study_guard_append_only", "study_expire_stale_attempts"];
    for (const n of internal) { const f = defs.find((d) => d.proname === n); ok(f && !f.auth_x, n + ": não executável por authenticated"); }
    ok(defs.find((d) => d.proname === "study_expire_stale_attempts").svc_x === true, "varredura executável só pelo service_role");
    ok(defs.every((d) => !/pg_temp/.test(d.cfg || "") || /^\{"?search_path=pg_catalog, public, pg_temp/.test(d.cfg)), "search_path começa por pg_catalog e pg_temp fica por último");
  }

  // ── 7e. Reforço do conteúdo publicado ───────────────────────────────────────
  {
    await fails(svc("update public.study_questions set stem = 'service_role tentando alterar o enunciado' where id = $1", [published[1].q]), /imut/, "service_role não altera enunciado publicado");
    await fails(svc("update public.study_questions set reviewed_by = null where id = $1", [published[1].q]), /imut/, "auditoria (reviewed_by) de questão publicada é imutável");
    await fails(svc("update public.study_questions set published_at = now() - interval '1 year' where id = $1", [published[1].q]), /imut/, "published_at é imutável");
    await fails(svc("update public.study_questions set no_real_patient_data_confirmed = false where id = $1", [published[1].q]), /imut|check|violat/i, "atestado de paciente real não é desfeito");
    await fails(db.query("update public.study_questions set id = gen_random_uuid() where id = $1", [published[1].q]), /imut|foreign|violat/i, "id de questão publicada é imutável");
    await db.query("update public.study_questions set source_note = 'anotação interna' where id = $1", [published[1].q]);
    ok(true, "anotação interna (source_note) continua editável");
    await fails(db.query("insert into public.study_questions (subject_id, stem, status) values ($1, 'Questão inserida já como publicada.', 'published')", [subj]), /nascer como rascunho/, "INSERT já publicado é recusado");
    await fails(db.query("update public.study_questions set status='published', no_real_patient_data_confirmed=true, reviewed_by=$2, reviewed_at=now(), published_at=now() where id=$1", [qNoKey.q, ADM]), /publicar exige/, "UPDATE direto para published sem gabarito é recusado pelo trigger");
    const mv = await makeQuestion(95);
    await fails(db.query("update public.study_question_options set question_id=$1 where id=$2", [mv.q, published[1].opts[2]]), /movidos|imut/, "alternativa de questão publicada não é movida para outra questão");
    await fails(db.query("update public.study_question_options set question_id=$1 where id=$2", [published[1].q, mv.opts[2]]), /movidos|imut/, "alternativa de rascunho não é movida para questão publicada");
    await fails(db.query("insert into public.study_question_options (question_id, label, body) values ($1, 'E', 'extra')", [published[1].q]), /imut/, "não se acrescenta alternativa a questão publicada");
    await fails(db.query("truncate public.study_questions cascade"), /TRUNCATE não é permitido/, "TRUNCATE de questões bloqueado (mesmo para o dono)");
    await fails(db.query("truncate public.study_answer_keys"), /TRUNCATE não é permitido/, "TRUNCATE de gabaritos bloqueado");
    await fails(svc("truncate public.study_questions"), /permission denied/, "service_role não tem TRUNCATE");
    ok((await svc("select count(*)::int c from public.study_questions where status='published'")).rows[0].c >= 4, "conteúdo publicado intacto depois das tentativas de alteração");
  }

  // ── 7f. Histórico append-only e exclusão de conta em cascata ────────────────
  {
    const U3 = "33333333-3333-3333-3333-333333333333";
    await db.query("insert into auth.users (id, email) values ($1, 'aluno3@example.test')", [U3]);
    await rpc(U3, "study_upsert_my_profile", ["Aluno Três", null, 5]);
    const t = await rpc(U3, "study_start_attempt", [null, "practice", 3]);
    for (const it of t.items) await rpc(U3, "study_submit_answer", [it.item_id, await keyOf(it.item_id)]);
    await rpc(U3, "study_complete_attempt", [t.attempt.id]);
    await fails(db.query("update public.study_attempt_answers set is_correct = false where user_id = $1", [U3]), /append-only/, "resposta gravada não é editada (nem pelo dono do banco)");
    await fails(db.query("delete from public.study_attempt_answers where user_id = $1", [U3]), /append-only/, "resposta gravada não é apagada diretamente");
    await fails(db.query("update public.study_points_ledger set points = 9999 where user_id = $1", [U3]), /append-only/, "livro-razão não é editado");
    await fails(db.query("delete from public.study_points_ledger where user_id = $1", [U3]), /append-only/, "livro-razão não é apagado diretamente");
    await fails(db.query("truncate public.study_points_ledger"), /TRUNCATE não é permitido/, "TRUNCATE do livro-razão bloqueado");
    await fails(db.query("truncate public.study_attempt_answers"), /TRUNCATE não é permitido/, "TRUNCATE das respostas bloqueado");
    await db.query("delete from auth.users where id = $1", [U3]);
    const left = (await db.query("select (select count(*)::int from public.study_profiles where user_id=$1) p, (select count(*)::int from public.study_attempts where user_id=$1) a, (select count(*)::int from public.study_attempt_answers where user_id=$1) r, (select count(*)::int from public.study_points_ledger where user_id=$1) l, (select count(*)::int from public.study_review_items where user_id=$1) v", [U3])).rows[0];
    ok(Object.values(left).every((v) => v === 0), "apagar a conta apaga em cascata perfil, tentativas, respostas, pontos e revisão (LGPD) apesar do append-only");
  }

  // ── 7g. Expiração e retomada de tentativas ──────────────────────────────────
  {
    const age = (attemptId, interval) => svc("update public.study_attempts set last_activity_at = now() - $2::interval where id = $1", [attemptId, interval]);
    const mk = async (n) => { const id = "44444444-4444-4444-4444-" + String(n).padStart(12, "0"); await db.query("insert into auth.users (id) values ($1)", [id]); await rpc(id, "study_upsert_my_profile", ["Aluno " + n, null, 5]); return id; };

    // retomada dentro do prazo
    const uA = await mk(1);
    const tA = await rpc(uA, "study_start_attempt", [null, "practice", 5]);
    await rpc(uA, "study_submit_answer", [tA.items[0].item_id, await wrongOf(tA.items[0])]);   // erro -> vai para revisão
    await rpc(uA, "study_submit_answer", [tA.items[1].item_id, await keyOf(tA.items[1].item_id)]);
    await age(tA.attempt.id, "6 days");
    const resumed = await rpc(uA, "study_start_attempt", [null, "practice", 5]);
    ok(resumed.attempt.id === tA.attempt.id && resumed.attempt.resumable === true, "parada há 6 dias (prazo de 7) continua retomável");
    await rpc(uA, "study_submit_answer", [tA.items[2].item_id, await keyOf(tA.items[2].item_id)]);
    ok(true, "e aceita novas respostas");

    // além do prazo, incompleta
    await age(tA.attempt.id, "8 days");
    const view = await rpc(uA, "study_get_attempt", [tA.attempt.id]);
    ok(view.attempt.status === "in_progress" && view.attempt.resumable === false, "parada há 8 dias: não é mais retomável (mas continua legível)");
    await fails(rpc(uA, "study_submit_answer", [tA.items[3].item_id, await keyOf(tA.items[3].item_id)]), /attempt_expired/, "tentativa vencida não aceita resposta");
    await fails(rpc(uA, "study_complete_attempt", [tA.attempt.id]), /attempt_expired/, "tentativa vencida e incompleta não conclui");
    const fresh = await rpc(uA, "study_start_attempt", [null, "practice", 5]);
    ok(fresh.attempt.id !== tA.attempt.id && fresh.attempt.status === "in_progress", "novo start cria outra tentativa");
    const old = (await svc("select status, points_awarded from public.study_attempts where id=$1", [tA.attempt.id])).rows[0];
    ok(old.status === "expired" && old.points_awarded === null, "a vencida vira 'expired', sem pontos");
    ok((await svc("select count(*)::int c from public.study_attempt_answers a join public.study_attempt_items i on i.id=a.item_id where i.attempt_id=$1", [tA.attempt.id])).rows[0].c === 3, "as 3 respostas dadas ficam no histórico");
    ok((await rpc(uA, "study_my_progress")).pending_review === 1 && (await svc("select count(*)::int c from public.study_points_ledger where attempt_id=$1", [tA.attempt.id])).rows[0].c === 0, "o erro segue para a revisão e a tentativa expirada não gerou pontos");
    ok(fresh.items.some((i) => tA.items.slice(3).some((x) => x.stem === i.stem)), "questões que ficaram sem resposta voltam a ser sorteadas");

    // além do prazo, mas TUDO respondido: nada se perde
    const uB = await mk(2);
    const tB = await rpc(uB, "study_start_attempt", [null, "practice", 3]);
    for (const it of tB.items) await rpc(uB, "study_submit_answer", [it.item_id, await keyOf(it.item_id)]);
    await age(tB.attempt.id, "9 days");
    const cB = await rpc(uB, "study_complete_attempt", [tB.attempt.id]);
    ok(cB.attempt.status === "completed" && cB.attempt.points_awarded === 50, "vencida porém toda respondida: ainda conclui e pontua (50)");

    const uC = await mk(3);
    const tC = await rpc(uC, "study_start_attempt", [null, "practice", 3]);
    for (const it of tC.items) await rpc(uC, "study_submit_answer", [it.item_id, await keyOf(it.item_id)]);
    await age(tC.attempt.id, "9 days");
    const nextC = await rpc(uC, "study_start_attempt", [null, "practice", 3]);
    const doneC = (await svc("select status, points_awarded from public.study_attempts where id=$1", [tC.attempt.id])).rows[0];
    ok(doneC.status === "completed" && doneC.points_awarded === 50 && nextC.attempt.id !== tC.attempt.id, "start sobre tentativa vencida e toda respondida a conclui com os pontos e abre outra");

    // varredura
    const uD = await mk(4);
    const pD = await rpc(uD, "study_start_attempt", [null, "practice", 4]);
    await rpc(uD, "study_submit_answer", [pD.items[0].item_id, await keyOf(pD.items[0].item_id)]);
    const fD = await rpc(uD, "study_start_attempt", [null, "free", 2]);
    for (const it of fD.items) await rpc(uD, "study_submit_answer", [it.item_id, await keyOf(it.item_id)]);
    await age(pD.attempt.id, "10 days"); await age(fD.attempt.id, "10 days");
    await fails(user(uD, "select public.study_expire_stale_attempts(10)"), /permission denied/, "aluno não executa a varredura");
    await fails(anon("select public.study_expire_stale_attempts(10)"), /permission denied/, "anon não executa a varredura");
    const swept = (await svc("select public.study_expire_stale_attempts(100) n")).rows[0].n;
    const st = (await svc("select id, status, points_awarded from public.study_attempts where id = any($1)", [[pD.attempt.id, fD.attempt.id]])).rows;
    ok(swept >= 2 && st.find((r) => r.id === pD.attempt.id).status === "expired" && st.find((r) => r.id === fD.attempt.id).status === "completed" && st.find((r) => r.id === fD.attempt.id).points_awarded === 0,
      "varredura: incompleta expira; toda respondida (livre) conclui com 0 pontos");
    ok((await svc("select public.study_expire_stale_attempts(100) n")).rows[0].n === 0, "segunda varredura não encontra nada (idempotente)");

    // prazo configurável
    await svc("insert into public.study_settings (key, value) values ('attempt_ttl_hours', 1)");
    const uE = await mk(5);
    const tE = await rpc(uE, "study_start_attempt", [null, "practice", 2]);
    await age(tE.attempt.id, "2 hours");
    await fails(rpc(uE, "study_submit_answer", [tE.items[0].item_id, await keyOf(tE.items[0].item_id)]), /attempt_expired/, "prazo configurado em 1 hora vale");
    await svc("delete from public.study_settings where key = 'attempt_ttl_hours'");
    await fails(svc("insert into public.study_settings (key, value) values ('attempt_ttl_hours', 100000)"), /check|violat/i, "faixa do parâmetro é validada");
    await fails(svc("insert into public.study_settings (key, value) values ('outra_chave', 5)"), /check|violat/i, "só chaves conhecidas são aceitas");
  }

  // ── 7h. Limites diários (tentativas e questões) ─────────────────────────────
  {
    const mk = async (n) => { const id = "55555555-5555-5555-5555-" + String(n).padStart(12, "0"); await db.query("insert into auth.users (id) values ($1)", [id]); await rpc(id, "study_upsert_my_profile", ["Limite " + n, null, 5]); return id; };
    await svc("insert into public.study_settings (key, value) values ('daily_attempts_limit', 3), ('daily_questions_limit', 7)");
    const uF = await mk(1);
    for (let i = 0; i < 3; i++) { const t = await rpc(uF, "study_start_attempt", [null, "free", 1]); await rpc(uF, "study_abandon_attempt", [t.attempt.id]); }
    await failsDetail(rpc(uF, "study_start_attempt", [null, "free", 1]), /daily_limit_reached/, "attempts", "limite de tentativas por dia (3 configuradas)");
    const pr = await rpc(uF, "study_my_progress");
    ok(pr.attempts_left_today === 0 && pr.questions_left_today === 4, "progresso informa saldo do dia (0 tentativas, 4 questões)");

    const uG = await mk(2);
    const g1 = await rpc(uG, "study_start_attempt", [null, "free", 5]);
    await rpc(uG, "study_abandon_attempt", [g1.attempt.id]);
    const g2 = await rpc(uG, "study_start_attempt", [null, "free", 5]);
    ok(g1.attempt.question_count === 5 && g2.attempt.question_count === 2, "saldo de questões menor que o pedido: a tentativa vem menor (5, depois 2)");
    await rpc(uG, "study_abandon_attempt", [g2.attempt.id]);
    await failsDetail(rpc(uG, "study_start_attempt", [null, "free", 1]), /daily_limit_reached/, "questions", "limite de questões por dia (7 configuradas)");

    // retomar não consome limite
    const uH = await mk(3);
    const h1 = await rpc(uH, "study_start_attempt", [null, "practice", 3]);
    for (let i = 0; i < 5; i++) await rpc(uH, "study_start_attempt", [null, "practice", 3]);
    ok((await svc("select count(*)::int c from public.study_attempts where user_id=$1", [uH])).rows[0].c === 1 && h1.attempt.question_count === 3, "retomar a mesma tentativa não consome o limite");
    await svc("delete from public.study_settings");
  }

  // ── 8. Limite diário e abandono ─────────────────────────────────────────────
  await db.exec("reset role");
  let limitHit = false;
  for (let i = 0; i < 40 && !limitHit; i++) {
    try {
      const t = await rpc(U2, "study_start_attempt", [null, "practice", 1]);
      await rpc(U2, "study_abandon_attempt", [t.attempt.id]);
    } catch (e) { limitHit = /daily_limit_reached/.test(e.message); if (!limitHit) throw e; }
  }
  ok(limitHit, "limite diário de tentativas freia varredura do banco de questões");
  ok((await svc("select count(*)::int c from public.study_attempts where user_id=$1 and started_at >= date_trunc('day', now())", [U2])).rows[0].c <= 20, "padrão: no máximo 20 tentativas novas por dia");

  console.log(`\n${pass} verificações passaram, ${failures.length} falharam`);
  await db.close();
  return failures.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { PGlite } = await import("@electric-sql/pglite");
  process.exit((await run(PGlite)) ? 1 : 0);
}
