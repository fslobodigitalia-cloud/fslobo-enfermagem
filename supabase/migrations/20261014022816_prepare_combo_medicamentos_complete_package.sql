-- Pacote completo do combo "Guia de Evolução + Medicamentos na Prática".
--
-- Registro, no repositório, da migration já aplicada no Supabase. O SKU é criado
-- INATIVO (active = false): a ativação é um passo posterior e separado.
--
-- Contrato do pedido com o pacote: exatamente dois itens —
--   combo-evolucao-medicamentos + pacote-completo-combo-medicamentos-bump.

do $preflight$
declare
  v_member_slugs constant text[] := array[
    'mapa-mental-ilustrado',
    'balanco-hidrico-bump',
    'exames-laboratoriais',
    'dicionario-termos-tecnicos',
    'feridas-curativos-coberturas'
  ];
  v_ready_members integer;
  v_bad_file_members integer;
  v_combo_ready integer;
  v_combo_files integer;
begin
  if exists (
    select 1 from public.products
    where slug = 'pacote-completo-combo-medicamentos-bump'
  ) then
    raise exception 'preflight: o SKU pacote-completo-combo-medicamentos-bump já existe.';
  end if;

  -- Os cinco complementos: ativos, prontos, em BRL e a 1000 centavos.
  select count(*) into v_ready_members
  from public.products
  where slug = any(v_member_slugs)
    and active = true
    and catalog_status = 'ready'
    and currency = 'BRL'
    and price_cents = 1000;

  if v_ready_members <> 5 then
    raise exception 'preflight: esperados 5 complementos ativos, prontos, em BRL e de 1000 centavos; encontrados %.', v_ready_members;
  end if;

  -- Cada complemento precisa ter exatamente um arquivo ativo.
  select count(*) into v_bad_file_members
  from public.products p
  where p.slug = any(v_member_slugs)
    and (
      select count(*)
      from public.product_files pf
      where pf.product_id = p.id
        and pf.active = true
    ) <> 1;

  if v_bad_file_members <> 0 then
    raise exception 'preflight: % complemento(s) sem exatamente um arquivo ativo.', v_bad_file_members;
  end if;

  -- O combo: ativo, pronto, BRL, 1700 centavos e cinco arquivos ativos.
  select count(*) into v_combo_ready
  from public.products
  where slug = 'combo-evolucao-medicamentos'
    and active = true
    and catalog_status = 'ready'
    and currency = 'BRL'
    and price_cents = 1700;

  if v_combo_ready <> 1 then
    raise exception 'preflight: combo-evolucao-medicamentos precisa estar ativo, pronto, em BRL e custar 1700 centavos.';
  end if;

  select count(*) into v_combo_files
  from public.products p
  join public.product_files pf on pf.product_id = p.id
  where p.slug = 'combo-evolucao-medicamentos'
    and pf.active = true;

  if v_combo_files <> 5 then
    raise exception 'preflight: combo-evolucao-medicamentos precisa ter 5 arquivos ativos; encontrados %.', v_combo_files;
  end if;
end;
$preflight$;

-- Produto: criado INATIVO.
insert into public.products (
  slug,
  name,
  description,
  kind,
  price_cents,
  currency,
  storage_bucket,
  storage_object_path,
  active,
  display_order,
  category,
  short_description,
  cover_url,
  deliverable_summary,
  catalog_status
)
select
  'pacote-completo-combo-medicamentos-bump',
  'Pacote Completo do Combo',
  'Os 5 materiais complementares do combo Guia de Evolução + Medicamentos na Prática.',
  'bump',
  3290,
  'BRL',
  'product-files',
  null,
  false,
  coalesce(max(display_order), 0) + 1,
  'enfermagem',
  '5 materiais complementares para plantões, estudos e concursos.',
  null,
  '5 materiais digitais em PDF',
  'ready'
from public.products;

-- Arquivos: exatamente um arquivo ativo de cada complemento, nesta ordem.
with source_files as (
  select
    pf.name,
    pf.storage_bucket,
    pf.storage_object_path,
    row_number() over (
      order by
        case p.slug
          when 'mapa-mental-ilustrado' then 1
          when 'balanco-hidrico-bump' then 2
          when 'exames-laboratoriais' then 3
          when 'dicionario-termos-tecnicos' then 4
          when 'feridas-curativos-coberturas' then 5
        end
    )::integer as package_display_order
  from public.products p
  join public.product_files pf on pf.product_id = p.id
  where p.slug = any(array[
    'mapa-mental-ilustrado',
    'balanco-hidrico-bump',
    'exames-laboratoriais',
    'dicionario-termos-tecnicos',
    'feridas-curativos-coberturas'
  ]::text[])
    and pf.active = true
)
insert into public.product_files (
  product_id,
  name,
  storage_bucket,
  storage_object_path,
  display_order,
  active
)
select
  pkg.id,
  sf.name,
  sf.storage_bucket,
  sf.storage_object_path,
  sf.package_display_order,
  true
