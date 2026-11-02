-- =============================================================================
-- 0002: banco de questões (conteúdo administrativo, NUNCA público)
--
-- Gabarito e explicação ficam em tabelas próprias, sem nenhum GRANT para
-- anon/authenticated: não existe coluna "is_correct" em lugar que um papel de
-- navegador consiga selecionar. O aluno só recebe o gabarito de um item
-- depois de respondê-lo (ver RPCs em 0004).
-- =============================================================================

create table public.study_questions (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.study_subjects (id) on delete restrict,
  stem        text not null check (char_length(btrim(stem)) between 10 and 2000),
  difficulty  smallint not null default 2 check (difficulty between 1 and 3),
  status      public.study_content_status not null default 'draft',
  -- Correção de questão publicada = arquivar e criar nova versão (o histórico
  -- dos alunos continua apontando para o texto que eles realmente viram).
  supersedes_id uuid references public.study_questions (id) on delete restrict,
  -- Campos administrativos (nunca retornados ao aluno):
  source_note text check (source_note is null or char_length(source_note) <= 500),
  no_real_patient_data_confirmed boolean not null default false,
  created_by  uuid references auth.users (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint study_questions_publish_requirements check (
    status not in ('published', 'archived')
    or (no_real_patient_data_confirmed and reviewed_by is not null and published_at is not null)
  )
);
comment on table public.study_questions is
  'Enunciados. Só entram em tentativas se status=published. Sem dados reais de paciente: a confirmação é exigida pela constraint de publicação.';
create index study_questions_subject_status_idx on public.study_questions (subject_id, status);

create table public.study_question_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.study_questions (id) on delete cascade,
  label       char(1) not null check (label in ('A', 'B', 'C', 'D', 'E')),
  body        text not null check (char_length(btrim(body)) between 1 and 600),
  unique (question_id, label),
  unique (id, question_id)          -- permite FK composta do gabarito e das respostas
);

create table public.study_answer_keys (
  question_id uuid primary key references public.study_questions (id) on delete cascade,
  option_id   uuid not null,
  foreign key (option_id, question_id)
    references public.study_question_options (id, question_id) on delete restrict
);
comment on table public.study_answer_keys is 'Gabarito. Sem GRANT para anon/authenticated.';

create table public.study_explanations (
  question_id uuid primary key references public.study_questions (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 10 and 4000)
);
comment on table public.study_explanations is 'Explicação. Sem GRANT para anon/authenticated.';

create trigger study_questions_touch before update on public.study_questions
  for each row execute function public.study_touch_updated_at();

-- ─────────────── congelamento do conteúdo publicado ───────────────────────────
-- Valem para QUALQUER papel (inclusive service_role e SQL direto), porque são
-- triggers e não RLS:
--  1. questão nasce como rascunho (INSERT já publicado é recusado);
--  2. só é publicada com 2 a 5 alternativas, gabarito e explicação (a RPC de
--     publicação dá mensagens melhores, mas a trava final é esta);
--  3. depois de publicada NENHUM campo de conteúdo nem de auditoria muda (id,
--     assunto, enunciado, dificuldade, versão anterior, autoria, revisão,
--     publicação, atestado de "sem paciente real"); o único movimento permitido
--     é published -> archived (e editar a anotação interna source_note);
--  4. alternativas, gabarito e explicação de questão publicada/arquivada não podem
--     ser inseridos, alterados, movidos para outra questão nem apagados — a checagem
--     trava a linha da questão (FOR SHARE), então não há corrida com a publicação;
--  5. TRUNCATE é bloqueado nas tabelas de conteúdo.
create or replace function public.study_guard_published_question()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_n integer;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'study: questão nova deve nascer como rascunho (status=draft).' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status in ('published', 'archived') then
      raise exception 'study: questão % já foi publicada e não pode ser apagada (arquive-a).', old.id
        using errcode = '23514';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status in ('published', 'archived') then
    if new.id is distinct from old.id
       or new.subject_id is distinct from old.subject_id
       or new.stem is distinct from old.stem
       or new.difficulty is distinct from old.difficulty
       or new.supersedes_id is distinct from old.supersedes_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.no_real_patient_data_confirmed is distinct from old.no_real_patient_data_confirmed
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
       or new.published_at is distinct from old.published_at then
      raise exception 'study: conteúdo e auditoria de questão publicada são imutáveis (arquive e crie nova versão).'
        using errcode = '23514';
    end if;
    if not (new.status = old.status or (old.status = 'published' and new.status = 'archived')) then
      raise exception 'study: transição de status inválida (% -> %).', old.status, new.status
        using errcode = '23514';
    end if;
    return new;
  end if;

  -- rascunho / em revisão
  if new.status = 'published' then
    select count(*) into v_n from public.study_question_options o where o.question_id = new.id;
    if v_n not between 2 and 5 then
      raise exception 'study: publicar exige de 2 a 5 alternativas (há %).', v_n using errcode = '23514';
    end if;
    if not exists (select 1 from public.study_answer_keys k where k.question_id = new.id) then
      raise exception 'study: publicar exige gabarito.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.study_explanations e where e.question_id = new.id) then
      raise exception 'study: publicar exige explicação.' using errcode = '23514';
    end if;
  elsif new.status = 'archived' then
    raise exception 'study: só questão publicada pode ser arquivada.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger study_questions_guard before insert or update or delete on public.study_questions
  for each row execute function public.study_guard_published_question();

