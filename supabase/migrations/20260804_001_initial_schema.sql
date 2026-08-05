-- ════════════════════════════════════════════════════════════════════════════
--  ENTRE NÓS TARÔ — FASE 1: ESQUEMA INICIAL DO BANCO
--
--  Esta migration cria a base de dados da plataforma: pacotes, pedidos,
--  perguntas, catálogo de cartas, sorteio, rascunhos de leitura gerados por
--  IA, eventos de pagamento, auditoria de pedidos e administradores.
--
--  Nada neste arquivo foi aplicado a um projeto Supabase — é só o arquivo de
--  migration, pronto para revisão. Nenhuma das 78 cartas de tarô é inserida
--  aqui (fica para uma migration futura, dedicada ao catálogo de cartas).
--
--  Ver docs/DB_SCHEMA.md para uma explicação completa em português simples.
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────── 1. Extensões ─────────────────────────────
-- pgcrypto fornece gen_random_uuid() e funções de hash (digest()), usadas
-- neste esquema e potencialmente por Edge Functions futuras.
create extension if not exists pgcrypto;


-- ──────────────────────────────── 2. Enums ─────────────────────────────────

-- Ciclo de vida do pedido, do pagamento pendente até a leitura liberada.
-- A ordem dos valores reflete a ordem lógica do pipeline (não é só cosmético
-- — ajuda leitura humana no painel do Supabase, que costuma listar em ordem
-- de declaração).
create type public.order_status as enum (
  'pending_payment',  -- criado, aguardando confirmação do Mercado Pago
  'paid',              -- pagamento confirmado pelo webhook
  'drawing_cards',     -- sorteio das cartas em andamento no servidor
  'generating',        -- rascunho sendo gerado pela IA (Anthropic)
  'awaiting_review',   -- rascunho(s) pronto(s), aguardando um administrador abrir a revisão
  'in_review',         -- um administrador está revisando agora
  'approved',          -- revisão humana aprovou o conteúdo
  'released',          -- leitura liberada para o cliente ver
  'failed',            -- alguma etapa do processo (sorteio ou geração) falhou e precisa de atenção
  'cancelled',         -- pedido cancelado antes do pagamento
  'refunded',          -- reembolsado após o pagamento
  'expired'            -- prazo de pagamento do Mercado Pago expirou
);

-- Status da geração do rascunho de UMA pergunta específica pela IA.
create type public.question_generation_status as enum (
  'pending',    -- ainda não foi enviada para geração
  'generating', -- chamada à API da Anthropic em andamento
  'generated',  -- rascunho gerado com sucesso
  'failed'      -- geração falhou (ver readings.generation_attempts)
);

-- Status de aprovação humana de UMA pergunta específica.
create type public.question_approval_status as enum (
  'pending',     -- aguardando revisão
  'approved',    -- aprovada como está
  'needs_edit',  -- revisor precisa editar antes de aprovar
  'rejected'     -- rejeitada (não será liberada ao cliente)
);

-- Orientação física da carta sorteada.
create type public.card_orientation as enum (
  'upright',  -- carta normal
  'reversed'  -- carta invertida
);

-- Status do documento de leitura (rascunho → edição → aprovação → liberação).
create type public.reading_status as enum (
  'pending',      -- ainda não gerado
  'draft_ready',  -- rascunho da IA disponível para revisão
  'in_review',    -- um revisor está com o rascunho aberto
  'approved',     -- conteúdo aprovado, ainda não visível ao cliente
  'released',     -- visível na página privada do cliente
  'failed'        -- geração falhou repetidamente
);


-- ──────────────────────── 3. Função utilitária: updated_at ────────────────
-- Mantém a coluna updated_at sempre atualizada em qualquer UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Ninguém precisa CHAMAR esta função diretamente — ela só existe para ser
-- disparada por trigger. Revogar de PUBLIC reduz a superfície de ataque sem
-- quebrar nada: o Postgres não exige EXECUTE do papel que faz o UPDATE para
-- que um trigger BEFORE UPDATE dispare (isso é checado pelo privilégio de
-- UPDATE na tabela, não pelo EXECUTE na função). Ver confirmação no resumo
-- desta revisão.
revoke execute on function public.set_updated_at() from public;
grant execute on function public.set_updated_at() to authenticated, service_role;


-- ═══════════════════════════════ 4. Tabelas ════════════════════════════════

