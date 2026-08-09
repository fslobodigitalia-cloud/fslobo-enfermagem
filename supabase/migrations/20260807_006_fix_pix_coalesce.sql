-- ════════════════════════════════════════════════════════════════════════════
--  ENTRE NÓS TARÔ — CORREÇÃO PONTUAL: pg_catalog.coalesce → COALESCE
--
--  A migration 20260805_005_create_pix_order_function.sql usava
--  pg_catalog.coalesce(...), que não existe (a função nativa é
--  pg_catalog.coalesce só como forma qualificada de COALESCE, mas o
--  parser do Postgres não a resolve como chamada de função regular —
--  confirmado pelo erro real em produção:
--  "function pg_catalog.coalesce(integer, integer) does not exist").
--  COALESCE é uma expressão especial do SQL, não uma função comum — não
--  pode ser qualificada por schema.
--
--  Esta migration CORRIGE, via CREATE OR REPLACE FUNCTION, exatamente as
--  duas funções afetadas, sem tocar em mais nada. A migration
--  20260805_005 NÃO é alterada nem reaplicada — as definições abaixo são
--  idênticas às de lá, com a única troca pg_catalog.coalesce(...) →
--  COALESCE(...) nos dois pontos onde ocorria.
--
--  Não inclui ALTER TABLE, CREATE TABLE, DROP, DELETE, mudanças de
--  frontend, Edge Function, secrets, Mercado Pago, Turnstile, draw-cards
--  ou qualquer outra função.
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────── 1. Função: criação idempotente de pedido + perguntas ───────────
create or replace function public.create_or_get_order_with_questions(
  p_checkout_request_id       uuid,
  p_checkout_access_token     text,
  p_package_slug              text,
  p_customer_name             text,
  p_customer_email            text,
  p_questions                 text[],
  p_terms_version             text,
  p_privacy_version           text,
  p_mercado_pago_environment  text
)
returns table (
  order_id                  uuid,
  public_id                 uuid,
  amount_cents               integer,
  currency                   text,
  package_name                text,
  question_count               integer,
  customer_email                text,
  order_created_at              timestamptz,
  mercado_pago_order_id         text,
  mercado_pago_payment_id       text,
  mercado_pago_environment      text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
#variable_conflict error
-- order_id, public_id, amount_cents, currency, package_name,
-- question_count, customer_email, order_created_at,
-- mercado_pago_order_id, mercado_pago_payment_id e
-- mercado_pago_environment (nomes do RETURNS TABLE) também existem como
-- colunas reais em orders/packages. Com #variable_conflict error, qualquer
-- referência não qualificada a esses nomes vira erro em tempo de execução
-- — por isso toda referência a coluna abaixo usa alias de tabela (pk., o.,
-- q.) ou variável com prefixo v_.
--
-- digest (pgcrypto) vive no schema "extensions" neste projeto; encode() é
-- nativo do pg_catalog. Confirmado por consulta a pg_proc antes de escrever
-- esta migration — nunca presumido.
declare
  v_access_token_hash        text;
  v_normalized_email         text;
  v_normalized_name          text;
  v_normalized_questions     text[];
  v_question_count           integer;
  v_index                    integer;
  v_attempt                  integer := 0;
  v_constraint_name          text;

  -- Dados do pedido já persistido, quando checkout_request_id já existe.
  -- Nunca reaproveitadas para o caminho de criação nova (ver v_package_*
  -- e v_order_id/v_public_id/v_created_at abaixo).
  v_existing_order_id        uuid;
  v_existing_public_id       uuid;
  v_existing_package_slug    text;
  v_existing_package_name    text;
  v_existing_amount_cents    integer;
  v_existing_currency        text;
  v_existing_customer_name   text;
  v_existing_customer_email  text;
  v_existing_terms_version   text;
  v_existing_privacy_version text;
  v_existing_token_hash      text;
  v_existing_mp_order_id     text;
  v_existing_mp_payment_id   text;
  v_existing_mp_environment  text;
  v_existing_created_at      timestamptz;
  v_existing_questions       text[];

  -- Valores autoritativos do pacote — só lidos (com active = true) quando
  -- checkout_request_id ainda não existe, isto é, só no caminho de INSERT
  -- novo.
  v_package_id                uuid;
  v_package_name              text;
  v_price_cents                integer;
  v_question_limit             integer;
  v_currency                    text;

  -- Resultado da criação nova.
  v_order_id                    uuid;
  v_public_id                    uuid;
  v_created_at                    timestamptz;
begin
  -- ── 1. Validação básica dos parâmetros ──────────────────────────────────
  if p_checkout_request_id is null then
    raise exception 'create_or_get_order_with_questions: checkout_request_id não informado.';
  end if;

  if p_checkout_access_token is null or p_checkout_access_token !~ '^[0-9a-f]{64}$' then
    raise exception
      'create_or_get_order_with_questions: checkout_access_token inválido (esperado 64 caracteres hexadecimais).';
  end if;

  if p_package_slug is null or btrim(p_package_slug) = '' then
    raise exception 'create_or_get_order_with_questions: pacote não informado.';
  end if;

  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'create_or_get_order_with_questions: nome do cliente não informado.';
  end if;

  if p_customer_email is null
     or btrim(p_customer_email) = ''
     or char_length(p_customer_email) > 254
     or p_customer_email not like '%@%' then
    raise exception 'create_or_get_order_with_questions: e-mail inválido.';
  end if;

  if p_terms_version is null or btrim(p_terms_version) = '' then
    raise exception 'create_or_get_order_with_questions: terms_version não informado.';
  end if;

  if p_privacy_version is null or btrim(p_privacy_version) = '' then
    raise exception 'create_or_get_order_with_questions: privacy_version não informado.';
  end if;

  if p_mercado_pago_environment is null or p_mercado_pago_environment not in ('test', 'production') then
    raise exception
      'create_or_get_order_with_questions: mercado_pago_environment deve ser "test" ou "production".';
  end if;

  -- CORREÇÃO desta migration: pg_catalog.coalesce(...) não existe
  -- (COALESCE é expressão especial do SQL, não função qualificável por
  -- schema) — era a causa do HTTP 500 real em produção.
  v_question_count := COALESCE(pg_catalog.cardinality(p_questions), 0);
  if v_question_count = 0 then
    raise exception 'create_or_get_order_with_questions: nenhuma pergunta informada.';
  end if;

  v_normalized_email := lower(btrim(p_customer_email));
  v_normalized_name := lower(btrim(p_customer_name));

  v_normalized_questions := array[]::text[];
  for v_index in 1..v_question_count loop
    if p_questions[v_index] is null or btrim(p_questions[v_index]) = '' then
      raise exception 'create_or_get_order_with_questions: pergunta % está vazia.', v_index;
    end if;
    if char_length(p_questions[v_index]) > 2000 then
      raise exception 'create_or_get_order_with_questions: pergunta % excede o tamanho máximo.', v_index;
    end if;
    v_normalized_questions := v_normalized_questions || btrim(p_questions[v_index]);
  end loop;

  -- Hash calculado uma única vez aqui — sempre 64 caracteres hex por
  -- construção, independente do formato de entrada (já validado acima).
  v_access_token_hash := pg_catalog.encode(extensions.digest(p_checkout_access_token, 'sha256'), 'hex');

  -- ── 2. Loop de no máximo 2 tentativas: cobre tanto o caminho normal
  --      (procura → encontra ou cria) quanto a corrida entre duas
  --      requisições SIMULTÂNEAS com o mesmo checkout_request_id (a que
  --      perde recebe unique_violation e volta ao topo, desta vez
  --      encontrando o pedido que a outra acabou de commitar).
  <<attempt_loop>>
  loop
    v_attempt := v_attempt + 1;

    -- Procura pedido já existente para este checkout_request_id — SEM
    -- exigir pacote ativo. Um pedido pendente de pagamento tem que
    -- continuar recuperável mesmo que o pacote associado seja desativado
    -- depois de criado.
    select o.id, o.public_id, pk.slug, pk.name, o.amount_cents, o.currency,
           o.customer_name, o.customer_email,
           o.terms_version, o.privacy_version, o.access_token_hash,
           o.mercado_pago_order_id, o.mercado_pago_payment_id,
           o.mercado_pago_environment, o.created_at
      into v_existing_order_id, v_existing_public_id, v_existing_package_slug, v_existing_package_name,
           v_existing_amount_cents, v_existing_currency,
           v_existing_customer_name, v_existing_customer_email,
           v_existing_terms_version, v_existing_privacy_version, v_existing_token_hash,
           v_existing_mp_order_id, v_existing_mp_payment_id,
           v_existing_mp_environment, v_existing_created_at
    from public.orders o
    join public.packages pk on pk.id = o.package_id
    where o.checkout_request_id = p_checkout_request_id
    for update of o;

    if found then
      select pg_catalog.array_agg(q.question_text order by q.position)
        into v_existing_questions
      from public.questions q
      where q.order_id = v_existing_order_id;

      -- IS DISTINCT FROM (não <>) de propósito: null-safe. Compara contra
      -- o que já está PERSISTIDO — nunca contra preço/nome/e-mail atuais
      -- de packages, e nunca resulta em UPDATE do pedido existente.
      --
      -- terms_version/privacy_version PROPOSITALMENTE NÃO entram nesta
      -- comparação: são gravados uma única vez, na criação, e o pedido
      -- existente mantém para sempre a versão vigente naquele momento,
      -- sem UPDATE. Se comparássemos contra p_terms_version/p_privacy_version
      -- (a versão atual no momento desta chamada), uma atualização dos
      -- termos legais depois da criação do pedido bloquearia para sempre a
      -- recuperação de um Pix já gerado, mesmo com todos os outros dados
      -- idênticos — exatamente o cenário que isto evita.
      -- mercado_pago_environment entra na MESMA comparação: um ambiente
      -- diferente do já persistido é tratado exatamente como
      -- pacote/nome/e-mail/perguntas/token diferentes — checkout_conflict,
      -- nunca UPDATE. Impede que uma troca futura de test para production
      -- (ou vice-versa) reconcilie uma tentativa criada no outro ambiente.
      if v_existing_package_slug is distinct from p_package_slug
         or lower(btrim(v_existing_customer_name)) is distinct from v_normalized_name
         or lower(btrim(v_existing_customer_email)) is distinct from v_normalized_email
         or v_existing_questions is distinct from v_normalized_questions
         or v_existing_token_hash is distinct from v_access_token_hash
         or v_existing_mp_environment is distinct from p_mercado_pago_environment then
        raise exception
          'create_or_get_order_with_questions: checkout_request_id % já foi usado com dados diferentes.',
          p_checkout_request_id;
      end if;

      return query
        select v_existing_order_id, v_existing_public_id, v_existing_amount_cents, v_existing_currency,
               v_existing_package_name, pg_catalog.cardinality(v_existing_questions),
               v_existing_customer_email, v_existing_created_at,
               v_existing_mp_order_id, v_existing_mp_payment_id, v_existing_mp_environment;
      return;
    end if;

    -- ── Nenhum pedido ainda para este checkout_request_id: cria agora.
    --    SÓ AQUI o pacote precisa estar ativo — preço e limite SEMPRE vêm
    --    daqui, nunca de parâmetro.
    select pk.id, pk.name, pk.price_cents, pk.question_limit, pk.currency
      into v_package_id, v_package_name, v_price_cents, v_question_limit, v_currency
    from public.packages pk
    where pk.slug = p_package_slug
      and pk.active = true
    for update of pk;

    if not found then
      raise exception 'create_or_get_order_with_questions: pacote "%" não encontrado ou inativo.', p_package_slug;
    end if;

    if v_question_count <> v_question_limit then
      raise exception
        'create_or_get_order_with_questions: pacote "%" exige exatamente % pergunta(s); % recebida(s).',
        p_package_slug, v_question_limit, v_question_count;
    end if;

    begin
      insert into public.orders as o
        (customer_name, customer_email, package_id, amount_cents, currency, status,
         access_token_hash, terms_version, privacy_version, checkout_request_id,
         mercado_pago_environment)
      values
        (btrim(p_customer_name), btrim(p_customer_email), v_package_id, v_price_cents, v_currency,
         'pending_payment', v_access_token_hash, p_terms_version, p_privacy_version, p_checkout_request_id,
         p_mercado_pago_environment)
      returning o.id, o.public_id, o.created_at into v_order_id, v_public_id, v_created_at;

      insert into public.questions (order_id, position, question_text)
      select v_order_id, s.idx, v_normalized_questions[s.idx]
      from generate_series(1, v_question_count) as s(idx);

      -- Pedido recém-criado: nunca tem mercado_pago_order_id/payment_id
      -- ainda — isso só é preenchido depois, pela Edge Function.
      -- mercado_pago_environment já é o recém-persistido (p_mercado_pago_environment).
      return query
        select v_order_id, v_public_id, v_price_cents, v_currency, v_package_name, v_question_count,
               btrim(p_customer_email), v_created_at, null::text, null::text, p_mercado_pago_environment;
      return;
    exception
      when unique_violation then
        -- Restringe o tratamento à corrida ESPERADA em checkout_request_id
        -- (constraint nomeada explicitamente na migration original). Qualquer
        -- outra violação de unicidade (ex.: colisão de access_token_hash —
        -- 256 bits, astronomicamente improvável, mas nunca mascarada) é
        -- repropagada tal como veio, sem reinterpretação.
        get stacked diagnostics v_constraint_name = constraint_name;
        if v_constraint_name is distinct from 'orders_checkout_request_id_key' then
          raise;
        end if;

        if v_attempt >= 2 then
          raise exception
            'create_or_get_order_with_questions: falha ao reconciliar checkout_request_id % após conflito de concorrência.',
            p_checkout_request_id;
        end if;
        -- Outra transação concorrente venceu a corrida: a próxima volta do
        -- loop encontra o pedido dela e aplica a mesma checagem acima, em
        -- vez de propagar o erro.
    end;
  end loop;
end;
$$;

comment on function public.create_or_get_order_with_questions(uuid, text, text, text, text, text[], text, text, text) is
  'Cria (ou, se checkout_request_id já existe com o mesmo conteúdo — incluindo o mesmo mercado_pago_environment — apenas devolve os dados persistidos) um pedido público e suas perguntas, atomicamente. Procura por checkout_request_id ANTES de exigir pacote ativo — só a criação de um pedido novo exige packages.active = true. Preço e limite de perguntas vêm sempre de public.packages na criação. p_mercado_pago_environment (test ou production) é persistido uma única vez, na criação; um checkout_request_id reutilizado com ambiente DIFERENTE do já persistido gera checkout_conflict, nunca reconcilia entre ambientes. Protegida contra retries sequenciais e requisições concorrentes. Executável somente por service_role.';

revoke execute on function public.create_or_get_order_with_questions(uuid, text, text, text, text, text[], text, text, text) from public;
revoke execute on function public.create_or_get_order_with_questions(uuid, text, text, text, text, text[], text, text, text) from anon;
revoke execute on function public.create_or_get_order_with_questions(uuid, text, text, text, text, text[], text, text, text) from authenticated;
grant execute on function public.create_or_get_order_with_questions(uuid, text, text, text, text, text[], text, text, text) to service_role;


-- ──────────── 2. Função: vinculação segura e idempotente da Order ───────────
-- Única forma legítima de gravar mercado_pago_order_id/mercado_pago_payment_id
-- em um pedido — a Edge Function NUNCA faz UPDATE direto em orders para isso.
--
-- Vinculação em DUAS ETAPAS: o Mercado Pago documenta que um POST/GET pode
-- devolver uma Order "shell" — já criada, com ID válido, mas ainda sem
-- transactions/payment completos (estado processing/in_process transitório).
-- Perder esse Order ID por não ter ainda um payment ID seria pior do que
-- vincular em duas etapas:
--   Etapa A: só mercado_pago_order_id é conhecido (p_mercado_pago_payment_id
--     null) — grava só o Order ID, sem exigir o payment ID.
--   Etapa B: numa chamada POSTERIOR para o MESMO pedido, com o mesmo
--     mercado_pago_order_id já persistido e o payment ID local ainda null,
--     preenche o payment ID (agora conhecido).
-- p_mercado_pago_payment_id null NUNCA significa "limpar o que já está
-- gravado" — significa apenas "não informado nesta chamada". Um Order ID
-- diferente do já persistido, ou um payment ID diferente do já persistido
-- (quando ambos os lados são não-null), são sempre conflito — nunca
-- sobrescritos.
create or replace function public.link_mercado_pago_order(
  p_order_id                 uuid,
  p_mercado_pago_order_id    text,
  p_mercado_pago_payment_id  text default null
)
returns table (
  order_id                 uuid,
  mercado_pago_order_id    text,
  mercado_pago_payment_id  text,
  was_already_linked       boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
#variable_conflict error
-- order_id, mercado_pago_order_id e mercado_pago_payment_id (nomes do
-- RETURNS TABLE) também existem como colunas reais de orders. Toda
-- referência a coluna abaixo usa alias de tabela (o.) ou variável v_.
declare
  v_current_mp_order_id    text;
  v_current_mp_payment_id  text;
  v_final_mp_payment_id    text;
begin
  if p_order_id is null then
    raise exception 'link_mercado_pago_order: order_id não informado.';
  end if;

  if p_mercado_pago_order_id is null or btrim(p_mercado_pago_order_id) = '' then
    raise exception 'link_mercado_pago_order: mercado_pago_order_id não pode ser vazio.';
  end if;

  -- payment_id é OPCIONAL (Etapa A) — mas se informado, não pode ser
  -- string vazia.
  if p_mercado_pago_payment_id is not null and btrim(p_mercado_pago_payment_id) = '' then
    raise exception 'link_mercado_pago_order: mercado_pago_payment_id, quando informado, não pode ser vazio.';
  end if;

  select o.mercado_pago_order_id, o.mercado_pago_payment_id
    into v_current_mp_order_id, v_current_mp_payment_id
  from public.orders o
  where o.id = p_order_id
  for update of o;

  if not found then
    raise exception 'link_mercado_pago_order: pedido % não encontrado.', p_order_id;
  end if;

  -- Conflito de Order ID: já vinculado a uma Order DIFERENTE — nunca
  -- sobrescreve.
  if v_current_mp_order_id is not null and v_current_mp_order_id is distinct from p_mercado_pago_order_id then
    raise exception
      'link_mercado_pago_order: pedido % já está vinculado a uma Order diferente.',
      p_order_id;
  end if;

  -- Conflito de payment ID: só compara quando AMBOS os lados são
  -- não-null — p_mercado_pago_payment_id null nunca é comparado nem grava
  -- por cima do que já existe.
  if v_current_mp_payment_id is not null
     and p_mercado_pago_payment_id is not null
     and v_current_mp_payment_id is distinct from p_mercado_pago_payment_id then
    raise exception
      'link_mercado_pago_order: pedido % já está vinculado a um pagamento diferente.',
      p_order_id;
  end if;

  -- payment_id final a persistir: mantém o que já está gravado, se
  -- houver; senão usa o recém-informado (pode continuar null — Etapa A).
  -- CORREÇÃO desta migration: pg_catalog.coalesce(...) não existe
  -- (COALESCE é expressão especial do SQL, não função qualificável por
  -- schema) — era a causa do HTTP 500 real em produção.
  v_final_mp_payment_id := COALESCE(v_current_mp_payment_id, p_mercado_pago_payment_id);

  if v_current_mp_order_id is null then
    -- Nenhum Order ID ainda: primeira gravação (Etapa A, com ou sem
    -- payment_id junto).
    update public.orders as o
      set mercado_pago_order_id = p_mercado_pago_order_id,
          mercado_pago_payment_id = v_final_mp_payment_id
      where o.id = p_order_id;

    return query select p_order_id, p_mercado_pago_order_id, v_final_mp_payment_id, false;
    return;
  end if;

  if v_final_mp_payment_id is distinct from v_current_mp_payment_id then
    -- Order ID já igual; payment_id está sendo preenchido agora pela
    -- primeira vez (Etapa B).
    update public.orders as o
      set mercado_pago_payment_id = v_final_mp_payment_id
      where o.id = p_order_id;

    return query select p_order_id, p_mercado_pago_order_id, v_final_mp_payment_id, false;
    return;
  end if;

  -- Exatamente o mesmo estado já persistido (Order ID igual, payment_id
  -- final igual ao já gravado — incluindo o caso "ambos ainda null"):
  -- sucesso idempotente, sem nenhum UPDATE (retry seguro).
  return query select p_order_id, p_mercado_pago_order_id, v_final_mp_payment_id, true;
end;
$$;

comment on function public.link_mercado_pago_order(uuid, text, text) is
  'Grava mercado_pago_order_id/mercado_pago_payment_id em um pedido de forma idempotente e em DUAS ETAPAS: Etapa A grava só mercado_pago_order_id quando o payment ainda não é conhecido (p_mercado_pago_payment_id null — Order "shell" do Mercado Pago, ainda sem transactions completo); Etapa B preenche mercado_pago_payment_id numa chamada posterior, quando o mesmo Order ID já está persistido. p_mercado_pago_payment_id null nunca limpa nem sobrescreve um valor já gravado. Se o vínculo já existe e é idêntico ao que seria gravado, retorna sucesso sem regravar; se é diferente (Order ID ou payment ID, quando ambos não-null), lança exceção — nunca sobrescreve. Executável somente por service_role. Única forma legítima de vincular uma Order do Mercado Pago a um pedido.';

revoke execute on function public.link_mercado_pago_order(uuid, text, text) from public;
revoke execute on function public.link_mercado_pago_order(uuid, text, text) from anon;
revoke execute on function public.link_mercado_pago_order(uuid, text, text) from authenticated;
grant execute on function public.link_mercado_pago_order(uuid, text, text) to service_role;
