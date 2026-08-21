-- ═══════════════════════════════════════════════════════════════════════════
--  CARRINHO MULTIPRODUTO — ETAPA 1 (SOMENTE BACKEND)
--  Habilita create_or_get_product_order_with_items_efi() a aceitar 2+
--  produtos kind='primary' no mesmo pedido, mantendo compatibilidade total
--  com o fluxo atual do Guia de Evolução de Enfermagem (1 primary + 0..N
--  bumps) durante a transição.
--
--  ÚNICA mudança de comportamento: a checagem abaixo é REMOVIDA:
--
--    if v_primary_count > 1 then
--      raise exception '... mais de um produto principal informado.';
--    end if;
--
--  Nada mais no corpo da função muda: validação de nome/e-mail/tokens,
--  limite de 16 slugs, checagem de produto repetido, checagem de produto
--  inexistente/inativo, checagem de moeda única, cálculo de amount_cents
--  (sum(price_cents) sobre TODOS os slugs resolvidos — já era assim),
--  gravação de order_items (snapshot por produto), e a lógica de
--  idempotência por checkout_request_id permanecem byte-a-byte idênticas.
--
--  DEFINIÇÃO ANTERIOR EXATA (lida agora no banco, antes desta migration,
--  registrada aqui para rollback/auditoria — NÃO editar este bloco):
--
--    CREATE OR REPLACE FUNCTION public.create_or_get_product_order_with_items_efi(p_checkout_request_id uuid, p_checkout_access_token text, p_product_slugs text[], p_customer_name text, p_customer_email text, p_terms_version text, p_privacy_version text, p_efi_environment text)
--     RETURNS TABLE(order_id uuid, public_id uuid, amount_cents integer, currency text, customer_email text, order_created_at timestamp with time zone, efi_txid text, efi_location_id bigint, efi_environment text, item_slugs text[], item_names text[])
--     LANGUAGE plpgsql
--     SECURITY DEFINER
--     SET search_path TO 'pg_catalog', 'public', 'pg_temp'
--    AS $function$
--    #variable_conflict error
--    declare
--      v_access_token_hash text;
--      v_normalized_email text;
--      v_normalized_name text;
--      v_sorted_slugs text[];
--      v_slug_count integer;
--      v_distinct_slug_count integer;
--      v_index integer;
--      v_attempt integer := 0;
--      v_constraint_name text;
--
--      v_existing_order_id uuid;
--      v_existing_public_id uuid;
--      v_existing_amount_cents integer;
--      v_existing_currency text;
--      v_existing_customer_name text;
--      v_existing_customer_email text;
--      v_existing_token_hash text;
--      v_existing_efi_txid text;
--      v_existing_efi_location_id bigint;
--      v_existing_efi_environment text;
--      v_existing_created_at timestamptz;
--      v_existing_order_kind text;
--      v_existing_payment_provider text;
--      v_existing_slugs text[];
--      v_existing_names text[];
--
--      v_resolved_count integer;
--      v_primary_count integer;
--      v_amount_cents integer;
--      v_currency text;
--      v_currency_mismatch_count integer;
--
--      v_order_id uuid;
--      v_public_id uuid;
--      v_created_at timestamptz;
--      v_new_names text[];
--    begin
--      if p_checkout_request_id is null then
--        raise exception 'create_or_get_product_order_with_items_efi: checkout_request_id não informado.';
--      end if;
--      if p_checkout_access_token is null or p_checkout_access_token !~ '^[0-9a-f]{64}$' then
--        raise exception 'create_or_get_product_order_with_items_efi: checkout_access_token inválido.';
--      end if;
--      if p_customer_name is null or btrim(p_customer_name) = '' then
--        raise exception 'create_or_get_product_order_with_items_efi: nome do cliente não informado.';
--      end if;
--      if p_customer_email is null or btrim(p_customer_email) = '' or char_length(p_customer_email) > 254 or p_customer_email not like '%@%' then
--        raise exception 'create_or_get_product_order_with_items_efi: e-mail inválido.';
--      end if;
--      if p_terms_version is null or btrim(p_terms_version) = '' then
--        raise exception 'create_or_get_product_order_with_items_efi: terms_version não informado.';
--      end if;
--      if p_privacy_version is null or btrim(p_privacy_version) = '' then
--        raise exception 'create_or_get_product_order_with_items_efi: privacy_version não informado.';
--      end if;
--      if p_efi_environment is null or p_efi_environment not in ('homologation','production') then
--        raise exception 'create_or_get_product_order_with_items_efi: efi_environment deve ser homologation ou production.';
--      end if;
--
--      v_slug_count := coalesce(pg_catalog.cardinality(p_product_slugs),0);
--      if v_slug_count = 0 then
--        raise exception 'create_or_get_product_order_with_items_efi: nenhum produto informado.';
--      end if;
--      if v_slug_count > 16 then
--        raise exception 'create_or_get_product_order_with_items_efi: quantidade de produtos excede o limite permitido.';
--      end if;
--      for v_index in 1..v_slug_count loop
--        if p_product_slugs[v_index] is null or btrim(p_product_slugs[v_index]) = '' then
--          raise exception 'create_or_get_product_order_with_items_efi: slug de produto vazio na posição %.', v_index;
--        end if;
--      end loop;
--
--      select pg_catalog.array_agg(s.slug order by s.slug) into v_sorted_slugs
--      from unnest(p_product_slugs) as s(slug);
--
--      select count(distinct s.slug) into v_distinct_slug_count
--      from unnest(v_sorted_slugs) as s(slug);
--
--      if v_distinct_slug_count <> v_slug_count then
--        raise exception 'create_or_get_product_order_with_items_efi: produto repetido na mesma compra.';
--      end if;
--
--      v_normalized_email := lower(btrim(p_customer_email));
--      v_normalized_name := lower(btrim(p_customer_name));
--      v_access_token_hash := pg_catalog.encode(extensions.digest(p_checkout_access_token,'sha256'),'hex');
--
--      <<attempt_loop>>
--      loop
--        v_attempt := v_attempt + 1;
--
--        select o.id,o.public_id,o.amount_cents,o.currency,o.order_kind,o.payment_provider,
--               o.customer_name,o.customer_email,o.access_token_hash,
--               o.efi_txid,o.efi_location_id,o.efi_environment,o.created_at
--        into v_existing_order_id,v_existing_public_id,v_existing_amount_cents,v_existing_currency,
--             v_existing_order_kind,v_existing_payment_provider,
--             v_existing_customer_name,v_existing_customer_email,v_existing_token_hash,
--             v_existing_efi_txid,v_existing_efi_location_id,v_existing_efi_environment,v_existing_created_at
--        from public.orders o
--        where o.checkout_request_id = p_checkout_request_id
--        for update of o;
--
--        if found then
--          if v_existing_order_kind <> 'digital_product' or v_existing_payment_provider <> 'efi' then
--            raise exception 'create_or_get_product_order_with_items_efi: checkout_request_id % já pertence a outro fluxo/provedor.', p_checkout_request_id;
--          end if;
--
--          select pg_catalog.array_agg(oi.product_slug order by oi.product_slug),
--                 pg_catalog.array_agg(oi.product_name order by oi.product_slug)
--          into v_existing_slugs,v_existing_names
--          from public.order_items oi
--          where oi.order_id = v_existing_order_id;
--
--          if v_existing_slugs is distinct from v_sorted_slugs
--             or lower(btrim(v_existing_customer_name)) is distinct from v_normalized_name
--             or lower(btrim(v_existing_customer_email)) is distinct from v_normalized_email
--             or v_existing_token_hash is distinct from v_access_token_hash
--             or v_existing_efi_environment is distinct from p_efi_environment then
--            raise exception 'create_or_get_product_order_with_items_efi: checkout_request_id % já foi usado com dados diferentes.', p_checkout_request_id;
--          end if;
--
--          return query select v_existing_order_id,v_existing_public_id,v_existing_amount_cents,v_existing_currency,
--            v_existing_customer_email,v_existing_created_at,v_existing_efi_txid,v_existing_efi_location_id,
--            v_existing_efi_environment,v_existing_slugs,v_existing_names;
--          return;
--        end if;
--
--        perform 1 from public.products p
--        where p.slug = any(v_sorted_slugs) and p.active = true
--        for update of p;
--
--        select count(*),count(*) filter(where p.kind='primary'),count(distinct p.currency)
--        into v_resolved_count,v_primary_count,v_currency_mismatch_count
--        from public.products p
--        where p.slug = any(v_sorted_slugs) and p.active = true;
--
--        if v_resolved_count <> v_slug_count then
--          raise exception 'create_or_get_product_order_with_items_efi: um ou mais produtos não existem ou estão inativos.';
--        end if;
--        if v_primary_count = 0 then
--          raise exception 'create_or_get_product_order_with_items_efi: o produto principal é obrigatório nesta compra.';
--        end if;
--        if v_primary_count > 1 then
--          raise exception 'create_or_get_product_order_with_items_efi: mais de um produto principal informado.';
--        end if;
--        if v_currency_mismatch_count <> 1 then
--          raise exception 'create_or_get_product_order_with_items_efi: produtos com moedas diferentes na mesma compra.';
--        end if;
--
--        select sum(p.price_cents),min(p.currency)
--        into v_amount_cents,v_currency
--        from public.products p
--        where p.slug = any(v_sorted_slugs) and p.active = true;
--
--        begin
--          insert into public.orders as o(
--            customer_name,customer_email,package_id,order_kind,amount_cents,currency,status,
--            access_token_hash,terms_version,privacy_version,checkout_request_id,payment_provider,
--            mercado_pago_environment,pagarme_environment,efi_environment
--          ) values (
--            btrim(p_customer_name),btrim(p_customer_email),null,'digital_product',v_amount_cents,v_currency,
--            'pending_payment',v_access_token_hash,p_terms_version,p_privacy_version,p_checkout_request_id,
--            'efi',null,null,p_efi_environment
--          ) returning o.id,o.public_id,o.created_at into v_order_id,v_public_id,v_created_at;
--
--          insert into public.order_items(order_id,product_id,product_slug,product_name,unit_price_cents)
--          select v_order_id,p.id,p.slug,p.name,p.price_cents
--          from public.products p
--          where p.slug = any(v_sorted_slugs) and p.active = true;
--
--          select pg_catalog.array_agg(p.name order by p.slug) into v_new_names
--          from public.products p
--          where p.slug = any(v_sorted_slugs) and p.active = true;
--
--          return query select v_order_id,v_public_id,v_amount_cents,v_currency,btrim(p_customer_email),v_created_at,
--            null::text,null::bigint,p_efi_environment,v_sorted_slugs,v_new_names;
--          return;
--        exception when unique_violation then
--          get stacked diagnostics v_constraint_name = constraint_name;
--          if v_constraint_name is distinct from 'orders_checkout_request_id_key' then
--            raise;
--          end if;
--          if v_attempt >= 2 then
--            raise exception 'create_or_get_product_order_with_items_efi: falha ao reconciliar checkout_request_id %.', p_checkout_request_id;
--          end if;
--        end;
--      end loop;
--    end;
--    $function$;
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.create_or_get_product_order_with_items_efi(
  p_checkout_request_id uuid,
  p_checkout_access_token text,
  p_product_slugs text[],
  p_customer_name text,
  p_customer_email text,
  p_terms_version text,
  p_privacy_version text,
  p_efi_environment text
)
returns table(
  order_id uuid,
  public_id uuid,
  amount_cents integer,
  currency text,
  customer_email text,
  order_created_at timestamp with time zone,
  efi_txid text,
  efi_location_id bigint,
  efi_environment text,
  item_slugs text[],
  item_names text[]
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
#variable_conflict error
declare
  v_access_token_hash text;
  v_normalized_email text;
  v_normalized_name text;
  v_sorted_slugs text[];
  v_slug_count integer;
  v_distinct_slug_count integer;
  v_index integer;
  v_attempt integer := 0;
  v_constraint_name text;

  v_existing_order_id uuid;
  v_existing_public_id uuid;
  v_existing_amount_cents integer;
  v_existing_currency text;
  v_existing_customer_name text;
  v_existing_customer_email text;
  v_existing_token_hash text;
  v_existing_efi_txid text;
  v_existing_efi_location_id bigint;
  v_existing_efi_environment text;
  v_existing_created_at timestamptz;
  v_existing_order_kind text;
  v_existing_payment_provider text;
  v_existing_slugs text[];
  v_existing_names text[];

  v_resolved_count integer;
  v_primary_count integer;
  v_amount_cents integer;
  v_currency text;
  v_currency_mismatch_count integer;

  v_order_id uuid;
  v_public_id uuid;
  v_created_at timestamptz;
  v_new_names text[];
begin
  if p_checkout_request_id is null then
    raise exception 'create_or_get_product_order_with_items_efi: checkout_request_id não informado.';
  end if;
  if p_checkout_access_token is null or p_checkout_access_token !~ '^[0-9a-f]{64}$' then
    raise exception 'create_or_get_product_order_with_items_efi: checkout_access_token inválido.';
  end if;
  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'create_or_get_product_order_with_items_efi: nome do cliente não informado.';
  end if;
  if p_customer_email is null or btrim(p_customer_email) = '' or char_length(p_customer_email) > 254 or p_customer_email not like '%@%' then
    raise exception 'create_or_get_product_order_with_items_efi: e-mail inválido.';
  end if;
  if p_terms_version is null or btrim(p_terms_version) = '' then
    raise exception 'create_or_get_product_order_with_items_efi: terms_version não informado.';
  end if;
  if p_privacy_version is null or btrim(p_privacy_version) = '' then
    raise exception 'create_or_get_product_order_with_items_efi: privacy_version não informado.';
  end if;
  if p_efi_environment is null or p_efi_environment not in ('homologation','production') then
    raise exception 'create_or_get_product_order_with_items_efi: efi_environment deve ser homologation ou production.';
  end if;

  v_slug_count := coalesce(pg_catalog.cardinality(p_product_slugs),0);
  if v_slug_count = 0 then
    raise exception 'create_or_get_product_order_with_items_efi: nenhum produto informado.';
  end if;
  if v_slug_count > 16 then
    raise exception 'create_or_get_product_order_with_items_efi: quantidade de produtos excede o limite permitido.';
  end if;
  for v_index in 1..v_slug_count loop
    if p_product_slugs[v_index] is null or btrim(p_product_slugs[v_index]) = '' then
      raise exception 'create_or_get_product_order_with_items_efi: slug de produto vazio na posição %.', v_index;
    end if;
  end loop;

  select pg_catalog.array_agg(s.slug order by s.slug) into v_sorted_slugs
  from unnest(p_product_slugs) as s(slug);

  select count(distinct s.slug) into v_distinct_slug_count
  from unnest(v_sorted_slugs) as s(slug);

  if v_distinct_slug_count <> v_slug_count then
    raise exception 'create_or_get_product_order_with_items_efi: produto repetido na mesma compra.';
  end if;

  v_normalized_email := lower(btrim(p_customer_email));
  v_normalized_name := lower(btrim(p_customer_name));
  v_access_token_hash := pg_catalog.encode(extensions.digest(p_checkout_access_token,'sha256'),'hex');

  <<attempt_loop>>
  loop
    v_attempt := v_attempt + 1;

    select o.id,o.public_id,o.amount_cents,o.currency,o.order_kind,o.payment_provider,
           o.customer_name,o.customer_email,o.access_token_hash,
           o.efi_txid,o.efi_location_id,o.efi_environment,o.created_at
    into v_existing_order_id,v_existing_public_id,v_existing_amount_cents,v_existing_currency,
         v_existing_order_kind,v_existing_payment_provider,
         v_existing_customer_name,v_existing_customer_email,v_existing_token_hash,
         v_existing_efi_txid,v_existing_efi_location_id,v_existing_efi_environment,v_existing_created_at
    from public.orders o
    where o.checkout_request_id = p_checkout_request_id
    for update of o;

    if found then
      if v_existing_order_kind <> 'digital_product' or v_existing_payment_provider <> 'efi' then
        raise exception 'create_or_get_product_order_with_items_efi: checkout_request_id % já pertence a outro fluxo/provedor.', p_checkout_request_id;
      end if;

      select pg_catalog.array_agg(oi.product_slug order by oi.product_slug),
             pg_catalog.array_agg(oi.product_name order by oi.product_slug)
      into v_existing_slugs,v_existing_names
      from public.order_items oi
      where oi.order_id = v_existing_order_id;

      if v_existing_slugs is distinct from v_sorted_slugs
         or lower(btrim(v_existing_customer_name)) is distinct from v_normalized_name
         or lower(btrim(v_existing_customer_email)) is distinct from v_normalized_email
         or v_existing_token_hash is distinct from v_access_token_hash
         or v_existing_efi_environment is distinct from p_efi_environment then
        raise exception 'create_or_get_product_order_with_items_efi: checkout_request_id % já foi usado com dados diferentes.', p_checkout_request_id;
      end if;

      return query select v_existing_order_id,v_existing_public_id,v_existing_amount_cents,v_existing_currency,
        v_existing_customer_email,v_existing_created_at,v_existing_efi_txid,v_existing_efi_location_id,
        v_existing_efi_environment,v_existing_slugs,v_existing_names;
      return;
    end if;

    perform 1 from public.products p
    where p.slug = any(v_sorted_slugs) and p.active = true
    for update of p;

    select count(*),count(*) filter(where p.kind='primary'),count(distinct p.currency)
    into v_resolved_count,v_primary_count,v_currency_mismatch_count
    from public.products p
    where p.slug = any(v_sorted_slugs) and p.active = true;

    if v_resolved_count <> v_slug_count then
      raise exception 'create_or_get_product_order_with_items_efi: um ou mais produtos não existem ou estão inativos.';
    end if;
    if v_primary_count = 0 then
      raise exception 'create_or_get_product_order_with_items_efi: o produto principal é obrigatório nesta compra.';
    end if;
    -- ALTERAÇÃO DESTA MIGRATION: removida a checagem "v_primary_count > 1 →
    -- erro mais de um produto principal informado". Um pedido agora pode
    -- conter 1 ou mais produtos kind='primary' (carrinho multiproduto),
    -- e continua aceitando 1 primary + 0..N bumps (fluxo atual do Guia de
    -- Evolução de Enfermagem, que nunca envia mais de 1 primary — logo
    -- nunca é afetado por esta mudança). Zero primary continua inválido
    -- (checagem acima, inalterada).
    if v_currency_mismatch_count <> 1 then
      raise exception 'create_or_get_product_order_with_items_efi: produtos com moedas diferentes na mesma compra.';
    end if;

    select sum(p.price_cents),min(p.currency)
    into v_amount_cents,v_currency
    from public.products p
    where p.slug = any(v_sorted_slugs) and p.active = true;

    begin
      insert into public.orders as o(
        customer_name,customer_email,package_id,order_kind,amount_cents,currency,status,
        access_token_hash,terms_version,privacy_version,checkout_request_id,payment_provider,
        mercado_pago_environment,pagarme_environment,efi_environment
      ) values (
        btrim(p_customer_name),btrim(p_customer_email),null,'digital_product',v_amount_cents,v_currency,
        'pending_payment',v_access_token_hash,p_terms_version,p_privacy_version,p_checkout_request_id,
        'efi',null,null,p_efi_environment
      ) returning o.id,o.public_id,o.created_at into v_order_id,v_public_id,v_created_at;

      insert into public.order_items(order_id,product_id,product_slug,product_name,unit_price_cents)
      select v_order_id,p.id,p.slug,p.name,p.price_cents
      from public.products p
      where p.slug = any(v_sorted_slugs) and p.active = true;

      select pg_catalog.array_agg(p.name order by p.slug) into v_new_names
      from public.products p
      where p.slug = any(v_sorted_slugs) and p.active = true;

      return query select v_order_id,v_public_id,v_amount_cents,v_currency,btrim(p_customer_email),v_created_at,
        null::text,null::bigint,p_efi_environment,v_sorted_slugs,v_new_names;
      return;
    exception when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name is distinct from 'orders_checkout_request_id_key' then
        raise;
      end if;
      if v_attempt >= 2 then
        raise exception 'create_or_get_product_order_with_items_efi: falha ao reconciliar checkout_request_id %.', p_checkout_request_id;
      end if;
    end;
  end loop;
end;
$function$;

comment on function public.create_or_get_product_order_with_items_efi(uuid, text, text[], text, text, text, text, text) is
  'Cria ou recupera (idempotente por checkout_request_id) um pedido digital_product/efi com 1 ou mais produtos kind=primary (carrinho multiproduto) + 0..N produtos kind=bump (compatibilidade com o checkout atual do Guia de Evolução de Enfermagem, que sempre envia exatamente 1 primary). amount_cents é sempre sum(products.price_cents) dos slugs resolvidos, calculado aqui — nunca recebido do cliente. Limite de 16 slugs por pedido, produto repetido/inexistente/inativo/moeda divergente continuam rejeitados. Etapa 1 do carrinho multiproduto (ver conversa/plano correspondente) — removida apenas a checagem que rejeitava mais de 1 produto primary.';
