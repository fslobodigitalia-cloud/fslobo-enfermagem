-- =============================================================================
-- 0003: tentativas, respostas, pontos e revisão de erros
--
-- Nenhuma destas tabelas aceita escrita do navegador (sem INSERT/UPDATE/DELETE
-- para authenticated). O usuário só LÊ as próprias linhas (RLS por auth.uid()).
-- Pontos = soma do livro-razão study_points_ledger, escrito apenas por
-- study_complete_attempt() (0004). Não existe coluna de pontos no perfil.
-- =============================================================================

create table public.study_attempts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  mode           public.study_attempt_mode not null default 'practice',
  subject_id     uuid references public.study_subjects (id) on delete set null,
  status         public.study_attempt_status not null default 'in_progress',
  question_count smallint not null check (question_count between 1 and 20),
  correct_count  smallint check (correct_count is null or correct_count between 0 and 20),
  points_awarded integer  check (points_awarded is null or points_awarded >= 0),
  scoring_version smallint not null default 1,
  started_at     timestamptz not null default now(),
  -- última atividade (início ou resposta): base do prazo de retomada (study_settings.attempt_ttl_hours)
  last_activity_at timestamptz not null default now(),
  completed_at   timestamptz,
  constraint study_attempts_completed_consistency check (
    (status = 'completed') = (completed_at is not null and correct_count is not null and points_awarded is not null)
  )
);
-- Uma tentativa em andamento por usuário e modo (retomada em vez de duplicar).
create unique index study_attempts_one_open_per_mode
  on public.study_attempts (user_id, mode) where status = 'in_progress';
create index study_attempts_user_started_idx on public.study_attempts (user_id, started_at desc);
create index study_attempts_stale_idx on public.study_attempts (last_activity_at) where status = 'in_progress';

-- Questões da tentativa, escolhidas pelo SERVIDOR no início (o navegador não
-- escolhe nem troca questões).
create table public.study_attempt_items (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references public.study_attempts (id) on delete cascade,
  position    smallint not null check (position between 1 and 20),
  question_id uuid not null references public.study_questions (id) on delete restrict,
  unique (attempt_id, position),
  unique (attempt_id, question_id),
  unique (id, question_id)
);

-- Resposta única por item; is_correct calculado no servidor.
create table public.study_attempt_answers (
  item_id     uuid primary key,
  question_id uuid not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  option_id   uuid not null,
  is_correct  boolean not null,
  answered_at timestamptz not null default now(),
  foreign key (item_id, question_id)   references public.study_attempt_items (id, question_id) on delete cascade,
  foreign key (option_id, question_id) references public.study_question_options (id, question_id) on delete restrict
);
create index study_attempt_answers_user_idx on public.study_attempt_answers (user_id, answered_at desc);

-- Livro-razão de pontos: imutável por RPC (sem UPDATE/DELETE concedido).
--
-- Regra anti-acúmulo (pontuação competitiva):
--   * 'question_first_correct': 10 pontos na PRIMEIRA vez que o usuário acerta
--     cada questão, uma única vez na vida — repetir a mesma questão não pontua
--     (índice único parcial por usuário+questão). O teto de pontos de um usuário
--     é, portanto, finito: 10 x (nº de questões) + bônus.
--   * 'attempt_completion': bônus de 20 por tentativa pontuada completa, só se a
--     tentativa rendeu pelo menos 3 pontuações de questão novas (um por tentativa).
--   * Teto por usuário: 10 x Q + 20 x floor(Q/3), onde Q = nº de questões DISTINTAS
--     que ele chegou a acertar (<= questões já publicadas, inclusive as arquivadas
--     depois). O bônus exige >= 3 pontuações novas, logo há no máximo floor(Q/3) bônus.
--   * modo 'free' (treino livre) nunca escreve aqui.
create table public.study_points_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  attempt_id      uuid not null references public.study_attempts (id) on delete cascade,
  reason          text not null check (reason in ('question_first_correct', 'attempt_completion')),
  question_id     uuid references public.study_questions (id) on delete restrict,
  points          integer not null check (points > 0),
  scoring_version smallint not null default 1,
  created_at      timestamptz not null default now(),
  check ((reason = 'question_first_correct') = (question_id is not null))
);
create unique index study_points_first_correct_once
  on public.study_points_ledger (user_id, question_id) where reason = 'question_first_correct';