-- ───────────────────────────────── packages ────────────────────────────────
-- Catálogo comercial: os pacotes que aparecem no site (3 perguntas,
-- 7 perguntas etc.). Substitui o array `packages` hoje hardcoded no front.
create table public.packages (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (btrim(slug) <> ''),
  name           text not null check (btrim(name) <> ''),
  description    text,
  question_limit integer not null check (question_limit > 0),
  price_cents    integer not null check (price_cents > 0),
  currency       text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  active         boolean not null default true,
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.packages is
  'Pacotes comerciais oferecidos no site (quantidade de perguntas e preço). Fonte única de verdade para o valor cobrado — o front nunca deve ser confiado para isso.';


-- ────────────────────────────────── orders ─────────────────────────────────
-- Um pedido por cliente. O acesso à leitura acontece por token (access_token
-- _hash), não por login — por isso o hash é único e nunca guardamos o token
-- em texto puro.
create table public.orders (
  id                          uuid primary key default gen_random_uuid(),
  public_id                   uuid not null unique default gen_random_uuid(),
  customer_name               text not null check (btrim(customer_name) <> ''),
  customer_email              text not null check (
                                 char_length(customer_email) <= 254
                                 and customer_email like '%@%'
                               ),
  package_id                  uuid not null references public.packages(id) on delete restrict,
  amount_cents                integer not null check (amount_cents > 0),
  currency                    text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  status                      public.order_status not null default 'pending_payment',
  mercado_pago_preference_id  text,
  mercado_pago_payment_id     text,
  access_token_hash           text not null unique,
  terms_version                text not null,
  privacy_version              text not null,
  paid_at                     timestamptz,
  review_started_at           timestamptz,
  approved_at                 timestamptz,
  released_at                 timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.orders is
  'Um pedido de leitura. access_token_hash guarda o HASH do token enviado ao cliente (nunca o token em si) — usado pela página privada, sem exigir login.';
comment on column public.orders.access_token_hash is
  'SHA-256 (ou equivalente) do token de acesso enviado ao cliente. O token em texto puro nunca é persistido no banco.';
comment on column public.orders.customer_email is
  'Obrigatório. Validação no banco é propositalmente simples (tamanho máximo e presença de "@") — validação completa de formato acontece na Edge Function/formulário, antes de chegar aqui.';

create index orders_package_id_idx on public.orders (package_id);
create index orders_status_idx on public.orders (status);
create index orders_customer_email_idx on public.orders (customer_email);
create index orders_created_at_idx on public.orders (created_at);


-- ───────────────────────────────── questions ───────────────────────────────
-- As perguntas que o cliente escreveu para o pedido, uma linha por pergunta,
-- numeradas por posição (1, 2, 3...) dentro do pedido.
create table public.questions (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete cascade,
  position           integer not null check (position > 0),
  question_text      text not null check (
                        btrim(question_text) <> '' and char_length(question_text) <= 2000
                      ),
  generation_status  public.question_generation_status not null default 'pending',
  approval_status    public.question_approval_status not null default 'pending',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (order_id, position)
);

comment on table public.questions is
  'Perguntas individuais de um pedido. Cada uma recebe seu próprio sorteio de cartas e seu próprio rascunho de leitura.';


-- ─────────────────────────────── tarot_cards ───────────────────────────────
-- Catálogo de referência das 78 cartas. Esta migration NÃO insere as cartas
-- — fica para uma migration dedicada e futura.
create table public.tarot_cards (
  id                 uuid primary key default gen_random_uuid(),
  canonical_name     text not null unique,
  arcana             text not null check (arcana in ('major', 'minor')),
  suit               text check (suit in ('wands', 'cups', 'swords', 'pentacles')),
  card_number        integer,
  upright_keywords   text[],
  reversed_keywords  text[],
  upright_meaning    text,
  reversed_meaning   text,
  image_path         text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint tarot_cards_minor_requires_suit
    check (arcana <> 'minor' or suit is not null)
);

comment on table public.tarot_cards is
  'Catálogo de referência das 78 cartas de tarô (arcanos maiores e menores). Populado por uma migration futura dedicada — vazio nesta etapa.';
comment on column public.tarot_cards.canonical_name is
  'Nome oficial e único da carta, ex.: "A Sacerdotisa", "Dois de Paus".';

create index tarot_cards_active_idx on public.tarot_cards (active);


-- ─────────────────────────────── drawn_cards ───────────────────────────────
-- As 3 cartas sorteadas no servidor para UMA pergunta específica.
create table public.drawn_cards (
  id             uuid primary key default gen_random_uuid(),
  question_id    uuid not null references public.questions(id) on delete cascade,
  card_id        uuid not null references public.tarot_cards(id) on delete restrict,
  draw_order     integer not null check (draw_order between 1 and 3),
  position_key   text not null,
  position_label text not null,
  orientation    public.card_orientation not null default 'upright',
  created_at     timestamptz not null default now(),
  -- Uma mesma carta não pode ser sorteada duas vezes na mesma pergunta.
  unique (question_id, card_id),
  -- Duas cartas não podem ocupar a mesma posição de sorteio na mesma pergunta.
  unique (question_id, draw_order)
);

comment on table public.drawn_cards is
  'Resultado do sorteio de 3 cartas por pergunta. O sorteio SEMPRE acontece no servidor (Edge Function), nunca no navegador do cliente.';
comment on column public.drawn_cards.position_key is
  'Identificador curto da posição no sorteio (ex.: "passado", "presente", "futuro"), definido pela Edge Function no momento do sorteio.';

create index drawn_cards_card_id_idx on public.drawn_cards (card_id);


-- ──────────────────────────────── readings ─────────────────────────────────
-- O documento de leitura de uma pergunta: rascunho gerado pela IA, versão
-- editada pelo revisor humano e versão final liberada ao cliente.
create table public.readings (
  id                   uuid primary key default gen_random_uuid(),
  question_id          uuid not null unique references public.questions(id) on delete cascade,
  draft_json           jsonb,
  edited_json          jsonb,
  final_json           jsonb,
  model_used           text,
  prompt_version       text,
  input_tokens         integer check (input_tokens is null or input_tokens >= 0),
  output_tokens        integer check (output_tokens is null or output_tokens >= 0),
  generation_attempts  integer not null default 0 check (generation_attempts >= 0),
  status               public.reading_status not null default 'pending',
  approved_by          uuid references auth.users(id) on delete set null,
  generated_at         timestamptz,
  approved_at          timestamptz,
  released_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.readings is
  'Conteúdo da leitura de uma pergunta. draft_json vem da IA (Anthropic) e NUNCA é exibido ao cliente diretamente — só final_json, depois de aprovação humana e liberação manual.';

create index readings_approved_by_idx on public.readings (approved_by);


-- ────────────────────────────── payment_events ─────────────────────────────
-- Registro bruto de cada notificação recebida de um provedor de pagamento.
-- A unicidade composta (provider, provider_event_id) garante idempotência:
-- a mesma notificação reenviada pelo provedor não é processada duas vezes.
create table public.payment_events (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null default 'mercado_pago',
  provider_event_id   text not null,
  event_type          text not null,
  order_id            uuid references public.orders(id) on delete set null,
  payment_id          text,
  status              text,
  attempts            integer not null default 0 check (attempts >= 0),
  error_message       text,
  received_at         timestamptz not null default now(),
  processed_at        timestamptz,
  -- Idempotência por provedor: o mesmo provider_event_id só é único DENTRO
  -- de cada provedor — evita colisão caso um segundo provedor de pagamento
  -- seja adicionado no futuro e use um esquema de IDs sobreposto ao do
  -- Mercado Pago.
  unique (provider, provider_event_id)
);

comment on table public.payment_events is
  'Log bruto de notificações (webhooks) de pagamento. A dupla (provider, provider_event_id) é única para garantir que a mesma notificação nunca seja processada duas vezes, mesmo se outro provedor de pagamento for adicionado no futuro.';

create index payment_events_order_id_idx on public.payment_events (order_id);
create index payment_events_payment_id_idx on public.payment_events (payment_id);


-- ─────────────────────────────── order_events ──────────────────────────────
-- Trilha de auditoria: cada mudança relevante de status de um pedido.
create table public.order_events (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  event_type     text not null,
  old_status     public.order_status,
  new_status     public.order_status,
  actor_user_id  uuid references auth.users(id) on delete set null,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

comment on table public.order_events is
  'Auditoria: histórico de mudanças de status de cada pedido, incluindo quem (actor_user_id) realizou a ação quando aplicável.';

create index order_events_order_id_idx on public.order_events (order_id);
create index order_events_actor_user_id_idx on public.order_events (actor_user_id);


-- ─────────────────────────────── admin_users ───────────────────────────────
-- Lista de administradores autorizados a usar o painel. Gerenciada fora do
-- RLS de escrita (ver seção de políticas) — só leitura para admins.
create table public.admin_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'admin' check (role in ('admin', 'supervisor')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.admin_users is
  'Quem pode acessar o painel administrativo. Conceder/revogar acesso é uma operação privilegiada — feita fora do RLS de escrita (SQL direto ou processo controlado), nunca pelo próprio painel autenticado.';
comment on column public.admin_users.role is
  'Rótulo "admin" ou "supervisor". Nesta etapa, is_admin() trata os dois de forma idêntica (qualquer linha ativa libera acesso) — a distinção de permissões entre os dois papéis, se necessária, é trabalho de uma fase futura.';


-- ═══════════════════════ 5. Triggers de updated_at ═════════════════════════

create trigger set_updated_at before update on public.packages
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.questions
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.tarot_cards
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.readings
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.admin_users
  for each row execute function public.set_updated_at();


-- ═══════════════════════════ 6. Função is_admin() ══════════════════════════
-- SECURITY DEFINER com search_path fixo: evita que a função seja enganada
-- por um search_path malicioso, e permite que ela leia admin_users mesmo
-- com RLS ativo na tabela (a própria política de admin_users depende dela).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and au.active = true
  );
$$;

comment on function public.is_admin() is
  'Retorna true se o usuário autenticado atual (auth.uid()) é um administrador ativo. Usada em todas as políticas de RLS que liberam acesso administrativo.';

-- Só quem precisa avaliar esta função pode chamá-la: papéis autenticados
-- (usados dentro das políticas de RLS) e service_role (Edge Functions).
-- anon nunca precisa — nenhuma política pública depende de is_admin().
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;


-- ═══════════════════════════════ 7. Ativar RLS ═════════════════════════════

alter table public.packages       enable row level security;
alter table public.orders         enable row level security;
alter table public.questions      enable row level security;
alter table public.tarot_cards    enable row level security;
alter table public.drawn_cards    enable row level security;
alter table public.readings       enable row level security;
alter table public.payment_events enable row level security;
alter table public.order_events   enable row level security;
alter table public.admin_users    enable row level security;


-- ═══════════════════════════ 8. Políticas de acesso ════════════════════════
--
-- Regra geral: o service_role (usado pelas Edge Functions) IGNORA o RLS por
-- padrão no Supabase — não precisa de política própria aqui. Todo o fluxo
-- público (criar pedido, sortear cartas, gerar rascunho, liberar leitura)
-- roda por trás de Edge Functions usando service_role, nunca por acesso
-- direto do navegador do cliente a estas tabelas.

-- packages: qualquer visitante pode ver os pacotes ativos (é o que a home
-- e as páginas de tema precisam exibir).
create policy packages_public_read_active
  on public.packages
  for select
  to anon, authenticated
  using (active = true);

-- packages: administradores autenticados podem ver e gerenciar tudo,
-- incluindo pacotes inativos.
create policy packages_admin_manage
  on public.packages
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- orders: nada de acesso direto para visitantes — só administradores.
-- (o cliente vê o próprio pedido através de uma Edge Function, que valida
-- o token e usa service_role, nunca uma política de RLS pública.)
create policy orders_admin_manage
  on public.orders
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- questions: mesmo princípio — só administradores.
create policy questions_admin_manage
  on public.questions
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- tarot_cards: catálogo interno de trabalho, não é exposto ao público
-- diretamente (a página do cliente recebe o conteúdo já pronto via Edge
-- Function). Só administradores.
create policy tarot_cards_admin_manage
  on public.tarot_cards
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- drawn_cards: nunca visível a visitantes — só administradores.
create policy drawn_cards_admin_manage
  on public.drawn_cards
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- readings: contém rascunhos e conteúdo ainda não aprovado — só
-- administradores. O cliente nunca lê esta tabela diretamente.
create policy readings_admin_manage
  on public.readings
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- payment_events: dado financeiro sensível — só administradores.
create policy payment_events_admin_manage
  on public.payment_events
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- order_events: auditoria — só administradores.
create policy order_events_admin_manage
  on public.order_events
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- admin_users: administradores podem CONSULTAR a lista (para o painel
-- mostrar quem tem acesso). Propositalmente NÃO existe política de
-- INSERT/UPDATE/DELETE aqui — conceder ou revogar acesso de administrador
-- é uma ação privilegiada demais para ficar disponível a qualquer admin
-- autenticado; deve ser feita por SQL direto (painel do Supabase) ou por um
-- processo separado e controlado.
create policy admin_users_admin_read
  on public.admin_users
  for select
  to authenticated
  using (public.is_admin());


-- ═══════════════════════ 9. Pacotes iniciais (seed) ════════════════════════
-- Apenas os dois pacotes pedidos nesta etapa. As 78 cartas ficam para uma
-- migration futura dedicada.

insert into public.packages
  (slug, name, description, question_limit, price_cents, currency, active, display_order)
values
  (
    'leitura-essencial',
    'Leitura Essencial',
    'Para compreender uma situação específica com objetividade.',
    3,
    1500,
    'BRL',
    true,
    1
  ),
  (
    'leitura-clareza',
    'Leitura Clareza',
    'Para quem possui diferentes dúvidas relacionadas ao mesmo momento.',
    7,
    2750,
    'BRL',
    false,
    2
  );
