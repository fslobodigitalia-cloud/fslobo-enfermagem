// Gera, a partir do Markdown editorial, o manifesto e o SQL de importação de RASCUNHOS do lote 01.
// NÃO conecta em banco nenhum. Uso:  node build.mjs <caminho-do-markdown> [--out <pasta>]
// Saídas (em --out; padrão: esta pasta): lote-01.manifest.json, lote-01.import.sql, lote-01.validate.sql
// Os TESTES não usam o lote real: geram um lote ARTIFICIAL com tests/fixtures/artificial-batch.mjs e --out em pasta temporária.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) throw new Error("informe o caminho do Markdown do lote");
const outArg = process.argv.indexOf("--out");
const outDir = outArg > 0 ? path.resolve(process.argv[outArg + 1] ?? "") : here;
if (outArg > 0 && !process.argv[outArg + 1]) throw new Error("--out exige uma pasta");
fs.mkdirSync(outDir, { recursive: true });
const raw = fs.readFileSync(src, "utf8");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

// ── mapeamento de assuntos (novo; nenhum assunto real existia na homologação) ────────
const SUBJECTS = [
  { slug: "politicas-saude-sus",            name: "Políticas de saúde e SUS",                       description: "Princípios e organização do SUS.", questions: [1] },
  { slug: "calculo-medicacao",              name: "Cálculo de medicação e gotejamento",             description: "Cálculo de doses, volumes e gotejamento.", questions: [2, 3] },
  { slug: "urgencia-emergencia",            name: "Urgência e emergência",                          description: "Suporte básico de vida, sepse, dor torácica e avaliação neurológica.", questions: [4, 9, 10, 13] },
  { slug: "feridas-curativos",              name: "Feridas e curativos",                            description: "Classificação de lesões e escolha de coberturas.", questions: [5, 25] },
  { slug: "saude-coletiva-vigilancia",      name: "Saúde coletiva, imunização e vigilância",        description: "Calendário vacinal, doenças transmissíveis e notificação compulsória.", questions: [6, 14, 21] },
  { slug: "etica-legislacao",               name: "Ética e legislação em saúde",                    description: "Código de Ética, normas do Cofen e legislação de saúde mental.", questions: [7, 17] },
  { slug: "fundamentos-sae-semiologia",     name: "Fundamentos, SAE e semiologia",                  description: "Processo de Enfermagem e sinais vitais.", questions: [8, 18] },
  { slug: "farmacologia-clinica",           name: "Farmacologia e cuidados clínicos",               description: "Administração de insulinas e manejo da hipoglicemia.", questions: [11, 19] },
  { slug: "saude-mulher-crianca",           name: "Saúde da mulher e da criança",                   description: "Pré-natal e triagem neonatal.", questions: [12, 20] },
  { slug: "seguranca-paciente-infeccao",    name: "Segurança do paciente e controle de infecção",   description: "Precauções, higiene das mãos, cirurgia segura e hemoterapia.", questions: [15, 16, 22, 23] },
  { slug: "administracao-enfermagem",       name: "Administração em enfermagem",                    description: "Liderança e gestão de equipes.", questions: [24] },
];
const subjOf = new Map(); SUBJECTS.forEach((s, i) => { s.position = (i + 1) * 10; s.questions.forEach((n) => subjOf.set(n, s.slug)); });

// ── leitura do Markdown ────────────────────────────────────────────────────────────────
const version = (raw.match(/Versão editorial proposta:\s*([0-9.]+)/) || [])[1] || "?";
const blocks = raw.split(/^### Questão (\d{2})\s*$/m);          // [pre, "01", corpo, "02", corpo, ...]
const qs = [];
for (let i = 1; i < blocks.length; i += 2) {
  const num = Number(blocks[i]);
  const body = blocks[i + 1].split(/^---\s*$/m)[0];
  const lines = body.split(/\r?\n/);
  const firstOpt = lines.findIndex((l) => /^A\) /.test(l));
  if (firstOpt < 0) throw new Error(`Q${num}: sem alternativa A`);
  const stem = lines.slice(0, firstOpt).join("\n").trim();
  const opts = {};
  for (const l of lines) { const m = l.match(/^([A-E])\) (.+)$/); if (m) opts[m[1]] = m[2].trim(); }
  const field = (label) => { const m = body.match(new RegExp("^\\*\\*" + label + ":\\*\\*\\s*(.+)$", "m")); return m ? m[1].trim() : null; };
  const refs = [...body.matchAll(/^- \[([^\]]+)\]\(([^)]+)\)\s*$/gm)].map((m) => ({ title: m[1], url: m[2] }));
  qs.push({ num, stem, opts, correct: field("Gabarito"), explanation: field("Explicação"), received_meta: field("Metadado recebido, origem não comprovada"), editorial_note: field("Nota editorial"), references: refs });
}

