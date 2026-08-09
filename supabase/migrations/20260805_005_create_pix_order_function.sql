-- ════════════════════════════════════════════════════════════════════════════
--  ENTRE NÓS TARÔ — FASE 2: CRIAÇÃO SEGURA E IDEMPOTENTE DE PEDIDO (PIX)
--
--  1. orders.mercado_pago_order_id — ID retornado pela API de Orders do
--     Mercado Pago (POST /v1/orders). Conceito diferente de
--     mercado_pago_preference_id (Checkout Pro/Preferences, não usado neste
--     fluxo) e de mercado_pago_payment_id (já existente desde a migration
--     inicial, preenchido junto quando presente na resposta).
--
--  2. orders.checkout_request_id — chave de idempotência ESTÁVEL, gerada
--     pelo cliente (frontend) uma única vez por tentativa de compra e
--     reenviada em toda tentativa/retry da MESMA compra.
--
--  3. public.create_or_get_order_with_questions(...): idempotente, e agora
--     na ORDEM CORRETA —
--       a) procura primeiro por checkout_request_id, SEM exigir que o
--          pacote ainda esteja ativo (um pedido pendente de pagamento tem
--          que continuar recuperável mesmo que o pacote seja desativado
--          depois — ver revisão que motivou esta correção);
--       b) se encontrar, compara pacote (slug), nome normalizado, e-mail
--          normalizado, perguntas e hash do token contra o que já está
--          persistido — nunca contra preço/nome/e-mail "atuais" de
--          packages, e nunca faz UPDATE do pedido existente. terms_version
--          e privacy_version PROPOSITALMENTE NÃO entram nesta comparação
--          (correção desta revisão): são gravados uma única vez, na
--          criação, e permanecem como estavam — uma atualização dos termos
--          legais depois da criação nunca bloqueia a recuperação de um Pix
--          já gerado para o mesmo checkout_request_id;
--       c) só quando NÃO existe pedido para aquele checkout_request_id é
--          que busca o pacote ATIVO, valida o limite de perguntas e cria
--          pedido + perguntas;
--       d) devolve sempre customer_email PERSISTIDO (nunca reconstruído a
--          partir do parâmetro desta chamada) e order_created_at (para a
--          janela de reconciliação por data que a Edge Function usa junto
--          à API de busca do Mercado Pago).
--     Protegida contra requisições concorrentes com o mesmo
--     checkout_request_id por um loop de no máximo 2 tentativas: se o
--     INSERT falhar com unique_violation (outra transação venceu a
--     corrida), a próxima volta do loop ENCONTRA o pedido dela no passo (a)
--     e aplica a mesma comparação do passo (b), em vez de propagar o erro.
--
--  4. access_token_hash (coluna já existente) guarda o hash de um
--     checkout_access_token gerado pelo CLIENTE (Web Crypto, 64 caracteres
--     hex). O valor bruto nunca entra nem sai do banco.
--
--  4b. orders.mercado_pago_environment — 'test' ou 'production',
--      persistido na criação do pedido, NUNCA alterado depois (correção
--      desta revisão). create_or_get_order_with_questions() agora exige
--      p_mercado_pago_environment: pedido novo grava o ambiente recebido;
--      pedido existente exige igualdade EXATA com o ambiente já
--      persistido — ambiente diferente entra na MESMA comparação que já
--      gera 'checkout_conflict' (pacote/nome/e-mail/perguntas/token
--      diferentes), nunca UPDATE. Isso impede que uma troca futura de
--      test para production (ou vice-versa) reconcilie ou reutilize uma
--      tentativa de checkout criada no outro ambiente.
--
--  Correções de revisões anteriores:
--    - o hash usava extensions.encode(extensions.digest(...), 'hex') —
--      errado. Neste projeto, digest() vive em "extensions", mas encode()
--      vive em "pg_catalog" (confirmado por consulta a pg_proc). Corrigido
--      para pg_catalog.encode(extensions.digest(...), 'hex').
--    - a constraint UNIQUE de checkout_request_id agora é NOMEADA
--      explicitamente (orders_checkout_request_id_key) — o tratamento de
--      unique_violation dentro do loop de tentativas usa
--      GET STACKED DIAGNOSTICS ... = CONSTRAINT_NAME para só reinterpretar
--      a corrida esperada nessa constraint específica; qualquer outra
--      violação de unicidade é repropagada (RAISE;), nunca mascarada.
--
--  5. public.link_mercado_pago_order(...): única forma legítima de gravar
--     mercado_pago_order_id/mercado_pago_payment_id em um pedido —
--     idempotente (mesmos IDs já persistidos = sucesso sem regravar) e
--     nunca sobrescreve um vínculo existente com IDs diferentes (lança
--     exceção de conflito). A Edge Function usa esta função, nunca UPDATE
--     direto em orders para isso. VINCULAÇÃO EM DUAS ETAPAS (correção desta
--     revisão): mercado_pago_payment_id agora é OPCIONAL (default null) —
--     Etapa A grava só mercado_pago_order_id quando o Mercado Pago devolveu
--     uma Order "shell" (criada, mas ainda sem transactions/payment
--     completo); Etapa B preenche o payment_id numa chamada posterior,
--     quando o mesmo Order ID já está persistido. Nunca limpa nem
--     sobrescreve um ID já gravado.
--
--  6. Rate limiting de create-pix-order, com decisão CONGELADA E COM
--     EXPIRAÇÃO por tentativa de compra (correção desta revisão):
--       - public.checkout_rate_limit_windows: contadores por janela fixa
--         (10 min/10 tentativas por IP; 30 min/5 tentativas por e-mail);
--       - public.checkout_rate_limit_decisions: congela was_allowed (a
--         decisão combinada de IP+e-mail) junto de um decision_expires_at —
--         24h para decisões permitidas (vida útil esperada do checkout);
--         fim da janela de rate limit que causou o bloqueio, para decisões
--         bloqueadas. request_hash é HMAC de "request:" + checkout_request_id
--         + ":email:" + e-mail normalizado — NÃO só do checkout_request_id
--         (correção desta revisão): o MESMO checkout_request_id com o MESMO
--         e-mail continua sendo retry idempotente (devolve a mesma
--         decisão); com um e-mail DIFERENTE, conta como tentativa DISTINTA.
--         Enquanto não expira, retries com o mesmo par
--         checkout_request_id+e-mail sempre devolvem a mesma decisão, sem
--         recalcular. Depois de expirar, a PRÓXIMA chamada reavalia
--         atomicamente — nunca fica bloqueada para sempre por falta de
--         limpeza agendada. Reivindicação/relock atômicos via INSERT ... ON
--         CONFLICT + SELECT ... FOR UPDATE sobre request_hash, seguros sob
--         concorrência real (a segunda chamada simultânea bloqueia até a
--         primeira commitar, e só então lê a decisão final);
--       - public.record_checkout_attempt(ip_hash, email_hash, request_hash):
--         RPC atômica que orquestra as duas tabelas acima. ip_hash é
--         OPCIONAL (null quando a Edge Function não tem um IP confiável) —
--         nesse caso o limite por IP é ignorado, só o de e-mail vale.
--         Retry-After devolvido representa o tempo real até
--         decision_expires_at;
--       - public.cleanup_expired_checkout_rate_limits(): limpeza de janelas
--         e decisões expiradas (por decision_expires_at, não created_at),
--         não agendada por esta migration.
--     Nenhuma das duas tabelas tem política de RLS — com RLS ativo e zero
--     políticas, nem authenticated acessa via Data API, só service_role.
--     subject_hash/request_hash são sempre HMAC-SHA256 hex (64 caracteres,
--     checado tanto na tabela quanto na RPC) — nunca IP/e-mail/
--     checkout_request_id em texto puro.
--
--  Esta migration NÃO:
--    - cria pedidos ou perguntas de teste;
--    - altera orders.status além do valor inicial 'pending_payment';
--    - insere em order_events;
--    - expõe access_token_hash ou qualquer token em qualquer retorno;
--    - mexe no catálogo de cartas, no sorteio ou em qualquer IA.
--
--  Não aplicada a nenhum projeto Supabase por este arquivo — apenas o
--  arquivo de migration, pronto para revisão manual. orders está vazia
--  neste projeto (confirmado por consulta de leitura) — checkout_request_id
--  pode ser adicionada diretamente como NOT NULL UNIQUE, sem backfill.
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────────────────── 1. Novas colunas em orders ─────────────────────────
alter table public.orders
  add column mercado_pago_order_id text unique check (
    mercado_pago_order_id is null
    or btrim(mercado_pago_order_id) <> ''
  );

