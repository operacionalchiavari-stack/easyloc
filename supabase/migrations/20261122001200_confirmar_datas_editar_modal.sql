-- Editar e confirmar as datas na Central, em uma única transação, usando a gravação normal do pedido.
create or replace function public.comercial_confirmar_datas_atualizar(
  p_empresa uuid, p_pedido uuid, p_datas jsonb, p_antes jsonb, p_observacao text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p separacoes_pedidos;
  entrega date; evento date; fim date; coleta date;
  atuais jsonb; itens jsonb; resultado jsonb;
begin
  if auth.uid() is null or not coalesce(eh_membro_empresa(p_empresa), false)
     or not coalesce(seguranca_2fa_ok(), false)
     or not coalesce(operacao_pode(p_empresa, 'comercial.pedidos.editar'), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into p from separacoes_pedidos where id = p_pedido and empresa_id = p_empresa for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  atuais := jsonb_build_object('data_entrega', p.data_entrega, 'data_evento', coalesce(p.data_evento, p.data_hora::date),
    'data_evento_fim', p.data_evento_fim, 'data_coleta', p.data_coleta);
  if atuais is distinct from p_antes then
    raise exception 'As datas deste pedido mudaram em outro aparelho. Feche e abra a confirmação novamente para atualizar.';
  end if;
  if jsonb_typeof(p_datas) is distinct from 'object' then raise exception 'Informe as datas do pedido'; end if;
  entrega := nullif(p_datas->>'data_entrega', '')::date;
  evento := nullif(p_datas->>'data_evento', '')::date;
  fim := nullif(p_datas->>'data_evento_fim', '')::date;
  coleta := nullif(p_datas->>'data_coleta', '')::date;
  if entrega is null or evento is null or coleta is null then raise exception 'Informe as datas de entrega, evento e coleta'; end if;
  if length(coalesce(p_observacao, '')) > 1000 then raise exception 'Observação: até 1000 caracteres'; end if;
  if p.pedido_origem_id is not null and row(evento, fim, coleta) is distinct from row(p.data_evento, p.data_evento_fim, p.data_coleta) then
    raise exception 'O evento e a coleta do pedido extra devem ser alterados no pedido principal';
  end if;
  if p.pedido_origem_id is null and entrega > evento then raise exception 'A entrega precisa ser no dia do evento ou antes'; end if;
  if fim < evento then raise exception 'O fim do evento precisa ser no dia do início ou depois'; end if;
  if coleta < coalesce(fim, evento) or coleta < entrega then raise exception 'A coleta precisa ser no último dia do evento e da entrega ou depois'; end if;

  if row(entrega, evento, fim, coleta) is distinct from row(p.data_entrega, p.data_evento, p.data_evento_fim, p.data_coleta) then
    select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into itens
      from separacoes_itens i where i.separacao_pedido_id = p.id;
    if p.status_comercial in ('pre_reserva', 'aprovado', 'enviado', 'finalizado')
       and row(entrega, coleta) is distinct from row(p.data_entrega, p.data_coleta) then
      perform operacao_validar_reserva(p.empresa_id, p.id, itens, entrega, coleta);
    end if;
    resultado := pedido_salvar_integrado(p.id, to_jsonb(p) || jsonb_build_object(
      'data_entrega', entrega, 'data_evento', evento, 'data_evento_fim', fim, 'data_coleta', coleta,
      'data_hora', evento + time '12:00'), itens, p.revisao);
  end if;
  perform comercial_confirmar_datas_registrar(p_empresa, p.id, p_observacao);
  return jsonb_build_object('ok', true, 'pedido_id', p.id);
end $$;

revoke all on function public.comercial_confirmar_datas_atualizar(uuid, uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.comercial_confirmar_datas_atualizar(uuid, uuid, jsonb, jsonb, text) to authenticated;
notify pgrst, 'reload schema';
