// Testes de CONCORRÊNCIA REAL: um servidor PostgreSQL de verdade, local e
// descartável (embedded-postgres, em diretório temporário, porta local), com
// VÁRIAS conexões disparando chamadas ao mesmo tempo. O PGlite do run-local.mjs
// tem uma conexão só e NÃO demonstra concorrência; este arquivo existe para isso.
//
//   npm i -D embedded-postgres pg        (só para rodar; não é dependência do site)
//   node supabase-app/tests/run-concurrency.mjs
//
// Não toca em nenhum projeto Supabase, não usa rede além de 127.0.0.1 e a senha
// abaixo é de um servidor descartável que existe só durante a execução.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
// layout do repositório: <raiz>/migrations; layout da CLI: <raiz>/supabase/migrations
const migDir = [path.join(root, "supabase", "migrations"), path.join(root, "migrations")].find((d) => fs.existsSync(d));
const proposedDir = path.join(root, "supabase-proposed", "migrations");
const INCLUDE_PROPOSED = process.env.FSL_INCLUDE_PROPOSED === "1" && fs.existsSync(proposedDir);
// lista [{ file, dir }] na ordem de aplicação; a proposta (0005) só entra com FSL_INCLUDE_PROPOSED=1
const allMigrations = () => [
  ...fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort().map((f) => ({ f, dir: migDir })),
  ...(INCLUDE_PROPOSED ? fs.readdirSync(proposedDir).filter((f) => f.endsWith(".sql")).sort().map((f) => ({ f, dir: proposedDir })) : []),
];
const PORT = Number(process.env.FSL_PG_PORT) || 54329;
const PW = "descartavel-local";

