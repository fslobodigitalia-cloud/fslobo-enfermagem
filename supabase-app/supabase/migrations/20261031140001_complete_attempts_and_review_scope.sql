-- =============================================================================
-- 0006 (PROPOSTA — NÃO APLICADA): "treino completo" e escopo da revisão
--
-- Corrige dois pontos da revisão externa SEM reescrever as migrations já aplicadas
-- (só substitui, com CREATE OR REPLACE, quatro funções; nenhuma tabela, índice ou
-- permissão muda):
--
-- 1. TREINO COMPLETO. Antes, study_complete_attempt() concluía qualquer tentativa em
--    andamento, mesmo vazia ou com parte das questões, e as métricas contavam todo
--    "completed". Agora:
--      * só conclui quem respondeu TODAS as questões; senão levanta attempt_incomplete
--        (ou attempt_expired, se a tentativa também está vencida);
--      * attempts_completed e week_completed contam só tentativas concluídas COM todas as
--        questões respondidas (inclui linhas antigas: uma conclusão parcial já gravada
--        deixa de contar, sem ser apagada);
--      * tentativa parcial pode ser retomada, encerrada sem concluir (abandoned) ou expirar:
--        em nenhum caso conta como treino nem preenche a meta semanal, e não pontua
--        (pontos só entram ao concluir; regra de pontuação inalterada).
--
-- 2. REVISÃO. Antes, a revisão aceitava questões arquivadas e não olhava o assunto. Agora
--    "elegível para revisar" = erro pendente de questão PUBLICADA em assunto ATIVO, e esse
--    mesmo critério vale para: nova tentativa de revisão, contagem pending_review e lista
--    study_list_my_review_items. O histórico é preservado: study_review_items não é tocada
--    (se a questão volta a ser publicada/o assunto reativado, o erro volta a ser elegível),
--    as respostas e tentativas antigas continuam legíveis com gabarito e explicação, e uma
--    tentativa de revisão JÁ ABERTA continua de onde parou.
-- =============================================================================

-- respostas dadas numa tentativa (uso interno; não executável pelo navegador)
create or replace function public.study__answered_count(p_attempt_id uuid)
returns integer
language sql
stable
set search_path = pg_catalog, public
as $$
  select count(*)::integer
    from public.study_attempt_answers x
    join public.study_attempt_items i on i.id = x.item_id
   where i.attempt_id = p_attempt_id;
$$;
revoke execute on function public.study__answered_count(uuid) from public, anon, authenticated;

