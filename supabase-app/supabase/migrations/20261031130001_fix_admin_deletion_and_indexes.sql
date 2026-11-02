-- =============================================================================
-- 0005: correção encontrada na homologação + trilha de auditoria + índices
--
-- DEFEITO (reproduzido no projeto de homologação, HTTP 500 ao apagar o usuário no Auth):
--   apagar a conta de um administrador que publicou questões falha, porque
--   created_by / reviewed_by têm ON DELETE SET NULL e esse UPDATE em cascata é recusado
--   (a) pelo trigger de imutabilidade e (b) pela constraint que exige reviewed_by NOT NULL.
--
-- CORREÇÃO, com a integridade e a rastreabilidade das questões publicadas em mente:
--   1. INTEGRIDADE — a exclusão da conta não pode ser bloqueada nem deixar a questão inválida:
--        * a constraint de publicação deixa de exigir reviewed_by; a validade da publicação passa a
--          depender de reviewed_at + published_at + atestado "sem paciente real", que NÃO mudam;
--        * created_by e reviewed_by de questão publicada só podem virar NULL por ação de chave
--          estrangeira (pg_trigger_depth() > 1), nunca por UPDATE direto;
--        * a publicação (draft/in_review -> published) continua exigindo reviewed_by preenchido.
--   2. RASTREABILIDADE — quem criou e quem revisou continua identificável de forma OPACA depois
--      que a conta some: duas colunas SEM chave estrangeira (created_by_ref, reviewed_by_ref)
--      guardam o UUID da conta. Um UUID de conta apagada não aponta para nenhuma pessoa (não há
--      mais linha em auth.users), mas permite agrupar "as questões revisadas pela mesma conta",
--      cruzar com logs de auditoria de época e provar que a revisão ocorreu. As colunas:
--        * são preenchidas só por trigger, a partir de created_by/reviewed_by (o cliente não
--          consegue gravar valor arbitrário, nem em INSERT);
--        * nunca são apagadas: se a conta some, o trigger preserva o valor anterior;
--        * são imutáveis em questão publicada/arquivada;
--        * não têm GRANT para anon/authenticated e não saem em nenhuma RPC do aluno.
--   3. ÍNDICES nas chaves estrangeiras apontadas pelo Performance Advisor e (user_id, question_id)
--      em respostas, usado pelo sorteio "inéditas primeiro".
--
-- Aplicar: depois de aprovada, vai para supabase/migrations/. Backfill: as colunas de referência
-- são preenchidas nas questões existentes por um UPDATE neutro ao final.
-- =============================================================================

-- ── 1. integridade ────────────────────────────────────────────────────────────
alter table public.study_questions drop constraint study_questions_publish_requirements;
alter table public.study_questions add constraint study_questions_publish_requirements check (
  status not in ('published', 'archived')
  or (no_real_patient_data_confirmed and reviewed_at is not null and published_at is not null)
);

-- ── 2. rastreabilidade: referências opacas, sem FK ────────────────────────────
alter table public.study_questions
  add column created_by_ref  uuid,
  add column reviewed_by_ref uuid;
comment on column public.study_questions.created_by_ref is
  'UUID opaco de quem criou, sem FK: sobrevive à exclusão da conta. Preenchido só por trigger; imutável após publicar.';
comment on column public.study_questions.reviewed_by_ref is
  'UUID opaco de quem revisou/publicou, sem FK: sobrevive à exclusão da conta. Preenchido só por trigger; imutável após publicar.';

create or replace function public.study_sync_audit_refs()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    -- nunca aceita valor do cliente: a referência é sempre derivada da conta
    new.created_by_ref  := new.created_by;
    new.reviewed_by_ref := new.reviewed_by;
  else
    -- conta presente: a referência acompanha; conta apagada (NULL): preserva a anterior
    if new.created_by  is not null then new.created_by_ref  := new.created_by;  else new.created_by_ref  := old.created_by_ref;  end if;
    if new.reviewed_by is not null then new.reviewed_by_ref := new.reviewed_by; else new.reviewed_by_ref := old.reviewed_by_ref; end if;
  end if;
  return new;
end;
$$;
-- ordem alfabética dos triggers BEFORE: guard (confere) -> sync_refs (deriva) -> touch
create trigger study_questions_sync_refs before insert or update on public.study_questions
  for each row execute function public.study_sync_audit_refs();
revoke execute on function public.study_sync_audit_refs() from public, anon, authenticated;

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
       or new.created_at is distinct from old.created_at
       or new.no_real_patient_data_confirmed is distinct from old.no_real_patient_data_confirmed
       or new.reviewed_at is distinct from old.reviewed_at
       or new.published_at is distinct from old.published_at
       or new.created_by_ref is distinct from old.created_by_ref
       or new.reviewed_by_ref is distinct from old.reviewed_by_ref then
      raise exception 'study: conteúdo e auditoria de questão publicada são imutáveis (arquive e crie nova versão).'
        using errcode = '23514';
    end if;
    -- autoria e revisão: só viram NULL, e só por ação de FK (apagar a conta do usuário)
    if (new.created_by is distinct from old.created_by and not (new.created_by is null and pg_trigger_depth() > 1))
       or (new.reviewed_by is distinct from old.reviewed_by and not (new.reviewed_by is null and pg_trigger_depth() > 1)) then
      raise exception 'study: autoria e revisão de questão publicada são imutáveis (só são anuladas ao apagar a conta).'
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
    if new.reviewed_by is null then
      raise exception 'study: publicar exige reviewed_by (quem revisou).' using errcode = '23514';
    end if;
  elsif new.status = 'archived' then
    raise exception 'study: só questão publicada pode ser arquivada.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- backfill das referências nas questões que já existem (UPDATE neutro: o guard não vê mudança,
-- o trigger sync_refs deriva as referências a partir de created_by/reviewed_by)
update public.study_questions set source_note = source_note;

-- ── 3. índices ────────────────────────────────────────────────────────────────
create index if not exists study_attempt_items_question_idx   on public.study_attempt_items (question_id);
create index if not exists study_attempts_subject_idx         on public.study_attempts (subject_id) where subject_id is not null;
create index if not exists study_points_ledger_question_idx   on public.study_points_ledger (question_id) where question_id is not null;
create index if not exists study_review_items_question_idx    on public.study_review_items (question_id);
create index if not exists study_questions_created_by_idx     on public.study_questions (created_by) where created_by is not null;
create index if not exists study_questions_reviewed_by_idx    on public.study_questions (reviewed_by) where reviewed_by is not null;
create index if not exists study_questions_supersedes_idx     on public.study_questions (supersedes_id) where supersedes_id is not null;
create index if not exists study_questions_reviewed_ref_idx   on public.study_questions (reviewed_by_ref) where reviewed_by_ref is not null;
create index if not exists study_answer_keys_option_idx       on public.study_answer_keys (option_id, question_id);
create index if not exists study_attempt_answers_option_idx   on public.study_attempt_answers (option_id, question_id);
create index if not exists study_attempt_answers_item_q_idx   on public.study_attempt_answers (item_id, question_id);
create index if not exists study_attempt_answers_user_q_idx   on public.study_attempt_answers (user_id, question_id);
