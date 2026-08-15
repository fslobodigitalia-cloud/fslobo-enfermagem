-- ════════════════════════════════════════════════════════════════════════════
--  ENTRE NÓS TARÔ — CORREÇÃO: public.create_or_get_product_order_with_items
--
--  Esta migration CORRIGE, via CREATE OR REPLACE FUNCTION, exatamente uma
--  linha de public.create_or_get_product_order_with_items() (criada na
--  migration 008, create_product_order_function): a chamada
--
--    v_slug_count := pg_catalog.coalesce(pg_catalog.cardinality(p_product_slugs), 0);
--
--  falha em tempo de EXECUÇÃO (nunca na criação da função — CREATE FUNCTION
--  não valida profundamente expressões do corpo em plpgsql) com:
--    ERROR: 42883: function pg_catalog.coalesce(integer, integer) does not
--    exist
--  Confirmado isoladamente nesta sessão, direto no banco:
--    select pg_catalog.coalesce(1::integer, 0);  -- mesmo erro
--    select coalesce(1::integer, 0);              -- ok
--  COALESCE é uma construção especial do SQL padrão (como CASE), não uma
--  função de catálogo de verdade — nunca pode ser schema-qualificada como
--  pg_catalog.coalesce(...). pg_catalog.cardinality(...) É uma função real
--  e continua correta como está, sem mudança.
--
--  ACHADO SEPARADO, FORA DO ESCOPO DESTA MIGRATION — REGISTRADO AQUI PARA
--  VISIBILIDADE, NÃO CORRIGIDO: public.create_or_get_order_with_questions()
--  (migrations 005/006, fluxo de tarô) tem a MESMA linha, sem correção:
--    v_question_count := pg_catalog.coalesce(pg_catalog.cardinality(p_questions), 0);
--  Essa linha roda incondicionalmente no início de TODA chamada (nenhum
--  pedido de tarô tem zero perguntas) — ou seja, hoje, qualquer tentativa
--  real de gerar um Pix pelo fluxo de tarô existente falha com o mesmo
--  erro, antes de qualquer INSERT. Este arquivo NÃO altera essa função —
--  instrução explícita desta etapa foi não tocar em create-pix-order nem em
--  nada do fluxo de tarô. Correção deve ser tratada como um item separado,
--  fora desta etapa.
--
--  Nenhuma outra mudança: mesma assinatura, mesmo corpo, mesmas permissões
--  (já concedidas pela migration 008, não repetidas aqui desnecessariamente
--  — GRANT/REVOKE são idempotentes, mas CREATE OR REPLACE FUNCTION sozinho
--  já é suficiente e não afeta permissões existentes na função).
-- ════════════════════════════════════════════════════════════════════════════

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

  v_resolved_count             integer;
  v_primary_count               integer;
  v_amount_cents                  integer;
  v_currency                       text;
  v_currency_mismatch_count         integer;

  v_order_id                    uuid;
  v_public_id                    uuid;
  v_created_at                    timestamptz;
  v_new_names                     text[];
begin
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

  -- CORREÇÃO desta migration: coalesce (não pg_catalog.coalesce — ver
  -- cabeçalho). pg_catalog.cardinality continua correta, sem mudança.
  v_slug_count := coalesce(pg_catalog.cardinality(p_product_slugs), 0);
  if v_slug_count = 0 then
    raise exception 'create_or_get_product_order_with_items: nenhum produto informado.';
  end if;
  if v_slug_count > 16 then
    raise exception 'create_or_get_product_order_with_items: quantidade de produtos excede o limite permitido.';
  end if;

  for v_index in 1..v_slug_count loop
    if p_product_slugs[v_index] is null or btrim(p_product_slugs[v_index]) = '' then
      raise exception 'create_or_get_product_order_with_items: slug de produto vazio na posição %.', v_index;
    end if;
  end loop;

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

  v_access_token_hash := pg_catalog.encode(extensions.digest(p_checkout_access_token, 'sha256'), 'hex');

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

      select pg_catalog.array_agg(p.name order by p.slug)
        into v_new_names
      from public.products p
      where p.slug = any (v_sorted_slugs)
        and p.active = true;

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
    end;
  end loop;
end;
$$;

comment on function public.create_or_get_product_order_with_items(uuid, text, text[], text, text, text, text, text) is
  'Cria (ou, se checkout_request_id já existe com o mesmo conjunto de produtos/dados — incluindo o mesmo mercado_pago_environment — apenas devolve o que está persistido) um pedido de produto digital + seus order_items, atomicamente. Exige exatamente um produto kind=primary entre os slugs recebidos e zero ou mais kind=bump, sem repetição. amount_cents é SEMPRE somado a partir de products.price_cents no momento da criação — nunca recebido como parâmetro de preço. Protegida contra retries sequenciais e requisições concorrentes, mesmo padrão de create_or_get_order_with_questions. Executável somente por service_role.';
