-- ════════════════════════════════════════════════════════════════════════════
--  GUIA DE EVOLUÇÃO DE ENFERMAGEM — FASE 0 DA MIGRAÇÃO PIX MERCADO PAGO → PAGAR.ME V5
--
--  Escopo desta migration: public.orders ganha 4 colunas novas + constraints
--  de consistência entre elas, e UMA coluna existente (mercado_pago_
--  environment) tem seu NOT NULL removido — nada mais muda nela (mesmo
--  tipo, mesmo CHECK, mesmos valores em toda linha existente). NENHUMA
--  outra tabela é tocada. NENHUM dado existente é alterado (nenhum UPDATE
--  nesta migration inteira). NENHUMA RPC existente (create_or_get_order_
--  with_questions, create_or_get_product_order_with_items, link_mercado_
--  pago_order, mark_order_paid, record_checkout_attempt, get_order_
--  downloads_info) é alterada por este arquivo.
--
--  ── BLOQUEIO ESTRUTURAL ENCONTRADO E CORRIGIDO NESTA REVISÃO ─────────────
--  A primeira versão desta migration exigia pagarme_environment preenchido
--  para payment_provider='pagarme', mas nunca liberava mercado_pago_
--  environment (coluna herdada, NOT NULL desde a migration 20260805_005)
--  para ficar NULL nesse mesmo caso. Resultado: todo pedido pagarme seria
--  OBRIGADO pelo próprio schema a também carregar um mercado_pago_
--  environment ('test' ou 'production') que não significa nada para um
--  pedido que nunca fala com o Mercado Pago — exatamente a mistura
--  semântica de gateways que esta migração inteira existe para evitar.
--  Corrigido abaixo com DROP NOT NULL em mercado_pago_environment + uma
--  constraint simétrica única (orders_provider_environment_match) que
--  decide, por payment_provider, qual das duas colunas de ambiente deve
--  estar preenchida e qual deve ser NULL.
--
--  Auditoria feita ANTES de aceitar o DROP NOT NULL (respostas registradas
--  na conversa que aprovou esta migration, resumidas aqui para quem ler
--  só o arquivo):
--    1. create_or_get_order_with_questions e create_or_get_product_order_
--       with_items (as duas únicas RPCs que fazem INSERT em orders hoje)
--       já validam p_mercado_pago_environment com raise exception PRÓPRIO
--       antes do INSERT (não dependem do NOT NULL da coluna) e sempre
--       listam a coluna explicitamente no INSERT — DROP NOT NULL não muda
--       o comportamento delas em nada.
--    2. Nenhuma outra função (mark_order_paid, link_mercado_pago_order,
--       get_order_downloads_info) sequer referencia mercado_pago_
--       environment — confirmado por busca textual nos arquivos dessas
--       migrations.
--    3. Toda linha hoje existente já satisfaz NOT NULL (é a própria coluna
--       NOT NULL atual que garante isso) — DROP NOT NULL não reescreve
--       nem revalida nenhuma linha, só deixa de exigir o valor em INSERTs
--       futuros.
--    4. orders_mercado_pago_environment_check (CHECK (mercado_pago_
--       environment in ('test','production')), nome automático do
--       Postgres para o CHECK inline original da migration 20260805_005)
--       já permite NULL pela semântica padrão de CHECK no Postgres: a
--       linha só é rejeitada quando a expressão avalia para FALSE; uma
--       comparação envolvendo NULL avalia para UNKNOWN, que É aceito.
--       Ou seja, esse CHECK específico não precisa ser recriado — ele já
--       "deixa passar" NULL desde sempre; só o NOT NULL da coluna
--       impedia isso até agora.
--    5. Nenhum status, paid_at, ID ou pedido histórico é alterado por
--       este arquivo — confirmar: nenhuma linha abaixo contém UPDATE.
--
--  Por que só orders, e não payment_events: payment_events já foi
--  desenhada desde a migration inicial (20260804_001) para múltiplos
--  provedores — provider é text livre (default 'mercado_pago', não um
--  enum) e a unicidade é composta (provider, provider_event_id). Nenhuma
--  alteração de estrutura é necessária ali; o futuro pagarme-webhook só
--  precisa gravar provider = 'pagarme' nas linhas que criar.
--
--  Por que não products/order_items: são agnósticos de gateway de
--  pagamento por design (um order_item representa "o que foi comprado",
--  nunca "como foi pago"). Nenhuma mudança necessária.
--
--  Reversibilidade: as 4 colunas são novas e nenhuma coluna existente é
--  removida ou renomeada. payment_provider possui NOT NULL DEFAULT
--  'mercado_pago' para preservar semanticamente todos os pedidos
--  históricos existentes. As três colunas pagarme_* são nullable durante
--  as etapas intermediárias do fluxo, respeitando as constraints
--  definidas abaixo. mercado_pago_environment perde o NOT NULL, mas
--  mantém tipo, CHECK e todos os valores das linhas existentes — nenhuma
--  linha Mercado Pago hoje fica com esse campo NULL (a nova constraint
--  orders_provider_environment_match exige o contrário: NOT NULL para
--  payment_provider='mercado_pago'). Reverter esta migration (se
--  necessário) seria uma migration futura e trivial:
--    alter table public.orders
--      drop constraint if exists orders_provider_environment_match,
--      drop constraint if exists orders_mercado_pago_ids_forbidden_for_pagarme,
--      drop constraint if exists orders_pagarme_ids_forbidden_for_mercado_pago,
--      drop constraint if exists orders_pagarme_order_id_key,
--      drop constraint if exists orders_pagarme_order_id_not_blank,
--      drop constraint if exists orders_pagarme_charge_id_key,
--      drop constraint if exists orders_pagarme_charge_id_not_blank,
--      drop constraint if exists orders_pagarme_environment_check,
--      drop column if exists pagarme_environment,
--      drop column if exists pagarme_charge_id,
--      drop column if exists pagarme_order_id,
--      drop column if exists payment_provider;
--    alter table public.orders
--      alter column mercado_pago_environment set not null;
--  (o SET NOT NULL de volta só seria seguro se, no momento da reversão,
--  nenhum pedido payment_provider='pagarme' — com mercado_pago_environment
--  NULL por design — ainda existir; caso existam, teriam que virar
--  'mercado_pago' ou ser removidos antes, o que já é uma decisão de
--  produto, não de schema). Não incluída como parte executável desta
--  migration (nenhuma migration já aplicada neste projeto se
--  autorreverte) — só documentada aqui para confirmar que a operação é
--  ESTRUTURALMENTE reversível.
--
--  RESSALVA IMPORTANTE: a reversão acima só é "sem perda de dado" enquanto
--  nenhum pedido tiver payment_provider = 'pagarme' com pagarme_order_id/
--  pagarme_charge_id preenchidos (ou seja, imediatamente após esta
--  migration, antes da fase seguinte entrar em produção). A partir do
--  momento em que existirem pedidos Pagar.me reais (vendas reais), o DROP
--  COLUMN de pagarme_order_id/pagarme_charge_id/pagarme_environment
--  apagaria permanentemente os IDs históricos do gateway desses pedidos —
--  a reversão continua estruturalmente possível, mas deixa de ser sem
--  perda de dado. Qualquer reversão depois desse ponto exigiria antes um
--  backup/export dessas 3 colunas.
--
--  NÃO cria create-pagarme-order nem pagarme-webhook (Edge Functions —
--  fase seguinte). NÃO cria RPCs novas (create_or_get_..._pagarme,
--  link_pagarme_order — fase seguinte, fora do escopo aprovado agora).
--  NÃO altera create_or_get_order_with_questions nem create_or_get_
--  product_order_with_items (nem nenhuma outra RPC). NÃO altera
--  create-pix-order, pixCheckout.ts, PixEssentialCheckout.tsx,
--  fluxo/pedidos de tarô, mercado-pago-webhook, get-order-downloads,
--  Pixel, Turnstile, frontend nem secrets. NENHUM UPDATE em nenhuma linha
--  de orders.
-- ════════════════════════════════════════════════════════════════════════════


