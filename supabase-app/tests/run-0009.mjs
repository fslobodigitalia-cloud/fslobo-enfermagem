// Testes LOCAIS da migration 0009 (persistência da Prática na conta do aluno). Banco descartável (PGlite ou PostgreSQL local).
// Sem rede, sem credenciais, sem tocar em nenhum projeto Supabase.   run(db, label) com db = { exec(sql), query(sql, params) -> { rows } }
// Cobre: isolamento entre dois usuários, acesso sem login, permissões mínimas (listas explícitas), salvar/carregar/apagar,
// conflito entre aparelhos, validação de exercício/versão/tamanho/marcações, texto fora das mensagens de erro, ausência de acesso administrativo.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migDir = path.join(path.resolve(here, ".."), "supabase", "migrations");

export async function run(db, label = "") {
  let pass = 0; const failures = [];
  const ok = (c, name, extra) => { if (c) pass++; else { failures.push(name); console.log("FAIL", name, extra ?? ""); } };
  const owner = (sql, p) => db.query(sql, p);
  const one = async (sql, p) => (await db.query(sql, p)).rows[0];

  await db.exec(fs.readFileSync(path.join(here, "stubs", "supabase_stub.sql"), "utf8"));
  const files = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) await db.exec(fs.readFileSync(path.join(migDir, f), "utf8"));
  ok(files.some((f) => /practice_progress/.test(f)), "a migration 0009 está entre as aplicadas neste teste");

  async function as(role, uid, sql, params) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
    await db.exec(`set role ${role}`);
    try { return await db.query(sql, params); } finally { await db.exec("reset role"); }
  }
  const U1 = "00000000-0000-0000-0000-0000000000b1", U2 = "00000000-0000-0000-0000-0000000000b2";
  await owner(`insert into auth.users (id, email) values ('${U1}','aluna1@example.test'), ('${U2}','aluno2@example.test')`);
  const EX = "anotacao-dispneia-noite", EX2 = "evolucao-posoperatorio-3dias";
  const save = (uid, ex, ver, draft, rev, checks, expected, role = "authenticated") =>
    as(role, uid, "select public.study_practice_save_progress($1,$2,$3,$4,$5::boolean[],$6) r", [ex, ver, draft, rev, checks, expected]).then((r) => r.rows[0].r);
  const list = (uid, role = "authenticated") => as(role, uid, "select public.study_practice_list_my_progress() r").then((r) => r.rows[0].r);
  const del = (uid, ex, role = "authenticated") => as(role, uid, "select public.study_practice_delete_progress($1) r", [ex]).then((r) => r.rows[0].r);
  async function fails(p, re, name) {
    try { await p; ok(false, `${name} (deveria falhar)`); } catch (e) { ok(re.test(String(e.message)), `${name} -> ${String(e.message).slice(0, 80)}`); }
  }
  const T = [true, false, true];

  // ════════ 1. estrutura, RLS e permissões (listas explícitas) ════════
  const tbl = (await owner(`select c.relname, c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('study_practice_exercises','study_practice_progress') order by 1`)).rows;
  ok(tbl.length === 2 && tbl.every((t) => t.rls === true), "1.1 as 2 tabelas novas têm RLS ligado");
  const privs = (await owner(`select t.t, r.r, p.p, has_table_privilege(r.r, 'public.'||t.t, p.p) h
      from (values ('study_practice_exercises'),('study_practice_progress')) t(t),
           (values ('anon'),('authenticated'),('service_role')) r(r),
           (values ('select'),('insert'),('update'),('delete'),('truncate'),('references'),('trigger')) p(p)`)).rows;
  ok(privs.length === 42 && privs.every((x) => x.h === false), "1.2 NENHUM papel (anon, authenticated, service_role) tem privilégio direto nas 2 tabelas novas (42 combinações)");
  const pol = (await owner("select policyname, cmd, roles::text r from pg_policies where tablename='study_practice_progress' order by 1")).rows;
  ok(pol.length === 4 && pol.every((p) => p.r === "{authenticated}") && pol.map((p) => p.cmd).sort().join() === "DELETE,INSERT,SELECT,UPDATE", "1.3 4 políticas, todas só para authenticated (select, insert, update, delete)");
  const fns = (await owner(`select p.proname, p.prosecdef, p.proconfig::text cfg, pg_get_function_arguments(p.oid) args,
      has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u, has_function_privilege('service_role', p.oid, 'execute') s
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%practice%' order by 1`)).rows;
  ok(fns.map((f) => f.proname).join() === "study__practice_row_json,study_practice_delete_progress,study_practice_list_my_progress,study_practice_save_progress", "1.4 as funções 'practice' são exatamente 4 (1 interna + 3 RPCs)", fns.map((f) => f.proname).join());
  ok(fns.filter((f) => f.u).map((f) => f.proname).join() === "study_practice_delete_progress,study_practice_list_my_progress,study_practice_save_progress", "1.5 authenticated executa só as 3 RPCs");
  ok(fns.every((f) => !f.a && !f.s), "1.6 anon e service_role NÃO executam nenhuma (sem acesso administrativo)");
  ok(fns.filter((f) => f.proname !== "study__practice_row_json").every((f) => f.prosecdef && /search_path/.test(f.cfg || "")), "1.7 as 3 RPCs são SECURITY DEFINER com search_path fixo");
  ok(!fns.some((f) => /user|uid/i.test(f.args)), "1.8 nenhuma RPC recebe user_id: a identidade vem só de auth.uid()", fns.map((f) => f.args).join(" | "));
  const readers = (await owner(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prosrc ilike '%study_practice_progress%' order by 1`)).rows.map((r) => r.proname);
  ok(readers.join() === "study_practice_delete_progress,study_practice_list_my_progress,study_practice_save_progress", "1.9 só as 3 RPCs referenciam a tabela do progresso (nenhuma RPC administrativa lê as redações)", readers.join());
  const cols = (await owner("select column_name from information_schema.columns where table_name='study_practice_progress' order by ordinal_position")).rows.map((r) => r.column_name);
  ok(cols.join() === "user_id,exercise_id,exercise_version,draft,revision,checks,rev,created_at,updated_at", "1.10 colunas exatas: sem nota, pontos, ranking, correção ou IA", cols.join());
  ok((await one("select count(*)::int n, bool_and(version=1 and check_count=3) b from public.study_practice_exercises")).n === 3, "1.11 o catálogo aceita exatamente 3 exercícios na versão 1");

  // ════════ 2. sem login ════════
  await fails(list(null, "anon"), /permission denied/, "2.1 anon não lista");
  await fails(save(null, EX, 1, "x", null, T, 0, "anon"), /permission denied/, "2.2 anon não grava");
  await fails(del(null, EX, "anon"), /permission denied/, "2.3 anon não apaga");
  await fails(list(null), /not_authenticated/, "2.4 authenticated sem sessão válida (sem auth.uid) não lista");
  await fails(save(null, EX, 1, "x", null, T, 0), /not_authenticated/, "2.5 sem auth.uid não grava");
  await fails(del(null, EX), /not_authenticated/, "2.6 sem auth.uid não apaga");
  await fails(as("authenticated", U1, "select * from public.study_practice_progress"), /permission denied/, "2.7 navegador não lê a tabela diretamente");
  await fails(as("authenticated", U1, "insert into public.study_practice_progress (user_id, exercise_id, exercise_version, checks) values ($1,'x',1,'{t,f,t}')", [U1]), /permission denied/, "2.8 navegador não grava na tabela diretamente");
  await fails(as("service_role", null, "select * from public.study_practice_progress"), /permission denied/, "2.9 nem o service_role lê a tabela (sem acesso administrativo)");
  await fails(as("authenticated", U1, "select * from public.study_practice_exercises"), /permission denied/, "2.10 o catálogo também não é legível diretamente");

  // ════════ 3. salvar, carregar, apagar ════════
  ok((await list(U1)).length === 0, "3.1 lista vazia no início");
  const s1 = await save(U1, EX, 1, "Texto inicial da aluna 1", null, T, 0);
  ok(s1.status === "saved" && s1.row.rev === 1 && s1.row.draft === "Texto inicial da aluna 1" && s1.row.revision === null && JSON.stringify(s1.row.checks) === JSON.stringify(T), "3.2 primeira gravação: rev 1, revisão nula, marcações preservadas");
  const l1 = await list(U1);
  ok(l1.length === 1 && l1[0].exercise_id === EX && l1[0].exercise_version === 1 && l1[0].rev === 1, "3.3 carregar devolve o que foi gravado (exercício e versão)");
  const s2 = await save(U1, EX, 1, "Texto inicial da aluna 1", "Versão revisada", [true, true, true], 1);
  ok(s2.status === "saved" && s2.row.rev === 2 && s2.row.revision === "Versão revisada" && s2.row.checks.every(Boolean), "3.4 nova gravação com a rev correta: rev 2, revisão e marcações novas");
  const s3 = await save(U1, EX, 1, "Texto inicial da aluna 1", "Versão revisada", [true, true, true], 1);
  ok(s3.status === "saved" && s3.row.rev === 2, "3.5 repetir a MESMA gravação (resposta perdida) com rev antiga não gera conflito nem nova rev");
  const e1 = await save(U1, EX, 1, "", null, [false, false, false], 2);
  ok(e1.status === "saved" && e1.row.draft === "" && e1.row.revision === null && e1.row.rev === 3, "3.6 gravar vazio é permitido (a aluna pode limpar o texto)");
  const m = await one("select updated_at > created_at as t from public.study_practice_progress where user_id=$1", [U1]);
  ok(m.t === true, "3.7 updated_at é atualizado por gatilho");
  ok((await save(U1, EX2, 1, "Evolução", null, T, 0)).row.rev === 1, "3.8 exercícios diferentes têm linhas independentes");
  ok((await list(U1)).length === 2, "3.9 a lista traz os 2 exercícios");
  ok((await del(U1, EX)) === 1 && (await list(U1)).length === 1, "3.10 apagar remove só o exercício pedido (devolve 1)");
  ok((await del(U1, EX)) === 0, "3.11 apagar de novo devolve 0 (idempotente)");
  ok((await del(U1, "nao-existe")) === 0, "3.12 apagar exercício desconhecido não falha nem apaga nada");
  await fails(del(U1, "x".repeat(61)), /invalid_exercise/, "3.13 id de exercício longo demais é recusado");

  // ════════ 4. isolamento entre usuários ════════
  await owner("delete from public.study_practice_progress");
  await save(U1, EX, 1, "SEGREDO-DA-ALUNA-1", "revisão 1", T, 0);
  ok((await list(U2)).length === 0, "4.1 o usuário 2 não vê nada do usuário 1");
  const u2 = await save(U2, EX, 1, "texto do aluno 2", null, [false, true, false], 0);
  ok(u2.status === "saved" && u2.row.rev === 1, "4.2 o usuário 2 grava o MESMO exercício sem colidir (rev 1 próprio)");
  ok((await list(U1))[0].draft === "SEGREDO-DA-ALUNA-1" && (await list(U2))[0].draft === "texto do aluno 2", "4.3 cada um lê só o próprio texto");
  ok((await del(U2, EX)) === 1 && (await list(U1)).length === 1 && (await list(U1))[0].draft === "SEGREDO-DA-ALUNA-1", "4.4 apagar do usuário 2 não toca no usuário 1");
  const sx = await save(U2, EX, 1, "outro texto", null, T, 0);
  ok(sx.status === "saved" && (await list(U1))[0].rev === 1, "4.5 a gravação do usuário 2 não altera a rev do usuário 1");
  ok((await owner("select count(*)::int n from public.study_practice_progress")).rows[0].n === 2, "4.6 duas linhas no total, uma por usuário");

  // ════════ 5. conflito entre aparelhos ════════
  await owner("delete from public.study_practice_progress");
  const a0 = await save(U1, EX, 1, "base", null, T, 0);                       // aparelho A e B conhecem rev 1
  ok(a0.row.rev === 1, "5.0 base rev 1");
  const a1 = await save(U1, EX, 1, "texto do aparelho A", null, T, 1);        // A grava primeiro
  ok(a1.status === "saved" && a1.row.rev === 2, "5.1 aparelho A grava (rev 2)");
  const b1 = await save(U1, EX, 1, "texto do aparelho B (versão antiga)", null, T, 1);   // B ainda acha que é rev 1
  ok(b1.status === "conflict" && b1.row.rev === 2 && b1.row.draft === "texto do aparelho A", "5.2 aparelho B recebe CONFLITO com a versão mais nova do servidor (rev 2)");
  ok((await list(U1))[0].draft === "texto do aparelho A" && (await list(U1))[0].rev === 2, "5.3 o conflito NÃO sobrescreveu nada");
  const b2 = await save(U1, EX, 1, "B decidiu manter a sua versão", null, T, 2);   // depois de ver o conflito, B regrava informando a rev 2
  ok(b2.status === "saved" && b2.row.rev === 3, "5.4 depois de resolver, B grava com a rev atual (rev 3)");
  await del(U1, EX);
  const b3 = await save(U1, EX, 1, "B ainda acha que existe", null, T, 3);
  ok(b3.status === "conflict" && b3.row === null, "5.5 apagado em outro aparelho: conflito com row nulo (nada é recriado em silêncio)");
  const b4 = await save(U1, EX, 1, "B recria de propósito", null, T, 0);
  ok(b4.status === "saved" && b4.row.rev === 1, "5.6 B pode recriar de propósito (rev 0)");
  const c1 = await save(U1, EX, 1, "tenta de novo como se fosse nova", null, T, 0);
  ok(c1.status === "conflict" && c1.row.rev === 1, "5.7 gravar como 'nova' (rev 0) sobre linha existente é conflito");

  // ════════ 6. validação ════════
  const SECRET = "ZEBRA-QUE-NAO-PODE-VAZAR";
  const errs = [];
  const bad = async (p, re, name) => { try { await p; ok(false, `${name} (deveria falhar)`); } catch (e) { errs.push(String(e.message) + String(e.detail ?? "") + String(e.hint ?? "")); ok(re.test(String(e.message)), `${name} -> ${String(e.message).slice(0, 60)}`); } };
  await bad(save(U1, "exercicio-desconhecido", 1, SECRET, null, T, 0), /invalid_exercise/, "6.1 exercício desconhecido");
  await bad(save(U1, EX, 2, SECRET, null, T, 0), /invalid_exercise/, "6.2 versão desconhecida");
  await bad(save(U1, EX, null, SECRET, null, T, 0), /invalid_exercise/, "6.3 versão nula");
  await bad(save(U1, null, 1, SECRET, null, T, 0), /invalid_exercise/, "6.4 exercício nulo");
  await bad(save(U1, EX, 1, SECRET + "x".repeat(3001), null, T, 0), /text_too_long/, "6.5 texto inicial acima de 3000");
  await bad(save(U1, EX, 1, "ok", SECRET + "x".repeat(3001), T, 0), /text_too_long/, "6.6 revisão acima de 3000");
  ok((await save(U1, EX2, 1, "y".repeat(3000), "z".repeat(3000), T, 0)).status === "saved", "6.7 exatamente 3000 e 3000 caracteres são aceitos");
  await bad(save(U1, EX, 1, SECRET, null, [true, false], 0), /invalid_checks/, "6.8 marcações a menos");
  await bad(save(U1, EX, 1, SECRET, null, [true, false, true, true], 0), /invalid_checks/, "6.9 marcações a mais");
  await bad(save(U1, EX, 1, SECRET, null, null, 0), /invalid_checks/, "6.10 marcações nulas");
  await bad(as("authenticated", U1, "select public.study_practice_save_progress($1,1,$2,null,array[true,null,true]::boolean[],0)", [EX, SECRET]), /invalid_checks/, "6.11 marcação nula dentro da lista");
  await bad(save(U1, EX, 1, SECRET, null, T, -1), /invalid_revision/, "6.12 rev esperada negativa");
  await bad(save(U1, EX, 1, SECRET, null, T, null), /invalid_revision/, "6.13 rev esperada nula");
  ok(errs.every((e) => !e.includes(SECRET)), "6.14 nenhuma mensagem de erro repete o texto da aluna");
  await fails(owner("insert into public.study_practice_progress (user_id, exercise_id, exercise_version, checks) values ($1,'inexistente',1,'{t,f,t}')", [U1]), /violates foreign key/, "6.15 a tabela recusa exercício fora do catálogo (chave estrangeira)");
  await fails(owner("insert into public.study_practice_progress (user_id, exercise_id, exercise_version, draft, checks) values ($1,$2,1,$3,'{t,f,t}')", [U2, EX2, "w".repeat(3001)]), /check constraint/, "6.16 a tabela recusa texto > 3000 (restrição)");
  await fails(owner("delete from public.study_practice_exercises where exercise_id = $1", [EX2]), /violates foreign key/, "6.17 não dá para tirar do catálogo exercício com progresso gravado");

  // ════════ 7. ciclo de vida e ausência de efeitos colaterais ════════
  const before = (await owner("select (select count(*) from public.study_points_ledger)::int p, (select count(*) from public.study_attempts)::int a, (select count(*) from public.study_review_items)::int r")).rows[0];
  await save(U2, EX2, 1, "mais um texto", "rev", T, 0);
  const after = (await owner("select (select count(*) from public.study_points_ledger)::int p, (select count(*) from public.study_attempts)::int a, (select count(*) from public.study_review_items)::int r")).rows[0];
  ok(JSON.stringify(before) === JSON.stringify(after), "7.1 gravar progresso não gera pontos, tentativas nem itens de revisão");
  await owner("delete from auth.users where id = $1", [U2]);
  ok((await owner("select count(*)::int n from public.study_practice_progress where user_id=$1", [U2])).rows[0].n === 0, "7.2 apagar a conta apaga o progresso (cascata)");

  console.log(`[${label}] ${pass} verificações passaram, ${failures.length} falharam`);
  return failures.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  process.exitCode = (await run(db, "PGlite")) ? 1 : 0;
  await db.close();
}