comment on column public.orders.mercado_pago_order_id is
  'ID retornado pela API de Orders do Mercado Pago (POST /v1/orders) para este pedido, usado no checkout Pix transparente. Único quando preenchido. Preenchido pela Edge Function create-pix-order somente depois de confirmado — nunca pelo cliente.';

-- Constraint nomeada explicitamente (não deixada para o nome automático do
-- Postgres) — create_or_get_order_with_questions() precisa desse nome
-- exato para distinguir, dentro do tratamento de unique_violation, a
-- corrida esperada em checkout_request_id de qualquer outra violação de
-- unicidade (nunca mascarada).
alter table public.orders
  add column checkout_request_id uuid not null,
  add constraint orders_checkout_request_id_key unique (checkout_request_id);

comment on column public.orders.checkout_request_id is
  'Chave de idempotência gerada pelo CLIENTE (frontend) uma única vez por tentativa de compra e reenviada em todo retry da mesma compra. É o que permite create_or_get_order_with_questions() devolver o mesmo pedido em vez de criar um novo, e também a base do X-Idempotency-Key enviado ao Mercado Pago.';

comment on column public.orders.access_token_hash is
  'Hash SHA-256 (hex) de um checkout_access_token gerado pelo CLIENTE via Web Crypto (alta entropia, 64 caracteres hex) e enviado uma única vez por tentativa de compra. O token em texto puro nunca é persistido no banco. Em repetições do mesmo checkout_request_id, o hash recebido é apenas CONFERIDO contra este valor — nunca regravado. Uso futuro: combinado com public_id, autentica a página privada do cliente.';

