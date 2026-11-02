-- =============================================================================
-- FSLOBO Enfermagem (app de estudo) — 0001: fundação
--
-- RASCUNHO PARA REVISÃO. NÃO APLICAR no projeto Supabase da loja
-- (o projeto atual da loja). Destino previsto: projeto Supabase SEPARADO do app.
-- Ver supabase-app/README.md.
--
-- Convenções (iguais às da loja):
--   * tudo em public, prefixo study_ (não há colisão com public.questions,
--     que é das perguntas de tarô);
--   * RLS ligado em toda tabela; REVOKE ALL explícito de public/anon/authenticated;
--     só entra GRANT do que o navegador realmente precisa ler;
--   * funções SECURITY DEFINER com search_path fixo e EXECUTE só para quem deve.
-- =============================================================================

-- ─────────────────────────────── tipos ────────────────────────────────────────
create type public.study_content_status as enum ('draft', 'in_review', 'published', 'archived');
-- abandoned = o aluno desistiu; expired = ficou parada além do prazo de retomada
-- (ver study_settings.attempt_ttl_hours e 0004).
create type public.study_attempt_status as enum ('in_progress', 'completed', 'abandoned', 'expired');
-- practice = treino pontuado (pontua só na 1ª vez que cada questão é acertada);
-- review   = revisão dos erros (mesma regra de pontos);
-- free     = treino livre: repete o que quiser, NUNCA pontua.
create type public.study_attempt_mode   as enum ('practice', 'review', 'free');

-- ─────────────────────────────── utilitário ───────────────────────────────────
create or replace function public.study_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- ─────────────────────────────── administradores ──────────────────────────────
-- Tabela SEPARADA do perfil: o usuário nunca consegue se promover editando o
-- próprio perfil. Concessão só por SQL direto / service_role (nunca pelo app).
create table public.study_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.study_admins is
  'Quem administra o conteúdo do app. Sem GRANT e sem política: só service_role/SQL direto escreve e lê.';

create or replace function public.is_study_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.study_admins a
    where a.user_id = auth.uid() and a.active
  );
$$;

-- ─────────────────────────────── perfil de estudo ─────────────────────────────
-- Dados mínimos e editáveis só por RPC com lista branca de campos.
-- NÃO guarda pontos (derivados do livro-razão no servidor), papel/permissão
-- nem e-mail (o e-mail fica só em auth.users).
create table public.study_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  exam_focus   text check (exam_focus is null or char_length(exam_focus) <= 80),
  weekly_goal  smallint not null default 5 check (weekly_goal between 1 and 21),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.study_profiles is
  'Perfil de estudo. Sem pontos, sem papel e sem e-mail. Escrita só por study_upsert_my_profile().';
create trigger study_profiles_touch before update on public.study_profiles
  for each row execute function public.study_touch_updated_at();

-- ─────────────────────────────── assuntos ─────────────────────────────────────
create table public.study_subjects (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (char_length(name) between 2 and 80),
  description text check (description is null or char_length(description) <= 300),
  position    integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger study_subjects_touch before update on public.study_subjects
  for each row execute function public.study_touch_updated_at();

-- ─────────────────────────────── parâmetros ───────────────────────────────────
-- Limites ajustáveis sem nova migration (só service_role/SQL direto). Chaves e
-- faixas fixas por CHECK; se a linha não existir vale o padrão da função.
--   daily_attempts_limit   padrão  20   tentativas NOVAS por dia (retomar não conta)
--   daily_questions_limit  padrão 200   questões entregues por dia (todos os modos)
--   attempt_ttl_hours      padrão 168   inatividade (7 dias) até a tentativa expirar
create table public.study_settings (
  key        text primary key check (key in ('daily_attempts_limit', 'daily_questions_limit', 'attempt_ttl_hours')),
  value      integer not null,
  updated_at timestamptz not null default now(),
  constraint study_settings_range check (
    (key = 'daily_attempts_limit'  and value between 1 and 200)
 or (key = 'daily_questions_limit' and value between 1 and 2000)
 or (key = 'attempt_ttl_hours'     and value between 1 and 720))
);
create trigger study_settings_touch before update on public.study_settings
  for each row execute function public.study_touch_updated_at();

create or replace function public.study__setting(p_key text, p_default integer)
returns integer
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce((select s.value from public.study_settings s where s.key = p_key), p_default);
$$;

-- ─────────────────────────────── RLS e permissões ─────────────────────────────
alter table public.study_settings enable row level security;
alter table public.study_admins   enable row level security;
alter table public.study_profiles enable row level security;
alter table public.study_subjects enable row level security;

-- service_role também entra no REVOKE: os privilégios padrão da Supabase lhe dão
-- TRUNCATE/TRIGGER/REFERENCES, que não queremos; o GRANT abaixo devolve só o necessário.
revoke all on public.study_settings from public, anon, authenticated, service_role;
revoke all on public.study_admins   from public, anon, authenticated, service_role;
revoke all on public.study_profiles from public, anon, authenticated, service_role;
revoke all on public.study_subjects from public, anon, authenticated, service_role;

-- O usuário LÊ o próprio perfil direto; escreve só pela RPC.
grant select on public.study_profiles to authenticated;
create policy study_profiles_own_select on public.study_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Assuntos: nenhum acesso direto (a lista sai por study_list_subjects()).
grant select, insert, update, delete on public.study_settings, public.study_admins,
  public.study_profiles, public.study_subjects to service_role;

revoke execute on function public.is_study_admin() from public, anon;
grant  execute on function public.is_study_admin() to authenticated, service_role;
revoke execute on function public.study_touch_updated_at() from public, anon, authenticated;
revoke execute on function public.study__setting(text, integer) from public, anon, authenticated;
