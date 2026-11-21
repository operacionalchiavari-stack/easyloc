-- Entrada de vários materiais em uma transação, sem atribuição de endereço.
create table if not exists public.warehouse_entry_batches (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  idempotency_key text not null,
  payload jsonb not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (empresa_id, idempotency_key)
);
alter table public.warehouse_entry_batches enable row level security;
revoke all on public.warehouse_entry_batches from public, anon, authenticated;

create or replace function public.register_warehouse_entry_batch(
  p_items jsonb, p_reason text, p_op_number text, p_note text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_empresa uuid := public.almox_empresa();
  v_actor uuid := public.almox_funcionario();
  v_id uuid; v_previous jsonb; v_payload jsonb; v_item jsonb;
  v_quantity numeric; v_unit numeric;
begin
  if v_empresa is null or v_actor is null or not public.almox_tw_pode('Registrar entrada') then
    raise exception 'Sem permissão para registrar entrada.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Informe a lista de materiais.'; end if;
  if jsonb_array_length(p_items) not between 1 and 500 then raise exception 'Informe de 1 a 500 materiais.'; end if;
  if nullif(trim(p_idempotency_key), '') is null or length(p_idempotency_key) > 200 then raise exception 'Chave da operação inválida.'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Informe o motivo da entrada.'; end if;
  p_op_number := nullif(trim(p_op_number), '');
  v_payload := jsonb_build_object('items',p_items,'reason',p_reason,'op_number',p_op_number,'note',p_note);
  -- Serializa tentativas concorrentes da mesma operação sem duplicar o saldo.
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text || ':' || p_idempotency_key, 0));
  select id,payload into v_id,v_previous from public.warehouse_entry_batches
    where empresa_id=v_empresa and idempotency_key=p_idempotency_key;
  if found then
    if v_previous <> v_payload then raise exception 'Esta operação já foi registrada com outros dados.'; end if;
    return jsonb_build_object('batch_id',v_id,'duplicate',true);
  end if;
  if p_op_number is not null and not public.almox_pedido_existe(v_empresa,p_op_number) then raise exception 'Pedido não encontrado.'; end if;
  -- Ordem estável de bloqueio para entradas concorrentes com vários materiais.
  perform id from public.warehouse_materials
    where empresa_id=v_empresa and id in (select (value->>'material_id')::uuid from jsonb_array_elements(p_items))
    order by id for update;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit := nullif(v_item->>'unit_value','')::numeric;
    if v_quantity is null or v_quantity <= 0 or v_quantity::text in ('NaN','Infinity','-Infinity') then raise exception 'Quantidade inválida.'; end if;
    if v_unit is not null and (v_unit < 0 or v_unit::text in ('NaN','Infinity','-Infinity')) then raise exception 'Valor unitário inválido.'; end if;
    perform public.register_warehouse_manual_movement((v_item->>'material_id')::uuid,'entrada',v_quantity,
      jsonb_build_object('documento',p_reason,'op_numero',p_op_number,'observacao',p_note,'valor_unitario',v_unit));
    -- A função original mantém o custo quando recebe zero; zero informado explicitamente é válido.
    if v_unit = 0 then update public.warehouse_materials set valor_unitario=0 where id=(v_item->>'material_id')::uuid and empresa_id=v_empresa; end if;
  end loop;
  insert into public.warehouse_entry_batches(empresa_id,idempotency_key,payload,created_by)
    values(v_empresa,p_idempotency_key,v_payload,v_actor) returning id into v_id;
  return jsonb_build_object('batch_id',v_id,'duplicate',false,'items',jsonb_array_length(p_items));
end $$;
revoke all on function public.register_warehouse_entry_batch(jsonb,text,text,text,text) from public,anon;
grant execute on function public.register_warehouse_entry_batch(jsonb,text,text,text,text) to authenticated;
