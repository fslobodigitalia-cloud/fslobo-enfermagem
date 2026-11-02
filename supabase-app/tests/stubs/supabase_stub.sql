-- Simula, num Postgres LOCAL descartável (PGlite), o mínimo do ambiente Supabase
-- de que as migrations dependem: papéis, auth.users, auth.uid() e os
-- privilégios PADRÃO do Supabase (que concedem tudo a anon/authenticated e que
-- as migrations precisam revogar de forma explícita).
-- NUNCA executar num projeto Supabase real.

create role anon          nologin;
create role authenticated nologin;
create role service_role  nologin bypassrls;

create schema auth;
create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);
create function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- auth.jwt(): o Supabase real devolve os claims do JWT da requisição (request.jwt.claims); a 0007 lê o claim 'aal' (MFA).
create function auth.jwt() returns jsonb
  language sql stable
  as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- Privilégios padrão do Supabase para objetos novos em public:
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