create unique index study_points_completion_once
  on public.study_points_ledger (attempt_id) where reason = 'attempt_completion';
create index study_points_ledger_user_idx on public.study_points_ledger (user_id);

-- Revisão de erros: uma linha por (usuário, questão errada).
create table public.study_review_items (
  user_id         uuid not null references auth.users (id) on delete cascade,
  question_id     uuid not null references public.study_questions (id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'resolved')),
  miss_count      integer not null default 1 check (miss_count >= 1),
  first_missed_at timestamptz not null default now(),
  last_missed_at  timestamptz not null default now(),
  resolved_at     timestamptz,
  primary key (user_id, question_id)
);
create index study_review_items_pending_idx on public.study_review_items (user_id) where status = 'pending';

-- ─────────────── histórico append-only ─────────────────────────────────────────
-- Respostas e pontos não são editados nem apagados diretamente por ninguém (nem
-- service_role). O DELETE em CASCATA (apagar a conta do aluno por LGPD, ou a
-- tentativa) continua funcionando: vem de dentro de um trigger de integridade
-- referencial, onde pg_trigger_depth() > 1.
create or replace function public.study_guard_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'study: % é append-only (UPDATE não permitido).', tg_table_name using errcode = '23514';
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() <= 1 then
    raise exception 'study: % é append-only (DELETE direto não permitido).', tg_table_name using errcode = '23514';
  end if;
  return old;
end;
$$;
create trigger study_answers_append_only before update or delete on public.study_attempt_answers
  for each row execute function public.study_guard_append_only();
create trigger study_ledger_append_only before update or delete on public.study_points_ledger
  for each row execute function public.study_guard_append_only();
create trigger study_answers_no_truncate before truncate on public.study_attempt_answers
  for each statement execute function public.study_block_truncate();
create trigger study_ledger_no_truncate before truncate on public.study_points_ledger
  for each statement execute function public.study_block_truncate();
create trigger study_items_no_truncate before truncate on public.study_attempt_items
  for each statement execute function public.study_block_truncate();
revoke execute on function public.study_guard_append_only() from public, anon, authenticated;

-- ─────────────────────────────── RLS e permissões ─────────────────────────────
alter table public.study_attempts        enable row level security;
alter table public.study_attempt_items   enable row level security;
alter table public.study_attempt_answers enable row level security;
alter table public.study_points_ledger   enable row level security;
alter table public.study_review_items    enable row level security;

revoke all on public.study_attempts, public.study_attempt_items, public.study_attempt_answers,
              public.study_points_ledger, public.study_review_items
  from public, anon, authenticated, service_role;

-- Só leitura das próprias linhas. Nenhuma coluna destas tabelas contém gabarito
-- ou texto de questão; is_correct de uma resposta já foi revelado ao aluno.
grant select on public.study_attempts, public.study_attempt_items, public.study_attempt_answers,
                public.study_points_ledger, public.study_review_items
  to authenticated;

create policy study_attempts_own_select on public.study_attempts
  for select to authenticated using (user_id = (select auth.uid()));
create policy study_attempt_items_own_select on public.study_attempt_items
  for select to authenticated using (
    exists (select 1 from public.study_attempts a
            where a.id = attempt_id and a.user_id = (select auth.uid())));
create policy study_attempt_answers_own_select on public.study_attempt_answers
  for select to authenticated using (user_id = (select auth.uid()));
create policy study_points_ledger_own_select on public.study_points_ledger
  for select to authenticated using (user_id = (select auth.uid()));
create policy study_review_items_own_select on public.study_review_items
  for select to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on
  public.study_attempts, public.study_attempt_items, public.study_attempt_answers,
  public.study_points_ledger, public.study_review_items
  to service_role;
