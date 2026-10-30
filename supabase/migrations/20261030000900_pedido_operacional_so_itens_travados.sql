-- Pedido com o operacional (30/out/2026, pedido do usuário): "a única coisa que precisa ficar bloqueada é os itens do
-- pedido, o resto pode continuar livre" (data de entrega, horário, plantas, financeiro e pagamento, contrato...).
-- Com o pedido na Triagem/Expedição o salvar não mexe em separacoes_itens (nem no que já foi separado ou nas etiquetas):
-- grava só os dados do pedido e recusa se a lista de itens tiver mudado. Mudar item continua exigindo a liberação pela
-- Triagem (reducao_liberada_em), que devolve o pedido ao Comercial e usa o caminho normal.
-- A situação comercial também fica como está: mudar de Reservado para outra coisa mexe na reserva e na operação.
create or replace function public.pedido_salvar_sem_itens(p separacoes_pedidos, pp jsonb, p_itens jsonb, p_revisao bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare novo separacoes_pedidos;
begin
  if not eh_membro_empresa(p.empresa_id) or not funcionario_pode(p.empresa_id, auth.uid(), 'comercial.pedidos.editar') then raise exception 'Sem permissão para salvar pedido'; end if;
  if (pp->>'empresa_id')::uuid is distinct from p.empresa_id then raise exception 'Sem acesso ao pedido'; end if;
  if p_revisao is null or p.revisao <> p_revisao then raise exception 'Pedido alterado em outro aparelho. Reabra o pedido antes de salvar'; end if;
  if coalesce(jsonb_typeof(p_itens), '') <> 'array' then raise exception 'Lista de itens inválida'; end if;
  if exists (
    select 1 from (select item_id, sum(quantidade_solicitada) q from separacoes_itens where separacao_pedido_id = p.id group by item_id) a
    full join (select (x->>'item_id')::uuid item_id, sum((x->>'quantidade_solicitada')::numeric) q from jsonb_array_elements(p_itens) x group by 1) b on a.item_id = b.item_id
    where coalesce(a.q, 0) <> coalesce(b.q, 0)) then
    raise exception 'Os itens deste pedido estão com o operacional. Para alterar itens, solicite a liberação pela Triagem';
  end if;
  if nullif(btrim(coalesce(pp->>'cliente_nome', '')), '') is null then raise exception 'Informe o cliente do pedido'; end if;
  if nullif(btrim(coalesce(pp->>'local_nome', '')), '') is null then raise exception 'Informe o local do evento'; end if;
  if nullif(pp->>'data_evento', '') is null then raise exception 'Informe a data do evento'; end if;
  if nullif(pp->>'data_entrega', '') is null then raise exception 'Informe a data de entrega'; end if;
  if nullif(pp->>'data_coleta', '') is null then raise exception 'Informe a data de coleta'; end if;
  if nullif(pp->>'pedido_origem_id', '') is not null then
    if (pp->>'data_entrega')::date > (pp->>'data_coleta')::date then raise exception 'A entrega do pedido extra precisa ser até a coleta'; end if;
  elsif (pp->>'data_entrega')::date > (pp->>'data_evento')::date then raise exception 'A entrega precisa ser no dia do evento ou antes'; end if;
  if (pp->>'data_coleta')::date < coalesce(nullif(pp->>'data_evento_fim', '')::date, (pp->>'data_evento')::date) then
    raise exception 'A coleta precisa ser no último dia do evento ou depois'; end if;

  novo := jsonb_populate_record(p, pp - array['id','status','status_comercial','pre_reserva_ate','status_operacional','operacao','revisao','reducao_liberada_em','reducao_liberada_por','encerrado_operacional_em']);
  perform set_config('app.fluxo_transferencia', 'sim', true); -- libera operacao_validar_pedido_update só nesta gravação
  update separacoes_pedidos set cliente_id = novo.cliente_id, cliente_nome = novo.cliente_nome, contato_cliente = novo.contato_cliente,
    tipo_evento = novo.tipo_evento, local_id = novo.local_id, local_nome = novo.local_nome, data_evento = novo.data_evento, data_evento_fim = novo.data_evento_fim,
    data_entrega = novo.data_entrega, data_coleta = novo.data_coleta, data_hora = novo.data_hora, valor_total = novo.valor_total,
    observacoes = novo.observacoes, revisao = revisao + 1, atualizado_em = now() where id = p.id;
  perform set_config('app.fluxo_transferencia', 'nao', true);
  insert into pedido_cronograma_pendencias(pedido_id, empresa_id, revisao)
    select id, empresa_id, revisao from separacoes_pedidos where id = p.id
    on conflict (pedido_id) do update set revisao = excluded.revisao, criado_em = now();
  return (select jsonb_build_object('id', id, 'revisao', revisao) from separacoes_pedidos where id = p.id);
end $$;
revoke all on function public.pedido_salvar_sem_itens(separacoes_pedidos, jsonb, jsonb, bigint) from public, anon, authenticated;

create or replace function public.pedido_salvar_integrado(p_id uuid, p_pedido jsonb, p_itens jsonb, p_revisao bigint default null::bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare p separacoes_pedidos; pr separacoes_pedidos; origem uuid; pp jsonb := p_pedido; prox int; trava boolean := false;
begin
 if p_id is not null then
  select * into strict p from separacoes_pedidos where id=p_id for update;
  if not eh_membro_empresa(p.empresa_id) then raise exception 'Sem acesso ao pedido';end if;
  -- com o operacional: só os itens ficam travados (pedido_salvar_sem_itens)
  trava := p.encerrado_operacional_em is not null or p.operacao->'carregamento'->>'iniciado_em' is not null or coalesce(p.status_operacional,'')<>''
           or (p.status<>'pendente' and p.reducao_liberada_em is null);
  origem := p.pedido_origem_id;
 else
  origem := nullif(p_pedido->>'pedido_origem_id','')::uuid;
 end if;
 if origem is not null then
  select * into pr from separacoes_pedidos where id=origem for update;
  if not found or pr.empresa_id is distinct from (p_pedido->>'empresa_id')::uuid then raise exception 'Pedido principal não encontrado';end if;
  if pr.pedido_origem_id is not null then raise exception 'Um pedido extra não pode ter outro pedido extra. Crie a partir do pedido principal';end if;
  if coalesce(pr.status,'')='cancelado' or coalesce(pr.status_comercial,'')='cancelado' then raise exception 'O pedido principal % foi cancelado',pr.numero_pedido;end if;
  if p_id is null then
   if coalesce(pr.status_comercial,'') not in ('pre_reserva','aprovado','enviado','finalizado') then raise exception 'Reserve o pedido % antes de criar um pedido extra',pr.numero_pedido;end if;
   if pedido_coleta_iniciada(pr.id) then raise exception 'A coleta do pedido % já começou: não é mais possível criar pedido extra',pr.numero_pedido;end if;
   select coalesce(max(nullif(substring(numero_pedido from '/(\d+)$'),'')::int),1)+1 into prox from separacoes_pedidos where pedido_origem_id=pr.id;
   pp := pp || jsonb_build_object('numero_pedido', pr.numero_pedido||'/'||prox);
  end if;
  -- cliente, local, evento e coleta são sempre os do principal
  pp := pp || jsonb_build_object('pedido_origem_id',pr.id,'cliente_id',pr.cliente_id,'cliente_nome',pr.cliente_nome,
    'contato_cliente',coalesce(nullif(p_pedido->>'contato_cliente',''),pr.contato_cliente),'tipo_evento',pr.tipo_evento,
    'local_id',pr.local_id,'local_nome',pr.local_nome,'data_evento',pr.data_evento,'data_evento_fim',pr.data_evento_fim,
    'data_hora',pr.data_hora,'data_coleta',pr.data_coleta);
  pp := jsonb_set(pp,'{observacoes}',coalesce(pp->'observacoes','{}'::jsonb)||jsonb_build_object(
    'horario_coleta',coalesce(pr.observacoes->>'horario_coleta',pr.observacoes->'horarios_pedido'->>'coleta'),
    'observacoes_coleta',coalesce(pr.observacoes->>'observacoes_coleta','')));
 else
  pp := pp - 'pedido_origem_id';
 end if;
 if trava then return pedido_salvar_sem_itens(p, pp, p_itens, p_revisao); end if;
 return pedido_salvar_integrado_base_fluxo(p_id,pp,p_itens,p_revisao);
end $$;