create or replace function public.study_guard_published_children()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_old    uuid;
  v_new    uuid;
  v_status public.study_content_status;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := old.question_id; end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := new.question_id; end if;

  if tg_op = 'UPDATE' and v_new is distinct from v_old then
    raise exception 'study: alternativa, gabarito e explicação não podem ser movidos para outra questão.'
      using errcode = '23514';
  end if;

  -- FOR SHARE: conflita com o FOR UPDATE da publicação; quem chegar depois relê o status já publicado.
  select q.status into v_status from public.study_questions q
   where q.id = coalesce(v_new, v_old) for share;
  if v_status in ('published', 'archived') then
    raise exception 'study: alternativas, gabarito e explicação de questão publicada são imutáveis.'
      using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger study_options_guard before insert or update or delete on public.study_question_options
  for each row execute function public.study_guard_published_children();
create trigger study_keys_guard before insert or update or delete on public.study_answer_keys
  for each row execute function public.study_guard_published_children();
create trigger study_explanations_guard before insert or update or delete on public.study_explanations
  for each row execute function public.study_guard_published_children();

create or replace function public.study_block_truncate()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'study: TRUNCATE não é permitido em %.', tg_table_name using errcode = '23514';
end;
$$;
create trigger study_questions_no_truncate before truncate on public.study_questions
  for each statement execute function public.study_block_truncate();
create trigger study_options_no_truncate before truncate on public.study_question_options
  for each statement execute function public.study_block_truncate();
create trigger study_keys_no_truncate before truncate on public.study_answer_keys
  for each statement execute function public.study_block_truncate();
create trigger study_explanations_no_truncate before truncate on public.study_explanations
  for each statement execute function public.study_block_truncate();

-- ─────────────────────────────── RLS e permissões ─────────────────────────────
alter table public.study_questions        enable row level security;
alter table public.study_question_options enable row level security;
alter table public.study_answer_keys      enable row level security;
alter table public.study_explanations     enable row level security;

revoke all on public.study_questions, public.study_question_options,
              public.study_answer_keys, public.study_explanations
  from public, anon, authenticated, service_role;

-- Nenhuma política e nenhum GRANT para anon/authenticated: acesso só por RPC
-- (SECURITY DEFINER) e por service_role (edição administrativa).
grant select, insert, update, delete on
  public.study_questions, public.study_question_options,
  public.study_answer_keys, public.study_explanations
  to service_role;

revoke execute on function public.study_guard_published_question() from public, anon, authenticated;
revoke execute on function public.study_guard_published_children() from public, anon, authenticated;
revoke execute on function public.study_block_truncate() from public, anon, authenticated;
