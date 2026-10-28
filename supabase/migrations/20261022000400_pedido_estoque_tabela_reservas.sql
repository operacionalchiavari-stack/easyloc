create or replace function public.pedido_estoque_detalhes(p_empresa_id uuid,p_item_id uuid,p_data date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare resultado jsonb;
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa_id) or not (
    funcionario_pode(p_empresa_id,auth.uid(),'comercial.pedidos.visualizar') or
    funcionario_pode(p_empresa_id,auth.uid(),'comercial.pedidos.criar')) then
    raise exception 'Sem permissão para consultar reservas' using errcode='42501'; end if;
  if not catalogo_parametro_permite(p_empresa_id,'disponivel','equipe',null) then
    raise exception 'Consulta de disponibilidade desativada' using errcode='42501'; end if;
  if p_data is null or not exists(select 1 from itens where id=p_item_id and empresa_id=p_empresa_id) then
    raise exception 'Item ou data inválidos'; end if;
  with componentes as (
    select k.item_id,sum(k.quantidade)::numeric necessario from kit_itens k
    join itens i on i.id=k.kit_id and lower(i.tipo)='kit' and i.empresa_id=p_empresa_id
    where k.kit_id=p_item_id group by k.item_id
    union all
    select p_item_id,1::numeric where not exists(select 1 from kit_itens k
      join itens i on i.id=k.kit_id and lower(i.tipo)='kit' where k.kit_id=p_item_id)
  ), reservas as (
    select s.item_id,s.quantidade_solicitada qtd,p.id pedido_id,
      coalesce(to_jsonb(p)->>'numero_pedido',to_jsonb(p)->>'numero',p.id::text) numero,
      coalesce(to_jsonb(p)->>'cliente_nome','Cliente não informado') cliente,
      p.data_evento evento, p.local_nome local, p.status_comercial situacao,
      coalesce(p.data_entrega,p.data_evento) inicio,coalesce(p.data_coleta,p.data_evento_fim,p.data_evento) fim
    from separacoes_itens s join separacoes_pedidos p on p.id=s.separacao_pedido_id
    where p.empresa_id=p_empresa_id and p.status_comercial in ('pre_reserva','aprovado','enviado','finalizado')
      and coalesce(p.status,'')<>'cancelado' and p.encerrado_operacional_em is null
      and p_data between coalesce(p.data_entrega,p.data_evento) and coalesce(p.data_coleta,p.data_evento_fim,p.data_evento)
  ), expandidas as (
    select r.item_id,r.qtd,r.pedido_id,r.numero,r.cliente,r.evento,r.local,r.situacao,r.inicio,r.fim from reservas r join itens i on i.id=r.item_id
    where coalesce(lower(i.tipo),'')<>'kit' or not exists(select 1 from kit_itens where kit_id=i.id)
    union all
    select k.item_id,r.qtd*k.quantidade,r.pedido_id,r.numero,r.cliente,r.evento,r.local,r.situacao,r.inicio,r.fim
    from reservas r join itens i on i.id=r.item_id and lower(i.tipo)='kit' join kit_itens k on k.kit_id=i.id
  ), pedidos as (
    select e.item_id,e.pedido_id,e.numero,e.cliente,e.evento,e.local,e.situacao,e.inicio,e.fim,sum(e.qtd) quantidade
    from expandidas e join componentes c on c.item_id=e.item_id
    group by e.item_id,e.pedido_id,e.numero,e.cliente,e.evento,e.local,e.situacao,e.inicio,e.fim
  ), bloqueios as (
    select e.item_id,p.id pedido_id,coalesce(to_jsonb(p)->>'numero_pedido',to_jsonb(p)->>'numero',p.id::text) numero,
      'Retorno pendente' motivo,count(*)::numeric quantidade
    from separacoes_etiquetas e join separacoes_pedidos p on p.id=e.separacao_pedido_id
    where p.empresa_id=p_empresa_id and e.lida_carregamento_em is not null and e.lida_retorno_em is null
      and coalesce(p.data_coleta,p.data_evento)<p_data
      and not exists(select 1 from operacao_ocorrencias o where o.pedido_id=p.id and o.codigo=e.codigo
        and o.tipo='falta' and o.resolucao like 'Perda confirmada:%')
    group by e.item_id,p.id
    union all
    select o.item_id,o.pedido_id,null,o.tipo,o.quantidade from operacao_ocorrencias o
    where o.empresa_id=p_empresa_id and o.resolvida_em is null and o.tipo in ('avaria','limpeza','manutencao')
  ), disponibilidade as (
    select c.item_id,c.necessario,i.codigo,i.produto,coalesce(i.estoque_total,0) estoque,
      coalesce(i.estoque_manutencao,0) manutencao,
      coalesce((select sum(p.quantidade) from pedidos p where p.item_id=c.item_id),0) reservado,
      coalesce((select sum(b.quantidade) from bloqueios b where b.item_id=c.item_id),0) bloqueado
    from componentes c join itens i on i.id=c.item_id and i.empresa_id=p_empresa_id
  ) select coalesce(jsonb_agg(jsonb_build_object(
    'item_id',d.item_id,'codigo',d.codigo,'nome',d.produto,'necessario',d.necessario,'estoque',d.estoque,
    'manutencao',d.manutencao,'reservado',d.reservado,'bloqueado',d.bloqueado,
    'livre',greatest(0,d.estoque-d.manutencao-d.reservado-d.bloqueado),
    'pedidos',coalesce((select jsonb_agg(to_jsonb(p)-'item_id' order by p.inicio,p.numero) from pedidos p where p.item_id=d.item_id),'[]'),
    'bloqueios',coalesce((select jsonb_agg(to_jsonb(b)-'item_id') from bloqueios b where b.item_id=d.item_id),'[]')
  ) order by d.codigo),'[]') into resultado from disponibilidade d
  where greatest(0,d.estoque-d.manutencao-d.reservado-d.bloqueado)<d.necessario;
  return jsonb_build_object('data',p_data,'componentes',resultado);
end $$;
revoke all on function public.pedido_estoque_detalhes(uuid,uuid,date) from public,anon;
grant execute on function public.pedido_estoque_detalhes(uuid,uuid,date) to authenticated;
