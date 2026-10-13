do $preflight$
declare
  v_source_products integer;
  v_source_files integer;
begin
  if exists (
    select 1 from public.products
    where slug = 'kit-completo-enfermagem-bump'
  ) then
    raise exception 'preflight: o SKU kit-completo-enfermagem-bump já existe.';
  end if;

  select count(*) into v_source_products
  from public.products
  where slug = any(array[
    'medicamentos-na-pratica',
    'mapa-mental-ilustrado',
    'balanco-hidrico-bump',
    'exames-laboratoriais',
    'dicionario-termos-tecnicos',
    'feridas-curativos-coberturas'
  ]::text[])
    and active = true;

  if v_source_products <> 6 then
    raise exception 'preflight: esperados 6 produtos-fonte ativos; encontrados %.', v_source_products;
  end if;

  select count(*) into v_source_files
  from public.products p
  join public.product_files pf on pf.product_id = p.id
  where p.slug = any(array[
    'medicamentos-na-pratica',
    'mapa-mental-ilustrado',
    'balanco-hidrico-bump',
    'exames-laboratoriais',
    'dicionario-termos-tecnicos',
    'feridas-curativos-coberturas'
  ]::text[])
    and p.active = true
    and pf.active = true;

  if v_source_files <> 8 then
    raise exception 'preflight: esperados 8 arquivos-fonte ativos; encontrados %.', v_source_files;
  end if;
end;
$preflight$;

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
) values (
  'kit-completo-enfermagem-bump',
  'Pacote Completo de Enfermagem',
  'Adicional exclusivo do Guia de Evolução: reúne os seis materiais complementares da oferta em um único item.',
  'bump',
  3990,
  'BRL',
  'product-files',
  null,
  false,
  999,
  'Pacotes',
  'Os seis materiais complementares do Guia de Evolução em um único pacote.',
  null,
  'Pacote digital com os seis materiais complementares. Acesso liberado após a confirmação do pagamento.',
  'ready'
);

with source_files as (
  select
    pf.name,
    pf.storage_bucket,
    pf.storage_object_path,
    row_number() over (
      order by
        case p.slug
          when 'medicamentos-na-pratica' then 1
          when 'mapa-mental-ilustrado' then 2
          when 'balanco-hidrico-bump' then 3
          when 'exames-laboratoriais' then 4
          when 'dicionario-termos-tecnicos' then 5
          when 'feridas-curativos-coberturas' then 6
        end,
        pf.display_order,
        pf.id
    )::integer as package_display_order
  from public.products p
  join public.product_files pf on pf.product_id = p.id
  where p.slug = any(array[
    'medicamentos-na-pratica',
    'mapa-mental-ilustrado',
    'balanco-hidrico-bump',
    'exames-laboratoriais',
    'dicionario-termos-tecnicos',
    'feridas-curativos-coberturas'
  ]::text[])
    and p.active = true
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
  kit.id,
  sf.name,
  sf.storage_bucket,
  sf.storage_object_path,
  sf.package_display_order,
  true
from source_files sf
cross join public.products kit
where kit.slug = 'kit-completo-enfermagem-bump';

create or replace function public.enforce_guia_complete_package_exclusivity()
returns trigger
language plpgsql
security invoker
set search_path = 'pg_catalog', 'public', 'pg_temp'
as $function$
begin
  if exists (
    select 1
    from public.order_items package_item
    join public.order_items member_item
      on member_item.order_id = package_item.order_id
    where package_item.order_id = new.order_id
      and package_item.product_slug = 'kit-completo-enfermagem-bump'
      and member_item.product_slug = any(array[
        'medicamentos-na-pratica',
        'mapa-mental-ilustrado',
        'balanco-hidrico-bump',
        'exames-laboratoriais',
        'dicionario-termos-tecnicos',
        'feridas-curativos-coberturas'
      ]::text[])
  ) then
    raise exception using
      errcode = '23514',
      message = 'order_items: o pacote completo não pode ser combinado com seus materiais individuais.';
  end if;

  return null;
end;
$function$;

revoke all on function public.enforce_guia_complete_package_exclusivity() from public;
revoke all on function public.enforce_guia_complete_package_exclusivity() from anon;
revoke all on function public.enforce_guia_complete_package_exclusivity() from authenticated;
grant execute on function public.enforce_guia_complete_package_exclusivity() to postgres;
grant execute on function public.enforce_guia_complete_package_exclusivity() to service_role;

create constraint trigger order_items_guia_complete_package_exclusivity
after insert or update on public.order_items
deferrable initially immediate
for each row
execute function public.enforce_guia_complete_package_exclusivity();