from source_files sf
cross join public.products pkg
where pkg.slug = 'pacote-completo-combo-medicamentos-bump';

-- Exclusividade dos pacotes. Avalia o PEDIDO inteiro (usa order_id de NEW ou OLD,
-- pois o gatilho também dispara em DELETE).
create or replace function public.enforce_guia_complete_package_exclusivity()
returns trigger
language plpgsql
security invoker
set search_path = 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_new_order_id uuid;
  v_old_order_id uuid;
  v_order_id uuid;
  v_item_count integer;
  v_slugs text[];
begin
  -- INSERT: só NEW; DELETE: só OLD; UPDATE: os dois (o item pode mudar de pedido,
  -- então o pedido antigo e o novo precisam ser validados).
  if tg_op <> 'DELETE' then
    v_new_order_id := new.order_id;
  end if;
  if tg_op <> 'INSERT' then
    v_old_order_id := old.order_id;
  end if;

  for v_order_id in
    select distinct candidate
    from unnest(array[v_new_order_id, v_old_order_id]::uuid[]) as candidate
    where candidate is not null
  loop
    select coalesce(array_agg(oi.product_slug), array[]::text[]), count(*)::integer
      into v_slugs, v_item_count
    from public.order_items oi
    where oi.order_id = v_order_id;

    -- Pacote do Guia: nunca junto dos seus seis materiais individuais.
    if 'kit-completo-enfermagem-bump' = any(v_slugs)
       and v_slugs && array[
         'medicamentos-na-pratica',
         'mapa-mental-ilustrado',
         'balanco-hidrico-bump',
         'exames-laboratoriais',
         'dicionario-termos-tecnicos',
         'feridas-curativos-coberturas'
       ]::text[] then
      raise exception using
        errcode = '23514',
        message = 'order_items: o pacote completo não pode ser combinado com seus materiais individuais.';
    end if;

    -- O combo já inclui Medicamentos e não aceita o pacote do Guia.
    if 'combo-evolucao-medicamentos' = any(v_slugs)
       and 'kit-completo-enfermagem-bump' = any(v_slugs) then
      raise exception using
        errcode = '23514',
        message = 'order_items: o combo não pode ser combinado com o pacote completo do Guia.';
    end if;

    if 'combo-evolucao-medicamentos' = any(v_slugs)
       and 'medicamentos-na-pratica' = any(v_slugs) then
      raise exception using
        errcode = '23514',
        message = 'order_items: o combo já inclui Medicamentos na Prática; o item avulso não pode ser combinado com ele.';
    end if;

    -- Pacote do combo: o pedido tem exatamente combo + pacote, sem itens extras.
    if 'pacote-completo-combo-medicamentos-bump' = any(v_slugs)
       and not (
         v_item_count = 2
         and 'combo-evolucao-medicamentos' = any(v_slugs)
       ) then
      raise exception using
        errcode = '23514',
        message = 'order_items: o pacote completo do combo exige exatamente o combo e o pacote, sem itens adicionais.';
    end if;
  end loop;

  return null;
end;
$function$;

revoke all on function public.enforce_guia_complete_package_exclusivity() from public;
revoke all on function public.enforce_guia_complete_package_exclusivity() from anon;
revoke all on function public.enforce_guia_complete_package_exclusivity() from authenticated;
grant execute on function public.enforce_guia_complete_package_exclusivity() to postgres;
grant execute on function public.enforce_guia_complete_package_exclusivity() to service_role;

-- Gatilho recriado para também validar DELETE e adiar a checagem ao fim da transação
-- (os itens do pedido são inseridos um a um).
drop trigger if exists order_items_guia_complete_package_exclusivity on public.order_items;

create constraint trigger order_items_guia_complete_package_exclusivity
after insert or update or delete on public.order_items
deferrable initially deferred
for each row
execute function public.enforce_guia_complete_package_exclusivity();