-- ═══════════════ 1. payment_provider — gateway de cada pedido ═══════════════
-- NOT NULL DEFAULT 'mercado_pago': toda linha hoje existente em orders foi
-- criada exclusivamente pelo Mercado Pago (create-pix-order/
-- create-product-order, únicas duas Edge Functions de criação de pedido em
-- produção até este momento) — o DEFAULT não é uma suposição, é a
-- interpretação correta e já verdadeira de TODO pedido pré-existente.
-- Adicionar uma coluna NOT NULL com DEFAULT constante em uma tabela já
-- populada é seguro e rápido no Postgres (11+): o valor default é
-- metadado, não reescreve a tabela inteira linha a linha.
--
-- IMPORTANTE (disciplina de código, não algo que este CHECK consegue
-- impor sozinho): o DEFAULT existe para que pedidos Mercado Pago já
-- persistidos e qualquer INSERT futuro feito pelas RPCs MP existentes
-- (create_or_get_order_with_questions / create_or_get_product_order_with_
-- items — nenhuma das duas foi alterada por esta migration, então nenhuma
-- delas passa payment_provider explicitamente, e é exatamente isso que
-- deve continuar acontecendo) continuem caindo em 'mercado_pago' sem
-- precisar de nenhuma mudança nelas. A RPC nova de Pagar.me (fase
-- seguinte, fora deste arquivo) deve SEMPRE listar payment_provider
-- explicitamente na lista de colunas do INSERT — nunca omitir a coluna
-- confiando no DEFAULT. Postgres não distingue "valor igual ao default
-- porque foi omitido" de "valor igual ao default porque foi informado
-- explicitamente" — a garantia de que pedidos Pagar.me nunca dependem
-- silenciosamente do DEFAULT é responsabilidade da RPC nova, não desta
-- coluna. Constraint alguma pode substituir essa revisão de código.
alter table public.orders
  add column payment_provider text not null default 'mercado_pago'
  constraint orders_payment_provider_check check (payment_provider in ('mercado_pago', 'pagarme'));

