-- ════════════════════════════════════════════════════════════════════════════
--  ENTRE NÓS TARÔ — CORREÇÃO: PERSISTÊNCIA IDEMPOTENTE DO PAGAMENTO CONFIRMADO
--
--  Problema corrigido: create-pix-order já reconhece corretamente quando o
--  Mercado Pago reporta uma Order/pagamento como processed/accredited (ver
--  resolvePixPayment/classifyPaymentState), mas nunca persistia isso em
--  public.orders — o pedido permanecia para sempre em 'pending_payment',
--  mesmo com o pagamento confirmado do lado do provedor. Esta migration
--  fecha esse ciclo com uma única RPC dedicada, seguindo exatamente o
--  mesmo padrão já usado por public.link_mercado_pago_order(): nunca um
--  UPDATE direto feito pela Edge Function, sempre por uma função
--  SECURITY DEFINER que valida identidade e nunca sobrescreve um estado já
--  avançado.
--
--  public.mark_order_paid(p_order_id, p_mercado_pago_order_id,
--  p_mercado_pago_payment_id, p_paid_amount_cents):
--    1. Valida os quatro parâmetros (nenhum nulo/vazio/≤0);
--    2. SELECT ... FOR UPDATE do pedido (trava a linha para a duração da
--       transação — nenhuma outra chamada concorrente para o MESMO pedido
--       consegue ler um estado intermediário);
--    3. Confere IDENTIDADE: p_mercado_pago_order_id e
--       p_mercado_pago_payment_id têm que bater EXATAMENTE com o que já
--       está vinculado ao pedido (gravado antes por
--       link_mercado_pago_order) — nunca confia num payment ID que não é o
--       que este pedido já reconhece como seu. p_paid_amount_cents também
--       tem que bater exatamente com orders.amount_cents — nunca confirma
--       um valor pago diferente do valor cobrado. Qualquer divergência
--       lança exceção e NUNCA modifica o pedido;
--    4. Se o pedido já está 'paid' OU em qualquer estágio POSTERIOR do
--       pipeline (drawing_cards, generating, awaiting_review, in_review,
--       approved, released) — retorna sucesso idempotente
--       (was_already_paid = true), SEM UPDATE e SEM novo order_event. Isto
--       é o que torna a chamada segura em retry: um evento de confirmação
--       atrasado ou duplicado, chegando depois que o pipeline já avançou,
--       nunca reabre nem duplica nada;
--    5. Se o pedido está num estado TERMINAL (failed, cancelled, refunded,
--       expired) — lança exceção de conflito e NUNCA sobrescreve. Um
--       "processed" chegando depois de um desses estados é uma anomalia
--       que exige investigação manual, nunca uma transição automática;
--    6. Só quando o status atual é exatamente 'pending_payment' é que
--       grava: UPDATE de status='paid' e paid_at (preenchida uma única vez
--       — COALESCE(paid_at, clock_timestamp()) — nunca reescrita numa
--       chamada futura), seguido de EXATAMENTE UM INSERT em
--       public.order_events (event_type='payment_confirmed',
--       old_status='pending_payment', new_status='paid', com os IDs do
--       Mercado Pago e o valor pago em metadata — nunca em texto livre).
--
--  Fonte de verdade: o Mercado Pago. Esta RPC nunca decide sozinha que um
--  pedido foi pago — ela só persiste uma decisão que o chamador (a Edge
--  Function, depois de validar identidade e estado via GET/POST à API do
--  Mercado Pago) já tomou, e faz isso de um jeito que nenhuma chamada
--  repetida ou fora de ordem consegue corromper.
--
--  Nenhuma coluna nova, nenhum enum novo — orders.paid_at e o valor 'paid'
--  de order_status já existiam desde a migration inicial
--  (20260804_001_initial_schema.sql), assim como public.order_events
--  (append-only, sem UPDATE/DELETE para nenhum papel). Os GRANTs
--  necessários (orders UPDATE, order_events INSERT para service_role) já
--  foram concedidos na migration inicial — nenhum GRANT novo de tabela é
--  necessário aqui, só o EXECUTE da função nova.
--
--  Não aplicada a nenhum projeto Supabase por este arquivo — apenas o
--  arquivo de migration, pronto para revisão manual.
-- ════════════════════════════════════════════════════════════════════════════


