-- =============================================================================
-- 0004: RPCs (a única porta de escrita e de leitura de conteúdo)
--
-- Todas: SECURITY DEFINER, search_path fixo, identidade SEMPRE por auth.uid()
-- (nenhuma recebe user_id do cliente), EXECUTE só para authenticated. As funções
-- internas (prefixo study__) e a de varredura não são executáveis pelo navegador.
-- Erros usam mensagens curtas e estáveis (not_authenticated, not_found,
-- already_answered, attempt_expired, daily_limit_reached, ...). Um id de outro
-- usuário responde "not_found", igual a um id inexistente (sem enumeração).
--
-- Pontuação v1 (calculada aqui, nunca pelo navegador) — competitiva e finita:
--   * 10 pontos na PRIMEIRA vez que o usuário acerta cada questão (uma vez na
--     vida; repetir a mesma questão não pontua);
--   * bônus de 20 se a tentativa pontuada foi respondida por inteiro E rendeu
--     pelo menos 3 pontuações de questão novas (um bônus por tentativa);
--   * modo 'free' (treino livre) nunca pontua; 'practice' e 'review' pontuam
--     pela mesma regra;
--   * pontos só entram ao CONCLUIR (abandonar ou expirar incompleta não pontua).
--   Teto por usuário: 10 x Q + 20 x floor(Q/3), onde Q = nº de questões DISTINTAS
--   que o usuário chegou a acertar (no máximo as já publicadas, inclusive as
--   arquivadas depois). Cada bônus exige >= 3 pontuações novas, por isso há no
--   máximo floor(Q/3) bônus. Mudar a regra = nova scoring_version.
--
-- Ciclo de vida da tentativa:
--   in_progress -> completed   (study_complete_attempt, ou automático na expiração
--                               se TODAS as questões já estavam respondidas)
--   in_progress -> abandoned   (o aluno desistiu)
--   in_progress -> expired     (inatividade > attempt_ttl_hours com questões sem
--                               resposta; as respostas dadas ficam no histórico e
--                               os erros seguem para a revisão, mas não há pontos)
--   Dentro do prazo (padrão 7 dias sem atividade) a tentativa é sempre RETOMADA
--   por study_start_attempt / study_get_attempt. Expirar é preguiçoso: acontece
--   quando o aluno inicia outra tentativa ou quando study_expire_stale_attempts()
--   (service_role; agendar com pg_cron a critério do projeto) varre.
--
-- Limites diários (dia = America/Sao_Paulo; valores em public.study_settings):
--   * 20 tentativas NOVAS por dia (retomar não conta);
--   * 200 questões entregues por dia, somando todos os modos. Se o saldo for menor
--     que o pedido, a tentativa vem MENOR (question_count < pedido); saldo zero =
--     daily_limit_reached com detail 'questions'. Sem saldo de tentativas =
--     daily_limit_reached com detail 'attempts'.
-- =============================================================================

-- ─────────────────────────────── interno ──────────────────────────────────────
create or replace function public.study__attempt_payload(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_att public.study_attempts;
  v_ttl interval := make_interval(hours => public.study__setting('attempt_ttl_hours', 168));
begin
  select * into v_att from public.study_attempts a
   where a.id = p_attempt_id and a.user_id = auth.uid();
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', v_att.id, 'mode', v_att.mode, 'status', v_att.status,
      'question_count', v_att.question_count, 'correct_count', v_att.correct_count,
      'points_awarded', v_att.points_awarded,
      'awards_points', v_att.mode <> 'free',
      'scored_questions', (select count(*) from public.study_points_ledger l
                            where l.attempt_id = v_att.id and l.reason = 'question_first_correct'),
      'started_at', v_att.started_at, 'last_activity_at', v_att.last_activity_at,
      'resumable', (v_att.status = 'in_progress' and v_att.last_activity_at >= now() - v_ttl),
      'expires_at', case when v_att.status = 'in_progress' then v_att.last_activity_at + v_ttl end,
      'completed_at', v_att.completed_at),
    'items', coalesce((
      select jsonb_agg(s.item order by s.pos)
      from (
        select i.position as pos,
               jsonb_build_object(
                 'item_id', i.id,
                 'position', i.position,
                 'stem', q.stem,
                 'difficulty', q.difficulty,
                 'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'body', o.body) order by o.label)
                               from public.study_question_options o where o.question_id = q.id),
                 'answer', case when ans.item_id is null then null
                                else jsonb_build_object(
                                       'option_id', ans.option_id,
                                       'is_correct', ans.is_correct,
                                       'correct_option_id', k.option_id,
                                       'explanation', e.body) end
               ) as item
          from public.study_attempt_items i
          join public.study_questions q on q.id = i.question_id
          left join public.study_attempt_answers ans on ans.item_id = i.id
          left join public.study_answer_keys k on k.question_id = q.id and ans.item_id is not null
          left join public.study_explanations e on e.question_id = q.id and ans.item_id is not null
         where i.attempt_id = v_att.id
      ) s), '[]'::jsonb)
  );