create or replace function public.study_start_attempt(
  p_subject_slug   text default null,
  p_mode           public.study_attempt_mode default 'practice',
  p_question_count integer default 5
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_subject uuid;
  v_open    public.study_attempts;
  v_ids     uuid[];
  v_attempt uuid;
  v_tz      constant text := 'America/Sao_Paulo';
  v_day     timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
  v_ttl     interval := make_interval(hours => public.study__setting('attempt_ttl_hours', 168));
  v_a_limit integer := public.study__setting('daily_attempts_limit', 20);
  v_q_limit integer := public.study__setting('daily_questions_limit', 200);
  v_a_today integer;
  v_q_today integer;
  v_count   integer;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_question_count is null or p_question_count not between 1 and 20 then
    raise exception 'invalid_question_count' using errcode = '22023';
  end if;
  if not exists (select 1 from public.study_profiles where user_id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;

  -- serializa cliques duplos / duas abas do mesmo usuário (todas as checagens abaixo)
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('study_start:' || v_uid::text, 0));

  select * into v_open from public.study_attempts a
   where a.user_id = v_uid and a.mode = p_mode and a.status = 'in_progress';
  if found then
    if v_open.last_activity_at >= now() - v_ttl then
      return public.study__attempt_payload(v_open.id);           -- retoma (dentro do prazo)
    end if;
    perform public.study__expire_attempt_row(v_open.id);          -- parada além do prazo: conclui ou expira
  end if;

  select count(*)::integer into v_a_today from public.study_attempts a
   where a.user_id = v_uid and a.started_at >= v_day;
  if v_a_today >= v_a_limit then
    raise exception 'daily_limit_reached' using errcode = 'P0001', detail = 'attempts';
  end if;

  select count(*)::integer into v_q_today
    from public.study_attempt_items i
    join public.study_attempts a on a.id = i.attempt_id
   where a.user_id = v_uid and a.started_at >= v_day;
  v_count := least(p_question_count, v_q_limit - v_q_today);
  if v_count <= 0 then
    raise exception 'daily_limit_reached' using errcode = 'P0001', detail = 'questions';
  end if;

  if p_subject_slug is not null then
    select s.id into v_subject from public.study_subjects s where s.slug = p_subject_slug and s.active;
    if not found then raise exception 'subject_not_found' using errcode = 'P0002'; end if;
  end if;

  if p_mode = 'free' then
    -- treino livre: qualquer questão publicada, inclusive as já respondidas
    select array_agg(x.id order by x.rn) into v_ids
      from (
        select q.id, row_number() over (order by random()) as rn
          from public.study_questions q
          join public.study_subjects s on s.id = q.subject_id and s.active
         where q.status = 'published'
           and (v_subject is null or q.subject_id = v_subject)
         order by rn
         limit v_count
      ) x;
  elsif p_mode = 'practice' then
    select array_agg(x.id order by x.rn) into v_ids
      from (
        select q.id,
               row_number() over (
                 order by exists (select 1 from public.study_attempt_answers a
                                   where a.user_id = v_uid and a.question_id = q.id),   -- inéditas para o aluno primeiro
                          random()) as rn
          from public.study_questions q
          join public.study_subjects s on s.id = q.subject_id and s.active
         where q.status = 'published'
           and (v_subject is null or q.subject_id = v_subject)
         order by rn
         limit v_count
      ) x;
  else
    select array_agg(x.id order by x.rn) into v_ids
      from (
        select q.id, row_number() over (order by r.last_missed_at) as rn
          from public.study_review_items r
          join public.study_questions q on q.id = r.question_id and q.status = 'published'
          join public.study_subjects s on s.id = q.subject_id and s.active
         where r.user_id = v_uid and r.status = 'pending'
           and (v_subject is null or q.subject_id = v_subject)
         order by rn
         limit v_count
      ) x;
  end if;

  if v_ids is null or array_length(v_ids, 1) is null then
    raise exception 'no_questions_available' using errcode = 'P0002';
  end if;

  insert into public.study_attempts (user_id, mode, subject_id, question_count)
  values (v_uid, p_mode, v_subject, array_length(v_ids, 1))
  returning id into v_attempt;

  insert into public.study_attempt_items (attempt_id, position, question_id)
  select v_attempt, u.ord::smallint, u.qid
    from unnest(v_ids) with ordinality as u(qid, ord);

  return public.study__attempt_payload(v_attempt);
end;
$$;

create or replace function public.study_complete_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_att      public.study_attempts;
  v_answered integer;
  v_ttl      interval := make_interval(hours => public.study__setting('attempt_ttl_hours', 168));
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select * into v_att from public.study_attempts a
   where a.id = p_attempt_id and a.user_id = v_uid
     for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if v_att.status = 'completed' then
    return public.study__attempt_payload(v_att.id);       -- idempotente
  end if;
  if v_att.status <> 'in_progress' then
    raise exception 'attempt_not_open' using errcode = 'P0001';
  end if;

  -- "Treino completo" = TODAS as questões da tentativa respondidas. Tentativa vazia ou parcial não
  -- conclui (nem conta no total de treinos nem na meta semanal): o aluno retoma e termina, ou
  -- encerra sem concluir (abandonar), ou deixa expirar. Vencida e incompleta: attempt_expired.
  select count(*)::integer into v_answered
    from public.study_attempt_answers x
    join public.study_attempt_items i on i.id = x.item_id
   where i.attempt_id = v_att.id;
  if v_answered < v_att.question_count then
    if v_att.last_activity_at < now() - v_ttl then
      raise exception 'attempt_expired' using errcode = 'P0001';
    end if;
    raise exception 'attempt_incomplete' using errcode = 'P0001';
  end if;

  perform public.study__complete_attempt_row(v_att.id);
  return public.study__attempt_payload(v_att.id);
end;
$$;

create or replace function public.study_my_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tz  constant text := 'America/Sao_Paulo';
  v_week_start timestamptz := (date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
  v_day        timestamptz := (date_trunc('day',  now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
  v_a_limit integer := public.study__setting('daily_attempts_limit', 20);
  v_q_limit integer := public.study__setting('daily_questions_limit', 200);
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return jsonb_build_object(
    'points',             coalesce((select sum(l.points) from public.study_points_ledger l where l.user_id = v_uid), 0),
    'scored_questions',   (select count(*) from public.study_points_ledger l where l.user_id = v_uid and l.reason = 'question_first_correct'),
    'attempts_completed', (select count(*) from public.study_attempts a where a.user_id = v_uid and a.status = 'completed'
                           and public.study__answered_count(a.id) = a.question_count),
    'answered',           (select count(*) from public.study_attempt_answers x where x.user_id = v_uid),
    'correct',            (select count(*) from public.study_attempt_answers x where x.user_id = v_uid and x.is_correct),
    'study_days',         (select count(distinct (x.answered_at at time zone v_tz)::date) from public.study_attempt_answers x where x.user_id = v_uid),
    'week_completed',     (select count(*) from public.study_attempts a where a.user_id = v_uid and a.status = 'completed' and a.completed_at >= v_week_start
                           and public.study__answered_count(a.id) = a.question_count),
    'weekly_goal',        (select p.weekly_goal from public.study_profiles p where p.user_id = v_uid),
    'pending_review',     (select count(*) from public.study_review_items r
                           join public.study_questions q on q.id = r.question_id and q.status = 'published'
                           join public.study_subjects s on s.id = q.subject_id and s.active
                          where r.user_id = v_uid and r.status = 'pending'),
    'attempts_left_today',  greatest(v_a_limit - (select count(*) from public.study_attempts a where a.user_id = v_uid and a.started_at >= v_day), 0),
    'questions_left_today', greatest(v_q_limit - (select count(*) from public.study_attempt_items i join public.study_attempts a on a.id = i.attempt_id
                                                   where a.user_id = v_uid and a.started_at >= v_day), 0)
  );
end;
$$;

create or replace function public.study_list_my_review_items(p_limit integer default 20)
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
  return coalesce((
    select jsonb_agg(row_json order by last_missed desc)
      from (
        select r.last_missed_at as last_missed,
               jsonb_build_object(
                 'stem', q.stem,
                 'subject', s.name,
                 'miss_count', r.miss_count,
                 'last_missed_at', r.last_missed_at,
                 'options', (select jsonb_agg(jsonb_build_object('label', o.label, 'body', o.body, 'is_correct', o.id = k.option_id) order by o.label)
                               from public.study_question_options o where o.question_id = q.id),
                 'explanation', e.body) as row_json
          from public.study_review_items r
          join public.study_questions q on q.id = r.question_id and q.status = 'published'
          join public.study_subjects s on s.id = q.subject_id and s.active
          join public.study_answer_keys k on k.question_id = q.id
          left join public.study_explanations e on e.question_id = q.id
         where r.user_id = v_uid and r.status = 'pending'
         order by r.last_missed_at desc
         limit least(greatest(coalesce(p_limit, 20), 1), 50)
      ) t), '[]'::jsonb);
end;
$$;

-- permissões de execução (CREATE OR REPLACE preserva, mas reafirmamos para quem revisar)
do $$
declare
  f text;
begin
  foreach f in array array[
    'study_start_attempt(text, public.study_attempt_mode, integer)',
    'study_complete_attempt(uuid)',
    'study_my_progress()',
    'study_list_my_review_items(integer)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
