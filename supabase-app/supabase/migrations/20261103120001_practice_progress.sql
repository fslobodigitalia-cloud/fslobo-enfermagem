-- =============================================================================
-- 0009: persistência da PRÁTICA (anotação e evolução) na conta do aluno.
--
-- O que guarda, por aluno, exercício e versão do exercício: o texto inicial, a versão revisada e as marcações da
-- autoavaliação. NÃO guarda nota, pontos, ranking, correção nem texto de IA. Nada disto entra em pontuação.
--
-- Segurança (mesmo padrão das migrations 0001-0008):
--   * as tabelas NÃO têm nenhum GRANT (nem para authenticated, nem para service_role): só as 3 RPCs abaixo leem e gravam;
--   * toda RPC é SECURITY DEFINER com search_path fixo e usa SEMPRE auth.uid(): o navegador nunca informa user_id;
--   * EXECUTE só para authenticated (nem anon, nem service_role): não há leitura administrativa das redações;
--   * RLS ligado + políticas "só a própria linha" (defesa em profundidade: se algum dia houver GRANT na tabela, a política já restringe);
--   * os exercícios e as versões aceitos ficam em study_practice_exercises (conferidos a cada gravação);
--   * limites: texto inicial e revisão <= 3000 caracteres; nº de marcações = o do exercício; linhas por aluno limitadas pelo catálogo;
--   * mensagens de erro curtas e fixas (invalid_exercise, text_too_long, invalid_checks, invalid_revision, not_authenticated):
--     nunca repetem o texto do aluno.
--
-- Concorrência entre aparelhos: cada linha tem "rev" (número da versão gravada). A gravação envia a rev que o aparelho
-- conhece (p_expected_rev; 0 = nunca gravou). Se a rev do servidor for diferente, NADA é gravado e a RPC devolve
-- status = 'conflict' com a linha atual do servidor (ou row = null se foi apagada em outro aparelho). Se o conteúdo
-- enviado for idêntico ao do servidor, devolve 'saved' sem alterar (repetir uma gravação cuja resposta se perdeu não gera conflito falso).
-- Para exercício novo, vale uma única gravação por vez (trava consultiva por usuário/exercício/versão).
-- =============================================================================

-- ─────────────────────────────── catálogo de exercícios aceitos ───────────────────────────────
create table public.study_practice_exercises (
  exercise_id text     not null check (exercise_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(exercise_id) <= 60),
  version     integer  not null check (version >= 1),
  check_count smallint not null check (check_count between 1 and 10),
  primary key (exercise_id, version)
);
comment on table public.study_practice_exercises is
  'Exercícios da Prática e versões aceitos para gravação. Novo exercício ou nova versão = nova migration. Sem GRANT: só as RPCs leem.';

insert into public.study_practice_exercises (exercise_id, version, check_count) values
  ('anotacao-dispneia-noite',        1, 3),
  ('anotacao-curativo-umido',        1, 3),
  ('evolucao-posoperatorio-3dias',   1, 3);

-- ─────────────────────────────── progresso do aluno ───────────────────────────────
create table public.study_practice_progress (
  user_id          uuid        not null references auth.users (id) on delete cascade,
  exercise_id      text        not null,
  exercise_version integer     not null,
  draft            text        not null default '' check (char_length(draft) <= 3000),
  revision         text        check (revision is null or char_length(revision) <= 3000),
  checks           boolean[]   not null check (array_ndims(checks) = 1 and cardinality(checks) between 1 and 10 and array_position(checks, null) is null),
  rev              integer     not null default 1 check (rev >= 1),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, exercise_id, exercise_version),
  foreign key (exercise_id, exercise_version) references public.study_practice_exercises (exercise_id, version)
);
comment on table public.study_practice_progress is
  'Texto inicial, revisão e autoavaliação do aluno por exercício/versão. Sem nota, pontos ou ranking. Sem GRANT: só study_practice_* leem e gravam, sempre por auth.uid().';

create trigger study_practice_progress_touch before update on public.study_practice_progress
  for each row execute function public.study_touch_updated_at();

alter table public.study_practice_exercises enable row level security;
alter table public.study_practice_progress  enable row level security;

revoke all on public.study_practice_exercises from public, anon, authenticated, service_role;
revoke all on public.study_practice_progress  from public, anon, authenticated, service_role;

-- defesa em profundidade (sem GRANT estas políticas ficam inertes): cada um só enxerga e altera a PRÓPRIA linha
create policy study_practice_progress_own_select on public.study_practice_progress for select to authenticated using (user_id = auth.uid());
create policy study_practice_progress_own_insert on public.study_practice_progress for insert to authenticated with check (user_id = auth.uid());
create policy study_practice_progress_own_update on public.study_practice_progress for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy study_practice_progress_own_delete on public.study_practice_progress for delete to authenticated using (user_id = auth.uid());

