-- Fretes anunciados: também os caminhões TERCEIRIZADOS (de transportadora, sem freteiro do app) escalados na entrega/coleta.
-- Uma linha por pedido + direção, com os caminhões. Caminhão próprio não entra. Sem QR nem check-in (não passam pelo app).
create or replace function public.logistica_anunciados_transportadoras(p_empresa uuid,p_inicio date,p_fim date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  perform logistica_servicos_autorizar(p_empresa);
  if p_inicio is null or p_fim is null or p_fim<p_inicio then raise exception 'Informe um período válido';end if;
  return coalesce((select jsonb_agg(g.j order by g.data,g.hora) from (
    select min(e.data) data,min(e.hora) hora,jsonb_build_object(
      'tipo','frete','id',null,'ativo',false,'transportadora',true,'pedido_id',e.pedido_id,'pedido',p.numero_pedido,'cliente',p.cliente_nome,
      'cliente_foto',ce.catalogo_logo_url,'local',p.local_nome,'data',min(e.data),'hora',to_char(min(e.hora),'HH24:MI'),
      'etapa',case frete_direcao(e.tipo) when 'entrega' then 'Entrega' when 'coleta' then 'Coleta' else 'Frete' end||' · transportadora',
      'valor',null,'quantidade',count(distinct k.id),
      'linhas',jsonb_agg(distinct jsonb_build_object('nome',coalesce(nullif(k.codigo,''),'Caminhão')||coalesce(' · '||nullif(k.modelo,''),''),
        'foto',k.foto_url,'detalhe','Transportadora'||coalesce(' · '||nullif(k.empresa_nome,''),''),
        'confirmado',true,'situacao','escalado','checkin',null,'checkout',null))) j
    from operacao_etapas e
    join operacao_etapa_caminhoes ec on ec.etapa_id=e.id
    join caminhoes k on k.id=ec.caminhao_id and k.empresa_id=p_empresa and k.tipo='terceirizado' and k.freteiro_id is null
    join separacoes_pedidos p on p.id=e.pedido_id and p.empresa_id=p_empresa
    left join clientes_empresas ce on ce.id=p.cliente_id
    where e.empresa_id=p_empresa and e.data between p_inicio and p_fim and frete_direcao(e.tipo) is not null
      and coalesce(p.status_comercial,'')<>'cancelado' and coalesce(p.status,'')<>'cancelado'
    group by e.pedido_id,frete_direcao(e.tipo),p.numero_pedido,p.cliente_nome,ce.catalogo_logo_url,p.local_nome
  ) g),'[]'::jsonb);
end $$;
revoke all on function public.logistica_anunciados_transportadoras(uuid,date,date) from public,anon;
grant execute on function public.logistica_anunciados_transportadoras(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