-- orders está vazia neste projeto (mesma verificação já feita para
-- checkout_request_id) — pode ser adicionada diretamente como NOT NULL,
-- sem backfill.
alter table public.orders
  add column mercado_pago_environment text not null
  check (mercado_pago_environment in ('test', 'production'));

comment on column public.orders.mercado_pago_environment is
  'Ambiente do Mercado Pago (test ou production) em que este pedido foi criado — persistido uma única vez, na criação, nunca alterado depois. create_or_get_order_with_questions() exige igualdade exata com este valor para recuperar um pedido existente pelo mesmo checkout_request_id; ambiente diferente é tratado como checkout_conflict. Garante que uma troca futura de test para production (ou vice-versa) nunca reutilize nem reconcilie uma tentativa de checkout criada no outro ambiente.';


-- ─────────── 2. Função: criação idempotente de pedido + perguntas ───────────
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

  v_question_count := pg_catalog.coalesce(pg_catalog.cardinality(p_questions), 0);
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
        -- (constraint nomeada explicitamente na seção 1). Qualquer outra
        -- violação de unicidade (ex.: colisão de access_token_hash — 256
        -- bits, astronomicamente improvável, mas nunca mascarada) é
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


-- ═══════════════════════════════ Permissões ═══════════════════════════════
revoke execute on function public.create_or_get_order_with_questions(uuid, text, text, text, text, text[], text, text, text) from public;
revoke execute on function public.create_or_get_order_with_questions(uuid, text, text, text, text, text[], text, text, text) from anon;
revoke execute on function public.create_or_get_order_with_questions(uuid, text, text, text, text, text[], text, text, text) from authenticated;
grant execute on function public.create_or_get_order_with_questions(uuid, text, text, text, text, text[], text, text, text) to service_role;


-- ──────────── 3. Função: vinculação segura e idempotente da Order ───────────
-- Única forma legítima de gravar mercado_pago_order_id/mercado_pago_payment_id
-- em um pedido — a Edge Function NUNCA faz UPDATE direto em orders para isso.
--
-- Vinculação em DUAS ETAPAS (correção desta revisão): o Mercado Pago
-- documenta que um POST/GET pode devolver uma Order "shell" — já criada,
-- com ID válido, mas ainda sem transactions/payment completos (estado
-- processing/in_process transitório). Perder esse Order ID por não ter
-- ainda um payment ID seria pior do que vincular em duas etapas:
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
  v_final_mp_payment_id := pg_catalog.coalesce(v_current_mp_payment_id, p_mercado_pago_payment_id);

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


