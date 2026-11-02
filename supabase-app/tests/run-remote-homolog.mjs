// Testes REAIS no projeto de HOMOLOGAÇÃO (nunca na loja): Auth (GoTrue) e PostgREST de verdade,
// JWT de verdade, várias requisições HTTP simultâneas. Dados 100% fictícios (@example.test, prefixo
// [TESTE-HOMOLOG]); no fim apaga os usuários de teste (cascata) e ARQUIVA as questões de teste.
//
//   node supabase/../tests/run-remote-homolog.mjs   (via wrapper que injeta { pg }; ver README-HOMOLOG.md)
//
// Segurança: as chaves vêm da CLI em memória e NUNCA são impressas; a senha do banco vem do arquivo
// local do usuário; nada é gravado em disco. A trava abaixo recusa rodar se o projeto vinculado não
// for o esperado (FSL_EXPECTED_REF).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

export async function run({ pg }) {
  const REF = process.env.FSL_EXPECTED_REF;
  if (!/^[a-z]{20}$/.test(REF || "")) throw new Error("defina FSL_EXPECTED_REF");
  const linked = fs.readFileSync(path.join(root, "supabase", ".temp", "project-ref"), "utf8").trim();
  if (linked !== REF) throw new Error("BLOQUEADO: CLI vinculada a outro projeto");
  const URL_ = `https://${REF}.supabase.co`;

  // chaves: só em memória
  const keysRaw = execFileSync("npx", ["--yes", "supabase", "projects", "api-keys", "--project-ref", REF, "-o", "json"], { cwd: root, shell: true, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const keys = JSON.parse(keysRaw.slice(keysRaw.indexOf("[")));
  const ANON = (keys.find((k) => k.name === "anon") || {}).api_key;
  const SVC = (keys.find((k) => k.name === "service_role") || {}).api_key;
  if (!ANON || !SVC) throw new Error("chaves não encontradas");

  let pass = 0; const failures = [];
  const ok = (c, name, extra) => { if (c) pass++; else { failures.push(name); console.log("FAIL", name, extra ?? ""); } };

  // ── HTTP ────────────────────────────────────────────────────────────────────
  async function api(p, { method = "GET", key = ANON, token, body, headers = {} } = {}) {
    const r = await fetch(URL_ + p, { method, headers: { apikey: key, Authorization: "Bearer " + (token || key), "Content-Type": "application/json", Prefer: "return=representation", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let b; try { b = t ? JSON.parse(t) : null; } catch { b = t; }
    return { status: r.status, body: b };
  }
  const msg = (r) => String((r.body && (r.body.message || r.body.msg || r.body.error_description || r.body.error)) || "") + " " + String((r.body && r.body.details) || "");
  const rpc = (token, fn, args = {}) => api("/rest/v1/rpc/" + fn, { method: "POST", token, body: args });
  const svc = (p, o = {}) => api(p, { ...o, key: SVC });
  const okRpc = (r) => r.status === 200 || r.status === 204;   // função void => 204 No Content
  const errIs = (r, re) => r.status >= 400 && re.test(msg(r));

  // ── 1. Auth: configuração e confirmação obrigatória ─────────────────────────
  const settings = await api("/auth/v1/settings");
  ok(settings.status === 200 && settings.body.external?.email === true, "Auth: login por e-mail e senha habilitado");
  ok(settings.body.mailer_autoconfirm === false, "Auth: confirmação de e-mail OBRIGATÓRIA (mailer_autoconfirm = false)");
  ok(settings.body.disable_signup === false, "Auth: cadastro público habilitado");
  ok(settings.body.external?.anonymous_users !== true, "Auth: login anônimo desligado");
  console.log("  (política de senha remota ainda não configurada: ver relatório)");

  if (process.env.FSL_TEST_EMAIL) {
    const pw = crypto.randomBytes(18).toString("base64url") + "aA1";
    const su = await api("/auth/v1/signup", { method: "POST", body: { email: process.env.FSL_TEST_EMAIL, password: pw } });
    ok(su.status === 200 && !su.body.access_token && !!(su.body.user?.confirmation_sent_at || su.body.confirmation_sent_at), "Cadastro real: usuário criado SEM sessão e com e-mail de confirmação enviado", su.status + " " + msg(su));
    const early = await api("/auth/v1/token?grant_type=password", { method: "POST", body: { email: process.env.FSL_TEST_EMAIL, password: pw } });
    ok(early.status === 400 && /email_not_confirmed|not confirmed/i.test(JSON.stringify(early.body)), "Login ANTES de confirmar o e-mail é recusado (email_not_confirmed)", early.status + " " + msg(early));
    fs.writeFileSync(path.join(process.env.USERPROFILE || ".", ".fslobo-homolog", "test-user-password"), pw, { mode: 0o600 });
  }

  // ── 2. Auditoria do banco (catálogo) ────────────────────────────────────────
  const dbpw = fs.readFileSync(path.join(process.env.USERPROFILE, ".fslobo-homolog", "db-password"), "utf8").trim();
  const poolerUrl = fs.readFileSync(path.join(root, "supabase", ".temp", "pooler-url"), "utf8").trim();
  const u = new globalThis.URL(poolerUrl);
  const sql = new pg.Client({ host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: dbpw, database: "postgres", ssl: { rejectUnauthorized: false } });
  await sql.connect();
  const q = async (text, params) => (await sql.query(text, params)).rows;
  try {
    ok(u.username.endsWith("." + REF), "SQL: conexão do auditor é ao projeto de homologação");
    ok((await q("select count(*)::int c from supabase_migrations.schema_migrations"))[0].c === 6, "Banco: 6 migrations registradas no histórico remoto");
    const tabs = await q("select c.relname, c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'study\\_%'");
    ok(tabs.length === 13 && tabs.every((t) => t.rls), "Banco: 13 tabelas study_*, todas com RLS ligado");
    const own = ["study_profiles", "study_attempts", "study_attempt_items", "study_attempt_answers", "study_points_ledger", "study_review_items"];
    const privs = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
    const bad = [];
    for (const t of tabs.map((x) => x.relname)) for (const p of privs) {
      const r = (await q("select has_table_privilege('anon', $1, $2) a, has_table_privilege('authenticated', $1, $2) u, has_table_privilege('service_role', $1, $2) s", ["public." + t, p]))[0];
      if (r.a) bad.push("anon " + p + " " + t);
      if (r.u !== (p === "SELECT" && own.includes(t))) bad.push("authenticated " + p + " " + t);
      if (r.s !== ["SELECT", "INSERT", "UPDATE", "DELETE"].includes(p)) bad.push("service_role " + p + " " + t);
    }
    ok(bad.length === 0, "Banco: privilégios exatos (anon nada; authenticated só SELECT nas 6 tabelas próprias; service_role sem TRUNCATE/TRIGGER/REFERENCES)", bad.slice(0, 4).join("; "));
    const pol = await q("select cmd, roles::text r, qual from pg_policies where schemaname='public' and tablename like 'study\\_%'");
    ok(pol.length === 6 && pol.every((p) => p.cmd === "SELECT" && p.r === "{authenticated}" && /auth\.uid\(\)/.test(p.qual)), "Banco: 6 políticas RLS, todas SELECT/authenticated e amarradas a auth.uid()");
    const fns = await q("select p.proname, p.prosecdef, p.proconfig::text cfg, has_function_privilege('anon', p.oid, 'execute') anon_x, has_function_privilege('authenticated', p.oid, 'execute') auth_x, has_function_privilege('service_role', p.oid, 'execute') svc_x from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'study%' or p.proname='is_study_admin')");
    const rpcs = ["study_upsert_my_profile", "study_list_subjects", "study_start_attempt", "study_get_attempt", "study_submit_answer", "study_complete_attempt", "study_abandon_attempt", "study_my_progress", "study_list_my_attempts", "study_list_my_review_items", "study_admin_publish_question", "is_study_admin"];
    ok(fns.every((f) => !f.anon_x), "Banco: nenhuma função study_* executável por anon");
    ok(fns.filter((f) => f.auth_x).map((f) => f.proname).sort().join() === [...rpcs].sort().join(), "Banco: authenticated executa exatamente as 12 RPCs previstas (nenhuma interna, nenhuma varredura)");
    ok(fns.find((f) => f.proname === "study_expire_stale_attempts")?.svc_x === true && !fns.find((f) => f.proname === "study_expire_stale_attempts").auth_x, "Banco: varredura executável só pelo service_role");
    ok(fns.filter((f) => f.prosecdef).every((f) => /search_path/.test(f.cfg || "")), "Banco: toda SECURITY DEFINER com search_path fixo");
    ok((await q("select count(*)::int c from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname like 'study\\_%' and not t.tgisinternal"))[0].c === 18, "Banco: 18 triggers de proteção instalados");
    ok((await q("select count(*)::int c from pg_publication_tables where tablename like 'study\\_%'"))[0].c === 0, "Banco: nenhuma tabela study_* publicada no Realtime");
    ok((await q("show server_version"))[0].server_version.startsWith("17"), "Banco: PostgreSQL 17");
  } finally { /* mantém conexão para conferências finais */ }

  // ── 3. Usuários de teste (Auth real) ────────────────────────────────────────
  const tag = crypto.randomBytes(3).toString("hex");
  const mkUser = async (label) => {
    const email = `homolog-${label}-${tag}@example.test`;
    const pw = crypto.randomBytes(18).toString("base64url") + "aA1";
    const c = await svc("/auth/v1/admin/users", { method: "POST", body: { email, password: pw, email_confirm: true } });
    if (c.status >= 300) throw new Error("não consegui criar usuário de teste: " + c.status + " " + msg(c));
    const t = await api("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password: pw } });
    if (!t.body?.access_token) throw new Error("login de teste falhou: " + t.status);
    return { id: c.body.id, token: t.body.access_token };
  };
  const weak = await svc("/auth/v1/admin/users", { method: "POST", body: { email: `weak-${tag}@example.test`, password: "abc", email_confirm: true } });
  ok(weak.status >= 400, "Auth: senha de 3 caracteres é recusada (política mínima do GoTrue)", weak.status);
  if (weak.status < 300) await svc("/auth/v1/admin/users/" + weak.body.id, { method: "DELETE" });

  const U1 = await mkUser("a"), U2 = await mkUser("b"), ADM = await mkUser("adm"), U3 = await mkUser("c");
  const created = [U1, U2, ADM, U3];
  try {
    await svc("/rest/v1/study_admins", { method: "POST", body: { user_id: ADM.id } });

    // ── 4. Conteúdo fictício via service_role ────────────────────────────────
    const subj = (await svc("/rest/v1/study_subjects", { method: "POST", body: { slug: "teste-homolog-" + tag, name: "[TESTE-HOMOLOG] Assunto " + tag } })).body[0].id;
    const qs = [];
    for (let n = 1; n <= 6; n++) {
      const qq = (await svc("/rest/v1/study_questions", { method: "POST", body: { subject_id: subj, stem: `[TESTE-HOMOLOG ${tag}] Enunciado fictício número ${n} para teste.`, created_by: ADM.id } })).body[0].id;
      const opts = (await svc("/rest/v1/study_question_options", { method: "POST", body: ["A", "B", "C", "D"].map((l) => ({ question_id: qq, label: l, body: `Alternativa ${l} da questão ${n}` })) })).body;
      await svc("/rest/v1/study_answer_keys", { method: "POST", body: { question_id: qq, option_id: opts.find((o) => o.label === "A").id } });
      await svc("/rest/v1/study_explanations", { method: "POST", body: { question_id: qq, body: `Explicação fictícia da questão ${n} (teste).` } });
      qs.push({ id: qq, keyId: opts.find((o) => o.label === "A").id });
    }
    const draft = (await svc("/rest/v1/study_questions", { method: "POST", body: { subject_id: subj, stem: `[TESTE-HOMOLOG ${tag}] Questão INÉDITA em rascunho.`, created_by: ADM.id } })).body[0].id;
    const dOpts = (await svc("/rest/v1/study_question_options", { method: "POST", body: [{ question_id: draft, label: "A", body: "x" }, { question_id: draft, label: "B", body: "y" }] })).body;
    await svc("/rest/v1/study_answer_keys", { method: "POST", body: { question_id: draft, option_id: dOpts[0].id } });
    await svc("/rest/v1/study_explanations", { method: "POST", body: { question_id: draft, body: "Explicação do rascunho de teste." } });

    ok(errIs(await rpc(U1.token, "study_admin_publish_question", { p_question_id: qs[0].id, p_confirm_no_real_patient_data: true }), /forbidden/), "Publicação por não-admin é recusada (forbidden)");
    ok(errIs(await rpc(ADM.token, "study_admin_publish_question", { p_question_id: qs[0].id, p_confirm_no_real_patient_data: false }), /patient_data_confirmation_required/), "Publicação sem atestado de 'sem paciente real' é recusada");
    for (const x of qs) ok(okRpc(await rpc(ADM.token, "study_admin_publish_question", { p_question_id: x.id, p_confirm_no_real_patient_data: true })), "Admin publica questão de teste");
    ok(errIs(await svc("/rest/v1/study_questions?id=eq." + qs[0].id, { method: "PATCH", body: { stem: "alterado depois de publicado" } }), /imut/), "service_role NÃO altera enunciado publicado (trigger)");
    ok(errIs(await svc("/rest/v1/study_questions?id=eq." + qs[0].id, { method: "DELETE" }), /não pode ser apagada|apagad/), "service_role NÃO apaga questão publicada");
    ok(errIs(await svc("/rest/v1/study_answer_keys?question_id=eq." + qs[0].id, { method: "PATCH", body: { option_id: qs[0].keyId } }), /imut/), "gabarito publicado é imutável");

    // ── 5. Acesso direto: anon e authenticated (RLS e GRANT reais) ───────────
    const tables = ["study_settings", "study_admins", "study_subjects", "study_questions", "study_question_options", "study_answer_keys", "study_explanations"];
    for (const t of [...tables, "study_profiles", "study_attempts", "study_attempt_items", "study_attempt_answers", "study_points_ledger", "study_review_items"]) {
      const r = await api("/rest/v1/" + t + "?select=*&limit=1");
      ok(r.status === 401 || r.status === 403, `anon não lê ${t} (HTTP ${r.status})`);
    }
    for (const t of tables) {
      const r = await api("/rest/v1/" + t + "?select=*&limit=1", { token: U1.token });
      ok(r.status === 401 || r.status === 403, `aluno logado não lê ${t} (HTTP ${r.status})`);
    }
    const w = await api("/rest/v1/study_profiles", { method: "POST", token: U1.token, body: { user_id: U1.id, display_name: "x" } });
    ok(w.status === 401 || w.status === 403, "aluno não insere perfil direto");
    ok((await api("/rest/v1/study_attempts?id=eq.00000000-0000-0000-0000-000000000000", { method: "PATCH", token: U1.token, body: { points_awarded: 9999 } })).status >= 400, "aluno não altera pontos");
    ok(errIs(await rpc(null, "study_start_attempt", {}), /./), "anon não chama RPC do app");
    ok((await rpc(U1.token, "study_expire_stale_attempts", {})).status >= 400, "aluno não executa a varredura");
    ok((await rpc(U1.token, "study__attempt_payload", { p_attempt_id: "00000000-0000-0000-0000-000000000000" })).status >= 400, "aluno não executa função interna");

    // ── 6. Fluxo do aluno e proteção do gabarito ─────────────────────────────
    ok(errIs(await rpc(U1.token, "study_start_attempt", { p_subject_slug: null, p_mode: "practice", p_question_count: 5 }), /profile_required/), "tentativa exige perfil");
    ok(okRpc(await rpc(U1.token, "study_upsert_my_profile", { p_display_name: "Aluno Teste A", p_weekly_goal: 5 })), "perfil criado pelo RPC");
    await rpc(U2.token, "study_upsert_my_profile", { p_display_name: "Aluno Teste B", p_weekly_goal: 5 });
    await rpc(U3.token, "study_upsert_my_profile", { p_display_name: "Aluno Teste C", p_weekly_goal: 5 });
    const p1 = await api("/rest/v1/study_profiles?select=display_name", { token: U1.token });
    ok(p1.status === 200 && p1.body.length === 1 && p1.body[0].display_name === "Aluno Teste A", "aluno lê só o próprio perfil (RLS)");
    ok(JSON.stringify((await api("/rest/v1/study_profiles?select=display_name", { token: U2.token })).body) === JSON.stringify([{ display_name: "Aluno Teste B" }]), "outro aluno vê só o seu (RLS)");

    const slug = "teste-homolog-" + tag;
    const subjects = await rpc(U1.token, "study_list_subjects");
    ok(subjects.status === 200 && subjects.body.some((s) => s.slug === slug && s.question_count === 6), "lista de assuntos: só questões publicadas (6; o rascunho não conta)");
    const a1 = (await rpc(U1.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "practice", p_question_count: 5 })).body;
    const raw = JSON.stringify(a1);
    ok(a1?.items?.length === 5 && !/correct_option_id|explanation|is_correct|Explicação fictícia/.test(raw), "tentativa iniciada: 5 itens SEM gabarito nem explicação no JSON");
    ok(!raw.includes("INÉDITA"), "questão inédita (rascunho) nunca é entregue");
    ok((await rpc(U1.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "practice", p_question_count: 5 })).body?.attempt?.id === a1.attempt.id, "iniciar de novo RETOMA a mesma tentativa");
    const keyOf = async (itemId) => { const it = (await svc("/rest/v1/study_attempt_items?id=eq." + itemId + "&select=question_id")).body[0]; return (await svc("/rest/v1/study_answer_keys?question_id=eq." + it.question_id + "&select=option_id")).body[0].option_id; };
    const wrongOf = async (it) => { const k = await keyOf(it.item_id); return it.options.find((o) => o.id !== k).id; };
    const it = a1.items;
    ok(errIs(await rpc(U2.token, "study_submit_answer", { p_item_id: it[0].item_id, p_option_id: it[0].options[0].id }), /not_found/), "outro usuário não responde item alheio");
    ok(errIs(await rpc(U2.token, "study_get_attempt", { p_attempt_id: a1.attempt.id }), /not_found/), "outro usuário não lê tentativa alheia");
    ok(errIs(await rpc(U2.token, "study_complete_attempt", { p_attempt_id: a1.attempt.id }), /not_found/), "outro usuário não conclui tentativa alheia");
    ok(errIs(await rpc(U2.token, "study_abandon_attempt", { p_attempt_id: a1.attempt.id }), /not_found/), "outro usuário não abandona tentativa alheia");
    ok(errIs(await rpc(U1.token, "study_submit_answer", { p_item_id: it[0].item_id, p_option_id: it[1].options[0].id }), /invalid_option/), "alternativa de outra questão é recusada");
    const r0 = await rpc(U1.token, "study_submit_answer", { p_item_id: it[0].item_id, p_option_id: await keyOf(it[0].item_id) });
    ok(okRpc(r0) && r0.body.is_correct === true && /Explicação/.test(r0.body.explanation), "acerto revela gabarito e explicação só DEPOIS de responder");
    ok(errIs(await rpc(U1.token, "study_submit_answer", { p_item_id: it[0].item_id, p_option_id: await keyOf(it[0].item_id) }), /already_answered/), "resposta repetida recusada");
    const r1 = await rpc(U1.token, "study_submit_answer", { p_item_id: it[1].item_id, p_option_id: await wrongOf(it[1]) });
    ok(okRpc(r1) && r1.body.is_correct === false, "erro marcado pelo servidor");
    const mid = (await rpc(U1.token, "study_get_attempt", { p_attempt_id: a1.attempt.id })).body;
    ok(mid.items.slice(2).every((i) => i.answer === null) && !JSON.stringify(mid.items.slice(2)).match(/correct_option_id|explanation/), "itens não respondidos continuam sem gabarito");
    const ledger0 = (await svc("/rest/v1/study_points_ledger?user_id=eq." + U1.id + "&select=id")).body.length;
    // migration 0006: treino com 2 de 5 respondidas não conclui, não pontua e pode ser encerrado sem concluir (respostas preservadas)
    const c1 = await rpc(U1.token, "study_complete_attempt", { p_attempt_id: a1.attempt.id });
    ok(errIs(c1, /attempt_incomplete/), "conclusão parcial (2 de 5 respondidas) é recusada com attempt_incomplete");
    ok((await svc("/rest/v1/study_points_ledger?user_id=eq." + U1.id + "&select=id")).body.length === ledger0, "a tentativa incompleta não gravou ponto algum");
    ok(okRpc(await rpc(U1.token, "study_abandon_attempt", { p_attempt_id: a1.attempt.id })) && (await svc("/rest/v1/study_attempt_answers?user_id=eq." + U1.id + "&select=item_id")).body.length === 2, "encerrar sem concluir preserva as 2 respostas");

    const a2 = (await rpc(U1.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "practice", p_question_count: 3 })).body;
    for (const x of a2.items) await rpc(U1.token, "study_submit_answer", { p_item_id: x.item_id, p_option_id: await keyOf(x.item_id) });
    const d2 = (await rpc(U1.token, "study_complete_attempt", { p_attempt_id: a2.attempt.id })).body;
    ok(d2.attempt.points_awarded === 50 && d2.attempt.scored_questions === 3, "3 questões novas, todas respondidas: 30 + bônus 20 = 50");
    { const pg = (await rpc(U1.token, "study_my_progress")).body; ok(pg.points === 50 && pg.attempts_completed === 1, "progresso calculado no servidor: 50 pontos e 1 treino concluído (a tentativa incompleta encerrada não conta)", JSON.stringify({ p: pg.points, c: pg.attempts_completed })); }
    ok((await rpc(U1.token, "study_my_progress")).body.pending_review === 1, "o erro foi para a revisão");
    const rv = (await rpc(U1.token, "study_list_my_review_items", { p_limit: 20 })).body;
    ok(rv.length === 1 && rv[0].options.some((o) => o.is_correct), "revisão traz o gabarito do que o aluno já respondeu");
    ok((await rpc(U2.token, "study_list_my_review_items", { p_limit: 20 })).body.length === 0, "revisão é por usuário");

    // anti-acúmulo, livre e revisão
    for (let round = 1; round <= 2; round++) {
      const f = (await rpc(U1.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "practice", p_question_count: 6 })).body;
      for (const x of f.items) await rpc(U1.token, "study_submit_answer", { p_item_id: x.item_id, p_option_id: await keyOf(x.item_id) });
      const fd = (await rpc(U1.token, "study_complete_attempt", { p_attempt_id: f.attempt.id })).body;
      // rodada 1: 3 questões ainda sem 1º acerto (a certa só na tentativa incompleta, a que errou e a nunca respondida) = 30 + bônus 20 (3 novas e tudo respondido)
      ok(fd.attempt.correct_count === 6 && fd.attempt.points_awarded === (round === 1 ? 50 : 0), `repetir as 6 questões (rodada ${round}): ${round === 1 ? "as 3 sem 1º acerto pontuam (30) + bônus 20" : "0 pontos, sem bônus"}`, fd.attempt.points_awarded);
    }
    ok((await rpc(U1.token, "study_my_progress")).body.points === 100, "pontos totais = 100 (teto finito: 6 questões x10 + 2 bônus de 20, um por treino completo com 3 ou mais inéditas)");
    const fr = (await rpc(U2.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "free", p_question_count: 3 })).body;
    for (const x of fr.items) await rpc(U2.token, "study_submit_answer", { p_item_id: x.item_id, p_option_id: await keyOf(x.item_id) });
    const frd = (await rpc(U2.token, "study_complete_attempt", { p_attempt_id: fr.attempt.id })).body;
    ok(frd.attempt.correct_count === 3 && frd.attempt.points_awarded === 0 && frd.attempt.awards_points === false, "treino livre: 3 acertos, 0 pontos");

    // ── 7. Expiração de tentativas ───────────────────────────────────────────
    const age = (id, iso) => svc("/rest/v1/study_attempts?id=eq." + id, { method: "PATCH", body: { last_activity_at: iso } });
    const days = (n) => new Date(Date.now() - n * 864e5).toISOString();
    const e1 = (await rpc(U3.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "practice", p_question_count: 5 })).body;
    await rpc(U3.token, "study_submit_answer", { p_item_id: e1.items[0].item_id, p_option_id: await wrongOf(e1.items[0]) });
    await age(e1.attempt.id, days(6));
    ok((await rpc(U3.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "practice", p_question_count: 5 })).body.attempt.id === e1.attempt.id, "parada há 6 dias: retomável");
    await age(e1.attempt.id, days(8));
    ok((await rpc(U3.token, "study_get_attempt", { p_attempt_id: e1.attempt.id })).body.attempt.resumable === false, "parada há 8 dias: resumable = false");
    ok(errIs(await rpc(U3.token, "study_submit_answer", { p_item_id: e1.items[1].item_id, p_option_id: await keyOf(e1.items[1].item_id) }), /attempt_expired/), "tentativa vencida não aceita resposta");
    ok(errIs(await rpc(U3.token, "study_complete_attempt", { p_attempt_id: e1.attempt.id }), /attempt_expired/), "tentativa vencida e incompleta não conclui");
    const e2 = (await rpc(U3.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "practice", p_question_count: 5 })).body;
    const old = (await svc("/rest/v1/study_attempts?id=eq." + e1.attempt.id + "&select=status,points_awarded")).body[0];
    ok(e2.attempt.id !== e1.attempt.id && old.status === "expired" && old.points_awarded === null, "novo start expira a vencida (sem pontos) e cria outra");
    ok((await svc("/rest/v1/study_attempt_answers?user_id=eq." + U3.id + "&select=item_id")).body.length === 1 && (await rpc(U3.token, "study_my_progress")).body.pending_review === 1, "resposta dada e erro de revisão preservados");
    await rpc(U3.token, "study_abandon_attempt", { p_attempt_id: e2.attempt.id });
    const e3 = (await rpc(U3.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "free", p_question_count: 2 })).body;
    for (const x of e3.items) await rpc(U3.token, "study_submit_answer", { p_item_id: x.item_id, p_option_id: await keyOf(x.item_id) });
    await age(e3.attempt.id, days(10));
    const sw = await svc("/rest/v1/rpc/study_expire_stale_attempts", { method: "POST", body: { p_limit: 100 } });
    ok(sw.status === 200 && sw.body >= 1 && (await svc("/rest/v1/study_attempts?id=eq." + e3.attempt.id + "&select=status")).body[0].status === "completed", "varredura (service_role): vencida e toda respondida é CONCLUÍDA");

    // ── 8. Limites diários ───────────────────────────────────────────────────
    await svc("/rest/v1/study_settings", { method: "POST", body: [{ key: "daily_attempts_limit", value: 3 }, { key: "daily_questions_limit", value: 7 }] });
    const L1 = (await mkUser("lim1")); created.push(L1); await rpc(L1.token, "study_upsert_my_profile", { p_display_name: "Limite 1" });
    for (let i = 0; i < 3; i++) { const t = (await rpc(L1.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "free", p_question_count: 1 })).body; await rpc(L1.token, "study_abandon_attempt", { p_attempt_id: t.attempt.id }); }
    const lim = await rpc(L1.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "free", p_question_count: 1 });
    ok(errIs(lim, /daily_limit_reached/) && /attempts/.test(msg(lim)), "limite de tentativas por dia (configurado em 3)", msg(lim));
    const L2 = (await mkUser("lim2")); created.push(L2); await rpc(L2.token, "study_upsert_my_profile", { p_display_name: "Limite 2" });
    const g1 = (await rpc(L2.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "free", p_question_count: 5 })).body; await rpc(L2.token, "study_abandon_attempt", { p_attempt_id: g1.attempt.id });
    const g2 = (await rpc(L2.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "free", p_question_count: 5 })).body; await rpc(L2.token, "study_abandon_attempt", { p_attempt_id: g2.attempt.id });
    ok(g1.attempt.question_count === 5 && g2.attempt.question_count === 2, "saldo de questões menor que o pedido: a tentativa vem menor (5, depois 2)");
    const lq = await rpc(L2.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "free", p_question_count: 1 });
    ok(errIs(lq, /daily_limit_reached/) && /questions/.test(msg(lq)), "limite de questões por dia (configurado em 7)", msg(lq));
    await svc("/rest/v1/study_settings?key=in.(daily_attempts_limit,daily_questions_limit)", { method: "DELETE" });

    // ── 9. Concorrência real (várias requisições HTTP simultâneas) ──────────
    const C1 = (await mkUser("conc1")); created.push(C1); await rpc(C1.token, "study_upsert_my_profile", { p_display_name: "Concorrência 1" });
    const ca = (await rpc(C1.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "practice", p_question_count: 5 })).body;
    const wrongOpt = await wrongOf(ca.items[0]);
    const par = await Promise.all(Array.from({ length: 10 }, () => rpc(C1.token, "study_submit_answer", { p_item_id: ca.items[0].item_id, p_option_id: wrongOpt })));
    ok(par.filter(okRpc).length === 1 && par.filter((r) => errIs(r, /already_answered/)).length === 9, "10 respostas simultâneas ao mesmo item: 1 aceita, 9 already_answered", par.map((r) => r.status).join());
    ok((await svc("/rest/v1/study_attempt_answers?item_id=eq." + ca.items[0].item_id + "&select=item_id")).body.length === 1 && (await svc("/rest/v1/study_review_items?user_id=eq." + C1.id + "&select=miss_count")).body[0].miss_count === 1, "1 única linha de resposta e miss_count = 1");
    for (const x of ca.items.slice(1)) await rpc(C1.token, "study_submit_answer", { p_item_id: x.item_id, p_option_id: await keyOf(x.item_id) });
    const cc = await Promise.all(Array.from({ length: 12 }, () => rpc(C1.token, "study_complete_attempt", { p_attempt_id: ca.attempt.id })));
    ok(cc.every(okRpc) && new Set(cc.map((r) => r.body.attempt.points_awarded)).size === 1, "12 conclusões simultâneas: todas respondem com os mesmos pontos", cc.map((r) => r.status).join());
    const led = (await svc("/rest/v1/study_points_ledger?user_id=eq." + C1.id + "&select=reason,points")).body;
    ok(led.filter((l) => l.reason === "question_first_correct").length === 4 && led.filter((l) => l.reason === "attempt_completion").length === 1 && led.reduce((a, l) => a + l.points, 0) === 60, "livro-razão sem duplicidade (4 questões x10 + 1 bônus de 20 = 60, apesar de 12 conclusões)", JSON.stringify(led.map((l) => l.reason + ":" + l.points)));
    const C2 = (await mkUser("conc2")); created.push(C2); await rpc(C2.token, "study_upsert_my_profile", { p_display_name: "Concorrência 2" });
    const st = await Promise.all(Array.from({ length: 12 }, () => rpc(C2.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "practice", p_question_count: 3 })));
    ok(st.every(okRpc) && new Set(st.map((r) => r.body.attempt.id)).size === 1 && (await svc("/rest/v1/study_attempts?user_id=eq." + C2.id + "&select=id")).body.length === 1, "12 inícios simultâneos: a MESMA tentativa e 1 linha");
    // limite de tentativas sob disputa: 1 vaga, 3 modos
    await svc("/rest/v1/study_settings", { method: "POST", body: { key: "daily_attempts_limit", value: 4 } });
    const C3 = (await mkUser("conc3")); created.push(C3); await rpc(C3.token, "study_upsert_my_profile", { p_display_name: "Concorrência 3" });
    for (let i = 0; i < 3; i++) { const t = (await rpc(C3.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "free", p_question_count: 1 })).body; await rpc(C3.token, "study_abandon_attempt", { p_attempt_id: t.attempt.id }); }
    await svc("/rest/v1/study_review_items", { method: "POST", body: { user_id: C3.id, question_id: qs[0].id } });
    const modes = ["practice", "free", "review", "practice", "free", "review"];
    const race = await Promise.all(modes.map((m) => rpc(C3.token, "study_start_attempt", { p_subject_slug: null, p_mode: m, p_question_count: 2 })));
    const total = (await svc("/rest/v1/study_attempts?user_id=eq." + C3.id + "&select=id")).body.length;
    ok(total === 4 && race.filter((r) => errIs(r, /daily_limit_reached/)).length >= 1, `limite sob disputa: 1 vaga, 6 pedidos em 3 modos -> exatamente 1 criada (total do dia ${total} de 4)`);
    await svc("/rest/v1/study_settings?key=eq.daily_attempts_limit", { method: "DELETE" });
    // respostas x conclusão
    let bad = 0, done = 0;
    for (let i = 0; i < 6; i++) {
      const X = await mkUser("x" + i); created.push(X); await rpc(X.token, "study_upsert_my_profile", { p_display_name: "Corrida " + i });
      const t = (await rpc(X.token, "study_start_attempt", { p_subject_slug: slug, p_mode: "practice", p_question_count: 4 })).body;
      const ks = await Promise.all(t.items.map((x) => keyOf(x.item_id)));
      await Promise.all([...t.items.map((x, j) => rpc(X.token, "study_submit_answer", { p_item_id: x.item_id, p_option_id: ks[j] })), rpc(X.token, "study_complete_attempt", { p_attempt_id: t.attempt.id })]);
      const row = (await svc("/rest/v1/study_attempts?id=eq." + t.attempt.id + "&select=status,correct_count")).body[0];
      const real = (await svc("/rest/v1/study_attempt_answers?item_id=in.(" + t.items.map((x) => x.item_id).join(",") + ")&is_correct=eq.true&select=item_id")).body.length;
      // 0006: a conclusão que chega antes da última resposta é recusada (attempt_incomplete) e não deixa rastro; a final, com tudo respondido, conclui
      const fin = await rpc(X.token, "study_complete_attempt", { p_attempt_id: t.attempt.id });
      if (!okRpc(fin)) bad++;
      const row2 = (await svc("/rest/v1/study_attempts?id=eq." + t.attempt.id + "&select=status,correct_count")).body[0];
      if (row2.status === "completed") { done++; if (row2.correct_count !== real) bad++; } else bad++;
    }
    ok(bad === 0 && done === 6, `resposta x conclusão simultâneas (6 rodadas): correct_count sempre igual às respostas gravadas (concluídas ${done}, divergências ${bad})`);
    // publicar x apagar alternativa
    let broken = 0, pub = 0, del = 0;
    for (let i = 0; i < 12; i++) {
      const qq = (await svc("/rest/v1/study_questions", { method: "POST", body: { subject_id: subj, stem: `[TESTE-HOMOLOG ${tag}] Corrida de publicação ${i} para teste.`, created_by: ADM.id } })).body[0].id;
      const o = (await svc("/rest/v1/study_question_options", { method: "POST", body: [{ question_id: qq, label: "A", body: "a" }, { question_id: qq, label: "B", body: "b" }] })).body;
      await svc("/rest/v1/study_answer_keys", { method: "POST", body: { question_id: qq, option_id: o.find((x) => x.label === "A").id } });
      await svc("/rest/v1/study_explanations", { method: "POST", body: { question_id: qq, body: "Explicação de corrida para teste." } });
      const [p, d] = await Promise.all([rpc(ADM.token, "study_admin_publish_question", { p_question_id: qq, p_confirm_no_real_patient_data: true }), svc("/rest/v1/study_question_options?id=eq." + o.find((x) => x.label === "B").id, { method: "DELETE" })]);
      if (okRpc(p)) pub++; if (d.status < 300) del++;
      const row = (await svc("/rest/v1/study_questions?id=eq." + qq + "&select=status")).body[0];
      const n = (await svc("/rest/v1/study_question_options?question_id=eq." + qq + "&select=id")).body.length;
      if (row.status === "published" && n < 2) broken++;
      qs.push({ id: qq });
    }
    ok(broken === 0, `publicar x apagar alternativa (12 corridas): nunca sobra questão publicada com < 2 alternativas (publicações ${pub}, exclusões ${del})`);

    // ── 10. Isolamento final entre usuários (RLS via API) ────────────────────
    for (const t of ["study_attempts", "study_attempt_items", "study_attempt_answers", "study_points_ledger", "study_review_items"]) {
      const mine = (await api("/rest/v1/" + t + "?select=*", { token: U2.token })).body;
      const all = (await svc("/rest/v1/" + t + "?select=*")).body;
      ok(Array.isArray(mine) && mine.length < all.length, `${t}: aluno B vê ${mine.length} de ${all.length} linhas`);
    }
    ok((await api("/rest/v1/study_points_ledger?user_id=eq." + U1.id, { token: U2.token })).body.length === 0, "aluno B não lê o livro-razão do aluno A mesmo filtrando pelo id dele");
    ok((await rpc(U2.token, "study_my_progress")).body.points === 0, "pontos do aluno B independem do aluno A");

    // ── 11. LGPD: apagar conta apaga o histórico ─────────────────────────────
    const delU = await svc("/auth/v1/admin/users/" + U1.id, { method: "DELETE" });
    created.splice(created.indexOf(U1), 1);
    const left = (await q("select (select count(*)::int from public.study_profiles where user_id=$1) p, (select count(*)::int from public.study_attempts where user_id=$1) a, (select count(*)::int from public.study_attempt_answers where user_id=$1) r, (select count(*)::int from public.study_points_ledger where user_id=$1) l, (select count(*)::int from public.study_review_items where user_id=$1) v", [U1.id]))[0];
    ok(delU.status < 300 && Object.values(left).every((v) => v === 0), "apagar a conta no Auth apaga perfil, tentativas, respostas, pontos e revisão em cascata");

    // ── 12. Advisor de segurança do projeto (via CLI) está no relatório; aqui só confere sem ERROR ──
  } finally {
    // limpeza: apaga usuários de teste e arquiva as questões fictícias
    const admDel = await svc("/auth/v1/admin/users/" + ADM.id, { method: "DELETE" }).catch((e) => ({ status: 599, body: String(e) }));
    ok(admDel.status < 300, "apagar a conta de um administrador que publicou questões funciona", admDel.status + " " + msg(admDel).slice(0, 160));
    if (admDel.status < 300) {
      const tr = (await q("select count(*)::int n, count(*) filter (where reviewed_by is null and created_by is null)::int nulos, count(*) filter (where reviewed_by_ref = $1 and created_by_ref = $1)::int refs, count(*) filter (where reviewed_at is not null and published_at is not null and no_real_patient_data_confirmed)::int auditoria from public.study_questions where reviewed_by_ref = $1", [ADM.id]))[0];
      ok(tr.n >= 6 && tr.nulos === tr.n && tr.refs === tr.n && tr.auditoria === tr.n, "RASTREABILIDADE: após apagar o administrador, " + tr.n + " questões mantêm referência opaca de autoria/revisão e a auditoria (datas e atestado) intacta");
    }
    if (admDel.status >= 300) await svc("/rest/v1/study_admins?user_id=eq." + ADM.id, { method: "PATCH", body: { active: false } }).catch(() => {});
    for (const x of created) await svc("/auth/v1/admin/users/" + x.id, { method: "DELETE" }).catch(() => {});
    await svc("/rest/v1/study_settings?key=in.(daily_attempts_limit,daily_questions_limit,attempt_ttl_hours)", { method: "DELETE" }).catch(() => {});
    await svc("/rest/v1/study_questions?stem=like.*TESTE-HOMOLOG*&status=eq.published", { method: "PATCH", body: { status: "archived" } }).catch(() => {});
    await svc("/rest/v1/study_questions?stem=like.*TESTE-HOMOLOG*&status=in.(draft,in_review)", { method: "DELETE" }).catch(() => {});
    await svc("/rest/v1/study_subjects?slug=eq.teste-homolog-" + tag, { method: "PATCH", body: { active: false } }).catch(() => {});
    await sql.end().catch(() => {});
  }
  console.log(`\n${pass} verificações passaram, ${failures.length} falharam`);
  return failures.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pg = (await import("pg")).default;
  process.exitCode = (await run({ pg })) ? 1 : 0;
}
