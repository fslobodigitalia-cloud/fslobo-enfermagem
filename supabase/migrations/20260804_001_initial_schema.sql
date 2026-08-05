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
  mercado_pago_preference_id  text unique check (
                                 mercado_pago_preference_id is null
                                 or btrim(mercado_pago_preference_id) <> ''
                               ),
  mercado_pago_payment_id     text unique check (
                                 mercado_pago_payment_id is null
                                 or btrim(mercado_pago_payment_id) <> ''
                               ),
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
comment on column public.orders.mercado_pago_preference_id is
  'Único quando preenchido. UNIQUE em Postgres permite qualquer quantidade de linhas com NULL — a restrição só entra em vigor quando o valor é de fato preenchido, evitando duas preferências do Mercado Pago apontarem para o mesmo pedido.';
comment on column public.orders.mercado_pago_payment_id is
  'Único quando preenchido, pelo mesmo motivo de mercado_pago_preference_id — evita dois pedidos serem conciliados com o mesmo pagamento do Mercado Pago.';

create index orders_package_id_idx on public.orders (package_id);
create index orders_status_idx on public.orders (status);
create index orders_customer_email_idx on public.orders (customer_email);
create index orders_created_at_idx on public.orders (created_at);


-- ───────────────────────────────── questions ───────────────────────────────
-- As perguntas que o cliente escreveu para o pedido, uma linha por pergunta,
-- numeradas por posição (1, 2, 3...) dentro do pedido.
create table public.questions (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete restrict,
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
comment on column public.questions.order_id is
  'ON DELETE RESTRICT (não CASCADE): um pedido com perguntas não pode ser apagado enquanto elas existirem. Cancelamento e expiração são representados por orders.status, nunca por exclusão de linhas.';


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
  question_id    uuid not null references public.questions(id) on delete restrict,
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
comment on column public.drawn_cards.question_id is
  'ON DELETE RESTRICT (não CASCADE): um sorteio já realizado é permanente. Se um sorteio precisar ser refeito, isso é uma decisão administrativa excepcional fora da aplicação — nunca um DELETE disparado pelo fluxo normal.';

create index drawn_cards_card_id_idx on public.drawn_cards (card_id);


-- ──────────────────────────────── readings ─────────────────────────────────
-- O documento de leitura de uma pergunta: rascunho gerado pela IA, versão
-- editada pelo revisor humano e versão final liberada ao cliente.
create table public.readings (
  id                   uuid primary key default gen_random_uuid(),
  question_id          uuid not null unique references public.questions(id) on delete restrict,
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
comment on column public.readings.question_id is
  'ON DELETE RESTRICT (não CASCADE): uma leitura gerada não desaparece junto com a pergunta. O histórico de rascunho/edição/aprovação é preservado.';

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
  order_id       uuid not null references public.orders(id) on delete restrict,
  event_type     text not null,
  old_status     public.order_status,
  new_status     public.order_status,
  actor_user_id  uuid references auth.users(id) on delete set null,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

comment on table public.order_events is
  'Auditoria: histórico de mudanças de status de cada pedido, incluindo quem (actor_user_id) realizou a ação quando aplicável.';
comment on column public.order_events.order_id is
  'ON DELETE RESTRICT (não CASCADE): apagar um pedido nunca pode fazer sua trilha de auditoria desaparecer arrastada em cascata. Enquanto existir qualquer order_events, o pedido não pode ser removido.';

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


-- ═══════════════ 8. Privilégios explícitos (GRANTs para a Data API) ═══════
--
-- Este projeto Supabase foi criado com "Expor automaticamente novas
-- tabelas" DESATIVADO — ou seja, nenhuma tabela fica acessível pela Data
-- API (PostgREST) até receber um GRANT explícito, mesmo com RLS ativo.
--
-- GRANT e RLS são camadas diferentes e ambas precisam liberar o acesso:
--   • GRANT responde "este papel pode tentar este comando nesta tabela?"
--   • RLS responde "e quais LINHAS ele efetivamente vê ou altera?"
-- Sem RLS, um GRANT liberaria a tabela inteira. Sem GRANT, mesmo com RLS
-- favorável, a Data API rejeita o pedido antes de chegar nas políticas.
-- É por isso que esta seção vem depois da 7 (RLS) — o RLS já está armado
-- antes de qualquer privilégio de tabela ser concedido.
--
-- Cada GRANT abaixo é explícito por tabela (não usamos
-- "grant all on all tables in schema public") de propósito: a migration
-- deve documentar exatamente o que cada papel pode tentar fazer.

grant usage on schema public to anon, authenticated, service_role;

-- ─── anon (visitante do site, sem login): só leitura de pacotes ativos.
-- Os REVOKE abaixo são defensivos/documentais — uma tabela recém-criada já
-- não concede nada a ninguém além do dono por padrão — mas deixam escrito,
-- de forma explícita e à prova de futuras mudanças acidentais, que anon
-- nunca deve ter acesso a estas 8 tabelas.
revoke all on public.orders         from anon;
revoke all on public.questions      from anon;
revoke all on public.tarot_cards    from anon;
revoke all on public.drawn_cards    from anon;
revoke all on public.readings       from anon;
revoke all on public.payment_events from anon;
revoke all on public.order_events   from anon;
revoke all on public.admin_users    from anon;

grant select on public.packages to anon;

-- ─── authenticated: privilégio SQL amplo nas tabelas operacionais, mas o
-- RLS (seção 9) ainda exige public.is_admin() para qualquer coisa além de
-- packages — estes GRANTs, sozinhos, NÃO tornam os dados públicos.
grant select, insert, update, delete on public.packages       to authenticated;

-- orders, questions, drawn_cards e readings são registros operacionais
-- protegidos contra exclusão: nenhum papel tem DELETE nestas quatro
-- tabelas. Cancelamento/expiração de pedido, sorteios e leituras são
-- sempre representados por status, nunca por remoção de linha — ver
-- comentários de coluna em cada tabela e docs/DB_SCHEMA.md.
grant select, insert, update on public.orders         to authenticated;
grant select, insert, update on public.questions      to authenticated;
grant select, insert, update, delete on public.tarot_cards    to authenticated;
grant select, insert, update on public.drawn_cards    to authenticated;
grant select, insert, update on public.readings       to authenticated;

-- payment_events e order_events são histórico append-only: administradores
-- podem consultar e registrar eventos, mas nunca apagar. Nenhum dos dois
-- recebe UPDATE aqui para o papel authenticated — em payment_events, a
-- política payment_events_admin_update continua existindo (ver seção de
-- políticas) para uso futuro, mas sem este GRANT ela é inalcançável pela
-- Data API hoje: a atualização de status de processamento é feita só pelo
-- service_role. Em order_events, nem a política existe — é imutável por
-- completo, em qualquer papel.
grant select, insert on public.payment_events to authenticated;
grant select, insert on public.order_events   to authenticated;

-- admin_users: só leitura. Conceder acesso de administrador continua sendo
-- uma operação fora do RLS de escrita — sem GRANT de insert/update/delete
-- aqui, nem um administrador autenticado consegue alterar esta tabela pela
-- Data API (ver também a política admin_users_admin_read).
grant select on public.admin_users to authenticated;

-- ─── service_role: acesso operacional completo, usado somente pelas Edge
-- Functions. Ignora RLS por definição do Supabase, mas ainda precisa do
-- GRANT — sem ele, a Data API rejeitaria o comando antes de chequar RLS.
-- Esta chave NUNCA pode aparecer no navegador do cliente.
grant select, insert, update, delete on public.packages       to service_role;

-- Mesma proteção contra exclusão vale para o backend: nem as Edge
-- Functions apagam pedidos, perguntas, sorteios ou leituras — uma limpeza
-- de dados, se um dia for necessária, é ação excepcional feita direto no
-- banco, fora do papel service_role.
grant select, insert, update on public.orders         to service_role;
grant select, insert, update on public.questions      to service_role;
grant select, insert, update, delete on public.tarot_cards    to service_role;
grant select, insert, update on public.drawn_cards    to service_role;
grant select, insert, update on public.readings       to service_role;

-- payment_events e order_events são histórico append-only mesmo para o
-- backend. A Edge Function do webhook precisa poder ATUALIZAR
-- payment_events (status de processamento, attempts, error_message,
-- processed_at) — por isso mantém UPDATE ali. order_events é mais estrito
-- ainda: NENHUM papel, nem service_role, recebe UPDATE ou DELETE — uma vez
-- inserido, um evento de auditoria é permanente. Correção de um evento
-- registrado deve gerar um novo evento, nunca apagar ou alterar o anterior.
grant select, insert, update on public.payment_events to service_role;
grant select, insert         on public.order_events   to service_role;

grant select, insert, update, delete on public.admin_users    to service_role;


-- ═══════════════════════════ 9. Políticas de acesso ════════════════════════
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
-- Sem política de DELETE de propósito: um pedido nunca é apagado pela
-- aplicação — cancelamento e expiração são representados por orders.status.
create policy orders_admin_select
  on public.orders
  for select
  to authenticated
  using (public.is_admin());

create policy orders_admin_insert
  on public.orders
  for insert
  to authenticated
  with check (public.is_admin());

create policy orders_admin_update
  on public.orders
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- questions: mesmo princípio — só administradores, e também sem DELETE:
-- uma pergunta permanece registrada mesmo que o pedido seja cancelado.
create policy questions_admin_select
  on public.questions
  for select
  to authenticated
  using (public.is_admin());

create policy questions_admin_insert
  on public.questions
  for insert
  to authenticated
  with check (public.is_admin());

create policy questions_admin_update
  on public.questions
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- tarot_cards: catálogo interno de trabalho, não é exposto ao público
-- diretamente (a página do cliente recebe o conteúdo já pronto via Edge
-- Function). Só administradores. Catálogo de referência — mantém DELETE,
-- diferente das tabelas de registro operacional abaixo.
create policy tarot_cards_admin_manage
  on public.tarot_cards
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- drawn_cards: nunca visível a visitantes — só administradores. Sem
-- DELETE: um sorteio já realizado é permanente (ver comentário na tabela).
create policy drawn_cards_admin_select
  on public.drawn_cards
  for select
  to authenticated
  using (public.is_admin());

create policy drawn_cards_admin_insert
  on public.drawn_cards
  for insert
  to authenticated
  with check (public.is_admin());

create policy drawn_cards_admin_update
  on public.drawn_cards
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- readings: contém rascunhos e conteúdo ainda não aprovado — só
-- administradores. O cliente nunca lê esta tabela diretamente. Sem
-- DELETE: uma leitura gerada não é apagada, mesmo que seja reprovada
-- (o histórico de draft/edição/aprovação fica preservado).
create policy readings_admin_select
  on public.readings
  for select
  to authenticated
  using (public.is_admin());

create policy readings_admin_insert
  on public.readings
  for insert
  to authenticated
  with check (public.is_admin());

create policy readings_admin_update
  on public.readings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- payment_events: dado financeiro sensível, histórico append-only.
-- Administradores podem consultar e registrar eventos — mas não existe
-- política de DELETE: nenhum papel autenticado pode apagar um evento de
-- pagamento já registrado.
create policy payment_events_admin_select
  on public.payment_events
  for select
  to authenticated
  using (public.is_admin());

create policy payment_events_admin_insert
  on public.payment_events
  for insert
  to authenticated
  with check (public.is_admin());

-- Política mantida para uso futuro (ex.: um painel que precise corrigir
-- manualmente um campo de processamento), mas HOJE é inalcançável: o
-- GRANT de UPDATE em payment_events para authenticated foi removido de
-- propósito (ver seção de GRANTs) — só o service_role atualiza esta
-- tabela, a partir da Edge Function do webhook.
create policy payment_events_admin_update
  on public.payment_events
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- order_events: histórico de auditoria IMUTÁVEL depois de inserido.
-- Administradores podem consultar e inserir novos eventos — mas não existe
-- política de UPDATE nem de DELETE: uma correção deve gerar um novo evento
-- (nova linha), nunca alterar ou remover um evento já registrado.
create policy order_events_admin_select
  on public.order_events
  for select
  to authenticated
  using (public.is_admin());

create policy order_events_admin_insert
  on public.order_events
  for insert
  to authenticated
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


-- ═══════════════════════ 10. Pacotes iniciais (seed) ═══════════════════════
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