-- ─────────── 4. Rate limiting de create-pix-order (tabelas + RPC) ───────────
-- Contadores por janela fixa. subject_hash é SEMPRE um HMAC-SHA256 (hex, 64
-- caracteres) calculado pela Edge Function com RATE_LIMIT_HASH_SECRET e
-- separação de domínio ("ip:"/"email:"/"request:" como prefixo antes do
-- HMAC) — o banco nunca vê IP, e-mail ou checkout_request_id em texto puro.
create table public.checkout_rate_limit_windows (
  subject_kind   text not null check (subject_kind in ('ip', 'email')),
  subject_hash   text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_start   timestamptz not null,
  attempt_count  integer not null default 1 check (attempt_count > 0),
  updated_at     timestamptz not null default now(),
  primary key (subject_kind, subject_hash, window_start)
);

comment on table public.checkout_rate_limit_windows is
  'Contadores de tentativas de checkout DISTINTAS por janela fixa (10 min/10 tentativas por IP; 30 min/5 tentativas por e-mail) — uma tentativa só incrementa o contador na PRIMEIRA vez que o request_hash (HMAC de checkout_request_id + e-mail normalizado juntos — não só o primeiro) aparece (ver checkout_rate_limit_decisions e record_checkout_attempt()). subject_hash é sempre HMAC-SHA256 hex (64 caracteres) — nunca IP/e-mail em texto puro. Sem política de RLS: com RLS ativo e nenhuma política, nem authenticated consegue ler/escrever via Data API — só service_role. Limpeza de janelas expiradas: ver public.cleanup_expired_checkout_rate_limits(), não agendada por esta migration.';

alter table public.checkout_rate_limit_windows enable row level security;
-- Nenhuma política é criada de propósito — ver comentário da tabela acima.

create index checkout_rate_limit_windows_window_start_idx
  on public.checkout_rate_limit_windows (window_start);

revoke all on public.checkout_rate_limit_windows from public, anon, authenticated;
grant select, insert, update, delete on public.checkout_rate_limit_windows to service_role;

-- Decisão de rate limiting CONGELADA por request_hash (HMAC de
-- checkout_request_id, prefixo "request:"). Ao contrário de um mero
-- registro de deduplicação, esta tabela guarda o próprio resultado
-- (was_allowed) computado na PRIMEIRA vez que este request_hash apareceu,
-- considerando IP e e-mail juntos naquele instante. Retries do MESMO
-- checkout_request_id nunca recalculam com base na contagem atual (que
-- pode ter subido por causa de OUTRAS tentativas, distintas, dentro da
-- mesma janela) — sempre devolvem esta decisão congelada. Chave primária
-- global em request_hash (não por subject): a decisão é uma propriedade
-- única da tentativa de compra, não do IP nem do e-mail isoladamente.
create table public.checkout_rate_limit_decisions (
  request_hash          text primary key check (request_hash ~ '^[0-9a-f]{64}$'),
  was_allowed            boolean not null,
  -- Momento em que esta decisão deixa de valer e uma nova chamada com o
  -- mesmo request_hash deve ser REAVALIADA atomicamente (nunca devolvida
  -- congelada para sempre): para decisões permitidas, o fim da vida útil
  -- esperada do checkout; para decisões bloqueadas, o fim da janela de
  -- rate limit que causou o bloqueio.
  decision_expires_at    timestamptz not null,
  created_at             timestamptz not null default now()
);

comment on table public.checkout_rate_limit_decisions is
  'Congela a decisão original (permitida ou não) de cada tentativa de checkout (request_hash = HMAC de "request:" + checkout_request_id + ":email:" + e-mail normalizado — NÃO só do checkout_request_id, para que o mesmo checkout_request_id reutilizado com um e-mail diferente conte como tentativa distinta), considerando IP e e-mail juntos no momento em que foi computada, em record_checkout_attempt(). Retries do MESMO par checkout_request_id+e-mail devolvem esta decisão enquanto decision_expires_at não passou; depois disso, a próxima chamada REAVALIA atomicamente (nunca fica bloqueada para sempre por falta de limpeza agendada). Sem política de RLS: só service_role acessa.';

alter table public.checkout_rate_limit_decisions enable row level security;
-- Nenhuma política é criada de propósito — mesmo raciocínio da tabela acima.

create index checkout_rate_limit_decisions_expires_at_idx
  on public.checkout_rate_limit_decisions (decision_expires_at);

