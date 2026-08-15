-- ════════════════════════════════════════════════════════════════════════════
--  ENTRE NÓS TARÔ — NOVO PRODUTO: GUIA DE EVOLUÇÃO DE ENFERMAGEM + ORDER BUMPS
--
--  Etapa 2 do plano aprovado: reaproveitar toda a infraestrutura de
--  pagamento já existente (Mercado Pago, Turnstile, rate limiting,
--  idempotência via checkout_request_id, mercado-pago-webhook,
--  mark_order_paid) para um segundo TIPO de pedido — produtos digitais
--  (PDF) com order bumps opcionais — sem tocar em nada do fluxo de tarô.
--
--  ─────────────────────────── Desenho ───────────────────────────────────
--  1. public.products — catálogo dos produtos digitais (produto principal +
--     bumps), espelhando public.packages (mesma ideia de "fonte única de
--     verdade para o valor cobrado"), mas sem question_limit (não há
--     perguntas aqui) e com o caminho do arquivo no Storage.
--
--  2. public.order_items — os produtos efetivamente comprados em UM pedido,
--     em snapshot (product_slug/product_name/unit_price_cents gravados no
--     momento da compra, nunca relidos de products depois) — mesmo
--     princípio já usado em public.questions para as perguntas de um
--     pedido de tarô.
--
--  3. public.orders ganha duas colunas aditivas:
--       - order_kind ('tarot_reading' | 'digital_product', default
--         'tarot_reading' — todo pedido já existente continua exatamente
--         como estava, sem nenhuma migração de dado);
--       - package_id passa a ser NULLABLE (só pedidos 'tarot_reading'
--         precisam dele agora).
--     Uma CHECK constraint nova garante, no próprio banco (não só na
--     Edge Function/RPC), que os dois campos nunca ficam inconsistentes:
--     'tarot_reading' sempre com package_id preenchido, 'digital_product'
--     sempre com package_id nulo.
--
--  4. public.create_or_get_product_order_with_items(...) — irmã de
--     public.create_or_get_order_with_questions(), copiada estruturalmente
--     (mesmo lock, mesmo loop de retry para corrida em checkout_request_id,
--     mesma regra de "terms_version/privacy_version gravados uma única vez
--     e nunca comparados na recuperação") — nunca compartilhada com a
--     função de tarô, por decisão explícita, para não arriscar o fluxo já
--     em produção (mesmo raciocínio já registrado para
--     mercado-pago-webhook duplicar em vez de importar de create-pix-order).
--
--     Preço é SEMPRE calculado aqui, somando products.price_cents dos
--     slugs recebidos — o cliente (frontend/Edge Function) nunca envia
--     nem influencia amount_cents. Exige exatamente UM produto kind='primary'
--     entre os slugs recebidos (hoje só existe um: guia-evolucao-enfermagem)
--     e zero ou mais produtos kind='bump', sem repetição.
--
--  5. Seed dos 5 produtos do MVP (preços em centavos, únicos valores
--     hardcoded nesta migration — igual ao seed de packages na migration
--     inicial):
--       guia-evolucao-enfermagem   (primary)  1700
--       guia-ilustrado-enfermagem  (bump)      1000
--       2500-questoes-concursos    (bump)      1000
--       legislacao-sus-ilustrada   (bump)      1000
--       guia-feridas-cronicas      (bump)      1000
--
--  ─────────────────────── Fora do escopo desta migration ─────────────────
--  NÃO cria bucket nem envia nenhum arquivo ao Supabase Storage — Storage
--  não é gerenciado por migration SQL. products.storage_object_path guarda
--  desde já o caminho ESPERADO (convenção "<slug>.pdf" dentro do bucket
--  "product-files"), mas o upload real dos PDFs é uma ação manual/separada,
--  fora desta etapa. Sem o arquivo enviado, uma tentativa futura de gerar
--  signed URL para esse caminho simplesmente falha — nunca finge sucesso.
--
--  NÃO altera create-pix-order, mercado-pago-webhook, draw-cards,
--  mark_order_paid, link_mercado_pago_order, record_checkout_attempt nem
--  nenhuma tabela/enum específico de tarô (packages, questions, tarot_cards,
--  drawn_cards, readings). NÃO cria a Edge Function create-product-order
--  nem get-order-downloads (Etapa 3). NÃO mexe em frontend.
-- ════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════ 1. products ════════════════════════════════
create table public.products (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique check (btrim(slug) <> ''),
  name                  text not null check (btrim(name) <> ''),
  description           text,
  kind                  text not null check (kind in ('primary', 'bump')),
  price_cents           integer not null check (price_cents > 0),
  currency              text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  -- Caminho ESPERADO do PDF dentro do Storage — ver nota "Fora do escopo"
  -- no cabeçalho. O upload do arquivo em si não faz parte desta migration.
  storage_bucket        text not null default 'product-files' check (btrim(storage_bucket) <> ''),
  storage_object_path   text not null unique check (btrim(storage_object_path) <> ''),
  active                boolean not null default true,
  display_order         integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.products is
  'Catálogo dos produtos digitais (PDF) vendidos fora do fluxo de tarô: um produto principal (kind=primary) e order bumps opcionais (kind=bump). Fonte única de verdade para o valor cobrado — o front nunca deve ser confiado para isso. Espelha public.packages, mas sem question_limit (não há perguntas neste fluxo).';
comment on column public.products.kind is
  '''primary'': produto principal, obrigatório em todo pedido deste tipo (hoje só existe um). ''bump'': order bump opcional — um pedido pode incluir zero ou mais.';
comment on column public.products.storage_object_path is
  'Caminho do PDF dentro do bucket privado do Supabase Storage indicado por storage_bucket. Único por produto. O upload do arquivo em si é feito fora desta migration (Storage não é gerenciado por SQL) — a existência da linha aqui não implica que o objeto já foi enviado.';

create trigger set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create index products_active_idx on public.products (active);
create index products_kind_idx on public.products (kind);

alter table public.products enable row level security;

-- Mesmo padrão de public.packages: qualquer visitante pode ver os produtos
-- ativos (preço e nome — nada sensível); administradores gerenciam tudo.
revoke all on public.products from anon;
grant select on public.products to anon;

grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.products to service_role;

create policy products_public_read_active
  on public.products
  for select
  to anon, authenticated
  using (active = true);

create policy products_admin_manage
  on public.products
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ═════════════════════════════ 2. order_items ═══════════════════════════════
-- Os produtos efetivamente comprados em UM pedido — uma linha por produto,
-- em SNAPSHOT (product_slug/product_name/unit_price_cents gravados no
-- momento da criação do pedido, nunca relidos de products depois). Mesmo
-- princípio de public.questions para perguntas de um pedido de tarô: o que
-- foi comprado fica congelado, mesmo que o catálogo mude depois.
create table public.order_items (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete restrict,
  product_id         uuid not null references public.products(id) on delete restrict,
  product_slug       text not null check (btrim(product_slug) <> ''),
  product_name       text not null check (btrim(product_name) <> ''),
  unit_price_cents   integer not null check (unit_price_cents > 0),
  created_at         timestamptz not null default now(),
  -- Um produto não pode aparecer duas vezes no mesmo pedido.
  unique (order_id, product_id)
);

comment on table public.order_items is
  'Produtos efetivamente comprados em um pedido do tipo digital_product — snapshot de product_slug/product_name/unit_price_cents no momento da compra (nunca relido de products depois). Imutável por natureza: nenhum papel tem UPDATE ou DELETE nesta tabela, mesma proteção já usada em drawn_cards.';
comment on column public.order_items.order_id is
  'ON DELETE RESTRICT (não CASCADE): um pedido com itens não pode ser apagado enquanto eles existirem — mesmo padrão de questions.order_id.';

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

alter table public.order_items enable row level security;

-- Nenhum acesso para anon (mesmo padrão de questions/drawn_cards). Só
-- SELECT para authenticated (painel admin) — sem INSERT/UPDATE/DELETE: a
-- única forma legítima de criar order_items é a RPC abaixo (SECURITY
-- DEFINER), nunca escrita direta pela Data API, nem por um administrador.
revoke all on public.order_items from anon;
grant select on public.order_items to authenticated;
grant select, insert on public.order_items to service_role;

create policy order_items_admin_select
  on public.order_items
  for select
  to authenticated
  using (public.is_admin());


-- ═══════════════════════ 3. orders: suporte a um 2º tipo de pedido ══════════
-- package_id passa a ser opcional: só pedidos 'tarot_reading' precisam dele
-- agora. Nenhuma linha existente muda de valor (todas continuam com
-- package_id preenchido).
alter table public.orders
  alter column package_id drop not null;

-- order_kind com DEFAULT explícito: as 5 linhas já existentes hoje neste
-- projeto recebem 'tarot_reading' automaticamente (é exatamente o que elas
-- são), sem nenhum UPDATE manual.
alter table public.orders
  add column order_kind text not null default 'tarot_reading'
  check (order_kind in ('tarot_reading', 'digital_product'));

comment on column public.orders.order_kind is
  '''tarot_reading'': pedido do fluxo original (package_id obrigatório, perguntas em public.questions). ''digital_product'': pedido de produto digital com order bumps (package_id nulo, itens em public.order_items). Nunca alterado depois de criado.';

-- Garantia no PRÓPRIO BANCO (não só em Edge Function/RPC) de que os dois
-- campos nunca ficam inconsistentes entre si.
alter table public.orders
  add constraint orders_package_id_matches_kind
  check (
    (order_kind = 'tarot_reading' and package_id is not null)
    or (order_kind = 'digital_product' and package_id is null)
  );

create index orders_order_kind_idx on public.orders (order_kind);

-- Nenhuma política de RLS nova é necessária: orders_admin_select/insert/
-- update (migration inicial) já cobrem qualquer order_kind, sem distinção.


-- ═══════ 4. Função: criação idempotente de pedido de produto + itens ════════
create or replace function public.create_or_get_product_order_with_items(
  p_checkout_request_id       uuid,
  p_checkout_access_token     text,
  p_product_slugs             text[],
  p_customer_name             text,
  p_customer_email            text,
  p_terms_version             text,
  p_privacy_version           text,
  p_mercado_pago_environment  text
)
returns table (
  order_id                  uuid,
  public_id                 uuid,
  amount_cents               integer,
  currency                   text,
  customer_email              text,
  order_created_at            timestamptz,
  mercado_pago_order_id       text,
  mercado_pago_payment_id     text,
  mercado_pago_environment    text,
  item_slugs                  text[],
  item_names                  text[]
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
#variable_conflict error
-- order_id, public_id, amount_cents, currency, customer_email,
-- order_created_at, mercado_pago_order_id, mercado_pago_payment_id,
-- mercado_pago_environment, item_slugs e item_names (nomes do RETURNS
-- TABLE) também existem como colunas reais em orders/order_items. Com
-- #variable_conflict error, qualquer referência não qualificada a esses
-- nomes vira erro em tempo de execução — toda referência a coluna abaixo
-- usa alias de tabela (o., oi., p.) ou variável com prefixo v_/p_.
declare
  v_access_token_hash        text;
  v_normalized_email         text;
  v_normalized_name          text;
  v_sorted_slugs              text[];
  v_slug_count                 integer;
  v_distinct_slug_count         integer;
  v_index                        integer;
  v_attempt                       integer := 0;
  v_constraint_name                text;

  -- Dados do pedido já persistido, quando checkout_request_id já existe.
  v_existing_order_id        uuid;
  v_existing_public_id       uuid;
  v_existing_amount_cents    integer;
  v_existing_currency        text;
  v_existing_customer_name   text;
  v_existing_customer_email  text;
  v_existing_token_hash      text;
  v_existing_mp_order_id     text;
  v_existing_mp_payment_id   text;
  v_existing_mp_environment  text;
  v_existing_created_at      timestamptz;
  v_existing_order_kind      text;
  v_existing_slugs           text[];
  v_existing_names           text[];

  -- Valores autoritativos dos produtos — só lidos (com active = true) quando
  -- checkout_request_id ainda não existe, isto é, só no caminho de INSERT
  -- novo. Nunca vêm de parâmetro.
  v_resolved_count             integer;
  v_primary_count               integer;
  v_amount_cents                  integer;
  v_currency                       text;
  v_currency_mismatch_count         integer;

  -- Resultado da criação nova.
  v_order_id                    uuid;
  v_public_id                    uuid;
  v_created_at                    timestamptz;
  v_new_names                     text[];
begin
  -- ── 1. Validação básica dos parâmetros ──────────────────────────────────
  if p_checkout_request_id is null then
    raise exception 'create_or_get_product_order_with_items: checkout_request_id não informado.';
  end if;

  if p_checkout_access_token is null or p_checkout_access_token !~ '^[0-9a-f]{64}$' then
    raise exception
      'create_or_get_product_order_with_items: checkout_access_token inválido (esperado 64 caracteres hexadecimais).';
  end if;

  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'create_or_get_product_order_with_items: nome do cliente não informado.';
  end if;

  if p_customer_email is null
     or btrim(p_customer_email) = ''
     or char_length(p_customer_email) > 254
     or p_customer_email not like '%@%' then
    raise exception 'create_or_get_product_order_with_items: e-mail inválido.';
  end if;

  if p_terms_version is null or btrim(p_terms_version) = '' then
    raise exception 'create_or_get_product_order_with_items: terms_version não informado.';
  end if;

  if p_privacy_version is null or btrim(p_privacy_version) = '' then
    raise exception 'create_or_get_product_order_with_items: privacy_version não informado.';
  end if;

  if p_mercado_pago_environment is null or p_mercado_pago_environment not in ('test', 'production') then
    raise exception
      'create_or_get_product_order_with_items: mercado_pago_environment deve ser "test" ou "production".';
  end if;

  v_slug_count := pg_catalog.coalesce(pg_catalog.cardinality(p_product_slugs), 0);
  if v_slug_count = 0 then
    raise exception 'create_or_get_product_order_with_items: nenhum produto informado.';
  end if;
  -- Sanidade: catálogo do MVP tem 5 produtos (1 primary + 4 bumps) — um
  -- pedido nunca pode ter mais linhas que o catálogo inteiro.
  if v_slug_count > 16 then
    raise exception 'create_or_get_product_order_with_items: quantidade de produtos excede o limite permitido.';
  end if;

  for v_index in 1..v_slug_count loop
    if p_product_slugs[v_index] is null or btrim(p_product_slugs[v_index]) = '' then
      raise exception 'create_or_get_product_order_with_items: slug de produto vazio na posição %.', v_index;
    end if;
  end loop;

  -- Ordenado para comparação determinística (o pedido é o mesmo CONJUNTO
  -- de produtos, independente da ordem em que o cliente marcou os bumps).
  select pg_catalog.array_agg(s.slug order by s.slug)
    into v_sorted_slugs
  from unnest(p_product_slugs) as s(slug);

  select count(distinct s.slug)
    into v_distinct_slug_count
  from unnest(v_sorted_slugs) as s(slug);

  if v_distinct_slug_count <> v_slug_count then
    raise exception 'create_or_get_product_order_with_items: produto repetido na mesma compra.';
  end if;

  v_normalized_email := lower(btrim(p_customer_email));
  v_normalized_name := lower(btrim(p_customer_name));

  -- Hash calculado uma única vez aqui — sempre 64 caracteres hex por
  -- construção (já validado acima).
  v_access_token_hash := pg_catalog.encode(extensions.digest(p_checkout_access_token, 'sha256'), 'hex');

  -- ── 2. Loop de no máximo 2 tentativas: mesmo padrão de
  --      create_or_get_order_with_questions — cobre o caminho normal
  --      (procura → encontra ou cria) e a corrida entre duas requisições
  --      SIMULTÂNEAS com o mesmo checkout_request_id.
  <<attempt_loop>>
  loop
    v_attempt := v_attempt + 1;

    select o.id, o.public_id, o.amount_cents, o.currency, o.order_kind,
           o.customer_name, o.customer_email, o.access_token_hash,
           o.mercado_pago_order_id, o.mercado_pago_payment_id,
           o.mercado_pago_environment, o.created_at
      into v_existing_order_id, v_existing_public_id, v_existing_amount_cents, v_existing_currency,
           v_existing_order_kind,
           v_existing_customer_name, v_existing_customer_email, v_existing_token_hash,
           v_existing_mp_order_id, v_existing_mp_payment_id,
           v_existing_mp_environment, v_existing_created_at
    from public.orders o
    where o.checkout_request_id = p_checkout_request_id
    for update of o;

    if found then
      -- checkout_request_id é UNIQUE em toda a tabela orders — uma colisão
      -- com um pedido de TAROT não deveria ser fisicamente possível (UUIDs
      -- gerados independentemente pelo frontend), mas nunca presumida como
      -- segura: um pedido do tipo errado aqui é tratado como conflito, não
      -- como recuperação.
      if v_existing_order_kind <> 'digital_product' then
        raise exception
          'create_or_get_product_order_with_items: checkout_request_id % já pertence a um pedido de outro tipo.',
          p_checkout_request_id;
      end if;

      select pg_catalog.array_agg(oi.product_slug order by oi.product_slug),
             pg_catalog.array_agg(oi.product_name order by oi.product_slug)
        into v_existing_slugs, v_existing_names
      from public.order_items oi
      where oi.order_id = v_existing_order_id;

      -- IS DISTINCT FROM (não <>): null-safe. Compara contra o que já está
      -- PERSISTIDO — nunca contra preço/nome atuais de products, e nunca
      -- resulta em UPDATE do pedido existente. terms_version/
      -- privacy_version propositalmente NÃO entram nesta comparação, pelo
      -- mesmo motivo já documentado em create_or_get_order_with_questions.
      if v_existing_slugs is distinct from v_sorted_slugs
         or lower(btrim(v_existing_customer_name)) is distinct from v_normalized_name
         or lower(btrim(v_existing_customer_email)) is distinct from v_normalized_email
         or v_existing_token_hash is distinct from v_access_token_hash
         or v_existing_mp_environment is distinct from p_mercado_pago_environment then
        raise exception
          'create_or_get_product_order_with_items: checkout_request_id % já foi usado com dados diferentes.',
          p_checkout_request_id;
      end if;

      return query
        select v_existing_order_id, v_existing_public_id, v_existing_amount_cents, v_existing_currency,
               v_existing_customer_email, v_existing_created_at,
               v_existing_mp_order_id, v_existing_mp_payment_id, v_existing_mp_environment,
               v_existing_slugs, v_existing_names;
      return;
    end if;

    -- ── Nenhum pedido ainda para este checkout_request_id: cria agora.
    --    SÓ AQUI os produtos precisam estar ativos — preço SEMPRE vem
    --    daqui, nunca de parâmetro. FOR UPDATE trava as linhas de products
    --    envolvidas ANTES de somar/validar — nenhuma transação concorrente
    --    consegue alterar preço/kind/active destes produtos enquanto esta
    --    transação estiver aberta. PERFORM roda a consulta só pelo efeito
    --    do lock; os dados em si vêm das consultas seguintes (já
    --    protegidas pelo lock que acabamos de tomar, sem precisar repetir
    --    FOR UPDATE nelas — mesma linha, mesma transação).
    perform 1
    from public.products p
    where p.slug = any (v_sorted_slugs)
      and p.active = true
    for update of p;

    select count(*), count(*) filter (where p.kind = 'primary'), count(distinct p.currency)
      into v_resolved_count, v_primary_count, v_currency_mismatch_count
    from public.products p
    where p.slug = any (v_sorted_slugs)
      and p.active = true;

    if v_resolved_count <> v_slug_count then
      raise exception 'create_or_get_product_order_with_items: um ou mais produtos não existem ou estão inativos.';
    end if;
    if v_primary_count = 0 then
      raise exception 'create_or_get_product_order_with_items: o produto principal é obrigatório nesta compra.';
    end if;
    if v_primary_count > 1 then
      raise exception 'create_or_get_product_order_with_items: mais de um produto principal informado.';
    end if;
    if v_currency_mismatch_count <> 1 then
      raise exception 'create_or_get_product_order_with_items: produtos com moedas diferentes na mesma compra.';
    end if;

    select sum(p.price_cents), min(p.currency)
      into v_amount_cents, v_currency
    from public.products p
    where p.slug = any (v_sorted_slugs)
      and p.active = true;

    begin
      insert into public.orders as o
        (customer_name, customer_email, package_id, order_kind, amount_cents, currency, status,
         access_token_hash, terms_version, privacy_version, checkout_request_id,
         mercado_pago_environment)
      values
        (btrim(p_customer_name), btrim(p_customer_email), null, 'digital_product', v_amount_cents, v_currency,
         'pending_payment', v_access_token_hash, p_terms_version, p_privacy_version, p_checkout_request_id,
         p_mercado_pago_environment)
      returning o.id, o.public_id, o.created_at into v_order_id, v_public_id, v_created_at;

      insert into public.order_items (order_id, product_id, product_slug, product_name, unit_price_cents)
      select v_order_id, p.id, p.slug, p.name, p.price_cents
      from public.products p
      where p.slug = any (v_sorted_slugs)
        and p.active = true;

      -- v_sorted_slugs já é o conjunto validado e ordenado — reaproveitado
      -- diretamente para o retorno, sem nova consulta.
      select pg_catalog.array_agg(p.name order by p.slug)
        into v_new_names
      from public.products p
      where p.slug = any (v_sorted_slugs)
        and p.active = true;

      -- Pedido recém-criado: nunca tem mercado_pago_order_id/payment_id
      -- ainda — preenchido depois pela Edge Function, via
      -- link_mercado_pago_order (reaproveitada sem alteração).
      return query
        select v_order_id, v_public_id, v_amount_cents, v_currency,
               btrim(p_customer_email), v_created_at, null::text, null::text, p_mercado_pago_environment,
               v_sorted_slugs, v_new_names;
      return;
    exception
      when unique_violation then
        get stacked diagnostics v_constraint_name = constraint_name;
        if v_constraint_name is distinct from 'orders_checkout_request_id_key' then
          raise;
        end if;

        if v_attempt >= 2 then
          raise exception
            'create_or_get_product_order_with_items: falha ao reconciliar checkout_request_id % após conflito de concorrência.',
            p_checkout_request_id;
        end if;
        -- Outra transação concorrente venceu a corrida: a próxima volta do
        -- loop encontra o pedido dela e aplica a mesma checagem acima.
    end;
  end loop;
end;
$$;

comment on function public.create_or_get_product_order_with_items(uuid, text, text[], text, text, text, text, text) is
  'Cria (ou, se checkout_request_id já existe com o mesmo conjunto de produtos/dados — incluindo o mesmo mercado_pago_environment — apenas devolve o que está persistido) um pedido de produto digital + seus order_items, atomicamente. Exige exatamente um produto kind=primary entre os slugs recebidos e zero ou mais kind=bump, sem repetição. amount_cents é SEMPRE somado a partir de products.price_cents no momento da criação — nunca recebido como parâmetro de preço. Protegida contra retries sequenciais e requisições concorrentes, mesmo padrão de create_or_get_order_with_questions. Executável somente por service_role.';

revoke execute on function public.create_or_get_product_order_with_items(uuid, text, text[], text, text, text, text, text) from public;
revoke execute on function public.create_or_get_product_order_with_items(uuid, text, text[], text, text, text, text, text) from anon;
revoke execute on function public.create_or_get_product_order_with_items(uuid, text, text[], text, text, text, text, text) from authenticated;
grant execute on function public.create_or_get_product_order_with_items(uuid, text, text[], text, text, text, text, text) to service_role;


-- ═════════════════════════════════ 5. Seed ══════════════════════════════════
-- Preços em centavos — únicos valores hardcoded nesta migration, exatamente
-- os informados: produto principal R$17,00; cada bump R$10,00.
insert into public.products
  (slug, name, kind, price_cents, storage_bucket, storage_object_path, active, display_order)
values
  ('guia-evolucao-enfermagem', 'Guia de Evolução de Enfermagem', 'primary', 1700,
   'product-files', 'guia-evolucao-enfermagem.pdf', true, 0),
  ('guia-ilustrado-enfermagem', 'Guia Ilustrado de Enfermagem', 'bump', 1000,
   'product-files', 'guia-ilustrado-enfermagem.pdf', true, 1),
  ('2500-questoes-concursos', '2500 Questões de Concursos', 'bump', 1000,
   'product-files', '2500-questoes-concursos.pdf', true, 2),
  ('legislacao-sus-ilustrada', 'Legislação SUS Ilustrada', 'bump', 1000,
   'product-files', 'legislacao-sus-ilustrada.pdf', true, 3),
  ('guia-feridas-cronicas', 'Guia de Feridas Crônicas', 'bump', 1000,
   'product-files', 'guia-feridas-cronicas.pdf', true, 4);


-- ═══════════════════════════ Consultas de validação ════════════════════════
-- Comentadas de propósito — não executam automaticamente com esta migration.

-- Nenhum pedido digital_product com package_id preenchido, e nenhum
-- tarot_reading com package_id nulo (0 linhas = ok; já é garantido por
-- CHECK, isto é só uma checagem de sanidade extra):
-- select id, order_kind, package_id
-- from public.orders
-- where (order_kind = 'tarot_reading' and package_id is null)
--    or (order_kind = 'digital_product' and package_id is not null);

-- Todo pedido digital_product deve ter pelo menos um order_item com
-- produto kind=primary (0 linhas = ok):
-- select o.id
-- from public.orders o
-- where o.order_kind = 'digital_product'
--   and not exists (
--     select 1
--     from public.order_items oi
--     join public.products p on p.id = oi.product_id
--     where oi.order_id = o.id and p.kind = 'primary'
--   );

-- amount_cents de todo pedido digital_product deve bater com a soma dos
-- seus order_items (0 linhas = ok):
-- select o.id, o.amount_cents, sum(oi.unit_price_cents) as items_total
-- from public.orders o
-- join public.order_items oi on oi.order_id = o.id
-- where o.order_kind = 'digital_product'
-- group by o.id, o.amount_cents
-- having o.amount_cents <> sum(oi.unit_price_cents);

-- Os 5 produtos do seed, ativos, com exatamente 1 primary e 4 bumps
-- (esperado: 1 linha "primary" | 1, 1 linha "bump" | 4):
-- select kind, count(*) from public.products where active = true group by kind;
