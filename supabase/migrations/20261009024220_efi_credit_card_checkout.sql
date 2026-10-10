-- Cartão Efí usa a API Cobranças; o Pix existente continua na API Pix.
-- NULL em efi_payment_method representa os pedidos Pix anteriores e futuros.
alter table public.orders
  add column efi_payment_method text,
  add column efi_card_charge_id bigint,
  add column efi_card_claimed_at timestamptz;

alter table public.orders
  add constraint orders_efi_payment_method_check
    check (efi_payment_method is null or efi_payment_method in ('pix', 'credit_card')),
  add constraint orders_efi_card_charge_id_positive
    check (efi_card_charge_id is null or efi_card_charge_id > 0),
  add constraint orders_efi_card_only_for_efi
    check ((efi_card_charge_id is null and efi_card_claimed_at is null and efi_payment_method is null)
      or (payment_provider = 'efi' and order_kind = 'digital_product')),
  add constraint orders_efi_card_excludes_pix
    check (efi_payment_method is distinct from 'credit_card'
      or (efi_txid is null and efi_location_id is null and efi_end_to_end_id is null)),
  add constraint orders_efi_card_identity
    check (efi_card_charge_id is null or
      (efi_payment_method = 'credit_card' and efi_card_claimed_at is not null));

create unique index orders_efi_card_charge_id_uidx
  on public.orders (efi_card_charge_id) where efi_card_charge_id is not null;

-- Seleção atômica do Pix antes de chamar a API Pix; elimina a disputa
-- entre dois endpoints usando o mesmo checkout_request_id.
create function public.claim_efi_pix_checkout(p_order_id uuid)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_order.payment_provider <> 'efi' or v_order.order_kind <> 'digital_product'
     or v_order.efi_payment_method = 'credit_card' or v_order.efi_card_claimed_at is not null then
    return false;
  end if;
  if v_order.efi_payment_method is null then
    update public.orders o set efi_payment_method = 'pix' where o.id = p_order_id;
  end if;
  return true;
end;
$function$;

-- Reivindica a tentativa antes de enviar a cobrança à Efí. Se a resposta da
-- rede for ambígua, não é seguro fazer outra cobrança automática: o pedido
-- fica reservado para conciliação por notification_url/custom_id.
create function public.claim_efi_card_checkout(p_order_id uuid)
returns table(should_create boolean, charge_id bigint, public_id uuid, amount_cents integer, order_status text)
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $function$
#variable_conflict error
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_order.order_kind <> 'digital_product' or v_order.payment_provider <> 'efi'
     or v_order.efi_txid is not null or v_order.efi_location_id is not null
     or v_order.efi_payment_method = 'pix' then
    raise exception 'claim_efi_card_checkout: pedido indisponível para cartão';
  end if;

  if v_order.efi_payment_method is null then
    update public.orders o set efi_payment_method = 'credit_card'
    where o.id = p_order_id;
  end if;

  if v_order.efi_card_claimed_at is null then
    if v_order.status <> 'pending_payment' then
      raise exception 'claim_efi_card_checkout: pedido não está pendente';
    end if;
    update public.orders o set efi_card_claimed_at = now() where o.id = p_order_id;
    return query select true, null::bigint, v_order.public_id, v_order.amount_cents, v_order.status::text;
  else
    return query select false, v_order.efi_card_charge_id, v_order.public_id, v_order.amount_cents, v_order.status::text;
  end if;
end;
$function$;

-- Chamado somente depois de consultar o estado da cobrança na API Cobranças.
-- A mesma operação serve à resposta síncrona e à notificação autenticada
-- pela consulta do token recebido à própria Efí.
create function public.link_efi_card_charge(
  p_public_id uuid, p_charge_id bigint, p_amount_cents integer, p_provider_status text
)
returns table(order_id uuid, order_status text, charge_id bigint)
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $function$
#variable_conflict error
declare v_order public.orders%rowtype;
begin
  if p_charge_id is null or p_charge_id <= 0 or p_provider_status is null or p_provider_status not in
     ('new', 'waiting', 'identified', 'approved', 'paid', 'unpaid',
      'refunded', 'contested', 'canceled', 'settled') then
    raise exception 'link_efi_card_charge: dados inválidos';
  end if;
  select * into v_order from public.orders o where o.public_id = p_public_id for update;
  if not found or v_order.payment_provider <> 'efi' or v_order.order_kind <> 'digital_product'
     or v_order.efi_payment_method <> 'credit_card' or v_order.efi_card_claimed_at is null
     or v_order.efi_txid is not null or v_order.amount_cents <> p_amount_cents
     or (v_order.efi_card_charge_id is not null and v_order.efi_card_charge_id <> p_charge_id) then
    raise exception 'link_efi_card_charge: pedido/cobrança incompatível';
  end if;

  if p_provider_status in ('approved', 'paid')
     and v_order.status in ('failed', 'cancelled', 'refunded', 'expired') then
    raise exception 'link_efi_card_charge: pedido terminal requer conciliação';
  end if;

  update public.orders o
  set efi_card_charge_id = p_charge_id,
      status = case when p_provider_status in ('approved', 'paid')
                    and o.status = 'pending_payment' then 'paid'::public.order_status
                    when p_provider_status = 'unpaid' and o.status = 'pending_payment'
                      then 'failed'::public.order_status
                    when p_provider_status = 'canceled' and o.status = 'pending_payment'
                      then 'cancelled'::public.order_status
                    when p_provider_status = 'refunded' and o.status = 'paid'
                      then 'refunded'::public.order_status
                    when p_provider_status in ('unpaid', 'contested') and o.status = 'paid'
                      then 'failed'::public.order_status
                    when p_provider_status = 'canceled' and o.status = 'paid'
                      then 'cancelled'::public.order_status
                    else o.status end,
      paid_at = case when p_provider_status in ('approved', 'paid')
                     and o.status = 'pending_payment' then now() else o.paid_at end
  where o.id = v_order.id;

  if p_provider_status in ('approved', 'paid') and v_order.status = 'pending_payment' then
    insert into public.order_events (order_id, event_type, old_status, new_status, metadata)
    values (v_order.id, 'payment_confirmed', 'pending_payment', 'paid',
      jsonb_build_object('provider', 'efi', 'payment_method', 'credit_card',
        'efi_card_charge_id', p_charge_id, 'paid_amount_cents', p_amount_cents));
  end if;
  if p_provider_status in ('refunded', 'unpaid', 'contested', 'canceled')
     and v_order.status = 'paid' then
    insert into public.order_events (order_id, event_type, old_status, new_status, metadata)
    values (v_order.id, 'payment_reversed', 'paid',
      case when p_provider_status = 'refunded' then 'refunded'::public.order_status
           when p_provider_status = 'canceled' then 'cancelled'::public.order_status
           else 'failed'::public.order_status end,
      jsonb_build_object('provider', 'efi', 'efi_card_charge_id', p_charge_id,
        'provider_status', p_provider_status));
  end if;

  return query select o.id, o.status::text, o.efi_card_charge_id
    from public.orders o where o.id = v_order.id;
end;
$function$;

revoke all on function public.claim_efi_card_checkout(uuid) from public, anon, authenticated;
revoke all on function public.claim_efi_pix_checkout(uuid) from public, anon, authenticated;
revoke all on function public.link_efi_card_charge(uuid, bigint, integer, text) from public, anon, authenticated;
grant execute on function public.claim_efi_card_checkout(uuid) to service_role;
grant execute on function public.claim_efi_pix_checkout(uuid) to service_role;
grant execute on function public.link_efi_card_charge(uuid, bigint, integer, text) to service_role;
