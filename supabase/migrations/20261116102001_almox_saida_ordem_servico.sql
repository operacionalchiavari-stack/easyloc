-- Custos de saída vinculados a O.S. de item danificado ou manutenção interna.
alter table public.warehouse_operations
  add column if not exists service_order_id uuid,
  add column if not exists service_order_source text;
alter table public.warehouse_movements
  add column if not exists service_order_id uuid,
  add column if not exists service_order_source text;
alter table public.warehouse_operations add constraint warehouse_operation_service_order_valid
  check ((service_order_id is null and service_order_source is null)
    or (service_order_id is not null and service_order_source is not null and service_order_source in ('acervo','predial')));
alter table public.warehouse_movements add constraint warehouse_movement_service_order_valid
  check ((service_order_id is null and service_order_source is null)
    or (service_order_id is not null and service_order_source is not null and service_order_source in ('acervo','predial')));
create index warehouse_movements_service_order_cost on public.warehouse_movements
  (empresa_id, service_order_source, service_order_id) where service_order_id is not null;

create or replace function public.almox_ordens_servico_abertas() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare company uuid := public.almox_empresa(); result jsonb;
begin
  if not public.almox_tw_pode('Acessar almoxarifado') then
    raise exception 'Sem permissão para consultar as ordens de serviço.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(orders) order by orders.fonte, orders.numero), '[]'::jsonb)
    into result from (
      select o.id, 'acervo'::text fonte, o.numero::text numero,
        coalesce(nullif(to_jsonb(i)->>'descricao_total',''),to_jsonb(i)->>'produto','Item danificado') descricao
      from public.acervo_os o left join public.itens i on i.id = o.item_id and i.empresa_id = company
      where o.empresa_id = company and o.status = 'aberta'
      union all
      select m.id, 'predial'::text, m.numero::text, concat_ws(' · ',m.titulo,m.local)
      from public.manutencao_predial_solicitacoes m
      where m.empresa_id = company and m.status in ('aberta','analise','agendada','execucao')
    ) orders;
  return result;
end $$;

-- Sobrecarga explícita: mantém o fluxo de Pedido e clientes anteriores com seis argumentos.
-- O vínculo da O.S. é validado e gravado na mesma transação da baixa do estoque.
create or replace function public.process_warehouse_exit_cart(
  p_pin text, p_items jsonb, p_destination text, p_op_number text, p_note text,
  p_idempotency_key text, p_service_order_id uuid, p_service_order_source text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare company uuid := public.almox_empresa(); previous public.warehouse_operations;
  result jsonb; operation uuid; os_number text; reference text;
begin
  if public.almox_funcionario() is null or not public.almox_tw_pode('Registrar saida') then
    raise exception 'Sem permissão para registrar saída.' using errcode = '42501';
  end if;
  if p_destination is null or p_destination not in ('op','os') then raise exception 'Selecione Pedido ou O.S. como destino.'; end if;
  if p_destination = 'op' and (nullif(trim(p_op_number),'') is null or p_service_order_id is not null or p_service_order_source is not null) then
    raise exception 'Selecione o pedido que vai usar o material.';
  end if;
  if p_destination = 'os' and (p_service_order_id is null or p_service_order_source is null or p_service_order_source not in ('acervo','predial') or nullif(trim(p_op_number),'') is not null) then
    raise exception 'Selecione uma O.S. para vincular o custo.';
  end if;
  select * into previous from public.warehouse_operations
    where empresa_id = company and idempotency_key = p_idempotency_key;
  if previous.id is not null then
    if previous.destination_type is distinct from p_destination
      or previous.service_order_id is distinct from p_service_order_id
      or previous.service_order_source is distinct from p_service_order_source then
      raise exception 'Esta operação já foi registrada com outro destino.';
    end if;
    return jsonb_build_object('operation_id',previous.id,'duplicate',true);
  end if;
  if p_destination = 'os' then
    if p_service_order_source = 'acervo' then
      select numero::text into os_number from public.acervo_os
        where id = p_service_order_id and empresa_id = company and status = 'aberta' for share;
    else
      select numero::text into os_number from public.manutencao_predial_solicitacoes
        where id = p_service_order_id and empresa_id = company and status in ('aberta','analise','agendada','execucao') for share;
    end if;
    if os_number is null then raise exception 'O.S. não encontrada ou já encerrada. Selecione uma ordem aberta desta empresa.'; end if;
  end if;
  result := public.process_warehouse_exit_cart(p_pin,p_items,p_destination,p_op_number,p_note,p_idempotency_key);
  operation := (result->>'operation_id')::uuid;
  if p_destination = 'os' then
    reference := 'O.S. ' || os_number || case when p_service_order_source = 'acervo' then ' · Item danificado' else ' · Manutenção interna' end;
    update public.warehouse_operations set service_order_id = p_service_order_id, service_order_source = p_service_order_source
      where id = operation and empresa_id = company;
    update public.warehouse_movements set service_order_id = p_service_order_id, service_order_source = p_service_order_source, documento = reference
      where operation_id = operation and empresa_id = company;
  end if;
  return result;
end $$;
revoke all on function public.almox_ordens_servico_abertas(), public.process_warehouse_exit_cart(text,jsonb,text,text,text,text,uuid,text) from public,anon;
grant execute on function public.almox_ordens_servico_abertas(), public.process_warehouse_exit_cart(text,jsonb,text,text,text,text,uuid,text) to authenticated;