comment on column public.orders.payment_provider is
  'Gateway de pagamento responsável por este pedido, decidido na criação e nunca alterado depois. DEFAULT ''mercado_pago'' existe apenas para que pedidos já existentes e as RPCs Mercado Pago existentes (não alteradas por esta migration) continuem funcionando sem nenhuma mudança nelas. A RPC de criação de pedido Pagar.me (fase seguinte) DEVE sempre informar este valor explicitamente no INSERT — nunca omitir a coluna confiando neste DEFAULT.';


-- ═══════ 2. mercado_pago_environment — libera para NULL (pedidos pagarme) ═══
-- Coluna herdada da migration 20260805_005, hoje NOT NULL. Sem este passo,
-- todo pedido payment_provider='pagarme' seria obrigado a também carregar
-- um mercado_pago_environment válido ('test'/'production') que não tem
-- nenhum significado para um pedido que nunca fala com o Mercado Pago —
-- a mistura semântica de gateways que esta migração existe para evitar.
--
-- DROP NOT NULL não reescreve nem revalida nenhuma linha (é uma operação
-- de metadado, não uma varredura da tabela) e não apaga nem altera nenhum
-- valor já persistido — toda linha existente continua exatamente com o
-- mercado_pago_environment que já tinha. A partir de agora, a obrigação
-- "mercado_pago_environment deve estar preenchido" passa a ser condicional
-- (só para payment_provider='mercado_pago'), imposta pela constraint
-- orders_provider_environment_match (seção 4c abaixo) — não mais pelo
-- NOT NULL incondicional da própria coluna.
--
-- orders_mercado_pago_environment_check (CHECK (mercado_pago_environment
-- in ('test','production')), nome automático do Postgres para o CHECK
-- inline da migration 20260805_005) não precisa ser recriado nem tocado:
-- pela semântica padrão do Postgres, um CHECK só rejeita uma linha quando
-- a expressão avalia para FALSE — uma comparação envolvendo NULL avalia
-- para UNKNOWN, que é aceito. Esse CHECK específico já permitia NULL
-- desde que foi criado; só o NOT NULL da coluna impedia até agora.
alter table public.orders
  alter column mercado_pago_environment drop not null;