export async function run({ EmbeddedPostgres, pg }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsl-pg-"));
  const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: PW, port: PORT, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-c", "max_connections=400"] });
  await server.initialise();
  await server.start();
  await server.createDatabase("t");
  const open = [];
  const connect = async () => {
    const c = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "t" });
    await c.connect(); open.push(c); return c;
  };
  let pass = 0; const failures = [];
  const ok = (c, name) => { if (c) pass++; else { failures.push(name); console.log("FAIL", name); } };

  try {
    const admin = await connect();
    const pidInfo = (await admin.query("select version() v, (select count(*)::int from pg_stat_activity) conns")).rows[0];
    console.log("servidor:", pidInfo.v.split(",")[0]);
    await admin.query(fs.readFileSync(path.join(here, "stubs", "supabase_stub.sql"), "utf8"));
    for (const m of allMigrations())
      await admin.query(fs.readFileSync(path.join(m.dir, m.f), "utf8"));

    const ADM = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
    await admin.query("insert into auth.users (id) values ($1)", [ADM]);
    await admin.query("insert into public.study_admins (user_id) values ($1)", [ADM]);
    const subj = (await admin.query("insert into public.study_subjects (slug, name) values ('s','Assunto') returning id")).rows[0].id;
    const qids = [];
    for (let n = 1; n <= 8; n++) {
      const q = (await admin.query("insert into public.study_questions (subject_id, stem, created_by) values ($1,$2,$3) returning id", [subj, `Enunciado fictício ${n} de teste de concorrência.`, ADM])).rows[0].id;
      let first;
      for (const l of ["A", "B", "C", "D"]) {
        const o = (await admin.query("insert into public.study_question_options (question_id,label,body) values ($1,$2,$3) returning id", [q, l, `Alt ${l}`])).rows[0].id;
        if (l === "A") first = o;
      }
      await admin.query("insert into public.study_answer_keys values ($1,$2)", [q, first]);
      await admin.query("insert into public.study_explanations values ($1,$2)", [q, `Explicação fictícia ${n}.`]);
      qids.push(q);
    }
    await admin.query("update public.study_questions set status='published', no_real_patient_data_confirmed=true, reviewed_by=$1, reviewed_at=now(), published_at=now()", [ADM]);

    // cria usuários e devolve N conexões independentes, todas "logadas" como o usuário
    async function makeUser(n, conns = 1) {
      const id = uid(n);
      await admin.query("insert into auth.users (id) values ($1)", [id]);
      const cs = [];
      for (let i = 0; i < conns; i++) {
        const c = await connect();
        await c.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
        await c.query("set role authenticated");
        cs.push(c);
      }
      await cs[0].query("select public.study_upsert_my_profile('Aluno', null, 5)");
      return { id, cs };
    }
    const call = async (c, fn, args = []) => {
      try { return { ok: true, v: (await c.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) r`, args)).rows[0].r }; }
      catch (e) { return { ok: false, e: e.message }; }
    };
    const keyOf = async (itemId) => (await admin.query("select k.option_id from public.study_attempt_items i join public.study_answer_keys k on k.question_id=i.question_id where i.id=$1", [itemId])).rows[0].option_id;
    const wrongOf = async (it) => { const k = await keyOf(it.item_id); return it.options.find((o) => o.id !== k).id; };
    const n = (r) => Number(r.rows[0].c);

    // ── A. Respostas simultâneas ao mesmo item ────────────────────────────────
    {
      const u = await makeUser(1, 8);
      const att = (await call(u.cs[0], "study_start_attempt", [null, "practice", 3])).v;
      const it = att.items[0];
      const wrong = await wrongOf(it);
      const res = await Promise.all(u.cs.map((c) => call(c, "study_submit_answer", [it.item_id, wrong])));
      ok(res.filter((r) => r.ok).length === 1, "A: 8 respostas simultâneas ao mesmo item -> exatamente 1 aceita");
      ok(res.filter((r) => !r.ok).every((r) => /already_answered/.test(r.e)), "A: as outras 7 recebem already_answered");
      ok(n(await admin.query("select count(*) c from public.study_attempt_answers where item_id=$1", [it.item_id])) === 1, "A: 1 única linha de resposta");
      ok(n(await admin.query("select miss_count c from public.study_review_items where user_id=$1", [u.id])) === 1, "A: miss_count da revisão = 1 (sem dupla contagem)");
    }

    // ── B. Conclusões simultâneas da mesma tentativa ──────────────────────────
    {
      const u = await makeUser(2, 10);
      const att = (await call(u.cs[0], "study_start_attempt", [null, "practice", 5])).v;
      for (const it of att.items) await call(u.cs[0], "study_submit_answer", [it.item_id, await keyOf(it.item_id)]);
      const res = await Promise.all(u.cs.map((c) => call(c, "study_complete_attempt", [att.attempt.id])));
      ok(res.every((r) => r.ok), "B: 10 conclusões simultâneas, todas respondem sem erro");
      ok(new Set(res.map((r) => r.v.attempt.points_awarded)).size === 1 && res[0].v.attempt.points_awarded === 70, "B: todas veem os mesmos 70 pontos (5x10 + bônus 20)");
      ok(n(await admin.query("select count(*) c from public.study_points_ledger where user_id=$1", [u.id])) === 6, "B: livro-razão com 6 linhas (5 questões + 1 bônus), sem duplicidade");
      ok(n(await admin.query("select sum(points) c from public.study_points_ledger where user_id=$1", [u.id])) === 70, "B: soma do livro-razão = 70");
    }

    // ── C. Duas tentativas (pontuado + revisão) concluídas juntas com a MESMA questão ──
    {
      const u = await makeUser(3, 2);
      const [c1, c2] = u.cs;
      const p0 = (await call(c1, "study_start_attempt", [null, "practice", 1])).v;      // 1 questão
      const q0item = p0.items[0];
      await call(c1, "study_submit_answer", [q0item.item_id, await wrongOf(q0item)]);   // erra -> revisão pendente
      await call(c1, "study_complete_attempt", [p0.attempt.id]);
      const pr = (await call(c1, "study_start_attempt", [null, "practice", 8])).v;       // inclui a questão errada
      const rv = (await call(c2, "study_start_attempt", [null, "review", 5])).v;         // também inclui
      const sharedPr = pr.items.find((i) => i.stem === q0item.stem);
      const sharedRv = rv.items.find((i) => i.stem === q0item.stem);
      ok(!!sharedPr && !!sharedRv, "C: a mesma questão está em duas tentativas abertas (pontuado e revisão)");
      // migration 0006: só conclui treino com TODAS as questões respondidas. As outras questões do treino pontuado
      // são respondidas antes; a questão disputada é respondida nas duas tentativas ao mesmo tempo.
      for (const it of pr.items) if (it.item_id !== sharedPr.item_id) await call(c1, "study_submit_answer", [it.item_id, await keyOf(it.item_id)]);
      await Promise.all([
        call(c1, "study_submit_answer", [sharedPr.item_id, await keyOf(sharedPr.item_id)]),
        call(c2, "study_submit_answer", [sharedRv.item_id, await keyOf(sharedRv.item_id)]),
      ]);
      const done = await Promise.all([call(c1, "study_complete_attempt", [pr.attempt.id]), call(c2, "study_complete_attempt", [rv.attempt.id])]);
      ok(done.every((r) => r.ok), "C: as duas conclusões simultâneas terminam sem erro");
      ok(n(await admin.query("select count(*) c from public.study_points_ledger where user_id=$1 and question_id=(select question_id from public.study_attempt_items where id=$2)", [u.id, sharedPr.item_id])) === 1, "C: a questão pontuou UMA vez no total (índice único decide a corrida)");
      // outras = questões inéditas do treino pontuado (10 cada; +20 de bônus com 3 ou mais pontuadas e tudo respondido)
      const others = pr.items.length - 1;
      const expectPr = (won) => 10 * (others + (won ? 1 : 0)) + (others + (won ? 1 : 0) >= 3 ? 20 : 0);
      const [awPr, awRv] = [done[0].v.attempt.points_awarded, done[1].v.attempt.points_awarded];
      ok((awRv === 10 && awPr === expectPr(false)) || (awRv === 0 && awPr === expectPr(true)), `C: a questão disputada rendeu os 10 pontos a UMA só tentativa (treino=${awPr}, revisão=${awRv})`);
    }

    // ── D. Início simultâneo: mesma tentativa; e limite diário com disputa ───────
    {
      const u = await makeUser(4, 12);
      const res = await Promise.all(u.cs.map((c) => call(c, "study_start_attempt", [null, "practice", 3])));
      ok(res.every((r) => r.ok), "D: 12 inícios simultâneos sem erro");
      ok(new Set(res.map((r) => r.v.attempt.id)).size === 1, "D: todos retomam a MESMA tentativa");
      ok(n(await admin.query("select count(*) c from public.study_attempts where user_id=$1", [u.id])) === 1, "D: 1 única tentativa criada");
    }
    {
      const u = await makeUser(5, 6);
      // 19 tentativas já feitas hoje (abandonadas; limite padrão = 20): resta exatamente UMA vaga
      for (let i = 0; i < 19; i++)
        await admin.query("insert into public.study_attempts (user_id, mode, status, question_count) values ($1,'practice','abandoned',1)", [u.id]);
      // prepara um erro pendente para o modo revisão existir
      await admin.query("insert into public.study_review_items (user_id, question_id) values ($1,$2)", [u.id, qids[0]]);
      const modes = ["practice", "free", "review", "practice", "free", "review"];
      const res = await Promise.all(u.cs.map((c, i) => call(c, "study_start_attempt", [null, modes[i], 2])));
      const created = n(await admin.query("select count(*) c from public.study_attempts where user_id=$1", [u.id])) - 19;
      ok(created === 1, `D: com 1 vaga restante e 6 disputas (3 modos), foi criada exatamente 1 tentativa (criadas: ${created})`);
      ok(res.filter((r) => !r.ok && /daily_limit_reached/.test(r.e)).length >= 1, "D: as demais recebem daily_limit_reached");
      ok(n(await admin.query("select count(*) c from public.study_attempts where user_id=$1", [u.id])) <= 20, "D: total do dia nunca passa de 20");
    }

    // ── E. Resposta x conclusão ao mesmo tempo: nada entra depois de concluir ─────
    {
      // migration 0006: se a conclusão chegar antes da última resposta, o desfecho correto é attempt_incomplete (e nada é gravado);
      // depois que todas as respostas entram, a conclusão tem de funcionar.
      let bad = 0, completedOk = 0, racedIncomplete = 0, unexpected = 0;
      for (let round = 0; round < 15; round++) {
        const u = await makeUser(100 + round, 4);
        const att = (await call(u.cs[0], "study_start_attempt", [null, "practice", 4])).v;
        const keys = await Promise.all(att.items.map((it) => keyOf(it.item_id)));
        const tasks = att.items.slice(1).map((it, i) => call(u.cs[1 + (i % 3)], "study_submit_answer", [it.item_id, keys[i + 1]]));
        tasks.push(call(u.cs[0], "study_complete_attempt", [att.attempt.id]));
        await call(u.cs[0], "study_submit_answer", [att.items[0].item_id, keys[0]]);
        const res = await Promise.all(tasks);
        const comp = res[res.length - 1];
        if (!comp.ok) { if (/attempt_incomplete/.test(comp.e)) racedIncomplete++; else unexpected++; }
        const after = (await admin.query("select status, correct_count, points_awarded from public.study_attempts where id=$1", [att.attempt.id])).rows[0];
        if (!comp.ok && (after.status !== "in_progress" || after.points_awarded !== null)) bad++;   // recusa não pode deixar rastro
        const fin = await call(u.cs[0], "study_complete_attempt", [att.attempt.id]);               // todas as respostas já entraram
        if (!fin.ok) unexpected++;
        const row = (await admin.query("select status, correct_count, (select count(*)::int from public.study_attempt_answers a join public.study_attempt_items i on i.id=a.item_id where i.attempt_id=$1 and a.is_correct) real from public.study_attempts where id=$1", [att.attempt.id])).rows[0];
        if (row.status === "completed") { completedOk++; if (row.correct_count !== row.real) bad++; }
      }
      ok(completedOk === 15 && bad === 0 && unexpected === 0, `E: em 15 rodadas de resposta x conclusão simultâneas, correct_count sempre igual às respostas gravadas (concluídas: ${completedOk}, conclusões que chegaram cedo e foram recusadas: ${racedIncomplete}, divergências: ${bad}, erros inesperados: ${unexpected})`);
    }


    // ── F. Limite de QUESTÕES por dia sob disputa ─────────────────────────────
    {
      await admin.query("insert into public.study_settings (key, value) values ('daily_questions_limit', 6)");
      const u = await makeUser(6, 3);
      await admin.query("insert into public.study_review_items (user_id, question_id) values ($1,$2)", [u.id, qids[0]]);
      const modes = ["practice", "free", "review"];
      const res = await Promise.all(u.cs.map((c, i) => call(c, "study_start_attempt", [null, modes[i], 5])));
      const items = n(await admin.query("select count(*) c from public.study_attempt_items i join public.study_attempts a on a.id=i.attempt_id where a.user_id=$1", [u.id]));
      ok(items <= 6, "F: com saldo de 6 questões e 3 pedidos simultâneos (5+5+1), o total entregue nunca passa de 6 (entregues: " + items + ")");
      ok(res.filter((r) => r.ok).length + res.filter((r) => !r.ok && /daily_limit_reached/.test(r.e)).length === 3, "F: cada pedido ou recebe tentativa (possivelmente menor) ou daily_limit_reached");
      await admin.query("delete from public.study_settings");
    }

    // ── G. Início simultâneo sobre uma tentativa VENCIDA ──────────────────────
    {
      const u = await makeUser(7, 6);
      const old = (await call(u.cs[0], "study_start_attempt", [null, "practice", 4])).v;
      await call(u.cs[0], "study_submit_answer", [old.items[0].item_id, await keyOf(old.items[0].item_id)]);
      await admin.query("update public.study_attempts set last_activity_at = now() - interval '10 days' where id=$1", [old.attempt.id]);
      const res = await Promise.all(u.cs.map((c) => call(c, "study_start_attempt", [null, "practice", 4])));
      ok(res.every((r) => r.ok), "G: 6 inícios simultâneos sobre tentativa vencida, sem erro");
      ok(new Set(res.map((r) => r.v.attempt.id)).size === 1 && res[0].v.attempt.id !== old.attempt.id, "G: todos recebem a MESMA tentativa nova");
      const st = (await admin.query("select status, count(*)::int c from public.study_attempts where user_id=$1 group by status", [u.id])).rows;
      ok(st.length === 2 && st.find((r) => r.status === "expired")?.c === 1 && st.find((r) => r.status === "in_progress")?.c === 1, "G: a vencida expirou uma vez e há uma única em andamento");
    }

    // ── H. Varreduras simultâneas de tentativas vencidas ──────────────────────
    {
      const users = [];
      for (let i = 0; i < 8; i++) {
        const u = await makeUser(200 + i, 1);
        const t = (await call(u.cs[0], "study_start_attempt", [null, "practice", 3])).v;
        for (const it of t.items) await call(u.cs[0], "study_submit_answer", [it.item_id, await keyOf(it.item_id)]);
        await admin.query("update public.study_attempts set last_activity_at = now() - interval '9 days' where id=$1", [t.attempt.id]);
        users.push(u.id);
      }
      const sweepers = [await connect(), await connect(), await connect()];
      const res = await Promise.all(sweepers.map((c) => c.query("select public.study_expire_stale_attempts(100) n")));
      const total = res.reduce((a, r) => a + Number(r.rows[0].n), 0);
      ok(total === 8, "H: 3 varreduras simultâneas processam as 8 tentativas vencidas exatamente uma vez cada (total " + total + ")");
      const done = n(await admin.query("select count(*) c from public.study_attempts where user_id = any($1) and status='completed' and points_awarded=50", [users]));
      const rows = n(await admin.query("select count(*) c from public.study_points_ledger where user_id = any($1)", [users]));
      ok(done === 8 && rows === 32, "H: 8 concluídas com 50 pontos e 32 linhas no livro-razão (3 questões + 1 bônus por aluno), sem duplicidade (concluídas " + done + ", linhas " + rows + ")");
    }

    // ── I. Publicar x apagar alternativa ao mesmo tempo ───────────────────────
    {
      const adm = await connect();
      await adm.query("select set_config('request.jwt.claim.sub', $1, false)", [ADM]);
      await adm.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: ADM, aal: "aal2" })]);   // MFA (exigido pela 0007 nas escritas)
      await adm.query("set role authenticated");
      const other = await connect();
      let broken = 0, pubOk = 0, delOk = 0;
      for (let round = 0; round < 25; round++) {
        const q = (await admin.query("insert into public.study_questions (subject_id, stem, created_by) values ($1,$2,$3) returning id", [subj, "Enunciado de corrida " + round + " para teste.", ADM])).rows[0].id;
        const a = (await admin.query("insert into public.study_question_options (question_id,label,body) values ($1,'A','a') returning id", [q])).rows[0].id;
        await admin.query("insert into public.study_question_options (question_id,label,body) values ($1,'B','b')", [q]);
        await admin.query("insert into public.study_answer_keys values ($1,$2)", [q, a]);
        await admin.query("insert into public.study_explanations values ($1,'Explicação de corrida para teste.')", [q]);
        const [p, d] = await Promise.all([
          call(adm, "study_admin_publish_question", [q, true]),
          other.query("delete from public.study_question_options where question_id=$1 and label='B'", [q]).then(() => ({ ok: true }), (e) => ({ ok: false, e: e.message })),
        ]);
        if (p.ok) pubOk++;
        if (d.ok) delOk++;
        const row = (await admin.query("select q.status, (select count(*)::int from public.study_question_options o where o.question_id=q.id) opts from public.study_questions q where q.id=$1", [q])).rows[0];
        if (row.status === "published" && row.opts < 2) broken++;
        if (p.ok === d.ok) broken++;   // ou publicou (e o delete falhou) ou apagou (e a publicação falhou): nunca os dois
      }
      ok(broken === 0, "I: em 25 corridas publicar x apagar alternativa, nunca sobra questão publicada com menos de 2 alternativas (publicações " + pubOk + ", exclusões " + delOk + ")");
    }

    // ── J. Prática: gravações simultâneas de vários aparelhos da MESMA conta (migration 0009) ───────────────
    {
      const u = await makeUser(30, 8);
      const EX = "anotacao-dispneia-noite", T = [true, false, true];
      const save = (c, txt, exp) => call(c, "study_practice_save_progress", [EX, 1, txt, null, T, exp]);
      // 8 aparelhos gravam a PRIMEIRA vez ao mesmo tempo, com textos diferentes: exatamente 1 vence, os outros 7 recebem conflito
      const first = await Promise.all(u.cs.map((c, i) => call(c, "study_practice_save_progress", [EX, 1, `texto do aparelho ${i}`, null, T, 0])));
      ok(first.every((r) => r.ok), "J: nenhuma gravação simultânea dá erro (só 'saved' ou 'conflict')");
      ok(first.filter((r) => r.v.status === "saved").length === 1 && first.filter((r) => r.v.status === "conflict").length === 7, "J: 8 primeiras gravações simultâneas -> 1 saved e 7 conflict");
      ok(n(await admin.query("select count(*) c from public.study_practice_progress where user_id=$1", [u.id])) === 1, "J: uma única linha para o exercício");
      const winner = first.find((r) => r.v.status === "saved").v.row;
      ok(first.filter((r) => r.v.status === "conflict").every((r) => r.v.row && r.v.row.draft === winner.draft && r.v.row.rev === 1), "J: todo conflito devolve a versão vencedora (rev 1) para o aparelho recuperar");
      // 8 aparelhos com a MESMA rev conhecida (1) gravam ao mesmo tempo: 1 vence (rev 2), 7 conflito
      const second = await Promise.all(u.cs.map((c, i) => save(c, `segunda rodada, aparelho ${i}`, 1)));
      ok(second.filter((r) => r.v.status === "saved").length === 1 && second.filter((r) => r.v.status === "conflict").length === 7, "J: 8 gravações com a mesma rev conhecida -> 1 saved e 7 conflict");
      ok(n(await admin.query("select rev c from public.study_practice_progress where user_id=$1", [u.id])) === 2, "J: a rev subiu só uma vez (2), sem perda nem duplicidade");
      // apagar x gravar ao mesmo tempo: nunca fica estado inconsistente e nenhuma chamada dá erro
      const mixed = await Promise.all([call(u.cs[0], "study_practice_delete_progress", [EX]), save(u.cs[1], "depois de apagar?", 2)]);
      ok(mixed.every((r) => r.ok), "J: apagar x gravar simultâneos não geram erro");
      ok(n(await admin.query("select count(*) c from public.study_practice_progress where user_id=$1", [u.id])) <= 1, "J: no máximo 1 linha ao final");
    }

    console.log(`\n${pass} verificações de concorrência passaram, ${failures.length} falharam`);
  } finally {
    for (const c of open) await c.end().catch(() => {});
    await server.stop().catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { console.log("(aviso) não consegui apagar o diretório temporário:", dir); }
  }
  return failures.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const EmbeddedPostgres = (await import("embedded-postgres")).default;
  const pg = (await import("pg")).default;
  process.exitCode = (await run({ EmbeddedPostgres, pg })) ? 1 : 0;
}