// ── validações do conteúdo (limites do esquema + regras do lote) ───────────────────────────
const problems = [];
const keyOf = (n) => `FSLOBO-L01-Q${String(n).padStart(2, "0")}`;
if (qs.length !== 25) problems.push(`esperadas 25 questões, achei ${qs.length}`);
qs.forEach((q, i) => { if (q.num !== i + 1) problems.push(`numeração fora de ordem em Q${q.num}`); });
const finalKey = (raw.match(/^01-[A-E][^\n]*$/m) || [""])[0].replace(/\.\s*$/, "").split(",").map((s) => s.trim()).filter(Boolean);
for (const q of qs) {
  const t = `Q${String(q.num).padStart(2, "0")}`;
  if (Object.keys(q.opts).sort().join("") !== "ABCDE") problems.push(`${t}: alternativas ${Object.keys(q.opts).join("")} (esperado A–E)`);
  if (!/^[A-E]$/.test(q.correct || "")) problems.push(`${t}: gabarito inválido`);
  if (finalKey[q.num - 1] !== `${String(q.num).padStart(2, "0")}-${q.correct}`) problems.push(`${t}: gabarito do bloco (${q.correct}) difere da lista final (${finalKey[q.num - 1]})`);
  if (!(q.stem.length >= 10 && q.stem.length <= 2000)) problems.push(`${t}: enunciado fora de 10–2000 (${q.stem.length})`);
  for (const [l, b] of Object.entries(q.opts)) if (!(b.length >= 1 && b.length <= 600)) problems.push(`${t}: alternativa ${l} fora de 1–600`);
  if (!q.explanation || q.explanation.length < 10 || q.explanation.length > 4000) problems.push(`${t}: explicação fora de 10–4000`);
  if (new Set(Object.values(q.opts)).size !== 5) problems.push(`${t}: alternativas repetidas`);
  if (!subjOf.has(q.num)) problems.push(`${t}: sem assunto mapeado`);
}
for (const s of SUBJECTS) { if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.slug) || s.name.length < 2 || s.name.length > 80 || s.description.length > 300) problems.push(`assunto inválido: ${s.slug}`); }
if (problems.length) { console.error("PROBLEMAS:\n - " + problems.join("\n - ")); process.exit(1); }

