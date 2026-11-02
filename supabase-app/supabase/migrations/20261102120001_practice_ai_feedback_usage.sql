-- 0008: controle de frequência da correção assistida por IA da aba Prática (piloto).
--
-- O que faz: cria UMA tabela de eventos (quem pediu e quando, SEM nenhum texto de redação) e duas funções
-- que só o servidor (service_role, usada pela Edge Function "practice-feedback") consegue chamar.
-- O que NÃO faz: não guarda a redação, nem o resultado da correção, nem o ranking/pontos; não altera nenhuma
-- tabela, função, GRANT ou POLICY existente; não dá acesso a anon/authenticated.

create table public.study_ai_feedback_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null default 'practice_feedback' check (kind in ('practice_feedback')),
  created_at timestamptz not null default now()
);
create index study_ai_feedback_events_user_time on public.study_ai_feedback_events (user_id, created_at desc);
create index study_ai_feedback_events_time on public.study_ai_feedback_events (created_at desc);

comment on table public.study_ai_feedback_events is
  'Contador de pedidos de correção por IA (apenas user_id e horário; nunca o texto). Só o service_role acessa.';

alter table public.study_ai_feedback_events enable row level security;
revoke all on public.study_ai_feedback_events from public, anon, authenticated, service_role;
grant select, insert, delete on public.study_ai_feedback_events to service_role;

-- Reserva uma vaga (por usuário em janela curta, por usuário no dia e global no dia) e a registra de forma atômica.
-- Devolve {allowed, reason, retry_after_seconds, event_id}. Eventos com mais de 7 dias são apagados.
create or replace function public.study_ai_acquire(
  p_user uuid,
  p_window_minutes int default 10,
  p_per_user_window int default 3,
  p_per_user_day int default 15,
  p_global_day int default 150
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_in_window int;
  v_in_day int;
  v_global int;
  v_oldest timestamptz;
  v_id bigint;
begin
  if p_user is null then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_user', 'retry_after_seconds', 0);
  end if;
  if p_window_minutes < 1 or p_window_minutes > 120 or p_per_user_window < 1 or p_per_user_day < 1 or p_global_day < 1 then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_limits', 'retry_after_seconds', 0);
  end if;

  -- Serializa os pedidos (volume baixo no piloto): sem corrida entre contar e inserir.
  perform pg_advisory_xact_lock(hashtext('study_ai_feedback'));

  delete from public.study_ai_feedback_events where created_at < now() - interval '7 days';

  select count(*), min(created_at) into v_in_window, v_oldest
    from public.study_ai_feedback_events
   where user_id = p_user and created_at > now() - make_interval(mins => p_window_minutes);
  if v_in_window >= p_per_user_window then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + make_interval(mins => p_window_minutes) - now())))::int));
  end if;

  select count(*) into v_in_day from public.study_ai_feedback_events
   where user_id = p_user and created_at > now() - interval '24 hours';
  if v_in_day >= p_per_user_day then
    return jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'retry_after_seconds', 3600);
  end if;

  select count(*) into v_global from public.study_ai_feedback_events where created_at > now() - interval '24 hours';
  if v_global >= p_global_day then
    return jsonb_build_object('allowed', false, 'reason', 'global_limit', 'retry_after_seconds', 3600);
  end if;

  insert into public.study_ai_feedback_events (user_id) values (p_user) returning id into v_id;
  return jsonb_build_object('allowed', true, 'reason', 'ok', 'retry_after_seconds', 0, 'event_id', v_id);
end;
$$;

-- Devolve a vaga quando o provedor falhou (o aluno não deve "gastar" tentativa por erro do serviço).
create or replace function public.study_ai_release(p_user uuid, p_event_id bigint) returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  delete from public.study_ai_feedback_events where id = p_event_id and user_id = p_user;
$$;

revoke all on function public.study_ai_acquire(uuid, int, int, int, int) from public, anon, authenticated;
revoke all on function public.study_ai_release(uuid, bigint) from public, anon, authenticated;
grant execute on function public.study_ai_acquire(uuid, int, int, int, int) to service_role;
grant execute on function public.study_ai_release(uuid, bigint) to service_role;

comment on function public.study_ai_acquire(uuid, int, int, int, int) is
  'Reserva uma vaga de correção por IA (limites por usuário e global). Só service_role.';
