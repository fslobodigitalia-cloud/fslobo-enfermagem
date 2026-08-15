-- ════════════════════════════════════════════════════════════════════════════
--  ENTRE NÓS TARÔ — ETAPA 3B: INFRAESTRUTURA DE ENTREGA DOS PRODUTOS DIGITAIS
--
--  Duas peças, nenhuma delas tocando tarô, create-pix-order,
--  create-product-order, mercado-pago-webhook nem migrations já aplicadas:
--
--  1. Bucket PRIVADO "product-files" no Supabase Storage (via
--     storage.buckets — forma padrão de criar bucket por migration SQL,
--     sem precisar de script/cliente separado). public = false, e
--     NENHUMA policy é criada para storage.objects neste bucket — RLS já
--     vem ligado por padrão em storage.objects em todo projeto Supabase;
--     sem nenhuma policy que conceda acesso a anon/authenticated, só
--     service_role (que ignora RLS por definição, mas só é usado dentro de
--     Edge Functions, nunca no navegador) consegue ler ou gerar signed
--     URL para objetos deste bucket. allowed_mime_types restrito a PDF e
--     file_size_limit de 20MB — defesa extra, nunca a única barreira.
--
--  2. public.get_order_downloads_info(p_public_id, p_checkout_access_token)
--     — ÚNICA forma de autenticar um pedido para fins de entrega. Reusa
--     EXATAMENTE o mesmo mecanismo de hash já usado por
--     create_or_get_order_with_questions()/
--     create_or_get_product_order_with_items() para gravar
--     orders.access_token_hash: pg_catalog.encode(extensions.digest(token,
--     'sha256'), 'hex') — nenhum esquema de autenticação novo é inventado
--     aqui. NUNCA devolve access_token_hash na resposta (nem para
--     comparação do lado do chamador — a comparação acontece inteiramente
--     dentro desta função, em SQL). "Pedido não encontrado", "token não
--     confere" e "pedido não é do tipo digital_product" (tarô nunca deve
--     ser alcançável por esta função) devolvem EXATAMENTE a mesma mensagem
--     — nunca dá para um chamador malicioso distinguir qual das três
--     situações aconteceu.
--
--     Devolve sempre os itens comprados (order_items + products.
--     storage_object_path/storage_bucket) junto do status — a decisão de
--     quando de fato gerar signed URLs (só quando status = 'paid') é feita
--     na Edge Function, não aqui; esta função só autentica e informa.
--
--  Não altera nenhuma tabela existente, nenhum enum, nenhuma RPC já
--  existente. Não cria pedidos, não altera orders.status, não faz upload
--  de arquivo nenhum — os PDFs em si continuam precisando ser enviados
--  manualmente ao bucket (fora do escopo desta migration).
-- ════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════ 1. Bucket privado "product-files" ══════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-files',
  'product-files',
  false,
  20971520, -- 20 MB por arquivo — generoso para os guias em PDF do catálogo.
  array['application/pdf']
)
on conflict (id) do nothing;

-- Nenhuma policy é criada para storage.objects neste bucket, de propósito
-- (ver cabeçalho): sem política nenhuma, RLS (já ligado por padrão em
-- storage.objects em todo projeto Supabase) bloqueia anon/authenticated
-- por completo — só service_role, dentro de Edge Functions, acessa.


-- ═══════ 2. Função: autenticação do pedido para fins de entrega ═════════════
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
-- order_id, status, order_kind, item_slugs, item_names, item_paths e
-- item_buckets (nomes do RETURNS TABLE) também existem como colunas reais
-- em orders/order_items/products. Toda referência a coluna abaixo usa
-- alias de tabela (o., oi., p.) ou variável com prefixo v_/p_.
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

  -- Mesmo cálculo, byte a byte, já usado para GRAVAR orders.access_token_hash
  -- em create_or_get_order_with_questions()/create_or_get_product_order_with_items()
  -- — nenhum esquema de autenticação novo.
  v_access_token_hash := pg_catalog.encode(extensions.digest(p_checkout_access_token, 'sha256'), 'hex');

  select o.id, o.status, o.order_kind, o.access_token_hash
    into v_order_id, v_status, v_order_kind, v_stored_token_hash
  from public.orders o
  where o.public_id = p_public_id;

  -- Três situações diferentes (pedido inexistente; token não confere;
  -- pedido existe mas não é digital_product — esta função nunca alcança
  -- pedidos de tarô) colapsadas na MESMA mensagem, de propósito: um
  -- chamador nunca consegue distinguir qual das três aconteceu.
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

revoke execute on function public.get_order_downloads_info(uuid, text) from public;
revoke execute on function public.get_order_downloads_info(uuid, text) from anon;
revoke execute on function public.get_order_downloads_info(uuid, text) from authenticated;
grant execute on function public.get_order_downloads_info(uuid, text) to service_role;


-- ═══════════════════════════ Consultas de validação ════════════════════════
-- Comentadas de propósito — não executam automaticamente com esta migration.

-- Bucket criado, privado, restrito a PDF (esperado: 1 linha,
-- public=false, allowed_mime_types={application/pdf}):
-- select id, public, file_size_limit, allowed_mime_types
-- from storage.buckets where id = 'product-files';

-- Nenhuma policy de storage.objects para este bucket (esperado: 0 linhas —
-- ausência de política é o que bloqueia anon/authenticated por completo):
-- select policyname from pg_policies
-- where schemaname = 'storage' and tablename = 'objects'
--   and qual::text ilike '%product-files%';

-- Todo pedido digital_product pago deve ter pelo menos 1 order_item
-- (0 linhas = ok — já garantido pela RPC de criação, checagem de sanidade):
-- select o.id from public.orders o
-- where o.order_kind = 'digital_product' and o.status = 'paid'
--   and not exists (select 1 from public.order_items oi where oi.order_id = o.id);