end;
$$;

-- Pontua e conclui uma tentativa (o chamador já deve ter travado a linha). Usa o
-- dono da tentativa, não auth.uid(), para servir também à varredura (service_role).
create or replace function public.study__complete_attempt_row(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_att      public.study_attempts;
  v_correct  integer;
  v_answered integer;
  v_new      integer := 0;
  v_base     integer := 0;
  v_bonus    integer := 0;
begin
  select * into v_att from public.study_attempts a where a.id = p_attempt_id for update;
  if not found or v_att.status <> 'in_progress' then return; end if;

  select count(*) filter (where x.is_correct)::integer, count(*)::integer
    into v_correct, v_answered
    from public.study_attempt_answers x
    join public.study_attempt_items i on i.id = x.item_id
   where i.attempt_id = v_att.id;

  if v_att.mode <> 'free' then
    -- 10 pontos por questão acertada pela PRIMEIRA vez na vida do usuário. O
    -- índice único parcial (user_id, question_id) decide, inclusive entre duas
    -- tentativas concluídas ao mesmo tempo: só uma delas insere a linha.
    insert into public.study_points_ledger (user_id, attempt_id, reason, question_id, points, scoring_version)
    select v_att.user_id, v_att.id, 'question_first_correct', x.question_id, 10, v_att.scoring_version
      from public.study_attempt_answers x
      join public.study_attempt_items i on i.id = x.item_id
     where i.attempt_id = v_att.id and x.is_correct
    on conflict (user_id, question_id) where reason = 'question_first_correct' do nothing;
    get diagnostics v_new = row_count;
    v_base := v_new * 10;

    if v_answered = v_att.question_count and v_new >= 3 then
      insert into public.study_points_ledger (user_id, attempt_id, reason, points, scoring_version)
      values (v_att.user_id, v_att.id, 'attempt_completion', 20, v_att.scoring_version)
      on conflict (attempt_id) where reason = 'attempt_completion' do nothing;
      v_bonus := 20;
    end if;
  end if;

  update public.study_attempts
     set status = 'completed', completed_at = now(),
         correct_count = v_correct, points_awarded = v_base + v_bonus
   where id = v_att.id;
end;
$$;

-- Expira uma tentativa parada: se tudo já estava respondido, CONCLUI (nada se perde
-- por esquecer de apertar "Concluir"); senão vira 'expired'. Devolve o desfecho.
create or replace function public.study__expire_attempt_row(p_attempt_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_att      public.study_attempts;
  v_answered integer;
begin
  select * into v_att from public.study_attempts a where a.id = p_attempt_id for update;
  if not found or v_att.status <> 'in_progress' then return 'noop'; end if;

  select count(*)::integer into v_answered
    from public.study_attempt_answers x
    join public.study_attempt_items i on i.id = x.item_id
   where i.attempt_id = v_att.id;

  if v_answered = v_att.question_count then
    perform public.study__complete_attempt_row(v_att.id);
    return 'completed';
  end if;

  update public.study_attempts set status = 'expired' where id = v_att.id;
  return 'expired';
end;
$$;

-- ─────────────────────────────── perfil ───────────────────────────────────────
create or replace function public.study_upsert_my_profile(
  p_display_name text,
  p_exam_focus   text default null,
  p_weekly_goal  integer default 5
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.study_profiles;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  insert into public.study_profiles (user_id, display_name, exam_focus, weekly_goal)
  values (v_uid, btrim(p_display_name), nullif(btrim(p_exam_focus), ''), coalesce(p_weekly_goal, 5))
  on conflict (user_id) do update
     set display_name = excluded.display_name,
         exam_focus   = excluded.exam_focus,
         weekly_goal  = excluded.weekly_goal
  returning * into v_row;

  return jsonb_build_object('display_name', v_row.display_name,
                            'exam_focus', v_row.exam_focus,
                            'weekly_goal', v_row.weekly_goal);
end;
$$;

-- ─────────────────────────────── assuntos ─────────────────────────────────────
create or replace function public.study_list_subjects()
returns table (slug text, name text, description text, question_count integer)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
    select s.slug, s.name, s.description,
           (select count(*)::integer from public.study_questions q
             where q.subject_id = s.id and q.status = 'published')
      from public.study_subjects s
     where s.active
       and exists (select 1 from public.study_questions q where q.subject_id = s.id and q.status = 'published')
     order by s.position, s.name;
end;
$$;

-- ─────────────────────────────── tentativa ────────────────────────────────────
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
          join public.study_questions q on q.id = r.question_id
         where r.user_id = v_uid and r.status = 'pending'
           and q.status in ('published', 'archived')
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

create or replace function public.study_get_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return public.study__attempt_payload(p_attempt_id);
end;
$$;

-- ─────────────────────────────── resposta ─────────────────────────────────────
create or replace function public.study_submit_answer(p_item_id uuid, p_option_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid         uuid := auth.uid();
  v_item        record;
  v_key         uuid;
  v_correct     boolean;
  v_explanation text;
  v_ttl         interval := make_interval(hours => public.study__setting('attempt_ttl_hours', 168));
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select i.id as item_id, i.question_id, i.attempt_id, a.status, a.mode, a.last_activity_at
    into v_item
    from public.study_attempt_items i
    join public.study_attempts a on a.id = i.attempt_id
   where i.id = p_item_id and a.user_id = v_uid
     for update of a;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_item.status <> 'in_progress' then raise exception 'attempt_not_open' using errcode = 'P0001'; end if;
  if v_item.last_activity_at < now() - v_ttl then
    raise exception 'attempt_expired' using errcode = 'P0001';     -- inicie uma nova tentativa
  end if;

  if exists (select 1 from public.study_attempt_answers x where x.item_id = v_item.item_id) then
    raise exception 'already_answered' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.study_question_options o
                  where o.id = p_option_id and o.question_id = v_item.question_id) then
    raise exception 'invalid_option' using errcode = '22023';
  end if;

  select k.option_id into v_key from public.study_answer_keys k where k.question_id = v_item.question_id;
  if not found then raise exception 'question_misconfigured' using errcode = 'P0001'; end if;
  v_correct := (p_option_id = v_key);

  insert into public.study_attempt_answers (item_id, question_id, user_id, option_id, is_correct)
  values (v_item.item_id, v_item.question_id, v_uid, p_option_id, v_correct);

  update public.study_attempts set last_activity_at = now() where id = v_item.attempt_id;

  if not v_correct then
    insert into public.study_review_items (user_id, question_id)
    values (v_uid, v_item.question_id)
    on conflict (user_id, question_id) do update
       set status = 'pending',
           miss_count = public.study_review_items.miss_count + 1,
           last_missed_at = now(),
           resolved_at = null;
  elsif v_item.mode = 'review' then
    update public.study_review_items r
       set status = 'resolved', resolved_at = now()
     where r.user_id = v_uid and r.question_id = v_item.question_id;
  end if;

  select e.body into v_explanation from public.study_explanations e where e.question_id = v_item.question_id;

  return jsonb_build_object('is_correct', v_correct,
                            'correct_option_id', v_key,
                            'explanation', v_explanation);
end;
$$;

-- ─────────────────────────────── conclusão e pontos ───────────────────────────
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

  -- Parada além do prazo: só conclui se TUDO já estava respondido (nada se perde
  -- por esquecer de concluir); incompleta não é retomada.
  if v_att.last_activity_at < now() - v_ttl then
    select count(*)::integer into v_answered
      from public.study_attempt_answers x
      join public.study_attempt_items i on i.id = x.item_id
     where i.attempt_id = v_att.id;
    if v_answered < v_att.question_count then
      raise exception 'attempt_expired' using errcode = 'P0001';
    end if;
  end if;

  perform public.study__complete_attempt_row(v_att.id);
  return public.study__attempt_payload(v_att.id);
end;
$$;

create or replace function public.study_abandon_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  update public.study_attempts
     set status = 'abandoned'
   where id = p_attempt_id and user_id = auth.uid() and status = 'in_progress';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end;
$$;

-- Varredura de tentativas paradas (todas as contas). Só service_role. Não é
-- agendada por esta migration; sem agendamento a expiração acontece sob demanda
-- quando o aluno inicia outra tentativa.
create or replace function public.study_expire_stale_attempts(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  r     record;
  v_n   integer := 0;
  v_ttl interval := make_interval(hours => public.study__setting('attempt_ttl_hours', 168));
begin
  for r in
    select a.id from public.study_attempts a
     where a.status = 'in_progress' and a.last_activity_at < now() - v_ttl
     order by a.last_activity_at
     limit least(greatest(coalesce(p_limit, 500), 1), 5000)
       for update skip locked
  loop
    perform public.study__expire_attempt_row(r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ─────────────────────────────── progresso e histórico ────────────────────────
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
    'attempts_completed', (select count(*) from public.study_attempts a where a.user_id = v_uid and a.status = 'completed'),
    'answered',           (select count(*) from public.study_attempt_answers x where x.user_id = v_uid),
    'correct',            (select count(*) from public.study_attempt_answers x where x.user_id = v_uid and x.is_correct),
    'study_days',         (select count(distinct (x.answered_at at time zone v_tz)::date) from public.study_attempt_answers x where x.user_id = v_uid),
    'week_completed',     (select count(*) from public.study_attempts a where a.user_id = v_uid and a.status = 'completed' and a.completed_at >= v_week_start),
    'weekly_goal',        (select p.weekly_goal from public.study_profiles p where p.user_id = v_uid),
    'pending_review',     (select count(*) from public.study_review_items r where r.user_id = v_uid and r.status = 'pending'),
    'attempts_left_today',  greatest(v_a_limit - (select count(*) from public.study_attempts a where a.user_id = v_uid and a.started_at >= v_day), 0),
    'questions_left_today', greatest(v_q_limit - (select count(*) from public.study_attempt_items i join public.study_attempts a on a.id = i.attempt_id
                                                   where a.user_id = v_uid and a.started_at >= v_day), 0)
  );
end;
$$;

create or replace function public.study_list_my_attempts(p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, mode public.study_attempt_mode, status public.study_attempt_status,
               subject_name text, question_count smallint, correct_count smallint,
               points_awarded integer, started_at timestamptz, completed_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
    select a.id, a.mode, a.status, s.name, a.question_count, a.correct_count,
           a.points_awarded, a.started_at, a.completed_at
      from public.study_attempts a
      left join public.study_subjects s on s.id = a.subject_id
     where a.user_id = auth.uid()
     order by a.started_at desc
     limit least(greatest(coalesce(p_limit, 20), 1), 50)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Erros pendentes de revisão. O gabarito aparece aqui porque a questão só entra
-- em study_review_items depois que o aluno a respondeu (e já viu o gabarito).
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
          join public.study_questions q on q.id = r.question_id and q.status in ('published', 'archived')
          join public.study_subjects s on s.id = q.subject_id
          join public.study_answer_keys k on k.question_id = q.id
          left join public.study_explanations e on e.question_id = q.id
         where r.user_id = v_uid and r.status = 'pending'
         order by r.last_missed_at desc
         limit least(greatest(coalesce(p_limit, 20), 1), 50)
      ) t), '[]'::jsonb);
end;
$$;

-- ─────────────────────────────── administração ────────────────────────────────
-- Publicação exige: administrador ativo, atestado de ausência de paciente real e
-- (checado de novo pelo trigger de congelamento) 2 a 5 alternativas, gabarito e
-- explicação. Nota de processo: o mesmo administrador pode criar e publicar; se
-- quiser "dois pares de olhos", exija reviewed_by <> created_by aqui.
create or replace function public.study_admin_publish_question(
  p_question_id uuid,
  p_confirm_no_real_patient_data boolean
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_q   public.study_questions;
  v_n   integer;
begin
  if not public.is_study_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_confirm_no_real_patient_data is distinct from true then
    raise exception 'patient_data_confirmation_required' using errcode = 'P0001';
  end if;

  select * into v_q from public.study_questions where id = p_question_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_q.status not in ('draft', 'in_review') then raise exception 'invalid_status' using errcode = 'P0001'; end if;

  select count(*) into v_n from public.study_question_options where question_id = v_q.id;
  if v_n not between 2 and 5 then raise exception 'options_incomplete' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.study_answer_keys where question_id = v_q.id) then
    raise exception 'answer_key_missing' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.study_explanations where question_id = v_q.id) then
    raise exception 'explanation_missing' using errcode = 'P0001';
  end if;

  update public.study_questions
     set status = 'published', no_real_patient_data_confirmed = true,
         reviewed_by = v_uid, reviewed_at = now(), published_at = now()
   where id = v_q.id;
end;
$$;

-- ─────────────────────────────── permissões de execução ───────────────────────
revoke execute on function public.study__attempt_payload(uuid)       from public, anon, authenticated;
revoke execute on function public.study__complete_attempt_row(uuid)  from public, anon, authenticated;
revoke execute on function public.study__expire_attempt_row(uuid)    from public, anon, authenticated;
revoke execute on function public.study_expire_stale_attempts(integer) from public, anon, authenticated;
grant  execute on function public.study_expire_stale_attempts(integer) to service_role;

do $$
declare
  f text;
begin
  foreach f in array array[
    'study_upsert_my_profile(text, text, integer)',
    'study_list_subjects()',
    'study_start_attempt(text, public.study_attempt_mode, integer)',
    'study_get_attempt(uuid)',
    'study_submit_answer(uuid, uuid)',
    'study_complete_attempt(uuid)',
    'study_abandon_attempt(uuid)',
    'study_my_progress()',
    'study_list_my_attempts(integer, integer)',
    'study_list_my_review_items(integer)',
    'study_admin_publish_question(uuid, boolean)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