// ── manifesto ──────────────────────────────────────────────────────────────────────────────
const items = qs.map((q) => {
  const hash = sha(JSON.stringify({ stem: q.stem, opts: q.opts, correct: q.correct, explanation: q.explanation })).slice(0, 12);
  const source_note = `${keyOf(q.num)} | v${version} | h:${hash} | rascunho do lote 01; origem e direito de uso a confirmar pelo responsável`;
  return { number: q.num, key: keyOf(q.num), subject_slug: subjOf.get(q.num), content_hash: hash, source_note, difficulty: 2, correct: q.correct, option_lengths: Object.fromEntries(Object.entries(q.opts).map(([k, v]) => [k, v.length])), stem_length: q.stem.length, explanation_length: q.explanation.length, references: q.references, received_meta_not_for_students: q.received_meta, editorial_note: q.editorial_note };
});
const manifest = {
  batch: "lote-01", editorial_version: version, source_file: path.basename(src), source_sha256: sha(raw),
  status: "draft — não publicado, sem revisão clínica, sem confirmação de origem/direitos",
  expected_counts: { subjects_new: SUBJECTS.length, questions: 25, options: 125, answer_keys: 25, explanations: 25 },
  subjects: SUBJECTS.map(({ slug, name, description, position, questions }) => ({ slug, name, description, position, active_on_import: false, questions })),
  pending_before_publication: [
    "Revisão clínica/editorial por responsável habilitado (nada neste lote foi validado clinicamente)",
    "Confirmar origem e direito de uso do conteúdo",
    "Q03: apenas conferência aritmética; indicação e dose não foram validadas",
    "Q24: referência bibliográfica de administração ainda pendente",
    "Q21: reconferir a lista nacional de notificação vigente antes de publicar",
    "Rótulos 'Estilo IBFC/FGV…' são metadado do original e não devem ser mostrados ao aluno como origem",
    "Atestado 'sem dados reais de paciente' (no_real_patient_data_confirmed) fica FALSE até o responsável confirmar",
    "Dificuldade não veio no lote: gravada como 2 (padrão); ajustar na revisão se desejado",
    "Assuntos novos entram INATIVOS; ativar junto com a publicação",
  ],
  questions: items,
};
fs.writeFileSync(path.join(outDir, "lote-01.manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

// ── SQL (importação e validação compartilham a MESMA consulta de divergências) ─────────────────────
const dq = (s) => { for (let n = 0; ; n++) { const tag = `$t${n}$`; if (!s.includes(tag)) return tag + s + tag; } };
const subjRows = SUBJECTS.map((s) => `  (${dq(s.slug)}, ${dq(s.name)}, ${dq(s.description)}, ${s.position})`).join(",\n");
const qRows = qs.map((q, i) => `  (${q.num}, ${dq(items[i].key)}, ${dq(items[i].subject_slug)}, ${dq(q.stem)}, ${dq(items[i].source_note)}, ${dq(q.correct)}, ${dq(q.explanation)}, ${dq(q.opts.A)}, ${dq(q.opts.B)}, ${dq(q.opts.C)}, ${dq(q.opts.D)}, ${dq(q.opts.E)})`).join(",\n");
const QCOLS = "num, key, slug, stem, source_note, correct, expl, a, b, c, d, e";

// Precisa das relações b (conteúdo esperado) e sb (assuntos esperados). Produz o CTE d(key, campo):
// uma linha por divergência. Vazio = o banco tem EXATAMENTE as chaves Q01–Q25 com o conteúdo integral esperado.
const DIFF_CTES = `exp as (select * from b),
act as (
  select split_part(q.source_note, ' |', 1) as key, q.*
    from public.study_questions q
   where q.source_note like 'FSLOBO-L01-%'
),
d as (
  select e.key, 'ausente'::text as campo from exp e where not exists (select 1 from act a where a.key = e.key)
  union all select a.key, 'extra (chave fora de Q01-Q25)' from act a where not exists (select 1 from exp e where e.key = a.key)
  union all select key, 'duplicada' from act group by key having count(*) > 1
  union all
  select e.key, c.campo
    from exp e
    join act a on a.key = e.key
   cross join lateral (values
     ('enunciado',                    a.stem is distinct from e.stem),
     ('metadados (source_note)',      a.source_note is distinct from e.source_note),
     ('dificuldade',                  a.difficulty is distinct from 2),
     ('status',                       a.status::text is distinct from 'draft'),
     ('assunto',                      (select s.slug from public.study_subjects s where s.id = a.subject_id) is distinct from e.slug),
     ('revisão/publicação/atestado',  a.reviewed_by is not null or a.reviewed_at is not null or a.published_at is not null or a.no_real_patient_data_confirmed),
     ('autoria/versão anterior',      a.created_by is not null or a.supersedes_id is not null),
     ('gabarito',                     (select o.label::text from public.study_answer_keys k join public.study_question_options o on o.id = k.option_id where k.question_id = a.id) is distinct from e.correct::text),
     ('explicação',                   (select x.body from public.study_explanations x where x.question_id = a.id) is distinct from e.expl),
     ('número de alternativas',       (select count(*) from public.study_question_options x where x.question_id = a.id) <> 5)
   ) as c(campo, diverge)
   where c.diverge
  union all
  select e.key, 'alternativa ' || o.l
    from exp e
    join act a on a.key = e.key
   cross join lateral (values ('A', e.a), ('B', e.b), ('C', e.c), ('D', e.d), ('E', e.e)) as o(l, t)
   where not exists (select 1 from public.study_question_options x where x.question_id = a.id and x.label = o.l and x.body = o.t)
  union all
  select 'assunto:' || v.slug, 'ausente' from sb v where not exists (select 1 from public.study_subjects s where s.slug = v.slug)
  union all
  select 'assunto:' || v.slug, 'nome ou descrição divergente'
    from sb v join public.study_subjects s on s.slug = v.slug
   where s.name is distinct from v.name or s.description is distinct from v.description
)`;

const importSql = `-- =============================================================================
-- Lote 01 — importação de 25 RASCUNHOS (status = draft). Gerado por build.mjs a partir de
-- ${path.basename(src)} (sha256 ${manifest.source_sha256.slice(0, 16)}…), versão editorial ${version}.
-- NÃO é migration e NÃO fica em supabase/migrations. Só homologação (pmmxjohixttivxbmdnhp).
--
--  * nada é publicado: status fica 'draft'; reviewed_by/reviewed_at/published_at ficam NULL;
--    no_real_patient_data_confirmed fica FALSE; created_by fica NULL (nenhuma conta é promovida a admin);
--  * identidade estável: chave FSLOBO-L01-Qnn no início de source_note (campo administrativo já existente);
--  * ANTES DO COMMIT o banco é comparado, campo a campo, com o conteúdo esperado (o do próprio arquivo):
--    chaves exatamente Q01–Q25 (sem faltante, extra ou duplicada) e, para cada uma, enunciado, as 5 alternativas,
--    gabarito, explicação, assunto, dificuldade, status, metadados e campos de revisão. Qualquer divergência
--    — inclusive de chave que já existia — levanta exceção: a transação NÃO é confirmada e nada é gravado.
--    Conteúdo existente nunca é sobrescrito nem aceito em silêncio;
--  * idempotente: com tudo igual, rodar de novo insere 0 linhas;
--  * assuntos novos entram INATIVOS (active = false): ativar só junto com a publicação.
-- Quem executa deve dar ROLLBACK se a sessão ficar em transação abortada (o apply.mjs faz isso).
-- Nenhuma permissão (GRANT/POLICY) é criada ou alterada.
-- =============================================================================
begin;
select pg_advisory_xact_lock(hashtextextended('fslobo-import-lote-01', 0));

-- 0) conteúdo esperado em tabelas temporárias
create temporary table _s01 (slug text primary key, name text not null, description text not null, position int not null) on commit drop;
insert into _s01 values
${subjRows};

create temporary table _l01 (
  num int primary key, key text not null unique, slug text not null, stem text not null, source_note text not null,
  correct char(1) not null, expl text not null, a text not null, b text not null, c text not null, d text not null, e text not null
) on commit drop;
insert into _l01 values
${qRows};

-- 1) assuntos (11 novos, inativos; slug já existente é reaproveitado, mas conferido no passo 4)
insert into public.study_subjects (slug, name, description, position, active)
select slug, name, description, position, false from _s01
on conflict (slug) do nothing;

-- 2) questões (só as cuja chave ainda não existe)
insert into public.study_questions (subject_id, stem, difficulty, status, source_note, no_real_patient_data_confirmed)
select s.id, b.stem, 2, 'draft', b.source_note, false
  from _l01 b
  join public.study_subjects s on s.slug = b.slug
 where not exists (select 1 from public.study_questions q where q.source_note like b.key || ' |%')
 order by b.num;

-- 3) alternativas, gabarito e explicação: só das questões do lote que ainda não os têm
insert into public.study_question_options (question_id, label, body)
select q.id, o.label, o.body
  from _l01 b
  join public.study_questions q on q.source_note like b.key || ' |%'
  cross join lateral (values ('A', b.a), ('B', b.b), ('C', b.c), ('D', b.d), ('E', b.e)) as o(label, body)
 where not exists (select 1 from public.study_question_options x where x.question_id = q.id);

insert into public.study_answer_keys (question_id, option_id)
select q.id, o.id
  from _l01 b
  join public.study_questions q on q.source_note like b.key || ' |%'
  join public.study_question_options o on o.question_id = q.id and o.label = b.correct
 where not exists (select 1 from public.study_answer_keys k where k.question_id = q.id);

insert into public.study_explanations (question_id, body)
select q.id, b.expl
  from _l01 b
  join public.study_questions q on q.source_note like b.key || ' |%'
 where not exists (select 1 from public.study_explanations e where e.question_id = q.id);

-- 4) conferência INTEGRAL do conteúdo (chaves exatas + todos os campos) antes do COMMIT
do $chk$
declare v text;
begin
  with b as (select * from _l01), sb as (select * from _s01),
${DIFF_CTES}
  select string_agg(key || ' [' || campo || ']', '; ' order by key, campo) into v from d;
  if v is not null then
    raise exception 'lote 01 ABORTADO antes do COMMIT: chave ausente/extra/duplicada ou conteúdo divergente do esperado -> %. Nada foi gravado (ROLLBACK) e nenhum conteúdo existente foi sobrescrito.', v using errcode = '23514';
  end if;
end
$chk$;
-- 5) conferência de contagens (rede de segurança; a comparação integral acima já aponta a chave)
do $cnt$
declare n_q int; n_o int; n_k int; n_e int;
begin
  select count(*) into n_q from public.study_questions where source_note like 'FSLOBO-L01-%';
  select count(*) into n_o from public.study_question_options o join public.study_questions q on q.id = o.question_id where q.source_note like 'FSLOBO-L01-%';
  select count(*) into n_k from public.study_answer_keys k join public.study_questions q on q.id = k.question_id where q.source_note like 'FSLOBO-L01-%';
  select count(*) into n_e from public.study_explanations e join public.study_questions q on q.id = e.question_id where q.source_note like 'FSLOBO-L01-%';
  if n_q <> 25 or n_o <> 125 or n_k <> 25 or n_e <> 25 then
    raise exception 'lote 01 ABORTADO antes do COMMIT: contagens inesperadas (questões %, alternativas %, gabaritos %, explicações %). Nada foi gravado.', n_q, n_o, n_k, n_e using errcode = '23514';
  end if;
end
$cnt$;

commit;
`;
fs.writeFileSync(path.join(outDir, "lote-01.import.sql"), importSql);

// ── validação SOMENTE LEITURA: conteúdo integral, sem confiar no hash de source_note ─────────────────
const validateSql = `-- Validação do lote 01 (SOMENTE LEITURA). Compara o banco com o conteúdo integral esperado
-- (o mesmo que o importador usa), campo a campo; não depende do hash gravado em source_note.
-- Cada linha deve ter ok = true. 'valor' lista as divergências, se houver.
with b as (select * from (values
${qRows}
  ) as v(${QCOLS})),
sb as (select * from (values
${subjRows}
  ) as v(slug, name, description, position)),
${DIFF_CTES}
select 'chaves exatas Q01–Q25 (sem faltantes, extras ou duplicadas)' as check,
       not exists (select 1 from d where campo in ('ausente', 'duplicada') or campo like 'extra%') as ok,
       coalesce((select string_agg(key || ' [' || campo || ']', '; ' order by key) from d where campo in ('ausente', 'duplicada') or campo like 'extra%'), '') as valor
union all select 'conteúdo integral confere (enunciado, 5 alternativas, gabarito, explicação, assunto, dificuldade, metadados, estado de rascunho)',
       not exists (select 1 from d), coalesce((select string_agg(key || ' [' || campo || ']', '; ' order by key, campo) from d), '')
union all select 'questões do lote = 25', (select count(*) from act) = 25, (select count(*) from act)::text
union all select 'alternativas = 125', (select count(*) from public.study_question_options o join act on act.id = o.question_id) = 125, (select count(*) from public.study_question_options o join act on act.id = o.question_id)::text
union all select 'gabaritos = 25', (select count(*) from public.study_answer_keys k join act on act.id = k.question_id) = 25, (select count(*) from public.study_answer_keys k join act on act.id = k.question_id)::text
union all select 'explicações = 25', (select count(*) from public.study_explanations e join act on act.id = e.question_id) = 25, (select count(*) from public.study_explanations e join act on act.id = e.question_id)::text
union all select '11 assuntos do lote existem e estão inativos (verificação de pré-publicação)',
       (select count(*) from public.study_subjects where slug in (select slug from sb)) = 11 and not exists (select 1 from public.study_subjects where slug in (select slug from sb) and active),
       (select count(*) from public.study_subjects where slug in (select slug from sb))::text
union all select 'nada visível ao aluno (publicadas em assuntos ativos = 0)',
       (select count(*) from public.study_questions q2 join public.study_subjects s on s.id = q2.subject_id where q2.status = 'published' and s.active) = 0,
       (select count(*) from public.study_questions q2 join public.study_subjects s on s.id = q2.subject_id where q2.status = 'published' and s.active)::text;
`;
fs.writeFileSync(path.join(outDir, "lote-01.validate.sql"), validateSql);
console.log(JSON.stringify({ version, questions: qs.length, options: qs.length * 5, subjects: SUBJECTS.length, finalKey: finalKey.length, sha: manifest.source_sha256.slice(0, 16) }));