-- ═══════════ 3. pagarme_order_id / pagarme_charge_id — identidade ═══════════
-- Mesmo padrão já usado para mercado_pago_order_id/mercado_pago_payment_id
-- (migration 20260805_005): text, UNIQUE quando preenchido (UNIQUE em
-- Postgres permite qualquer quantidade de NULLs — a restrição só entra em
-- vigor quando o valor é de fato preenchido), nunca vazio quando não-null.
-- Nomes deliberadamente distintos de mercado_pago_order_id/payment_id —
-- nunca reaproveitar as colunas do Mercado Pago para outro gateway, exatamente
-- para que um pedido nunca fique ambíguo sobre "esse ID é de qual provedor".
--
-- UNIQUE e CHECK nomeados EXPLICITAMENTE (não deixados para o nome
-- automático do Postgres) — pedido explícito desta revisão, para que uma
-- auditoria futura consiga referenciar cada constraint pelo nome exato
-- sem precisar consultar o catálogo primeiro.
alter table public.orders
  add column pagarme_order_id text;

alter table public.orders
  add constraint orders_pagarme_order_id_key unique (pagarme_order_id);

alter table public.orders
  add constraint orders_pagarme_order_id_not_blank check (
    pagarme_order_id is null or btrim(pagarme_order_id) <> ''
  );

comment on column public.orders.pagarme_order_id is
  'ID do Order/Pedido retornado pela API do Pagar.me V5 para este pedido. Único quando preenchido (orders_pagarme_order_id_key). Preenchido somente pela futura Edge Function/RPC de vinculação Pagar.me, depois de confirmado — nunca pelo cliente. Só pode estar preenchido quando payment_provider = ''pagarme'' (ver orders_mercado_pago_ids_forbidden_for_pagarme e orders_pagarme_ids_forbidden_for_mercado_pago).';

alter table public.orders
  add column pagarme_charge_id text;

alter table public.orders
  add constraint orders_pagarme_charge_id_key unique (pagarme_charge_id);

alter table public.orders
  add constraint orders_pagarme_charge_id_not_blank check (
    pagarme_charge_id is null or btrim(pagarme_charge_id) <> ''
  );

comment on column public.orders.pagarme_charge_id is
  'ID da Charge (cobrança/Pix) retornada pela API do Pagar.me V5 para este pedido — equivalente a mercado_pago_payment_id, mas para o Pagar.me. Único quando preenchido (orders_pagarme_charge_id_key). Mesma disciplina de preenchimento e mesma restrição de provider que pagarme_order_id.';


