-- ════════════════════════════════════════════════════════════════════════════
--  ENTRE NÓS TARÔ — FASE 1: MOTOR SEGURO DE SORTEIO DAS CARTAS
--
--  Cria public.draw_cards_for_question(p_question_id uuid): a ÚNICA forma
--  legítima de sortear as 3 cartas de uma pergunta. Escolha das cartas,
--  ordem e orientação (upright/reversed) são decididas inteiramente pelo
--  PostgreSQL (random()) — a IA (Anthropic) nunca escolhe carta, posição ou
--  orientação, e nunca é chamada por esta função. A IA só recebe o resultado
--  já sorteado para gerar um RASCUNHO de leitura, em etapa futura.
--
--  Só o service_role pode executar esta função (Edge Functions no servidor).
--  Nem anon, nem authenticated, nem PUBLIC têm EXECUTE — o painel
--  administrativo não sorteia cartas diretamente nesta etapa.
--
--  Esta migration NÃO:
--    - cria perguntas ou pedidos de teste;
--    - altera orders.status (quem muda o status é o fluxo de pagamento e o
--      próprio pipeline, fora desta função);
--    - chama a Anthropic ou qualquer IA;
--    - cria Edge Function;
--    - gera leitura;
--    - insere em order_events;
--    - apaga cartas;
--    - altera tabelas existentes (nenhum ALTER TABLE aqui).
--
--  Não aplicada a nenhum projeto Supabase por este arquivo — apenas a
--  migration local, pronta para revisão manual.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.draw_cards_for_question(p_question_id uuid)
returns table (
  drawn_card_id      uuid,
  question_id        uuid,
  card_id            uuid,
  draw_order         integer,
  position_key       text,
  position_label     text,
  orientation        public.card_orientation,
  canonical_name     text,
  arcana             text,
  suit               text,
  card_number        integer,
  selected_keywords  text[],
  selected_meaning   text,
  image_path         text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
#variable_conflict error
-- Os nomes de RETURNS TABLE acima (question_id, card_id, draw_order,
-- position_key, position_label, orientation, canonical_name, arcana, suit,
-- card_number, image_path...) também existem como colunas reais em
-- drawn_cards/tarot_cards. Com #variable_conflict error, QUALQUER
-- referência não qualificada a um desses nomes dentro de uma consulta SQL
-- embutida nesta função vira ERRO em tempo de execução, em vez de resolver
-- silenciosamente para a variável errada (ou para a coluna errada). Por
-- isso, toda referência a essas colunas abaixo usa alias de tabela/CTE
-- (dc., tc., ins., selected.) — nunca o nome nu.
declare
  v_question_id       uuid;
  v_order_id          uuid;
  v_order_status      public.order_status;
  v_existing_count    integer;
  v_selected_card_ids uuid[];
  v_selected_count    integer;
begin
  -- ── 1. Validação básica do parâmetro ────────────────────────────────────
  if p_question_id is null then
    raise exception 'draw_cards_for_question: p_question_id não pode ser nulo.';
  end if;

  -- ── 2. Localiza a pergunta e o pedido vinculado, bloqueando as duas
  --      linhas na mesma instrução (FOR UPDATE OF q, o). Chamadas
  --      concorrentes que envolvam estas mesmas linhas — a mesma pergunta,
  --      ou outra pergunta do mesmo pedido — ficam serializadas: uma delas
  --      aguarda a transação da outra terminar antes de prosseguir.
  select q.id, q.order_id, o.status
    into v_question_id, v_order_id, v_order_status
  from public.questions q
  join public.orders o on o.id = q.order_id
  where q.id = p_question_id
  for update of q, o;

  if not found then
    raise exception 'draw_cards_for_question: pergunta % não encontrada.', p_question_id;
  end if;

  -- ── 3. Idempotência: quantas cartas já existem para esta pergunta? ──────
  select count(*) into v_existing_count
  from public.drawn_cards dc
  where dc.question_id = v_question_id;

  if v_existing_count = 3 then
    -- Sorteio já concluído: devolve o resultado existente, sem sortear de
    -- novo e sem tocar em orders.status. Isso é o que impede que uma
    -- segunda chamada (ex.: reenvio de webhook, retry de Edge Function)
    -- troque as cartas que o cliente já recebeu.
    return query
      select
        dc.id,
        dc.question_id,
        dc.card_id,
        dc.draw_order,
        dc.position_key,
        dc.position_label,
        dc.orientation,
        tc.canonical_name,
        tc.arcana,
        tc.suit,
        tc.card_number,
        case when dc.orientation = 'upright' then tc.upright_keywords else tc.reversed_keywords end,
        case when dc.orientation = 'upright' then tc.upright_meaning else tc.reversed_meaning end,
        tc.image_path
      from public.drawn_cards dc
      join public.tarot_cards tc on tc.id = dc.card_id
      where dc.question_id = v_question_id
      order by dc.draw_order;
    return;
  end if;

  if v_existing_count = 1 or v_existing_count = 2 then
    -- Estado parcial: nunca deveria acontecer (o INSERT do passo 6 grava as
    -- 3 linhas em uma única instrução), mas se acontecer — por intervenção
    -- manual direta no banco, por exemplo — a função recusa completar ou
    -- refazer o sorteio sozinha. Isso exige correção administrativa
    -- explícita, fora do fluxo automático.
    raise exception
      'draw_cards_for_question: pergunta % está em estado parcial (% de 3 cartas sorteadas). Requer correção administrativa manual — esta função não completa nem refaz o sorteio automaticamente.',
      p_question_id, v_existing_count;
  end if;

  -- v_existing_count = 0 a partir daqui: é o primeiro sorteio desta pergunta.

  -- ── 4. Validação de status do pedido (só se aplica ao primeiro sorteio) ─
  if v_order_status in ('pending_payment', 'cancelled', 'refunded', 'expired', 'failed') then
    raise exception
      'draw_cards_for_question: pedido % está em status "%", que bloqueia qualquer sorteio.',
      v_order_id, v_order_status;
  end if;

  if v_order_status not in ('paid', 'drawing_cards') then
    raise exception
      'draw_cards_for_question: pedido % está em status "%", fora dos status permitidos para o primeiro sorteio ("paid" ou "drawing_cards").',
      v_order_id, v_order_status;
  end if;

  -- ── 5. Seleciona as 3 cartas ativas em UMA única instrução, já
  --      armazenando IDs e ordem em v_selected_card_ids. Isso elimina a
  --      corrida entre "contar quantas cartas ativas existem" e "selecionar
  --      3 cartas ativas" como dois passos separados — o catálogo poderia,
  --      em tese, mudar entre os dois. random_order é calculado uma única
  --      vez por linha, dentro desta mesma subconsulta.
  select
    pg_catalog.array_agg(selected.id order by selected.random_order)
    into v_selected_card_ids
  from (
    select
      tc.id,
      pg_catalog.random() as random_order
    from public.tarot_cards tc
    where tc.active = true
    order by random_order
    limit 3
  ) selected;

  v_selected_count :=
    pg_catalog.coalesce(pg_catalog.cardinality(v_selected_card_ids), 0);

  if v_selected_count <> 3 then
    raise exception
      'draw_cards_for_question: catálogo insuficiente (% carta(s) ativa(s); mínimo 3 para sortear).',
      v_selected_count;
  end if;

  -- ── 6. Grava as 3 cartas já selecionadas no passo 5 — não consulta
  --      tarot_cards de novo para escolher outros IDs aqui. Posição fixa
  --      por draw_order; orientação sorteada de forma independente por
  --      carta. A junção com tarot_cards para montar o retorno completo
  --      acontece depois do INSERT, só para buscar os dados de exibição.
  return query
  with inserted as (
    insert into public.drawn_cards as dc
      (question_id, card_id, draw_order, position_key, position_label, orientation)
    select
      v_question_id,
      selected.card_id,
      selected.draw_order::integer,
      case selected.draw_order::integer
        when 1 then 'current_energy'
        when 2 then 'main_influence'
        when 3 then 'guidance'
      end,
      case selected.draw_order::integer
        when 1 then 'Energia atual'
        when 2 then 'Influência principal'
        when 3 then 'Orientação'
      end,
      -- Moeda justa por carta, independente entre as três: ~50% upright,
      -- ~50% reversed. Vem só do random() do banco — nunca de parâmetro.
      case when pg_catalog.random() < 0.5
        then 'upright'::public.card_orientation
        else 'reversed'::public.card_orientation
      end
    from pg_catalog.unnest(v_selected_card_ids)
      with ordinality as selected(card_id, draw_order)
    returning
      dc.id,
      dc.question_id,
      dc.card_id,
      dc.draw_order,
      dc.position_key,
      dc.position_label,
      dc.orientation
  )
  select
    ins.id,
    ins.question_id,
    ins.card_id,
    ins.draw_order,
    ins.position_key,
    ins.position_label,
    ins.orientation,
    tc.canonical_name,
    tc.arcana,
    tc.suit,
    tc.card_number,
    case when ins.orientation = 'upright' then tc.upright_keywords else tc.reversed_keywords end,
    case when ins.orientation = 'upright' then tc.upright_meaning else tc.reversed_meaning end,
    tc.image_path
  from inserted ins
  join public.tarot_cards tc on tc.id = ins.card_id
  order by ins.draw_order;
end;
$$;

comment on function public.draw_cards_for_question(uuid) is
  'Sorteia (ou, se já sorteadas, apenas devolve) as 3 cartas de uma pergunta. Escolha de carta, ordem e orientação vêm exclusivamente do PostgreSQL — a IA nunca decide nada aqui. Executável somente por service_role (Edge Functions), nunca por anon/authenticated/PUBLIC. Nunca altera orders.status.';


-- ═══════════════════════════════ Permissões ═══════════════════════════════
-- Só o service_role (Edge Functions no servidor) pode chamar esta função.
-- Nenhum papel exposto ao navegador do cliente — nem anon, nem
-- authenticated, nem o painel administrativo nesta etapa — recebe EXECUTE.
revoke execute on function public.draw_cards_for_question(uuid) from public;
revoke execute on function public.draw_cards_for_question(uuid) from anon;
revoke execute on function public.draw_cards_for_question(uuid) from authenticated;
grant execute on function public.draw_cards_for_question(uuid) to service_role;


-- ═══════════════════════════ Consultas de validação ════════════════════════
-- Comentadas de propósito — não executam automaticamente com esta migration.
-- Rode manualmente no SQL editor do Supabase depois de aplicar, se desejar
-- conferir o resultado (idealmente após um sorteio real feito por uma Edge
-- Function futura, ainda não criada nesta etapa).

-- Toda pergunta com sorteio deve ter exatamente 3 cartas (0 linhas = ok):
-- select question_id, count(*)
-- from public.drawn_cards
-- group by question_id
-- having count(*) <> 3;

-- Nenhum card_id duplicado na mesma pergunta (0 linhas = ok):
-- select question_id, card_id, count(*)
-- from public.drawn_cards
-- group by question_id, card_id
-- having count(*) > 1;

-- Toda pergunta sorteada deve ter draw_order exatamente {1,2,3} (0 linhas = ok):
-- select question_id, array_agg(draw_order order by draw_order) as orders
-- from public.drawn_cards
-- group by question_id
-- having array_agg(draw_order order by draw_order) <> array[1, 2, 3];

-- As três position_key esperadas, na posição certa (0 linhas = ok):
-- select *
-- from public.drawn_cards
-- where (draw_order = 1 and position_key <> 'current_energy')
--    or (draw_order = 2 and position_key <> 'main_influence')
--    or (draw_order = 3 and position_key <> 'guidance');

-- Orientação sempre upright ou reversed (0 linhas = ok; o enum já impede
-- outros valores, isto é só uma checagem de sanidade extra):
-- select *
-- from public.drawn_cards
-- where orientation not in ('upright', 'reversed');

-- Retorno completo de um sorteio — substitua <QUESTION_UUID> pelo UUID real
-- de uma pergunta antes de executar:
-- select * from public.draw_cards_for_question('<QUESTION_UUID>'::uuid);