create or replace function public.mark_order_paid(
  p_order_id                 uuid,
  p_mercado_pago_order_id    text,
  p_mercado_pago_payment_id  text,
  p_paid_amount_cents        integer
)
returns table (
  order_id           uuid,
  status              public.order_status,
  was_already_paid     boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
#variable_conflict error
-- order_id e status (nomes do RETURNS TABLE) também existem como colunas
-- reais em orders. Com #variable_conflict error, qualquer referência não
-- qualificada a esses nomes vira erro em tempo de execução — por isso toda
-- referência a coluna abaixo usa alias de tabela (o.) ou variável com
-- prefixo v_/p_.
declare
  v_current_status         public.order_status;
  v_current_mp_order_id    text;
  v_current_mp_payment_id  text;
  v_current_amount_cents   integer;
begin
  -- ── 1. Validação básica dos parâmetros ──────────────────────────────────
  if p_order_id is null then
    raise exception 'mark_order_paid: order_id não informado.';
  end if;

  if p_mercado_pago_order_id is null or btrim(p_mercado_pago_order_id) = '' then
    raise exception 'mark_order_paid: mercado_pago_order_id não pode ser vazio.';
  end if;

  if p_mercado_pago_payment_id is null or btrim(p_mercado_pago_payment_id) = '' then
    raise exception 'mark_order_paid: mercado_pago_payment_id não pode ser vazio.';
  end if;

  if p_paid_amount_cents is null or p_paid_amount_cents <= 0 then
    raise exception 'mark_order_paid: paid_amount_cents deve ser maior que zero.';
  end if;

  -- ── 2. Trava a linha do pedido para a duração da transação ──────────────
  select o.status, o.mercado_pago_order_id, o.mercado_pago_payment_id, o.amount_cents
    into v_current_status, v_current_mp_order_id, v_current_mp_payment_id, v_current_amount_cents
  from public.orders o
  where o.id = p_order_id
  for update of o;

  if not found then
    raise exception 'mark_order_paid: pedido % não encontrado.', p_order_id;
  end if;

  -- ── 3. Identidade: os IDs e o valor informados têm que bater EXATAMENTE
  --      com o que já está persistido — nunca confia num payment ID ou
  --      valor que não é o que este pedido já reconhece como seu.
  --      IS DISTINCT FROM (não <>): null-safe, embora aqui os dois lados já
  --      tenham sido validados como não-nulos acima; v_current_mp_order_id/
  --      v_current_mp_payment_id PODEM ser null se, por algum motivo, esta
  --      RPC for chamada antes de link_mercado_pago_order ter vinculado o
  --      pedido — nesse caso a comparação também deve falhar (nunca tratar
  --      null como "qualquer coisa serve").
  if v_current_mp_order_id is distinct from p_mercado_pago_order_id then
    raise exception
      'mark_order_paid: mercado_pago_order_id informado não confere com o vinculado ao pedido %.',
      p_order_id;
  end if;

  if v_current_mp_payment_id is distinct from p_mercado_pago_payment_id then
    raise exception
      'mark_order_paid: mercado_pago_payment_id informado não confere com o vinculado ao pedido %.',
      p_order_id;
  end if;

  if p_paid_amount_cents is distinct from v_current_amount_cents then
    raise exception
      'mark_order_paid: paid_amount_cents informado não confere com o valor do pedido %.',
      p_order_id;
  end if;

  -- ── 4. Já pago ou além (pipeline avançou depois da confirmação original)
  --      — idempotente por construção: sem UPDATE, sem novo order_event.
  --      Cobre exatamente o cenário de um evento de confirmação
  --      atrasado/duplicado chegando depois que o pedido já avançou —
  --      nunca reabre nem duplica o registro de pagamento.
  if v_current_status in (
    'paid', 'drawing_cards', 'generating', 'awaiting_review',
    'in_review', 'approved', 'released'
  ) then
    return query select p_order_id, v_current_status, true;
    return;
  end if;

  -- ── 5. Estado terminal — nunca sobrescrito silenciosamente. Um
  --      "processed" chegando depois de failed/cancelled/refunded/expired
  --      é uma anomalia que exige investigação manual, nunca uma transição
  --      automática de volta para 'paid'.
  if v_current_status in ('failed', 'cancelled', 'refunded', 'expired') then
    raise exception
      'mark_order_paid: pedido % está em estado terminal (%) — não pode ser marcado como pago.',
      p_order_id, v_current_status;
  end if;

  -- ── 6. Qualquer outro valor de status além de 'pending_payment' aqui
  --      seria inesperado (o enum atual só tem os doze valores já cobertos
  --      acima) — tratamento defensivo, nunca presumido como seguro.
  if v_current_status <> 'pending_payment' then
    raise exception
      'mark_order_paid: pedido % está em estado % não reconhecido para confirmação de pagamento.',
      p_order_id, v_current_status;
  end if;

  -- ── 7. Única transição legítima: pending_payment → paid.
  update public.orders as o
    set status = 'paid',
        paid_at = COALESCE(o.paid_at, clock_timestamp())
    where o.id = p_order_id;

  insert into public.order_events (order_id, event_type, old_status, new_status, metadata)
  values (
    p_order_id,
    'payment_confirmed',
    'pending_payment',
    'paid',
    jsonb_build_object(
      'provider', 'mercado_pago',
      'mercado_pago_order_id', p_mercado_pago_order_id,
      'mercado_pago_payment_id', p_mercado_pago_payment_id,
      'paid_amount_cents', p_paid_amount_cents
    )
  );

  return query select p_order_id, 'paid'::public.order_status, false;
end;
$$;

comment on function public.mark_order_paid(uuid, text, text, integer) is
  'Persiste a confirmação de pagamento (orders.status = paid, paid_at, + um order_events de auditoria) de forma idempotente e segura contra retrocesso. Exige que mercado_pago_order_id, mercado_pago_payment_id e paid_amount_cents batam EXATAMENTE com o que já está persistido no pedido (vinculado antes por link_mercado_pago_order) — qualquer divergência lança exceção e nunca modifica o pedido. Se o pedido já está paid ou em qualquer estágio posterior do pipeline, retorna sucesso idempotente (was_already_paid=true) sem escrever nada — nunca reabre nem duplica o evento de pagamento. Se o pedido está em estado terminal (failed/cancelled/refunded/expired), lança exceção de conflito — nunca sobrescreve. Só grava de fato quando o status atual é pending_payment. Executável somente por service_role.';

revoke execute on function public.mark_order_paid(uuid, text, text, integer) from public;
revoke execute on function public.mark_order_paid(uuid, text, text, integer) from anon;
revoke execute on function public.mark_order_paid(uuid, text, text, integer) from authenticated;
grant execute on function public.mark_order_paid(uuid, text, text, integer) to service_role;


-- ═══════════════════════════ Consultas de validação ════════════════════════
-- Comentadas de propósito — não executam automaticamente com esta migration.

-- Todo pedido 'paid' (ou além) deve ter paid_at preenchida (0 linhas = ok):
-- select id, status, paid_at
-- from public.orders
-- where status in ('paid', 'drawing_cards', 'generating', 'awaiting_review',
--                   'in_review', 'approved', 'released')
--   and paid_at is null;

-- Todo pedido 'paid' deve ter exatamente um order_event
-- event_type='payment_confirmed' (0 linhas fora desse padrão = ok):
-- select o.id, count(e.id) as payment_confirmed_events
-- from public.orders o
-- left join public.order_events e
--   on e.order_id = o.id and e.event_type = 'payment_confirmed'
-- where o.status <> 'pending_payment'
-- group by o.id
-- having count(e.id) <> 1;