-- ═══════════════ 4. pagarme_environment — sandbox vs. produção ═══════════════
-- Equivalente a mercado_pago_environment, mas NULLABLE no nível da coluna
-- desde a criação — a obrigatoriedade condicional ("obrigatório SE
-- payment_provider = 'pagarme', NULL se payment_provider = 'mercado_pago'")
-- é imposta abaixo, na constraint orders_provider_environment_match —
-- nunca confiar em NOT NULL de coluna para uma regra que só se aplica a
-- um subconjunto de linhas.
alter table public.orders
  add column pagarme_environment text
  constraint orders_pagarme_environment_check check (
    pagarme_environment is null or pagarme_environment in ('test', 'production')
  );

comment on column public.orders.pagarme_environment is
  'Ambiente do Pagar.me (test ou production) em que este pedido foi criado — persistido uma única vez, na criação, nunca alterado depois. Obrigatoriamente preenchido quando payment_provider = ''pagarme''; obrigatoriamente NULL quando payment_provider = ''mercado_pago'' (ver orders_provider_environment_match). Mesmo raciocínio de mercado_pago_environment: evita que uma troca futura entre sandbox e produção do Pagar.me reconcilie indevidamente uma tentativa de checkout criada no outro ambiente.';


-- ═══════════════════ 5. Constraints cruzadas entre colunas ═══════════════════
-- As três constraints abaixo, juntas, tornam estruturalmente impossível
-- (não só "improvável pela lógica da aplicação") qualquer uma das
-- inconsistências identificadas na revisão: pedido pagarme com ID Mercado
-- Pago preenchido, pedido mercado_pago com ID Pagar.me preenchido, ou
-- QUALQUER pedido com a dupla de colunas de ambiente (mercado_pago_
-- environment, pagarme_environment) fora do padrão "exatamente uma
-- preenchida, a outra NULL, de acordo com payment_provider". Aplicadas em
-- uma tabela com poucas dezenas de linhas — a validação inicial do CHECK
-- (contra todas as linhas já existentes) é instantânea; não há
-- necessidade de NOT VALID + VALIDATE CONSTRAINT em duas etapas aqui.

-- 5a. Pedido pagarme nunca pode ter os IDs do Mercado Pago preenchidos.
--     (Pedido mercado_pago É PERMITIDO ter os dois IDs Mercado Pago nulos —
--     é o estado normal entre a criação do pedido e a Etapa A de
--     link_mercado_pago_order — esta constraint só proíbe a combinação
--     inversa: gateway errado com ID preenchido.)
alter table public.orders
  add constraint orders_mercado_pago_ids_forbidden_for_pagarme check (
    payment_provider <> 'pagarme'
    or (mercado_pago_order_id is null and mercado_pago_payment_id is null)
  );

-- 5b. Pedido mercado_pago nunca pode ter os IDs do Pagar.me preenchidos.
alter table public.orders
  add constraint orders_pagarme_ids_forbidden_for_mercado_pago check (
    payment_provider <> 'mercado_pago'
    or (pagarme_order_id is null and pagarme_charge_id is null)
  );

-- 5c. SUBSTITUI o desenho anterior (orders_pagarme_environment_required_
--     for_provider), que exigia pagarme_environment preenchido para
--     payment_provider='pagarme' mas nunca liberava mercado_pago_
--     environment para NULL nesse mesmo caso — o bloqueio estrutural
--     identificado nesta revisão. orders_provider_environment_match é
--     estritamente simétrica entre os dois gateways, mesmo padrão de
--     simetria estrita já usado em orders_package_id_matches_kind
--     (migration 20260814_008, para package_id vs. order_kind):
--       payment_provider='mercado_pago'  ⇒  mercado_pago_environment IS
--         NOT NULL  E  pagarme_environment IS NULL;
--       payment_provider='pagarme'       ⇒  mercado_pago_environment IS
--         NULL  E  pagarme_environment IS NOT NULL.
--     Nenhuma linha pode ter as duas colunas de ambiente preenchidas, nem
--     as duas em NULL.
alter table public.orders
  add constraint orders_provider_environment_match check (
    (
      payment_provider = 'mercado_pago'
      and mercado_pago_environment is not null
      and pagarme_environment is null
    )
    or
    (
      payment_provider = 'pagarme'
      and mercado_pago_environment is null
      and pagarme_environment is not null
    )
  );


-- ═══════════════════════════ Consultas de validação ════════════════════════
-- Comentadas de propósito — não executam automaticamente com esta migration.
-- Rodar manualmente depois de aplicar, antes de seguir para a fase seguinte.

-- Todo pedido existente deve ter ficado exatamente como 'mercado_pago',
-- com mercado_pago_environment preenchido, e sem nenhum pagarme_*
-- preenchido (contagem esperada = total de linhas de orders na primeira
-- coluna, 0 nas quatro seguintes):
-- select
--   count(*) filter (where payment_provider <> 'mercado_pago') as linhas_nao_mp,
--   count(*) filter (where mercado_pago_environment is null) as mercado_pago_environment_vazio,
--   count(*) filter (where pagarme_order_id is not null) as pagarme_order_id_preenchido,
--   count(*) filter (where pagarme_charge_id is not null) as pagarme_charge_id_preenchido,
--   count(*) filter (where pagarme_environment is not null) as pagarme_environment_preenchido
-- from public.orders;

-- Nenhum pedido com status/paid_at alterado por esta migration (comparar
-- manualmente com uma contagem tirada ANTES de aplicar, se disponível):
-- select status, count(*) from public.orders group by status order by status;
