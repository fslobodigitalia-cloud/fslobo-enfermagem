-- ════════════════════════════════════════════════════════════════════════════
--  ENTRE NÓS TARÔ — CORREÇÃO: public.get_order_downloads_info
--
--  Mesma classe de bug já corrigida na migration 20260814_009 (Etapa 2):
--  pg_catalog.coalesce(...) falha em tempo de EXECUÇÃO com
--    ERROR: 42883: function pg_catalog.coalesce(...) does not exist
--  porque COALESCE é uma construção especial do SQL padrão (como CASE),
--  não uma função de catálogo de verdade — nunca pode ser schema-
--  qualificada. Corrigido para coalesce(...) sem qualificação, nas quatro
--  chamadas de RETURN QUERY de get_order_downloads_info() (migration
--  20260815_010). pg_catalog.array_agg/pg_catalog.encode (funções REAIS,
--  ao contrário de coalesce) continuam corretas como estavam, sem mudança.
--
--  Nenhuma outra mudança: mesma assinatura, mesmo corpo, mesmas permissões
--  (já concedidas pela migration 010, não repetidas aqui desnecessariamente).
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.get_order_downloads_info(
  p_public_id                 uuid,
  p_checkout_access_token     text
)
returns table (
  order_id        uuid,
  status           text,
  order_kind        text,
  item_slugs          text[],
  item_names            text[],
  item_paths              text[],
  item_buckets               text[]
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
#variable_conflict error
declare
  v_access_token_hash   text;
  v_order_id             uuid;
  v_status                 public.order_status;
  v_order_kind               text;
  v_stored_token_hash          text;
  v_item_slugs                    text[];
  v_item_names                      text[];
  v_item_paths                        text[];
  v_item_buckets                        text[];
begin
  if p_public_id is null then
    raise exception 'get_order_downloads_info: public_id não informado.';
  end if;

  if p_checkout_access_token is null or p_checkout_access_token !~ '^[0-9a-f]{64}$' then
    raise exception 'get_order_downloads_info: checkout_access_token inválido.';
  end if;

  v_access_token_hash := pg_catalog.encode(extensions.digest(p_checkout_access_token, 'sha256'), 'hex');

  select o.id, o.status, o.order_kind, o.access_token_hash
    into v_order_id, v_status, v_order_kind, v_stored_token_hash
  from public.orders o
  where o.public_id = p_public_id;

  if not found
     or v_stored_token_hash is distinct from v_access_token_hash
     or v_order_kind <> 'digital_product' then
    raise exception 'get_order_downloads_info: pedido não encontrado.';
  end if;

  select pg_catalog.array_agg(oi.product_slug order by oi.product_slug),
         pg_catalog.array_agg(oi.product_name order by oi.product_slug),
         pg_catalog.array_agg(p.storage_object_path order by oi.product_slug),
         pg_catalog.array_agg(p.storage_bucket order by oi.product_slug)
    into v_item_slugs, v_item_names, v_item_paths, v_item_buckets
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.order_id = v_order_id;

  -- CORREÇÃO desta migration: coalesce (não pg_catalog.coalesce — ver
  -- cabeçalho).
  return query
    select v_order_id, v_status::text, v_order_kind,
           coalesce(v_item_slugs, array[]::text[]),
           coalesce(v_item_names, array[]::text[]),
           coalesce(v_item_paths, array[]::text[]),
           coalesce(v_item_buckets, array[]::text[]);
end;
$$;

comment on function public.get_order_downloads_info(uuid, text) is
  'Autentica um pedido de produto digital para fins de entrega (public_id + checkout_access_token — MESMO hash já usado para gravar orders.access_token_hash, nenhum esquema novo) e devolve status + itens comprados (slug/nome/caminho no Storage/bucket). NUNCA devolve access_token_hash. "Não encontrado", "token não confere" e "não é um pedido digital_product" (tarô nunca alcançável aqui) devolvem a MESMA mensagem — nunca distinguível pelo chamador. Não decide quando gerar signed URL (isso é responsabilidade da Edge Function, condicionado a status=paid) — só autentica e informa. Nunca alterna orders.status, nunca escreve nada. Executável somente por service_role.';