-- ─────────────────────────────── interno: linha -> json ───────────────────────────────
create or replace function public.study__practice_row_json(p public.study_practice_progress)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'exercise_id', p.exercise_id,
    'exercise_version', p.exercise_version,
    'draft', p.draft,
    'revision', p.revision,
    'checks', to_jsonb(p.checks),
    'rev', p.rev,
    'updated_at', p.updated_at
  )
$$;

-- ─────────────────────────────── RPC: ler o próprio progresso ───────────────────────────────
create or replace function public.study_practice_list_my_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return coalesce(
    (select jsonb_agg(public.study__practice_row_json(p) order by p.exercise_id, p.exercise_version)
       from public.study_practice_progress p
      where p.user_id = v_uid),
    '[]'::jsonb);
end
$$;

-- ─────────────────────────────── RPC: gravar (com controle de conflito) ───────────────────────────────
create or replace function public.study_practice_save_progress(
  p_exercise_id      text,
  p_exercise_version integer,
  p_draft            text,
  p_revision         text,
  p_checks           boolean[],
  p_expected_rev     integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_cc    smallint;
  v_draft text := coalesce(p_draft, '');
  v_row   public.study_practice_progress;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  if p_exercise_id is null or p_exercise_version is null then raise exception 'invalid_exercise' using errcode = '22023'; end if;
  select e.check_count into v_cc from public.study_practice_exercises e
   where e.exercise_id = p_exercise_id and e.version = p_exercise_version;
  if not found then raise exception 'invalid_exercise' using errcode = '22023'; end if;

  if char_length(v_draft) > 3000 or (p_revision is not null and char_length(p_revision) > 3000) then
    raise exception 'text_too_long' using errcode = '22001';
  end if;
  if p_checks is null or array_ndims(p_checks) is distinct from 1 or cardinality(p_checks) <> v_cc or array_position(p_checks, null) is not null then
    raise exception 'invalid_checks' using errcode = '22023';
  end if;
  if p_expected_rev is null or p_expected_rev < 0 then raise exception 'invalid_revision' using errcode = '22023'; end if;

  -- uma gravação por vez para este aluno/exercício/versão (também cobre a primeira gravação simultânea de dois aparelhos)
  perform pg_advisory_xact_lock(hashtextextended('study_practice:' || v_uid::text || ':' || p_exercise_id || ':' || p_exercise_version::text, 0));

  select * into v_row from public.study_practice_progress p
   where p.user_id = v_uid and p.exercise_id = p_exercise_id and p.exercise_version = p_exercise_version
   for update;

  if not found then
    if p_expected_rev <> 0 then
      -- o aparelho achava que já existia gravação, mas ela foi apagada em outro aparelho
      return jsonb_build_object('status', 'conflict', 'row', null);
    end if;
    insert into public.study_practice_progress (user_id, exercise_id, exercise_version, draft, revision, checks)
    values (v_uid, p_exercise_id, p_exercise_version, v_draft, p_revision, p_checks)
    returning * into v_row;
    return jsonb_build_object('status', 'saved', 'row', public.study__practice_row_json(v_row));
  end if;

  -- conteúdo idêntico ao do servidor: nada a gravar (repetição segura de uma gravação cuja resposta se perdeu)
  if v_row.draft = v_draft and v_row.revision is not distinct from p_revision and v_row.checks = p_checks then
    return jsonb_build_object('status', 'saved', 'row', public.study__practice_row_json(v_row));
  end if;

  if p_expected_rev <> v_row.rev then
    return jsonb_build_object('status', 'conflict', 'row', public.study__practice_row_json(v_row));
  end if;

  update public.study_practice_progress p
     set draft = v_draft, revision = p_revision, checks = p_checks, rev = p.rev + 1
   where p.user_id = v_uid and p.exercise_id = p_exercise_id and p.exercise_version = p_exercise_version
   returning * into v_row;
  return jsonb_build_object('status', 'saved', 'row', public.study__practice_row_json(v_row));
end
$$;

-- ─────────────────────────────── RPC: apagar o próprio progresso de um exercício ───────────────────────────────
create or replace function public.study_practice_delete_progress(p_exercise_id text)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_n   integer;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_exercise_id is null or char_length(p_exercise_id) > 60 then raise exception 'invalid_exercise' using errcode = '22023'; end if;
  delete from public.study_practice_progress p where p.user_id = v_uid and p.exercise_id = p_exercise_id;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- ─────────────────────────────── permissões das funções ───────────────────────────────
revoke all on function public.study__practice_row_json(public.study_practice_progress) from public, anon, authenticated, service_role;
revoke all on function public.study_practice_list_my_progress()                          from public, anon, authenticated, service_role;
revoke all on function public.study_practice_save_progress(text, integer, text, text, boolean[], integer) from public, anon, authenticated, service_role;
revoke all on function public.study_practice_delete_progress(text)                       from public, anon, authenticated, service_role;
grant execute on function public.study_practice_list_my_progress()                          to authenticated;
grant execute on function public.study_practice_save_progress(text, integer, text, text, boolean[], integer) to authenticated;
grant execute on function public.study_practice_delete_progress(text)                       to authenticated;