revoke all on public.checkout_rate_limit_decisions from public, anon, authenticated;
grant select, insert, update, delete on public.checkout_rate_limit_decisions to service_role;

create or replace function public.record_checkout_attempt(
  p_ip_hash       text,
  p_email_hash    text,
  p_request_hash  text
)
returns table (
  allowed               boolean,
  retry_after_seconds   integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
#variable_conflict error
declare
  v_ip_window_seconds     constant integer := 600;    -- 10 minutos
  v_ip_limit              constant integer := 10;
  v_email_window_seconds  constant integer := 1800;   -- 30 minutos
  v_email_limit           constant integer := 5;
  -- Vida útil de uma decisão PERMITIDA — deliberadamente maior que
  -- qualquer janela de rate limit, para que retries legítimos da MESMA
  -- tentativa de checkout continuem permitidos enquanto o checkout ainda
  -- pode estar em andamento (aguardando confirmação do Mercado Pago,
  -- nova tentativa após erro temporário etc.).
  v_allowed_decision_ttl_seconds constant integer := 86400; -- 24 horas

  v_now                    timestamptz := clock_timestamp();
  v_ip_window_start        timestamptz;
  v_email_window_start     timestamptz;
  v_ip_window_end          timestamptz;
  v_email_window_end       timestamptz;
  v_existing_allowed       boolean;
  v_existing_expires_at    timestamptz;
  v_needs_evaluation       boolean;
  v_allowed                boolean;
  v_expires_at             timestamptz;
  v_ip_count               integer;
  v_email_count            integer;
  v_retry_after            integer := 0;
begin
  -- p_ip_hash é OPCIONAL (pode vir null): quando a Edge Function não
  -- conseguiu extrair um IP confiável da requisição, o limite por IP é
  -- simplesmente ignorado e a decisão passa a depender só do e-mail — ver
  -- comentário em extractTrustedClientIp() no index.ts. NUNCA um bucket
  -- "unknown" compartilhado por todo mundo sem IP confiável.
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'record_checkout_attempt: ip hash inválido (esperado null ou 64 caracteres hexadecimais).';
  end if;
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'record_checkout_attempt: email hash inválido (esperado 64 caracteres hexadecimais).';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'record_checkout_attempt: request hash inválido (esperado 64 caracteres hexadecimais).';
  end if;

  -- Bucket de janela fixa alinhado à época Unix — determinístico, sem
  -- depender de fuso horário.
  v_ip_window_start :=
    to_timestamp(floor(extract(epoch from v_now) / v_ip_window_seconds) * v_ip_window_seconds);
  v_email_window_start :=
    to_timestamp(floor(extract(epoch from v_now) / v_email_window_seconds) * v_email_window_seconds);
  v_ip_window_end := v_ip_window_start + make_interval(secs => v_ip_window_seconds);
  v_email_window_end := v_email_window_start + make_interval(secs => v_email_window_seconds);

  -- Passo 1: garante que a linha existe, com um placeholder inofensivo
  -- (was_allowed=false, decision_expires_at=v_now — ou seja, já
  -- "expirado", forçando reavaliação abaixo). Se a linha já existe, não
  -- faz nada. Isto NÃO decide nada ainda — só reivindica a linha.
  insert into public.checkout_rate_limit_decisions (request_hash, was_allowed, decision_expires_at)
  values (p_request_hash, false, v_now)
  on conflict (request_hash) do nothing;

  -- Passo 2: a linha CERTAMENTE existe agora (própria ou de outra
  -- transação) — trava para leitura/gravação exclusiva. Sob concorrência
  -- real, uma segunda transação (tentando reavaliar o MESMO request_hash
  -- expirado ao mesmo tempo) bloqueia aqui até a primeira liberar o lock
  -- (commit), e então lê o valor FINAL já commitado — nunca um estado
  -- intermediário. Isso vale tanto para a criação inicial (passo 1) quanto
  -- para reavaliações de decisões expiradas: nenhuma janela permite duas
  -- chamadas concorrentes para o mesmo request_hash ultrapassarem o limite
  -- através deste caminho.
  select d.was_allowed, d.decision_expires_at
    into v_existing_allowed, v_existing_expires_at
  from public.checkout_rate_limit_decisions d
  where d.request_hash = p_request_hash
  for update;

  v_needs_evaluation := v_now >= v_existing_expires_at;

  if v_needs_evaluation then
    -- Primeira vez OU decisão anterior expirada: (re)avalia atomicamente,
    -- incrementando os contadores de janela normalmente. Uma reavaliação
    -- por expiração é tratada exatamente como uma tentativa nova — se uma
    -- janela nova já começou, o bloqueio anterior não se aplica mais.
    if p_ip_hash is not null then
      insert into public.checkout_rate_limit_windows as w
        (subject_kind, subject_hash, window_start, attempt_count, updated_at)
      values
        ('ip', p_ip_hash, v_ip_window_start, 1, v_now)
      on conflict (subject_kind, subject_hash, window_start)
        do update set attempt_count = w.attempt_count + 1, updated_at = v_now
      returning w.attempt_count into v_ip_count;
    else
      v_ip_count := 0;
    end if;

    insert into public.checkout_rate_limit_windows as w
      (subject_kind, subject_hash, window_start, attempt_count, updated_at)
    values
      ('email', p_email_hash, v_email_window_start, 1, v_now)
    on conflict (subject_kind, subject_hash, window_start)
      do update set attempt_count = w.attempt_count + 1, updated_at = v_now
    returning w.attempt_count into v_email_count;

    v_allowed := (v_ip_count <= v_ip_limit) and (v_email_count <= v_email_limit);

    if v_allowed then
      v_expires_at := v_now + make_interval(secs => v_allowed_decision_ttl_seconds);
    else
      -- Expira no fim da janela que causou o bloqueio — a mais distante
      -- entre IP e e-mail, quando as duas contribuíram.
      v_expires_at := greatest(
        case when v_ip_count > v_ip_limit then v_ip_window_end else v_now end,
        case when v_email_count > v_email_limit then v_email_window_end else v_now end
      );
    end if;

    update public.checkout_rate_limit_decisions
      set was_allowed = v_allowed, decision_expires_at = v_expires_at
      where request_hash = p_request_hash;
  else
    -- Decisão ainda válida (não expirou): devolve exatamente o que foi
    -- congelado, sem tocar em nenhum contador.
    v_allowed := v_existing_allowed;
    v_expires_at := v_existing_expires_at;
  end if;

  -- Retry-After representa o tempo REAL até decision_expires_at — nunca
  -- um valor fixo recalculado do zero a cada chamada.
  if not v_allowed then
    v_retry_after := greatest(0, ceil(extract(epoch from (v_expires_at - v_now)))::integer);
  end if;

  return query select v_allowed, v_retry_after;
end;
$$;

comment on function public.record_checkout_attempt(text, text, text) is
  'Registra uma tentativa de checkout (hash de IP — opcional, null quando não há IP confiável —, hash de e-mail, e hash da tentativa que combina checkout_request_id E e-mail normalizado — request_hash = HMAC("request:"+checkout_request_id+":email:"+email) — não só o primeiro) e retorna se deve ser permitida, com base em limites fixos (10 checkout_request_id distintos/10min por IP, 5/30min por e-mail). A decisão (allowed) é computada e CONGELADA com um decision_expires_at: para decisões permitidas, 24h (vida útil esperada do checkout); para decisões bloqueadas, o fim da janela de rate limit que causou o bloqueio. Enquanto não expira, retries com o MESMO par checkout_request_id+e-mail sempre devolvem a mesma decisão, sem recalcular nem reincrementar contadores; o MESMO checkout_request_id com um e-mail DIFERENTE é uma tentativa distinta, contabilizada normalmente. Depois de expirar, a PRÓXIMA chamada reavalia atomicamente — nunca fica bloqueada para sempre por falta de limpeza agendada. Operação atômica via INSERT ... ON CONFLICT + SELECT ... FOR UPDATE sobre request_hash, segura sob concorrência real. Nunca recebe IP/e-mail/checkout_request_id em texto puro — só hashes calculados pela Edge Function. Executável somente por service_role.';

revoke execute on function public.record_checkout_attempt(text, text, text) from public;
revoke execute on function public.record_checkout_attempt(text, text, text) from anon;
revoke execute on function public.record_checkout_attempt(text, text, text) from authenticated;
grant execute on function public.record_checkout_attempt(text, text, text) to service_role;

-- Limpeza (não agendada por esta migration — chamada manual ou por um
-- scheduler futuro, fora daqui).
create or replace function public.cleanup_expired_checkout_rate_limits(
  p_older_than interval default interval '1 day'
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_cutoff   timestamptz := clock_timestamp() - p_older_than;
  v_deleted  integer := 0;
  v_count    integer;
begin
  -- decision_expires_at (não created_at): uma decisão só é candidata a
  -- limpeza depois que deixou de valer — nunca remove uma decisão ainda
  -- ativa, mesmo que antiga. Note que a ausência desta limpeza NUNCA deixa
  -- uma decisão bloqueada presa para sempre: record_checkout_attempt()
  -- reavalia atomicamente qualquer request_hash cuja decisão já expirou,
  -- independentemente de esta função de limpeza rodar ou não.
  delete from public.checkout_rate_limit_decisions where decision_expires_at < v_cutoff;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted + v_count;

  delete from public.checkout_rate_limit_windows where window_start < v_cutoff;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted + v_count;

  return v_deleted;
end;
$$;

comment on function public.cleanup_expired_checkout_rate_limits(interval) is
  'Remove janelas de rate limit (contadores em checkout_rate_limit_windows, com window_start antigo) e decisões congeladas (checkout_rate_limit_decisions, com decision_expires_at antigo — nunca remove uma decisão ainda ativa) mais antigas que p_older_than (padrão 1 dia). NÃO agendada por esta migration — chamada manual ou por um scheduler futuro (pg_cron ou externo); a ausência de agendamento nunca deixa uma decisão bloqueada permanente, pois record_checkout_attempt() reavalia sozinha qualquer decisão expirada. Executável somente por service_role.';

revoke execute on function public.cleanup_expired_checkout_rate_limits(interval) from public;
revoke execute on function public.cleanup_expired_checkout_rate_limits(interval) from anon;
revoke execute on function public.cleanup_expired_checkout_rate_limits(interval) from authenticated;
grant execute on function public.cleanup_expired_checkout_rate_limits(interval) to service_role;


-- ═══════════════════════════ Consultas de validação ════════════════════════
-- Comentadas de propósito — não executam automaticamente com esta migration.

-- Todo pedido deve ter exatamente o número de perguntas do seu pacote
-- (0 linhas = ok):
-- select o.id, count(q.id) as question_count, pk.question_limit
-- from public.orders o
-- join public.packages pk on pk.id = o.package_id
-- left join public.questions q on q.order_id = o.id
-- group by o.id, pk.question_limit
-- having count(q.id) <> pk.question_limit;

-- Nenhum checkout_request_id duplicado (0 linhas = ok; já é garantido por
-- UNIQUE, isto é só uma checagem de sanidade extra):
-- select checkout_request_id, count(*)
-- from public.orders
-- group by checkout_request_id
-- having count(*) > 1;

-- Nenhum mercado_pago_order_id duplicado (0 linhas = ok):
-- select mercado_pago_order_id, count(*)
-- from public.orders
-- where mercado_pago_order_id is not null
-- group by mercado_pago_order_id
-- having count(*) > 1;

-- Todo pedido criado por esta função deve começar em 'pending_payment'
-- (0 linhas = ok):
-- select id, status from public.orders where status <> 'pending_payment' and paid_at is null;

-- Nenhum pedido com só um dos dois IDs do Mercado Pago preenchido — os dois
-- são gravados juntos por link_mercado_pago_order() (0 linhas = ok):
-- select id, mercado_pago_order_id, mercado_pago_payment_id
-- from public.orders
-- where (mercado_pago_order_id is null) <> (mercado_pago_payment_id is null);

-- Nenhum subject_hash de rate limit em texto puro óbvio (checagem de
-- sanidade: um hash HMAC-SHA256 hex tem sempre 64 caracteres — 0 linhas
-- fora desse padrão = ok; já é garantido por CHECK, isto é só sanidade
-- extra):
-- select subject_kind, subject_hash
-- from public.checkout_rate_limit_windows
-- where subject_hash !~ '^[0-9a-f]{64}$';

-- Idem para request_hash na tabela de decisões congeladas (0 linhas = ok):
-- select request_hash
-- from public.checkout_rate_limit_decisions
-- where request_hash !~ '^[0-9a-f]{64}$';
